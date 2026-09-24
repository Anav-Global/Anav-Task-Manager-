import React, { useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import {
  collection,
  onSnapshot,
  doc,
  updateDoc,
  deleteDoc,
} from 'firebase/firestore';
import { sendPasswordResetEmail } from 'firebase/auth';
import {
  UserPlus,
  X,
  AlertCircle,
  CheckCircle2,
  Copy,
  Check,
  ShieldCheck,
  Info,
  Trash2,
  KeyRound,
  ChevronDown,
  Pencil,
} from 'lucide-react';
import { auth, db } from '../firebase/config';
import { useAuth } from '../context/AuthContext';
import { createManagedUser } from '../firebase/secondaryAuth';
import { ConfirmDialog } from '../components/ConfirmDialog';
import type { UserDoc, UserRole } from '../types';

const roleBadges: Record<UserRole, { bg: string; text: string; border: string; label: string }> = {
  manager: {
    bg: 'bg-purple-50 dark:bg-purple-900/30',
    text: 'text-brand-purple dark:text-purple-300',
    border: 'border-purple-200 dark:border-purple-800',
    label: 'Manager',
  },
  tl: {
    bg: 'bg-purple-50 dark:bg-purple-900/30',
    text: 'text-brand-purple dark:text-purple-300',
    border: 'border-purple-200 dark:border-purple-800',
    label: 'Team Lead',
  },
  employee: {
    bg: 'bg-emerald-50 dark:bg-emerald-900/30',
    text: 'text-emerald-700 dark:text-emerald-300',
    border: 'border-emerald-200 dark:border-emerald-800',
    label: 'Employee',
  },
};

export const UsersPage: React.FC = () => {
  const { userDoc, loading: authLoading } = useAuth();
  const isManager = userDoc?.role === 'manager';

  // Guard: if non-manager (e.g. TL or employee) hits /dashboard/users, redirect to tasks with message
  if (!authLoading && !isManager) {
    return (
      <Navigate
        to="/dashboard/tasks"
        state={{ message: 'This section is only available to managers' }}
        replace
      />
    );
  }

  const [users, setUsers] = useState<UserDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Role change confirmation state
  const [roleChangeTarget, setRoleChangeTarget] = useState<{
    user: UserDoc;
    newRole: UserRole;
    oldRole: UserRole;
  } | null>(null);
  const [isUpdatingRole, setIsUpdatingRole] = useState(false);

  // Remove Access confirmation state
  const [removeAccessTarget, setRemoveAccessTarget] = useState<UserDoc | null>(null);
  const [isRemovingAccess, setIsRemovingAccess] = useState(false);

  // Password Reset state
  const [resettingUserId, setResettingUserId] = useState<string | null>(null);

  // Edit User Modal State
  const [editingUser, setEditingUser] = useState<UserDoc | null>(null);
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Toast feedback state
  const [toast, setToast] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  // Auto-dismiss toast after 5 seconds
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => {
      setToast(null);
    }, 5000);
    return () => clearTimeout(timer);
  }, [toast]);

  // Modal State for adding new user
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<UserRole>('employee');
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Success state in modal
  const [successInfo, setSuccessInfo] = useState<{ email: string; password: string } | null>(null);
  const [copied, setCopied] = useState(false);

  // Subscribe to users collection
  useEffect(() => {
    setLoading(true);
    setFetchError(null);

    const unsub = onSnapshot(
      collection(db, 'users'),
      (snapshot) => {
        const list: UserDoc[] = snapshot.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            name: data.name || '',
            email: data.email || '',
            role: data.role || 'employee',
            client_ids: data.client_ids || [],
            created_at: data.created_at,
          };
        });
        setUsers(list);
        setLoading(false);
      },
      (error) => {
        console.error('Failed to list users:', error);
        setFetchError(
          error?.message || 'Unable to load users list. Please check your Firestore security permissions.'
        );
        setLoading(false);
      }
    );

    return () => unsub();
  }, []);

  const openAddModal = () => {
    setName('');
    setEmail('');
    setPassword('');
    setRole('employee');
    setErrorMessage(null);
    setSuccessInfo(null);
    setCopied(false);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setErrorMessage(null);
    setSuccessInfo(null);
    setCopied(false);
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const trimmedName = name.trim();
    const trimmedEmail = email.trim();
    const trimmedPassword = password;

    if (!trimmedName) {
      setErrorMessage('Please enter a user name.');
      return;
    }
    if (!trimmedEmail) {
      setErrorMessage('Please enter a valid email address.');
      return;
    }
    if (!trimmedPassword || trimmedPassword.length < 6) {
      setErrorMessage('Temporary password must be at least 6 characters long.');
      return;
    }

    setSubmitting(true);

    try {
      // Create user via secondary app instance to prevent session hijacking
      const result = await createManagedUser({
        name: trimmedName,
        email: trimmedEmail,
        password: trimmedPassword,
        role,
      });

      // Display one-time plaintext credentials to relay
      setSuccessInfo({
        email: result.email,
        password: result.password,
      });
    } catch (err: any) {
      console.error('User creation failed:', err);
      // Display exact error message (handles both Auth failure and Firestore failure)
      setErrorMessage(err?.message || 'Failed to create user. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCopyCredentials = () => {
    if (!successInfo) return;
    const text = `Email: ${successInfo.email}\nPassword: ${successInfo.password}`;
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  // 1. Role Change Handler
  const handleRequestRoleChange = (targetUser: UserDoc, newRole: UserRole) => {
    // Prevent manager from changing their own role via this control
    if (targetUser.id === userDoc?.id) return;
    if (targetUser.role === newRole) return;

    setRoleChangeTarget({
      user: targetUser,
      newRole,
      oldRole: targetUser.role,
    });
  };

  const handleConfirmRoleChange = async () => {
    if (!roleChangeTarget) return;
    setIsUpdatingRole(true);

    try {
      // Update that user's Firestore document with the new role value only via updateDoc
      await updateDoc(doc(db, 'users', roleChangeTarget.user.id), {
        role: roleChangeTarget.newRole,
      });

      const targetDisplayName = roleChangeTarget.user.name || roleChangeTarget.user.email;
      setToast({
        type: 'success',
        text: `Changed ${targetDisplayName}'s role from ${roleChangeTarget.oldRole} to ${roleChangeTarget.newRole}.`,
      });
      setRoleChangeTarget(null);
    } catch (err: any) {
      console.error('Role update failed:', err);
      setToast({
        type: 'error',
        text: err?.message || 'Failed to update user role.',
      });
    } finally {
      setIsUpdatingRole(false);
    }
  };

  // 2. Remove Access Handler
  const handleRequestRemoveAccess = (targetUser: UserDoc) => {
    // Manager should not be able to remove their own access
    if (targetUser.id === userDoc?.id) return;
    setRemoveAccessTarget(targetUser);
  };

  const handleConfirmRemoveAccess = async () => {
    if (!removeAccessTarget) return;
    setIsRemovingAccess(true);

    try {
      // Delete ONLY the Firestore users/{uid} document via deleteDoc. Do NOT attempt to delete the Firebase Auth account.
      await deleteDoc(doc(db, 'users', removeAccessTarget.id));

      const targetDisplayName = removeAccessTarget.name || removeAccessTarget.email;
      setToast({
        type: 'success',
        text: `Access removed for ${targetDisplayName}.`,
      });
      setRemoveAccessTarget(null);
    } catch (err: any) {
      console.error('Remove access failed:', err);
      setToast({
        type: 'error',
        text: err?.message || 'Failed to remove user access.',
      });
    } finally {
      setIsRemovingAccess(false);
    }
  };

  // 3. Send Password Reset Email Handler
  const handleSendPasswordReset = async (targetUser: UserDoc) => {
    if (!targetUser.email) {
      setToast({
        type: 'error',
        text: 'User does not have a valid email address.',
      });
      return;
    }

    setResettingUserId(targetUser.id);
    try {
      // Call sendPasswordResetEmail from firebase/auth using the main app's auth instance
      await sendPasswordResetEmail(auth, targetUser.email);
      setToast({
        type: 'success',
        text: `Password reset email sent to ${targetUser.email}.`,
      });
    } catch (err: any) {
      console.error('Password reset email failed:', err);
      // Show the actual Firebase error message, not a generic failure text
      setToast({
        type: 'error',
        text: err?.message || String(err),
      });
    } finally {
      setResettingUserId(null);
    }
  };

  // 4. Edit User (Name & Email) Handler
  const openEditModal = (targetUser: UserDoc) => {
    // Prevent manager from self-editing here (matches role/remove access safeguards)
    if (targetUser.id === userDoc?.id) return;
    setEditingUser(targetUser);
    setEditName(targetUser.name || '');
    setEditEmail(targetUser.email || '');
    setEditError(null);
  };

  const closeEditModal = () => {
    setEditingUser(null);
    setEditError(null);
  };

  const handleSaveEditUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;

    const trimmedName = editName.trim();
    const trimmedEmail = editEmail.trim();

    if (!trimmedName) {
      setEditError('Please enter a user name.');
      return;
    }
    if (!trimmedEmail) {
      setEditError('Please enter a valid email address.');
      return;
    }

    setIsSavingEdit(true);
    setEditError(null);

    try {
      // Update ONLY the name and email fields on that user's Firestore document via updateDoc
      await updateDoc(doc(db, 'users', editingUser.id), {
        name: trimmedName,
        email: trimmedEmail,
      });

      setToast({
        type: 'success',
        text: `Updated profile details for ${trimmedName}.`,
      });
      setEditingUser(null);
    } catch (err: any) {
      console.error('Failed to update user name and email:', err);
      setEditError(err?.message || 'Failed to update user.');
    } finally {
      setIsSavingEdit(false);
    }
  };

  const roleChangeUserName = roleChangeTarget?.user.name || roleChangeTarget?.user.email || 'User';
  const removeAccessUserName = removeAccessTarget?.name || removeAccessTarget?.email || 'User';

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100">Users</h1>
          <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-0.5">
            Manage organization members, assign roles, reset passwords, and control access
          </p>
        </div>

        {/* Add User Button (manager only) */}
        <button
          id="add-user-btn"
          onClick={openAddModal}
          className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-gradient-to-r from-brand-purple to-brand-blue hover:opacity-90 text-white text-sm font-semibold rounded-lg shadow-xs transition-opacity cursor-pointer shrink-0"
        >
          <UserPlus className="w-4 h-4" />
          <span>Add User</span>
        </button>
      </div>

      {/* Toast Feedback Banner */}
      {toast && (
        <div
          className={`fixed bottom-5 right-5 z-50 max-w-md p-4 rounded-xl border shadow-lg flex items-start gap-3 transition-all animate-in fade-in slide-in-from-bottom-3 ${
            toast.type === 'success'
              ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200'
              : 'bg-red-50 dark:bg-red-950/60 border-red-200 dark:border-red-800 text-red-900 dark:text-red-200'
          }`}
        >
          {toast.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
          ) : (
            <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
          )}
          <div className="flex-1 text-sm font-medium pr-2 break-words">
            {toast.text}
          </div>
          <button
            type="button"
            onClick={() => setToast(null)}
            className="text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 p-0.5 rounded cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Fetch Error Banner */}
      {fetchError && (
        <div className="p-4 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-xl flex items-start gap-3 text-sm text-amber-900 dark:text-amber-200 transition-colors">
          <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold block mb-0.5">Permission / Database Notice</span>
            <p className="text-xs text-amber-800 dark:text-amber-300">{fetchError}</p>
          </div>
        </div>
      )}

      {/* Users Table */}
      <div className="bg-white dark:bg-neutral-800 rounded-xl border border-neutral-200 dark:border-neutral-700 shadow-xs overflow-hidden transition-colors">
        {loading ? (
          <div className="p-12 text-center text-neutral-500 dark:text-neutral-400 text-sm">
            <div className="w-6 h-6 border-2 border-neutral-300 dark:border-neutral-600 border-t-neutral-800 dark:border-t-neutral-100 rounded-full animate-spin mx-auto mb-2" />
            Loading users...
          </div>
        ) : users.length === 0 ? (
          <div className="p-12 text-center">
            <ShieldCheck className="w-10 h-10 text-neutral-300 dark:text-neutral-600 mx-auto mb-3" />
            <p className="text-sm font-semibold text-neutral-800 dark:text-neutral-200">No users found</p>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1 max-w-sm mx-auto">
              No user documents were found in the database. Click "Add User" to register a team member.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-neutral-200 dark:border-neutral-700 bg-neutral-50/75 dark:bg-neutral-800/60 text-xs font-semibold uppercase tracking-wider text-neutral-600 dark:text-neutral-400">
                  <th className="py-3 px-4">Name</th>
                  <th className="py-3 px-4">Email</th>
                  <th className="py-3 px-4">Role</th>
                  <th className="py-3 px-4">Client Scope</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200 dark:divide-neutral-700 text-sm">
                {users.map((u) => {
                  const roleStyle = roleBadges[u.role] || roleBadges.employee;
                  const isCurrentUser = u.id === userDoc?.id;
                  const clientScopeDisplay =
                    !u.client_ids || u.client_ids.length === 0
                      ? 'All Clients'
                      : `${u.client_ids.length} ${u.client_ids.length === 1 ? 'client' : 'clients'}`;

                  return (
                    <tr key={u.id} className="hover:bg-neutral-50/80 dark:hover:bg-neutral-700/50 transition-colors">
                      <td className="py-3.5 px-4 font-medium text-neutral-900 dark:text-neutral-100">
                        <div className="flex items-center gap-2">
                          <span>{u.name || '—'}</span>
                          {isCurrentUser && (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-purple-100 dark:bg-purple-900/50 text-brand-purple dark:text-purple-300 border border-purple-200 dark:border-purple-800">
                              You
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-neutral-600 dark:text-neutral-400 font-mono text-xs">
                        {u.email}
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2">
                          <span
                            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${roleStyle.bg} ${roleStyle.text} ${roleStyle.border}`}
                          >
                            {roleStyle.label}
                          </span>

                          {/* Role Change Control: small dropdown next to Role badge (prevent manager from changing their OWN role) */}
                          {!isCurrentUser ? (
                            <div className="relative inline-flex items-center" title="Change user role">
                              <select
                                aria-label={`Change role for ${u.name || u.email}`}
                                value={u.role}
                                onChange={(e) => handleRequestRoleChange(u, e.target.value as UserRole)}
                                className="text-xs font-medium bg-neutral-50 dark:bg-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-600 border border-neutral-300 dark:border-neutral-600 rounded-md py-1 pl-2 pr-6 text-neutral-700 dark:text-neutral-200 appearance-none focus:outline-none focus:ring-1 focus:ring-brand-blue cursor-pointer transition-colors"
                              >
                                <option value="employee">Employee</option>
                                <option value="tl">Team Lead (tl)</option>
                                <option value="manager">Manager</option>
                              </select>
                              <ChevronDown className="w-3.5 h-3.5 text-neutral-400 dark:text-neutral-500 absolute right-1.5 pointer-events-none" />
                            </div>
                          ) : (
                            <span className="text-[11px] text-neutral-400 dark:text-neutral-500 italic">(Current user)</span>
                          )}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-neutral-600 dark:text-neutral-400 text-xs">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-md font-medium ${
                            clientScopeDisplay === 'All Clients'
                              ? 'bg-neutral-100 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-300'
                              : 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800'
                          }`}
                        >
                          {clientScopeDisplay}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {/* Edit User (pencil icon) - manager only, hidden on manager's own row */}
                          {!isCurrentUser && (
                            <button
                              type="button"
                              id={`edit-user-${u.id}`}
                              onClick={() => openEditModal(u)}
                              title={`Edit name and email for ${u.name || u.email}`}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-neutral-700 dark:text-neutral-300 bg-neutral-50 dark:bg-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-600 hover:text-neutral-900 dark:hover:text-neutral-100 border border-neutral-200 dark:border-neutral-600 rounded-lg transition-colors cursor-pointer"
                            >
                              <Pencil className="w-3.5 h-3.5 text-neutral-500 dark:text-neutral-400" />
                              <span>Edit</span>
                            </button>
                          )}

                          {/* Send Password Reset Email */}
                          <button
                            type="button"
                            onClick={() => handleSendPasswordReset(u)}
                            disabled={resettingUserId === u.id}
                            title={`Send password reset email to ${u.email}`}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-neutral-700 dark:text-neutral-300 bg-neutral-50 dark:bg-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-600 hover:text-neutral-900 dark:hover:text-neutral-100 border border-neutral-200 dark:border-neutral-600 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                          >
                            <KeyRound className={`w-3.5 h-3.5 text-neutral-500 dark:text-neutral-400 ${resettingUserId === u.id ? 'animate-spin' : ''}`} />
                            <span>{resettingUserId === u.id ? 'Sending...' : 'Reset Password'}</span>
                          </button>

                          {/* Remove Access Trash Button (manager only, hidden on manager's own row) */}
                          {!isCurrentUser && (
                            <button
                              type="button"
                              onClick={() => handleRequestRemoveAccess(u)}
                              title={`Remove access for ${u.name || u.email}`}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-red-600 dark:text-red-400 bg-red-50/70 dark:bg-red-950/40 hover:bg-red-100 dark:hover:bg-red-900/50 hover:text-red-700 dark:hover:text-red-300 border border-red-200 dark:border-red-800 rounded-lg transition-colors cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5 text-red-500 dark:text-red-400" />
                              <span>Remove Access</span>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Confirmation Dialog: Role Change */}
      <ConfirmDialog
        isOpen={Boolean(roleChangeTarget)}
        title="Change User Role"
        message={`Change ${roleChangeUserName}'s role from ${roleChangeTarget?.oldRole} to ${roleChangeTarget?.newRole}?`}
        confirmLabel="Change Role"
        cancelLabel="Cancel"
        isDestructive={false}
        isLoading={isUpdatingRole}
        onConfirm={handleConfirmRoleChange}
        onCancel={() => setRoleChangeTarget(null)}
      />

      {/* Confirmation Dialog: Remove Access */}
      <ConfirmDialog
        isOpen={Boolean(removeAccessTarget)}
        title="Remove User Access"
        message={`This removes ${removeAccessUserName}'s access to the app immediately — they'll be locked out on next login. Their login email itself isn't deleted from Firebase, just their access to this app's data.`}
        confirmLabel="Remove Access"
        cancelLabel="Cancel"
        isDestructive={true}
        isLoading={isRemovingAccess}
        onConfirm={handleConfirmRemoveAccess}
        onCancel={() => setRemoveAccessTarget(null)}
      />

      {/* Add User Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
          <div className="bg-white dark:bg-neutral-800 rounded-xl shadow-xl max-w-md w-full border border-neutral-200 dark:border-neutral-700 p-6 transition-colors">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-neutral-200 dark:border-neutral-700 mb-4">
              <h2 className="text-lg font-bold text-neutral-900 dark:text-neutral-100">
                {successInfo ? 'User Created' : 'Add New User'}
              </h2>
              <button
                type="button"
                onClick={closeModal}
                className="p-1 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 rounded-md transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Success State View */}
            {successInfo ? (
              <div className="space-y-4">
                <div className="p-4 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-xl flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                  <div className="text-xs text-emerald-900 dark:text-emerald-200 leading-relaxed">
                    <span className="font-semibold block text-sm mb-1 text-emerald-950 dark:text-emerald-100">
                      User Created Successfully
                    </span>
                    User created. Share these credentials with them:{' '}
                    <strong className="text-emerald-950 dark:text-emerald-100">{successInfo.email}</strong> /{' '}
                    <strong className="text-emerald-950 dark:text-emerald-100 font-mono">{successInfo.password}</strong>
                  </div>
                </div>

                <div className="bg-neutral-50 dark:bg-neutral-900/60 border border-neutral-200 dark:border-neutral-700 rounded-lg p-3 text-xs space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-neutral-500 dark:text-neutral-400">Email:</span>
                    <span className="font-medium text-neutral-800 dark:text-neutral-200 font-mono">{successInfo.email}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-neutral-500 dark:text-neutral-400">Temporary Password:</span>
                    <span className="font-medium text-neutral-800 dark:text-neutral-200 font-mono">{successInfo.password}</span>
                  </div>
                </div>

                <div className="text-xs text-neutral-400 dark:text-neutral-500 italic">
                  Note: The password will not be shown again once you close this modal.
                </div>

                <div className="pt-2 flex items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={handleCopyCredentials}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-neutral-700 dark:text-neutral-300 bg-neutral-100 dark:bg-neutral-700 hover:bg-neutral-200 dark:hover:bg-neutral-600 rounded-lg transition-colors cursor-pointer"
                  >
                    {copied ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                        <span>Copied!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copy Credentials</span>
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={closeModal}
                    className="px-4 py-2 text-xs font-semibold text-white bg-gradient-to-r from-brand-purple to-brand-blue hover:opacity-90 rounded-lg transition-opacity cursor-pointer"
                  >
                    Done
                  </button>
                </div>
              </div>
            ) : (
              /* Create User Form */
              <form onSubmit={handleCreateUser} className="space-y-4">
                {errorMessage && (
                  <div
                    id="add-user-error-alert"
                    className="p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded-lg flex items-start gap-2 text-xs text-red-700 dark:text-red-300 leading-relaxed"
                  >
                    <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
                    <span>{errorMessage}</span>
                  </div>
                )}

                <div>
                  <label
                    htmlFor="user-name-input"
                    className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 uppercase tracking-wider mb-1"
                  >
                    Name *
                  </label>
                  <input
                    id="user-name-input"
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Full name"
                    className="w-full px-3 py-2 text-sm border border-neutral-300 dark:border-neutral-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue bg-white dark:bg-neutral-700 text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 dark:placeholder:text-neutral-400"
                  />
                </div>

                <div>
                  <label
                    htmlFor="user-email-input"
                    className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 uppercase tracking-wider mb-1"
                  >
                    Email Address *
                  </label>
                  <input
                    id="user-email-input"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="user@example.com"
                    className="w-full px-3 py-2 text-sm border border-neutral-300 dark:border-neutral-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue bg-white dark:bg-neutral-700 text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 dark:placeholder:text-neutral-400"
                  />
                </div>

                <div>
                  <label
                    htmlFor="user-password-input"
                    className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 uppercase tracking-wider mb-1"
                  >
                    Temporary Password * (min 6 characters)
                  </label>
                  <input
                    id="user-password-input"
                    type="text"
                    required
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Temporary password"
                    className="w-full px-3 py-2 text-sm border border-neutral-300 dark:border-neutral-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue font-mono bg-white dark:bg-neutral-700 text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 dark:placeholder:text-neutral-400"
                  />
                </div>

                <div>
                  <label
                    htmlFor="user-role-select"
                    className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 uppercase tracking-wider mb-1"
                  >
                    Role *
                  </label>
                  <select
                    id="user-role-select"
                    value={role}
                    onChange={(e) => setRole(e.target.value as UserRole)}
                    className="w-full px-3 py-2 text-sm border border-neutral-300 dark:border-neutral-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue bg-white dark:bg-neutral-700 text-neutral-900 dark:text-neutral-100"
                  >
                    <option value="employee">Employee</option>
                    <option value="tl">Team Lead (tl)</option>
                    <option value="manager">Manager</option>
                  </select>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-semibold text-neutral-400 dark:text-neutral-500 uppercase tracking-wider">
                      Client Scope
                    </label>
                    <span className="text-[11px] text-neutral-400 dark:text-neutral-500 flex items-center gap-1">
                      <Info className="w-3 h-3" />
                      Client scoping UI coming in a later phase.
                    </span>
                  </div>
                  <div
                    title="Client scoping UI coming in a later phase."
                    className="w-full px-3 py-2 text-xs border border-neutral-200 dark:border-neutral-700 bg-neutral-100 dark:bg-neutral-900/40 text-neutral-400 dark:text-neutral-500 rounded-lg cursor-not-allowed select-none"
                  >
                    [ Placeholder — All clients assigned by default ]
                  </div>
                </div>

                <div className="pt-2 flex items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={closeModal}
                    disabled={submitting}
                    className="px-4 py-2 text-sm font-medium text-neutral-700 dark:text-neutral-300 bg-white dark:bg-neutral-700 border border-neutral-300 dark:border-neutral-600 rounded-lg hover:bg-neutral-50 dark:hover:bg-neutral-600 transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    id="user-submit-modal-btn"
                    type="submit"
                    disabled={submitting}
                    className="px-4 py-2 text-sm font-semibold text-white bg-gradient-to-r from-brand-purple to-brand-blue hover:opacity-90 rounded-lg transition-opacity disabled:opacity-50 cursor-pointer"
                  >
                    {submitting ? 'Creating User...' : 'Create User'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Edit User Modal (Manager only, updates ONLY name and email) */}
      {editingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
          <div className="bg-white dark:bg-neutral-800 rounded-xl shadow-xl max-w-md w-full border border-neutral-200 dark:border-neutral-700 p-6 transition-colors">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-neutral-200 dark:border-neutral-700 mb-4">
              <div>
                <h2 className="text-lg font-bold text-neutral-900 dark:text-neutral-100">
                  Edit User
                </h2>
                <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
                  Update name and display email address
                </p>
              </div>
              <button
                type="button"
                onClick={closeEditModal}
                className="p-1 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 rounded-md transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Error Message */}
            {editError && (
              <div className="mb-4 p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded-lg text-xs text-red-700 dark:text-red-300">
                {editError}
              </div>
            )}

            <form onSubmit={handleSaveEditUser} className="space-y-4">
              {/* Name Field */}
              <div>
                <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 uppercase tracking-wider mb-1">
                  Name *
                </label>
                <input
                  id="edit-user-name-input"
                  type="text"
                  required
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="e.g. Jane Doe"
                  className="w-full px-3 py-2 text-sm border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-700/60 rounded-lg text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-brand-blue/30 focus:border-brand-blue transition-colors"
                />
              </div>

              {/* CRITICAL — Persistent Warning Banner above Email field, visible every time modal opens */}
              <div className="p-3.5 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-xl flex items-start gap-2.5 text-xs text-amber-900 dark:text-amber-200 shadow-xs">
                <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <p className="leading-relaxed">
                  Changing this only updates the email shown in the app and used for reminders. It does NOT change their actual login — they will still sign in with their current email. To change their login email, an admin must also update it manually in the Firebase Console under Authentication → Users, matching this new value exactly.
                </p>
              </div>

              {/* Email Field */}
              <div>
                <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 uppercase tracking-wider mb-1">
                  Email *
                </label>
                <input
                  id="edit-user-email-input"
                  type="email"
                  required
                  value={editEmail}
                  onChange={(e) => setEditEmail(e.target.value)}
                  placeholder="e.g. jane@company.com"
                  className="w-full px-3 py-2 text-sm border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-700/60 rounded-lg text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-brand-blue/30 focus:border-brand-blue transition-colors font-mono"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={closeEditModal}
                  disabled={isSavingEdit}
                  className="px-4 py-2 text-sm font-medium text-neutral-700 dark:text-neutral-300 bg-white dark:bg-neutral-700 border border-neutral-300 dark:border-neutral-600 rounded-lg hover:bg-neutral-50 dark:hover:bg-neutral-600 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  id="save-edit-user-btn"
                  type="submit"
                  disabled={isSavingEdit}
                  className="px-4 py-2 text-sm font-semibold text-white bg-gradient-to-r from-brand-purple to-brand-blue hover:opacity-90 rounded-lg transition-opacity disabled:opacity-50 cursor-pointer"
                >
                  {isSavingEdit ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
