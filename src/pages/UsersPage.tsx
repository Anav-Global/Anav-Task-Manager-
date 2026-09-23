import React, { useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import {
  collection,
  onSnapshot,
} from 'firebase/firestore';
import {
  UserPlus,
  X,
  AlertCircle,
  CheckCircle2,
  Copy,
  Check,
  ShieldCheck,
  Info,
} from 'lucide-react';
import { db } from '../firebase/config';
import { useAuth } from '../context/AuthContext';
import { createManagedUser } from '../firebase/secondaryAuth';
import type { UserDoc, UserRole } from '../types';

const roleBadges: Record<UserRole, { bg: string; text: string; border: string; label: string }> = {
  manager: {
    bg: 'bg-purple-50',
    text: 'text-brand-purple',
    border: 'border-purple-200',
    label: 'Manager',
  },
  tl: {
    bg: 'bg-purple-50',
    text: 'text-brand-purple',
    border: 'border-purple-200',
    label: 'Team Lead',
  },
  employee: {
    bg: 'bg-emerald-50',
    text: 'text-emerald-700',
    border: 'border-emerald-200',
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

  // Modal State
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

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Users</h1>
          <p className="text-sm text-neutral-500 mt-0.5">
            Manage organization members and assign authorization roles
          </p>
        </div>

        {/* Add User Button (tl/manager only) */}
        <button
          id="add-user-btn"
          onClick={openAddModal}
          className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-gradient-to-r from-brand-purple to-brand-blue hover:opacity-90 text-white text-sm font-semibold rounded-lg shadow-xs transition-opacity cursor-pointer shrink-0"
        >
          <UserPlus className="w-4 h-4" />
          <span>Add User</span>
        </button>
      </div>

      {/* Fetch Error Banner */}
      {fetchError && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-3 text-sm text-amber-900">
          <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold block mb-0.5">Permission / Database Notice</span>
            <p className="text-xs text-amber-800">{fetchError}</p>
          </div>
        </div>
      )}

      {/* Users Table */}
      <div className="bg-white rounded-xl border border-neutral-200 shadow-xs overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-neutral-500 text-sm">
            <div className="w-6 h-6 border-2 border-neutral-300 border-t-neutral-800 rounded-full animate-spin mx-auto mb-2" />
            Loading users...
          </div>
        ) : users.length === 0 ? (
          <div className="p-12 text-center">
            <ShieldCheck className="w-10 h-10 text-neutral-300 mx-auto mb-3" />
            <p className="text-sm font-semibold text-neutral-800">No users found</p>
            <p className="text-xs text-neutral-500 mt-1 max-w-sm mx-auto">
              No user documents were found in the database. Click "Add User" to register a team member.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-neutral-200 bg-neutral-50/75 text-xs font-semibold uppercase tracking-wider text-neutral-600">
                  <th className="py-3 px-4">Name</th>
                  <th className="py-3 px-4">Email</th>
                  <th className="py-3 px-4">Role</th>
                  <th className="py-3 px-4">Client Scope</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200 text-sm">
                {users.map((u) => {
                  const roleStyle = roleBadges[u.role] || roleBadges.employee;
                  const clientScopeDisplay =
                    !u.client_ids || u.client_ids.length === 0
                      ? 'All Clients'
                      : `${u.client_ids.length} ${u.client_ids.length === 1 ? 'client' : 'clients'}`;

                  return (
                    <tr key={u.id} className="hover:bg-neutral-50/80 transition-colors">
                      <td className="py-3.5 px-4 font-medium text-neutral-900">
                        {u.name || '—'}
                      </td>
                      <td className="py-3.5 px-4 text-neutral-600">
                        {u.email}
                      </td>
                      <td className="py-3.5 px-4">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${roleStyle.bg} ${roleStyle.text} ${roleStyle.border}`}
                        >
                          {roleStyle.label}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-neutral-600 text-xs">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-md font-medium ${
                            clientScopeDisplay === 'All Clients'
                              ? 'bg-neutral-100 text-neutral-700'
                              : 'bg-blue-50 text-blue-700 border border-blue-200'
                          }`}
                        >
                          {clientScopeDisplay}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add User Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full border border-neutral-200 p-6">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-neutral-200 mb-4">
              <h2 className="text-lg font-bold text-neutral-900">
                {successInfo ? 'User Created' : 'Add New User'}
              </h2>
              <button
                type="button"
                onClick={closeModal}
                className="p-1 text-neutral-400 hover:text-neutral-600 rounded-md transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Success State View */}
            {successInfo ? (
              <div className="space-y-4">
                <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                  <div className="text-xs text-emerald-900 leading-relaxed">
                    <span className="font-semibold block text-sm mb-1 text-emerald-950">
                      User Created Successfully
                    </span>
                    User created. Share these credentials with them:{' '}
                    <strong className="text-emerald-950">{successInfo.email}</strong> /{' '}
                    <strong className="text-emerald-950 font-mono">{successInfo.password}</strong>
                  </div>
                </div>

                <div className="bg-neutral-50 border border-neutral-200 rounded-lg p-3 text-xs space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-neutral-500">Email:</span>
                    <span className="font-medium text-neutral-800 font-mono">{successInfo.email}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-neutral-500">Temporary Password:</span>
                    <span className="font-medium text-neutral-800 font-mono">{successInfo.password}</span>
                  </div>
                </div>

                <div className="text-xs text-neutral-400 italic">
                  Note: The password will not be shown again once you close this modal.
                </div>

                <div className="pt-2 flex items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={handleCopyCredentials}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-neutral-700 bg-neutral-100 hover:bg-neutral-200 rounded-lg transition-colors cursor-pointer"
                  >
                    {copied ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
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
                    className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2 text-xs text-red-700 leading-relaxed"
                  >
                    <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                    <span>{errorMessage}</span>
                  </div>
                )}

                <div>
                  <label
                    htmlFor="user-name-input"
                    className="block text-xs font-semibold text-neutral-700 uppercase tracking-wider mb-1"
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
                    className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue"
                  />
                </div>

                <div>
                  <label
                    htmlFor="user-email-input"
                    className="block text-xs font-semibold text-neutral-700 uppercase tracking-wider mb-1"
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
                    className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue"
                  />
                </div>

                <div>
                  <label
                    htmlFor="user-password-input"
                    className="block text-xs font-semibold text-neutral-700 uppercase tracking-wider mb-1"
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
                    className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue font-mono"
                  />
                </div>

                <div>
                  <label
                    htmlFor="user-role-select"
                    className="block text-xs font-semibold text-neutral-700 uppercase tracking-wider mb-1"
                  >
                    Role *
                  </label>
                  <select
                    id="user-role-select"
                    value={role}
                    onChange={(e) => setRole(e.target.value as UserRole)}
                    className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue bg-white"
                  >
                    <option value="employee">Employee</option>
                    <option value="tl">Team Lead (tl)</option>
                    <option value="manager">Manager</option>
                  </select>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider">
                      Client Scope
                    </label>
                    <span className="text-[11px] text-neutral-400 flex items-center gap-1">
                      <Info className="w-3 h-3" />
                      Client scoping UI coming in a later phase.
                    </span>
                  </div>
                  <div
                    title="Client scoping UI coming in a later phase."
                    className="w-full px-3 py-2 text-xs border border-neutral-200 bg-neutral-100 text-neutral-400 rounded-lg cursor-not-allowed select-none"
                  >
                    [ Placeholder — All clients assigned by default ]
                  </div>
                </div>

                <div className="pt-2 flex items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={closeModal}
                    disabled={submitting}
                    className="px-4 py-2 text-sm font-medium text-neutral-700 bg-white border border-neutral-300 rounded-lg hover:bg-neutral-50 transition-colors cursor-pointer"
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
    </div>
  );
};
