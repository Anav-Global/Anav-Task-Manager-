import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  collection,
  doc,
  query,
  where,
  orderBy,
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
} from 'firebase/firestore';
import {
  ArrowLeft,
  FileText,
  Plus,
  Edit2,
  Trash2,
  ChevronDown,
  ChevronUp,
  ArrowUp,
  ArrowDown,
  Clock,
  Building,
  Phone,
  AlertCircle,
  X,
} from 'lucide-react';
import { db } from '../firebase/config';
import { useAuth } from '../context/AuthContext';
import { ConfirmDialog } from '../components/ConfirmDialog';
import type { Client, ClientGroup, SOP } from '../types';

function formatTimestamp(val: any): string {
  if (!val) return '—';
  try {
    if (typeof val.toDate === 'function') {
      return val.toDate().toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    }
    if (val instanceof Date) {
      return val.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    }
    const parsed = new Date(val);
    if (!isNaN(parsed.getTime())) {
      return parsed.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    }
  } catch {
    // fallback
  }
  return String(val);
}

function getTimestampMillis(val: any): number {
  if (!val) return 0;
  try {
    if (typeof val.toMillis === 'function') return val.toMillis();
    if (typeof val.toDate === 'function') return val.toDate().getTime();
    if (val.seconds) return val.seconds * 1000 + (val.nanoseconds ? val.nanoseconds / 1e6 : 0);
    if (val instanceof Date) return val.getTime();
    const parsed = new Date(val).getTime();
    return isNaN(parsed) ? 0 : parsed;
  } catch {
    return 0;
  }
}

export const ClientDetailPage: React.FC = () => {
  const { clientId } = useParams<{ clientId: string }>();
  const { user, userDoc } = useAuth();
  const isPrivileged = userDoc?.role === 'tl' || userDoc?.role === 'manager';

  // Client State
  const [client, setClient] = useState<Client | null>(null);
  const [clientLoading, setClientLoading] = useState(true);
  const [clientNotFound, setClientNotFound] = useState(false);

  // Groups map for name lookup
  const [groupMap, setGroupMap] = useState<Map<string, string>>(new Map());

  // SOPs State
  const [sops, setSops] = useState<SOP[]>([]);
  const [sopsLoading, setSopsLoading] = useState(true);
  const [expandedSopIds, setExpandedSopIds] = useState<Record<string, boolean>>({});

  // Modal State for Add / Edit SOP
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSop, setEditingSop] = useState<SOP | null>(null);
  const [formTitle, setFormTitle] = useState('');
  const [formContent, setFormContent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [isReordering, setIsReordering] = useState(false);

  // Delete State
  const [deletingSop, setDeletingSop] = useState<SOP | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // 1. Fetch Group Names
  useEffect(() => {
    const unsubGroups = onSnapshot(
      collection(db, 'client_groups'),
      (snapshot) => {
        const map = new Map<string, string>();
        snapshot.docs.forEach((d) => {
          map.set(d.id, d.data().name || '');
        });
        setGroupMap(map);
      },
      (err) => console.error('Failed to listen to groups:', err)
    );
    return () => unsubGroups();
  }, []);

  // 2. Fetch Client Document by ID
  useEffect(() => {
    if (!clientId) {
      setClientNotFound(true);
      setClientLoading(false);
      return;
    }

    setClientLoading(true);
    setClientNotFound(false);

    const clientRef = doc(db, 'clients', clientId);
    const unsubClient = onSnapshot(
      clientRef,
      (snapshot) => {
        if (!snapshot.exists()) {
          setClient(null);
          setClientNotFound(true);
        } else {
          const data = snapshot.data();
          setClient({
            id: snapshot.id,
            name: data.name || '',
            group_id: data.group_id || null,
            status: data.status || 'active',
            contact_info: data.contact_info || '',
            created_at: data.created_at,
            created_by: data.created_by || '',
          });
          setClientNotFound(false);
        }
        setClientLoading(false);
      },
      (error) => {
        console.error('Failed to fetch client:', error);
        setClientNotFound(true);
        setClientLoading(false);
      }
    );

    return () => unsubClient();
  }, [clientId]);

  // 3. Fetch SOPs for this client using Firestore query sorted by last_updated_at ascending
  useEffect(() => {
    if (!clientId) {
      setSops([]);
      setSopsLoading(false);
      return;
    }

    setSopsLoading(true);

    const processSnapshot = (snapshot: any) => {
      const list: SOP[] = snapshot.docs.map((d: any) => {
        const data = d.data();
        return {
          id: d.id,
          client_id: data.client_id,
          title: data.title || '',
          content: data.content || '',
          order:
            typeof data.order === 'number'
              ? data.order
              : data.order !== undefined && data.order !== null && !isNaN(Number(data.order))
              ? Number(data.order)
              : null,
          last_updated_by: data.last_updated_by || '',
          last_updated_at: data.last_updated_at,
        };
      });

      // Sort logic:
      // If any SOP has an order value set, sort by order ascending first,
      // falling back to last_updated_at ascending (oldest first) for SOPs without one or ties.
      list.sort((a, b) => {
        const hasOrderA = a.order !== null && a.order !== undefined && !isNaN(Number(a.order));
        const hasOrderB = b.order !== null && b.order !== undefined && !isNaN(Number(b.order));

        if (hasOrderA && hasOrderB) {
          const orderDiff = Number(a.order) - Number(b.order);
          if (orderDiff !== 0) return orderDiff;
          return getTimestampMillis(a.last_updated_at) - getTimestampMillis(b.last_updated_at);
        }
        if (hasOrderA && !hasOrderB) return -1;
        if (!hasOrderA && hasOrderB) return 1;

        return getTimestampMillis(a.last_updated_at) - getTimestampMillis(b.last_updated_at);
      });

      setSops(list);
      setSopsLoading(false);
    };

    // Exact Firestore query sorted by order ascending
    const sopsQuery = query(
      collection(db, 'sops'),
      where('client_id', '==', clientId),
      orderBy('order', 'asc')
    );

    let unsub: (() => void) | null = null;

    unsub = onSnapshot(
      sopsQuery,
      processSnapshot,
      (error) => {
        console.warn('Primary sops orderBy order query error, falling back to where query:', error);
        const fallbackQuery = query(
          collection(db, 'sops'),
          where('client_id', '==', clientId)
        );
        unsub = onSnapshot(fallbackQuery, processSnapshot, (err) => {
          console.error('Failed to fetch SOPs:', err);
          setSopsLoading(false);
        });
      }
    );

    return () => {
      if (unsub) unsub();
    };
  }, [clientId]);

  // Expand / Collapse toggler
  const toggleSopExpand = (id: string) => {
    setExpandedSopIds((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  // Handle Reordering SOPs
  const handleMoveUp = async (index: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (index <= 0 || isReordering) return;
    await swapSopOrder(index, index - 1);
  };

  const handleMoveDown = async (index: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (index >= sops.length - 1 || isReordering) return;
    await swapSopOrder(index, index + 1);
  };

  const swapSopOrder = async (indexA: number, indexB: number) => {
    const sopA = sops[indexA];
    const sopB = sops[indexB];
    if (!sopA || !sopB) return;

    setIsReordering(true);

    let orderA = typeof sopA.order === 'number' && !isNaN(sopA.order) ? sopA.order : indexA + 1;
    let orderB = typeof sopB.order === 'number' && !isNaN(sopB.order) ? sopB.order : indexB + 1;

    if (orderA === orderB) {
      orderA = indexA + 1;
      orderB = indexB + 1;
    }

    try {
      const sopARef = doc(db, 'sops', sopA.id);
      const sopBRef = doc(db, 'sops', sopB.id);

      await Promise.all([
        updateDoc(sopARef, {
          order: orderB,
        }),
        updateDoc(sopBRef, {
          order: orderA,
        }),
      ]);
    } catch (err) {
      console.error('Failed to swap SOP order:', err);
    } finally {
      setIsReordering(false);
    }
  };

  // Open modal for Create
  const openAddModal = () => {
    setEditingSop(null);
    setFormTitle('');
    setFormContent('');
    setModalError(null);
    setIsModalOpen(true);
  };

  // Open modal for Edit
  const openEditModal = (sop: SOP, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingSop(sop);
    setFormTitle(sop.title);
    setFormContent(sop.content);
    setModalError(null);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingSop(null);
    setFormTitle('');
    setFormContent('');
    setModalError(null);
  };

  // Handle Submit (Create or Update SOP)
  const handleSubmitSop = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalError(null);

    const trimmedTitle = formTitle.trim();
    const trimmedContent = formContent.trim();

    if (!trimmedTitle) {
      setModalError('Title is required.');
      return;
    }
    if (!trimmedContent) {
      setModalError('Content is required.');
      return;
    }

    if (!clientId) return;

    setSubmitting(true);

    try {
      if (editingSop) {
        // Update existing SOP: update title, content, last_updated_by, last_updated_at
        // Do NOT change client_id or wipe order
        const sopRef = doc(db, 'sops', editingSop.id);
        const updatePayload: any = {
          title: trimmedTitle,
          content: trimmedContent,
          last_updated_by: user?.uid || '',
          last_updated_at: serverTimestamp(),
        };
        await updateDoc(sopRef, updatePayload);
      } else {
        // Create new SOP: automatically assign order = (highest order value among this client's SOPs) + 1
        const maxOrder = sops.reduce((max, s) => {
          return typeof s.order === 'number' && !isNaN(s.order) ? Math.max(max, s.order) : max;
        }, 0);
        const nextOrder = Math.max(maxOrder, sops.length) + 1;

        const newSopPayload: any = {
          client_id: clientId,
          title: trimmedTitle,
          content: trimmedContent,
          order: nextOrder,
          last_updated_by: user?.uid || '',
          last_updated_at: serverTimestamp(),
        };
        await addDoc(collection(db, 'sops'), newSopPayload);
      }

      closeModal();
    } catch (err: any) {
      console.error('Failed to save SOP:', err);
      setModalError(err?.message || 'Failed to save SOP. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // Handle Delete SOP
  const openDeleteDialog = (sop: SOP, e: React.MouseEvent) => {
    e.stopPropagation();
    setDeletingSop(sop);
  };

  const handleConfirmDelete = async () => {
    if (!deletingSop) return;
    setIsDeleting(true);

    try {
      await deleteDoc(doc(db, 'sops', deletingSop.id));
      setDeletingSop(null);
    } catch (err) {
      console.error('Failed to delete SOP:', err);
    } finally {
      setIsDeleting(false);
    }
  };

  // Loading state
  if (clientLoading) {
    return (
      <div className="p-16 text-center text-neutral-500 text-sm">
        <div className="w-6 h-6 border-2 border-neutral-300 border-t-neutral-800 rounded-full animate-spin mx-auto mb-3" />
        Loading client details...
      </div>
    );
  }

  // Client not found state
  if (clientNotFound || !client) {
    return (
      <div className="space-y-6">
        <div>
          <Link
            to="/dashboard/clients"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-neutral-600 hover:text-neutral-900 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Clients</span>
          </Link>
        </div>

        <div className="bg-white rounded-xl border border-neutral-200 shadow-xs p-12 text-center max-w-lg mx-auto">
          <AlertCircle className="w-12 h-12 text-neutral-300 mx-auto mb-3" />
          <h2 className="text-base font-bold text-neutral-900">Client not found</h2>
          <p className="text-xs text-neutral-500 mt-1 max-w-sm mx-auto mb-6">
            The requested client document does not exist or may have been deleted.
          </p>
          <Link
            to="/dashboard/clients"
            className="inline-flex items-center justify-center px-4 py-2 bg-gradient-to-r from-brand-purple to-brand-blue hover:opacity-90 text-white text-xs font-semibold rounded-lg transition-opacity"
          >
            Return to Clients List
          </Link>
        </div>
      </div>
    );
  }

  const groupName = client.group_id ? groupMap.get(client.group_id) || 'Unknown Group' : '—';

  return (
    <div className="space-y-6">
      {/* Back Link */}
      <div>
        <Link
          to="/dashboard/clients"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-neutral-600 hover:text-neutral-900 transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Clients</span>
        </Link>
      </div>

      {/* Top Client Summary Card */}
      <div className="bg-white p-6 rounded-xl border border-neutral-200 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight text-neutral-900">
                {client.name}
              </h1>
              {/* Status Badge (exact styling from ClientsPage) */}
              <span
                className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                  client.status === 'active'
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    : 'bg-neutral-100 text-neutral-500 border border-neutral-200'
                }`}
              >
                {client.status}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-4 text-xs text-neutral-600 pt-1">
              <div className="flex items-center gap-1.5">
                <Building className="w-3.5 h-3.5 text-neutral-400" />
                <span className="text-neutral-500">Group:</span>
                {groupName !== '—' ? (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-neutral-100 text-neutral-800">
                    {groupName}
                  </span>
                ) : (
                  <span className="text-neutral-400">—</span>
                )}
              </div>

              {client.contact_info && (
                <div className="flex items-center gap-1.5">
                  <Phone className="w-3.5 h-3.5 text-neutral-400" />
                  <span className="text-neutral-500">Contact:</span>
                  <span className="font-medium text-neutral-800">{client.contact_info}</span>
                </div>
              )}
            </div>
          </div>

          {/* tl/manager only: Add SOP Button */}
          {isPrivileged && (
            <button
              id="add-sop-btn"
              onClick={openAddModal}
              className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-gradient-to-r from-brand-purple to-brand-blue hover:opacity-90 text-white text-sm font-semibold rounded-lg shadow-xs transition-opacity cursor-pointer shrink-0 self-start sm:self-auto"
            >
              <Plus className="w-4 h-4" />
              <span>Add SOP</span>
            </button>
          )}
        </div>
      </div>

      {/* SOP Section Header */}
      <div className="flex items-center justify-between pt-2">
        <div>
          <h2 className="text-base font-bold text-neutral-900 flex items-center gap-2">
            <FileText className="w-4 h-4 text-neutral-500" />
            <span>Standard Operating Procedures (SOPs)</span>
          </h2>
          <p className="text-xs text-neutral-500 mt-0.5">
            Documented client processes and operating guidelines
          </p>
        </div>
        <span className="text-xs font-medium text-neutral-500">
          {sops.length} {sops.length === 1 ? 'procedure' : 'procedures'}
        </span>
      </div>

      {/* SOPs List */}
      {sopsLoading ? (
        <div className="bg-white p-12 rounded-xl border border-neutral-200 text-center text-neutral-500 text-sm">
          <div className="w-6 h-6 border-2 border-neutral-300 border-t-neutral-800 rounded-full animate-spin mx-auto mb-2" />
          Loading SOPs...
        </div>
      ) : sops.length === 0 ? (
        /* Empty State */
        <div className="bg-white rounded-xl border border-neutral-200 shadow-xs p-12 text-center">
          <FileText className="w-10 h-10 text-neutral-300 mx-auto mb-3" />
          <p className="text-sm font-semibold text-neutral-800">No SOPs yet</p>
          <p className="text-xs text-neutral-500 mt-1 max-w-sm mx-auto">
            {isPrivileged
              ? "No SOPs yet. Click 'Add SOP' to document a process for this client."
              : 'No SOPs yet'}
          </p>
          {isPrivileged && (
            <button
              onClick={openAddModal}
              className="mt-4 inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-neutral-900 bg-neutral-100 hover:bg-neutral-200 rounded-lg transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add SOP</span>
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {sops.map((sop, index) => {
            const isExpanded = !!expandedSopIds[sop.id];

            return (
              <div
                key={sop.id}
                className="bg-white rounded-xl border border-neutral-200 shadow-xs overflow-hidden transition-all"
              >
                {/* Header / Clickable Accordion Bar */}
                <div
                  onClick={() => toggleSopExpand(sop.id)}
                  className="p-4 flex items-center justify-between gap-4 cursor-pointer hover:bg-neutral-50/75 select-none transition-colors"
                >
                  {/* Table-like row: 1. Step number badge, 2. Title */}
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <span className="w-6 h-6 rounded-md bg-neutral-900 text-white flex items-center justify-center text-xs font-bold shrink-0">
                      {index + 1}
                    </span>
                    <h3 className="text-sm font-semibold text-neutral-900 truncate">
                      {sop.title}
                    </h3>
                  </div>

                  {/* 3. Up/Down Reorder, Edit/Delete, and Expand/Collapse Chevron */}
                  <div className="flex items-center gap-2 shrink-0">
                    {/* Privileged Reorder & Edit & Delete Controls (tl and manager only) */}
                    {isPrivileged && (
                      <div
                        className="flex items-center gap-0.5 pr-1 border-r border-neutral-200"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          disabled={index === 0 || isReordering}
                          onClick={(e) => handleMoveUp(index, e)}
                          title="Move step up"
                          className="p-1.5 text-neutral-500 hover:text-neutral-900 rounded-md hover:bg-neutral-100 transition-colors disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
                        >
                          <ArrowUp className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          disabled={index === sops.length - 1 || isReordering}
                          onClick={(e) => handleMoveDown(index, e)}
                          title="Move step down"
                          className="p-1.5 text-neutral-500 hover:text-neutral-900 rounded-md hover:bg-neutral-100 transition-colors disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
                        >
                          <ArrowDown className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => openEditModal(sop, e)}
                          title="Edit SOP"
                          className="p-1.5 text-neutral-400 hover:text-neutral-700 rounded-md hover:bg-neutral-100 transition-colors cursor-pointer"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => openDeleteDialog(sop, e)}
                          title="Delete SOP"
                          className="p-1.5 text-neutral-400 hover:text-red-600 rounded-md hover:bg-red-50 transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    )}

                    {/* Expand/Collapse Chevron */}
                    <div className="p-1 text-neutral-400">
                      {isExpanded ? (
                        <ChevronUp className="w-4 h-4" />
                      ) : (
                        <ChevronDown className="w-4 h-4" />
                      )}
                    </div>
                  </div>
                </div>

                {/* Expanded Content */}
                {isExpanded && (
                  <div className="px-4 pb-4 pt-1 border-t border-neutral-100 bg-neutral-50/40">
                    {/* Multiline content with white-space: pre-wrap */}
                    <div className="py-3 text-sm text-neutral-800 whitespace-pre-wrap leading-relaxed">
                      {sop.content}
                    </div>

                    {/* Footer: readable date */}
                    <div className="pt-3 border-t border-neutral-200/60 flex items-center gap-1.5 text-xs text-neutral-400">
                      <Clock className="w-3.5 h-3.5" />
                      <span>Last updated: {formatTimestamp(sop.last_updated_at)}</span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Add / Edit SOP Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full border border-neutral-200 p-6">
            <div className="flex items-center justify-between pb-3 border-b border-neutral-200 mb-4">
              <h3 className="text-lg font-bold text-neutral-900">
                {editingSop ? 'Edit SOP' : 'Add SOP'}
              </h3>
              <button
                type="button"
                onClick={closeModal}
                className="p-1 text-neutral-400 hover:text-neutral-600 rounded-md transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {modalError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2 text-xs text-red-700 mb-4">
                <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                <span>{modalError}</span>
              </div>
            )}

            <form onSubmit={handleSubmitSop} className="space-y-4">
              <div>
                <label
                  htmlFor="sop-title-input"
                  className="block text-xs font-semibold text-neutral-700 uppercase tracking-wider mb-1"
                >
                  Title *
                </label>
                <input
                  id="sop-title-input"
                  type="text"
                  required
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  placeholder="e.g. Monthly Reporting Workflow"
                  className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue"
                />
              </div>

              <div>
                <label
                  htmlFor="sop-content-input"
                  className="block text-xs font-semibold text-neutral-700 uppercase tracking-wider mb-1"
                >
                  Content *
                </label>
                <textarea
                  id="sop-content-input"
                  required
                  rows={6}
                  value={formContent}
                  onChange={(e) => setFormContent(e.target.value)}
                  placeholder="Write the SOP guidelines and process steps here..."
                  className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue leading-relaxed font-sans"
                />
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
                  id="sop-submit-btn"
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 text-sm font-semibold text-white bg-gradient-to-r from-brand-purple to-brand-blue hover:opacity-90 rounded-lg transition-opacity disabled:opacity-50 cursor-pointer"
                >
                  {submitting ? 'Saving...' : editingSop ? 'Save Changes' : 'Create SOP'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirm Delete Dialog (reused from components) */}
      <ConfirmDialog
        isOpen={!!deletingSop}
        title="Delete SOP"
        message={`Are you sure you want to delete the SOP "${deletingSop?.title}"? This action cannot be undone.`}
        confirmLabel="Delete"
        isDestructive={true}
        isLoading={isDeleting}
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeletingSop(null)}
      />
    </div>
  );
};
