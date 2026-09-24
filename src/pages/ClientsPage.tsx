import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
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
  Building,
  Filter,
  Eye,
  EyeOff,
  X,
  Phone,
} from 'lucide-react';
import { db } from '../firebase/config';
import { handleFirestoreError, OperationType } from '../firebase/errors';
import { useAuth } from '../context/AuthContext';
import { ConfirmDialog } from '../components/ConfirmDialog';
import type { Client, ClientGroup } from '../types';

export const ClientsPage: React.FC = () => {
  const { user, userDoc } = useAuth();
  const isPrivileged = userDoc?.role === 'tl' || userDoc?.role === 'manager';

  const [clients, setClients] = useState<Client[]>([]);
  const [groups, setGroups] = useState<ClientGroup[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [selectedGroupFilter, setSelectedGroupFilter] = useState<string>('all');
  const [showInactive, setShowInactive] = useState<boolean>(false);

  // Modal State for Add / Edit
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [formName, setFormName] = useState('');
  const [formGroupId, setFormGroupId] = useState<string>('');
  const [formStatus, setFormStatus] = useState<'active' | 'inactive'>('active');
  const [formContactInfo, setFormContactInfo] = useState('');
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Delete State
  const [deleteTarget, setDeleteTarget] = useState<Client | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Fetch groups
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
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'client_groups');
      }
    );
    return () => unsub();
  }, []);

  // Fetch clients
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
        setLoading(false);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'clients');
        setLoading(false);
      }
    );
    return () => unsub();
  }, []);

  // Map of group_id -> group name
  const groupMap = useMemo(() => {
    const map = new Map<string, string>();
    groups.forEach((g) => map.set(g.id, g.name));
    return map;
  }, [groups]);

  // Client scoping filter based on userDoc.client_ids (if configured for user)
  const scopedClients = useMemo(() => {
    if (userDoc?.client_ids && userDoc.client_ids.length > 0) {
      const allowedSet = new Set(userDoc.client_ids);
      return clients.filter((c) => allowedSet.has(c.id));
    }
    return clients;
  }, [clients, userDoc]);

  // Filtered clients
  const filteredClients = useMemo(() => {
    return scopedClients.filter((client) => {
      // Inactive filter
      if (!showInactive && client.status === 'inactive') {
        return false;
      }
      // Group filter
      if (selectedGroupFilter === 'all') {
        return true;
      }
      if (selectedGroupFilter === 'unassigned') {
        return !client.group_id;
      }
      return client.group_id === selectedGroupFilter;
    });
  }, [scopedClients, showInactive, selectedGroupFilter]);

  const openAddModal = () => {
    setEditingClient(null);
    setFormName('');
    setFormGroupId('');
    setFormStatus('active');
    setFormContactInfo('');
    setFormError(null);
    setIsModalOpen(true);
  };

  const openEditModal = (client: Client) => {
    setEditingClient(client);
    setFormName(client.name);
    setFormGroupId(client.group_id || '');
    setFormStatus(client.status);
    setFormContactInfo(client.contact_info || '');
    setFormError(null);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingClient(null);
    setFormError(null);
  };

  const handleSaveClient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isPrivileged) return;

    const trimmedName = formName.trim();
    if (!trimmedName) {
      setFormError('Client name is required.');
      return;
    }

    setFormSubmitting(true);
    setFormError(null);

    const targetGroupId = formGroupId.trim() ? formGroupId.trim() : null;
    const targetContactInfo = formContactInfo.trim();

    try {
      if (editingClient) {
        // Edit existing client - preserve fields, match schema strictly:
        // name, group_id, status, contact_info
        const clientRef = doc(db, 'clients', editingClient.id);
        await updateDoc(clientRef, {
          name: trimmedName,
          group_id: targetGroupId,
          status: formStatus,
          contact_info: targetContactInfo,
        });
      } else {
        // Create new client - strictly matching Firestore schema:
        // name, group_id, status, contact_info, created_at, created_by
        await addDoc(collection(db, 'clients'), {
          name: trimmedName,
          group_id: targetGroupId,
          status: formStatus,
          contact_info: targetContactInfo,
          created_at: serverTimestamp(),
          created_by: user?.uid || '',
        });
      }
      closeModal();
    } catch (err: any) {
      console.error('Failed to save client:', err);
      setFormError(err?.message || 'Error saving client. Please check your permissions.');
    } finally {
      setFormSubmitting(false);
    }
  };

  const handleDeleteClient = async () => {
    if (!deleteTarget || !isPrivileged) return;
    setIsDeleting(true);
    try {
      await deleteDoc(doc(db, 'clients', deleteTarget.id));
      setDeleteTarget(null);
    } catch (err: any) {
      console.error('Failed to delete client:', err);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100">Clients</h1>
          <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-0.5">
            Manage organization clients and their group associations
          </p>
        </div>

        {/* tl and manager only: Add Client button */}
        {isPrivileged && (
          <button
            id="add-client-btn"
            onClick={openAddModal}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-gradient-to-r from-brand-purple to-brand-blue hover:opacity-90 text-white text-sm font-semibold rounded-lg shadow-xs transition-opacity cursor-pointer shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>Add Client</span>
          </button>
        )}
      </div>

      {/* Filter and Control Bar */}
      <div className="bg-white dark:bg-neutral-800 p-4 rounded-xl border border-neutral-200 dark:border-neutral-700 shadow-xs flex flex-wrap items-center justify-between gap-4 transition-colors">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 text-sm text-neutral-600 dark:text-neutral-300 font-medium">
            <Filter className="w-4 h-4 text-neutral-400 dark:text-neutral-500" />
            <span>Group:</span>
          </div>
          <select
            id="client-group-filter"
            value={selectedGroupFilter}
            onChange={(e) => setSelectedGroupFilter(e.target.value)}
            className="px-3 py-1.5 text-sm bg-neutral-50 dark:bg-neutral-700 border border-neutral-300 dark:border-neutral-600 rounded-lg text-neutral-800 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-brand-blue"
          >
            <option value="all">All Groups</option>
            <option value="unassigned">Unassigned (No Group)</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center">
          <button
            id="toggle-show-inactive-btn"
            type="button"
            onClick={() => setShowInactive(!showInactive)}
            className={`inline-flex items-center gap-2 px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors cursor-pointer ${
              showInactive
                ? 'bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 border-neutral-900 dark:border-neutral-100'
                : 'bg-white dark:bg-neutral-700 text-neutral-700 dark:text-neutral-200 border-neutral-300 dark:border-neutral-600 hover:bg-neutral-50 dark:hover:bg-neutral-600'
            }`}
          >
            {showInactive ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
            <span>{showInactive ? 'Showing Inactive' : 'Show Inactive'}</span>
          </button>
        </div>
      </div>

      {/* Table Section */}
      <div className="bg-white dark:bg-neutral-800 rounded-xl border border-neutral-200 dark:border-neutral-700 shadow-xs overflow-hidden transition-colors">
        {loading ? (
          <div className="p-12 text-center text-neutral-500 dark:text-neutral-400 text-sm">
            <div className="w-6 h-6 border-2 border-neutral-300 dark:border-neutral-600 border-t-neutral-800 dark:border-t-neutral-100 rounded-full animate-spin mx-auto mb-2" />
            Loading clients...
          </div>
        ) : filteredClients.length === 0 ? (
          <div className="p-12 text-center">
            <Building className="w-10 h-10 text-neutral-300 dark:text-neutral-600 mx-auto mb-3" />
            <p className="text-sm font-semibold text-neutral-800 dark:text-neutral-200">No clients found</p>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1 max-w-sm mx-auto">
              {clients.length === 0
                ? isPrivileged
                  ? 'No clients have been created yet. Click "Add Client" to get started.'
                  : 'No clients are currently registered in the database.'
                : 'No clients match your selected group or active/inactive filter.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-neutral-200 dark:border-neutral-700 bg-neutral-50/75 dark:bg-neutral-800/60 text-xs font-semibold uppercase tracking-wider text-neutral-600 dark:text-neutral-400">
                  <th className="py-3 px-4">Name</th>
                  <th className="py-3 px-4">Group</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Contact Info</th>
                  {isPrivileged && <th className="py-3 px-4 text-right">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200 dark:divide-neutral-700 text-sm">
                {filteredClients.map((client) => {
                  const groupName = client.group_id
                    ? groupMap.get(client.group_id) || 'Unknown Group'
                    : '—';

                  return (
                    <tr key={client.id} className="hover:bg-neutral-50/80 dark:hover:bg-neutral-700/50 transition-colors">
                      <td className="py-3.5 px-4 font-medium text-neutral-900 dark:text-neutral-100">
                        <Link
                          to={`/dashboard/clients/${client.id}`}
                          className="text-neutral-900 dark:text-neutral-100 hover:text-blue-600 dark:hover:text-blue-400 hover:underline transition-colors font-medium"
                        >
                          {client.name}
                        </Link>
                      </td>
                      <td className="py-3.5 px-4 text-neutral-600 dark:text-neutral-300">
                        {groupName !== '—' ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-neutral-100 dark:bg-neutral-700 text-neutral-800 dark:text-neutral-200">
                            {groupName}
                          </span>
                        ) : (
                          <span className="text-neutral-400 dark:text-neutral-500 text-xs">—</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${
                            client.status === 'active'
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-800'
                              : 'bg-neutral-100 text-neutral-500 border-neutral-200 dark:bg-neutral-700/60 dark:text-neutral-400 dark:border-neutral-600'
                          }`}
                        >
                          {client.status}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-neutral-600 dark:text-neutral-300 max-w-xs truncate">
                        {client.contact_info ? (
                          <span className="text-xs text-neutral-700 dark:text-neutral-300">{client.contact_info}</span>
                        ) : (
                          <span className="text-neutral-400 dark:text-neutral-500 text-xs">—</span>
                        )}
                      </td>

                      {/* Privileged Actions */}
                      {isPrivileged && (
                        <td className="py-3.5 px-4 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              id={`edit-client-${client.id}`}
                              type="button"
                              onClick={() => openEditModal(client)}
                              className="p-1.5 text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 hover:bg-neutral-100 dark:hover:bg-neutral-700 rounded-md transition-colors cursor-pointer"
                              title="Edit Client"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              id={`delete-client-${client.id}`}
                              type="button"
                              onClick={() => setDeleteTarget(client)}
                              className="p-1.5 text-neutral-500 dark:text-neutral-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-md transition-colors cursor-pointer"
                              title="Delete Client"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add / Edit Client Modal (tl / manager only) */}
      {isModalOpen && isPrivileged && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
          <div className="bg-white dark:bg-neutral-800 rounded-xl shadow-xl max-w-md w-full border border-neutral-200 dark:border-neutral-700 p-6 transition-colors">
            <div className="flex items-center justify-between pb-3 border-b border-neutral-200 dark:border-neutral-700 mb-4">
              <h2 className="text-lg font-bold text-neutral-900 dark:text-neutral-100">
                {editingClient ? 'Edit Client' : 'Add Client'}
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

            <form onSubmit={handleSaveClient} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 uppercase tracking-wider mb-1">
                  Name *
                </label>
                <input
                  id="client-name-input"
                  type="text"
                  required
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="Acme Corporation"
                  className="w-full px-3 py-2 text-sm border border-neutral-300 dark:border-neutral-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue bg-white dark:bg-neutral-700 text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 dark:placeholder:text-neutral-400"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 uppercase tracking-wider mb-1">
                  Group
                </label>
                <select
                  id="client-group-input"
                  value={formGroupId}
                  onChange={(e) => setFormGroupId(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-neutral-300 dark:border-neutral-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue bg-white dark:bg-neutral-700 text-neutral-900 dark:text-neutral-100"
                >
                  <option value="">None (Unassigned)</option>
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 uppercase tracking-wider mb-1">
                  Status
                </label>
                <select
                  id="client-status-input"
                  value={formStatus}
                  onChange={(e) => setFormStatus(e.target.value as 'active' | 'inactive')}
                  className="w-full px-3 py-2 text-sm border border-neutral-300 dark:border-neutral-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue bg-white dark:bg-neutral-700 text-neutral-900 dark:text-neutral-100"
                >
                  <option value="active">active</option>
                  <option value="inactive">inactive</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 uppercase tracking-wider mb-1">
                  Contact Info (Optional)
                </label>
                <textarea
                  id="client-contact-input"
                  rows={3}
                  value={formContactInfo}
                  onChange={(e) => setFormContactInfo(e.target.value)}
                  placeholder="Email, phone, primary contact person..."
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
                  id="client-submit-modal-btn"
                  type="submit"
                  disabled={formSubmitting}
                  className="px-4 py-2 text-sm font-semibold text-white bg-gradient-to-r from-brand-purple to-brand-blue hover:opacity-90 rounded-lg transition-opacity disabled:opacity-50 cursor-pointer"
                >
                  {formSubmitting ? 'Saving...' : editingClient ? 'Save Changes' : 'Create Client'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={Boolean(deleteTarget)}
        title="Delete Client"
        message={`Are you sure you want to delete client "${deleteTarget?.name}"? This action cannot be undone.`}
        confirmLabel="Confirm Delete"
        isLoading={isDeleting}
        onConfirm={handleDeleteClient}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
};
