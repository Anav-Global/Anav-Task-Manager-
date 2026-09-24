import React, { useState, useEffect, useMemo } from 'react';
import {
  collection,
  onSnapshot,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
} from 'firebase/firestore';
import {
  Plus,
  Edit2,
  Trash2,
  FolderTree,
  X,
  AlertCircle,
  Users,
} from 'lucide-react';
import { db } from '../firebase/config';
import { handleFirestoreError, OperationType } from '../firebase/errors';
import { useAuth } from '../context/AuthContext';
import { ConfirmDialog } from '../components/ConfirmDialog';
import type { Client, ClientGroup } from '../types';

export const GroupsPage: React.FC = () => {
  const { user, userDoc } = useAuth();
  const isPrivileged = userDoc?.role === 'tl' || userDoc?.role === 'manager';

  const [groups, setGroups] = useState<ClientGroup[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal State for Add / Edit
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<ClientGroup | null>(null);
  const [formName, setFormName] = useState('');
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Delete State
  const [deleteTarget, setDeleteTarget] = useState<ClientGroup | null>(null);
  const [blockedDeleteMessage, setBlockedDeleteMessage] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Subscribe to groups
  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'client_groups'),
      (snapshot) => {
        const list: ClientGroup[] = snapshot.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            name: data.name || '',
            created_at: data.created_at,
            created_by: data.created_by || '',
          };
        });
        setGroups(list);
        setLoading(false);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'client_groups');
        setLoading(false);
      }
    );
    return () => unsub();
  }, []);

  // Subscribe to clients to compute client count per group
  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'clients'),
      (snapshot) => {
        const list: Client[] = snapshot.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            name: data.name || '',
            group_id: data.group_id ?? null,
            status: data.status === 'inactive' ? 'inactive' : 'active',
            contact_info: data.contact_info || '',
            created_at: data.created_at,
            created_by: data.created_by || '',
          };
        });
        setClients(list);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'clients');
      }
    );
    return () => unsub();
  }, []);

  // Count clients per group ID
  const clientCountByGroupId = useMemo(() => {
    const counts = new Map<string, number>();
    clients.forEach((client) => {
      if (client.group_id) {
        counts.set(client.group_id, (counts.get(client.group_id) || 0) + 1);
      }
    });
    return counts;
  }, [clients]);

  const openAddModal = () => {
    setEditingGroup(null);
    setFormName('');
    setFormError(null);
    setIsModalOpen(true);
  };

  const openEditModal = (group: ClientGroup) => {
    setEditingGroup(group);
    setFormName(group.name);
    setFormError(null);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingGroup(null);
    setFormError(null);
  };

  const handleSaveGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isPrivileged) return;

    const trimmedName = formName.trim();
    if (!trimmedName) {
      setFormError('Group name is required.');
      return;
    }

    setFormSubmitting(true);
    setFormError(null);

    try {
      if (editingGroup) {
        // Update group name
        const groupRef = doc(db, 'client_groups', editingGroup.id);
        await updateDoc(groupRef, {
          name: trimmedName,
        });
      } else {
        // Create new group - strictly matching schema:
        // name, created_at, created_by
        await addDoc(collection(db, 'client_groups'), {
          name: trimmedName,
          created_at: serverTimestamp(),
          created_by: user?.uid || '',
        });
      }
      closeModal();
    } catch (err: any) {
      console.error('Failed to save group:', err);
      setFormError(err?.message || 'Error saving group. Please check your permissions.');
    } finally {
      setFormSubmitting(false);
    }
  };

  const initiateDelete = (group: ClientGroup) => {
    if (!isPrivileged) return;
    const assignedClients = clientCountByGroupId.get(group.id) || 0;

    if (assignedClients > 0) {
      // BLOCK deletion with clear error message
      setBlockedDeleteMessage(
        `Cannot delete group "${group.name}": There are ${assignedClients} client(s) currently assigned to this group. Please reassign or remove them before deleting.`
      );
      return;
    }

    // Safe to delete: open confirmation dialog
    setDeleteTarget(group);
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget || !isPrivileged) return;

    // Double check that no clients are referencing this group
    const assignedClients = clientCountByGroupId.get(deleteTarget.id) || 0;
    if (assignedClients > 0) {
      setDeleteTarget(null);
      setBlockedDeleteMessage(
        `Cannot delete group "${deleteTarget.name}": There are ${assignedClients} client(s) currently assigned to this group. Please reassign or remove them before deleting.`
      );
      return;
    }

    setIsDeleting(true);
    try {
      await deleteDoc(doc(db, 'client_groups', deleteTarget.id));
      setDeleteTarget(null);
    } catch (err: any) {
      console.error('Failed to delete group:', err);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100">Groups</h1>
          <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-0.5">
            Client groupings and portfolio categories
          </p>
        </div>

        {/* tl and manager only: Add Group button */}
        {isPrivileged && (
          <button
            id="add-group-btn"
            onClick={openAddModal}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-gradient-to-r from-brand-purple to-brand-blue hover:opacity-90 text-white text-sm font-semibold rounded-lg shadow-xs transition-opacity cursor-pointer shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>Add Group</span>
          </button>
        )}
      </div>

      {/* Blocked Delete Notification Banner */}
      {blockedDeleteMessage && (
        <div
          id="blocked-delete-alert"
          className="p-4 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-xl flex items-start justify-between gap-3 text-sm text-amber-900 dark:text-amber-200 shadow-xs transition-colors"
        >
          <div className="flex items-start gap-2.5">
            <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <span className="font-semibold block">Deletion Blocked</span>
              <p className="text-xs text-amber-800 dark:text-amber-300 leading-relaxed">{blockedDeleteMessage}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setBlockedDeleteMessage(null)}
            className="p-1 text-amber-600 dark:text-amber-400 hover:text-amber-900 dark:hover:text-amber-200 rounded-md transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Groups List */}
      <div className="bg-white dark:bg-neutral-800 rounded-xl border border-neutral-200 dark:border-neutral-700 shadow-xs overflow-hidden transition-colors">
        {loading ? (
          <div className="p-12 text-center text-neutral-500 dark:text-neutral-400 text-sm">
            <div className="w-6 h-6 border-2 border-neutral-300 dark:border-neutral-600 border-t-neutral-800 dark:border-t-neutral-100 rounded-full animate-spin mx-auto mb-2" />
            Loading groups...
          </div>
        ) : groups.length === 0 ? (
          <div className="p-12 text-center">
            <FolderTree className="w-10 h-10 text-neutral-300 dark:text-neutral-600 mx-auto mb-3" />
            <p className="text-sm font-semibold text-neutral-800 dark:text-neutral-200">No groups found</p>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1 max-w-sm mx-auto">
              {isPrivileged
                ? 'No client groups have been created yet. Click "Add Group" to create the first group.'
                : 'No client groups are currently available in the database.'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-neutral-200 dark:divide-neutral-700">
            {groups.map((group) => {
              const clientCount = clientCountByGroupId.get(group.id) || 0;

              return (
                <div
                  key={group.id}
                  className="p-4 sm:p-5 flex items-center justify-between hover:bg-neutral-50/70 dark:hover:bg-neutral-700/50 transition-colors"
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    <div className="w-10 h-10 rounded-lg bg-neutral-100 dark:bg-neutral-700 border border-neutral-200 dark:border-neutral-600 text-neutral-700 dark:text-neutral-300 flex items-center justify-center shrink-0">
                      <FolderTree className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100 truncate">
                        {group.name}
                      </h3>
                      <div className="flex items-center gap-1.5 mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
                        <Users className="w-3.5 h-3.5 text-neutral-400 dark:text-neutral-500" />
                        <span>
                          {clientCount} {clientCount === 1 ? 'client' : 'clients'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Privileged controls: Edit and Delete */}
                  {isPrivileged && (
                    <div className="flex items-center gap-1.5 shrink-0 ml-4">
                      <button
                        id={`edit-group-${group.id}`}
                        type="button"
                        onClick={() => openEditModal(group)}
                        className="p-2 text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 hover:bg-neutral-100 dark:hover:bg-neutral-700 rounded-lg transition-colors cursor-pointer"
                        title="Edit Group"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        id={`delete-group-${group.id}`}
                        type="button"
                        onClick={() => initiateDelete(group)}
                        className="p-2 text-neutral-500 dark:text-neutral-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-lg transition-colors cursor-pointer"
                        title="Delete Group"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Add / Edit Group Modal (tl / manager only) */}
      {isModalOpen && isPrivileged && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
          <div className="bg-white dark:bg-neutral-800 rounded-xl shadow-xl max-w-md w-full border border-neutral-200 dark:border-neutral-700 p-6 transition-colors">
            <div className="flex items-center justify-between pb-3 border-b border-neutral-200 dark:border-neutral-700 mb-4">
              <h2 className="text-lg font-bold text-neutral-900 dark:text-neutral-100">
                {editingGroup ? 'Edit Group' : 'Add Group'}
              </h2>
              <button
                type="button"
                onClick={closeModal}
                className="p-1 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 rounded-md transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {formError && (
              <div className="mb-4 p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded-lg text-xs text-red-700 dark:text-red-300">
                {formError}
              </div>
            )}

            <form onSubmit={handleSaveGroup} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 uppercase tracking-wider mb-1">
                  Group Name *
                </label>
                <input
                  id="group-name-input"
                  type="text"
                  required
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="Enterprise Clients"
                  className="w-full px-3 py-2 text-sm border border-neutral-300 dark:border-neutral-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue bg-white dark:bg-neutral-700 text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 dark:placeholder:text-neutral-400"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={closeModal}
                  disabled={formSubmitting}
                  className="px-4 py-2 text-sm font-medium text-neutral-700 dark:text-neutral-300 bg-white dark:bg-neutral-700 border border-neutral-300 dark:border-neutral-600 rounded-lg hover:bg-neutral-50 dark:hover:bg-neutral-600 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  id="group-submit-modal-btn"
                  type="submit"
                  disabled={formSubmitting}
                  className="px-4 py-2 text-sm font-semibold text-white bg-gradient-to-r from-brand-purple to-brand-blue hover:opacity-90 rounded-lg transition-opacity disabled:opacity-50 cursor-pointer"
                >
                  {formSubmitting ? 'Saving...' : editingGroup ? 'Save Changes' : 'Create Group'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={Boolean(deleteTarget)}
        title="Delete Group"
        message={`Are you sure you want to delete group "${deleteTarget?.name}"? This action cannot be undone.`}
        confirmLabel="Confirm Delete"
        isLoading={isDeleting}
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
};
