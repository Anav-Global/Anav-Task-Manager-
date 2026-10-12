import React, { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import type { Client, ClientGroup } from '../types';

interface ClientAccessPickerProps {
  clients: Client[];
  groups: ClientGroup[];
  allClients: boolean;
  onAllClientsChange: (value: boolean) => void;
  selectedIds: string[];
  onSelectedIdsChange: (ids: string[]) => void;
  /** Prefix so element ids stay unique when two pickers are mounted. */
  idPrefix?: string;
}

const byName = (a: { name: string }, b: { name: string }) =>
  a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });

export const ClientAccessPicker: React.FC<ClientAccessPickerProps> = ({
  clients,
  groups,
  allClients,
  onAllClientsChange,
  selectedIds,
  onSelectedIdsChange,
  idPrefix = 'client-access',
}) => {
  const [search, setSearch] = useState('');
  const [groupPick, setGroupPick] = useState('');

  const groupNameById = useMemo(() => {
    const map = new Map<string, string>();
    groups.forEach((g) => map.set(g.id, g.name));
    return map;
  }, [groups]);

  const sortedClients = useMemo(() => [...clients].sort(byName), [clients]);
  const sortedGroups = useMemo(() => [...groups].sort(byName), [groups]);
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  const shownClients = useMemo(() => {
    const q = search.trim().toLowerCase();
    // The group dropdown also FILTERS the list, so picking a group shows only that group's clients.
    const inGroup = groupPick
      ? sortedClients.filter((c) => (groupPick === '__none__' ? !c.group_id : c.group_id === groupPick))
      : sortedClients;
    if (!q) return inGroup;
    return inGroup.filter((c) => {
      const groupName = (c.group_id ? groupNameById.get(c.group_id) : '') || '';
      return c.name.toLowerCase().includes(q) || groupName.toLowerCase().includes(q);
    });
  }, [sortedClients, search, groupPick, groupNameById]);

  const toggleClient = (id: string) => {
    if (selectedSet.has(id)) {
      onSelectedIdsChange(selectedIds.filter((x) => x !== id));
    } else {
      onSelectedIdsChange([...selectedIds, id]);
    }
  };

  const selectAllInGroup = () => {
    if (!groupPick) return;
    const idsInGroup = clients
      .filter((c) => (groupPick === '__none__' ? !c.group_id : c.group_id === groupPick))
      .map((c) => c.id);
    onSelectedIdsChange(Array.from(new Set([...selectedIds, ...idsInGroup])));
  };

  const radioBase =
    'flex items-center gap-2 px-3 py-2 rounded-lg border text-sm cursor-pointer transition-colors';
  const radioOn =
    'border-brand-blue bg-blue-50/60 dark:bg-blue-900/20 text-neutral-900 dark:text-neutral-100';
  const radioOff =
    'border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-700/40';

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <label className={`${radioBase} ${allClients ? radioOn : radioOff}`}>
          <input
            type="radio"
            name={`${idPrefix}-mode`}
            checked={allClients}
            onChange={() => onAllClientsChange(true)}
            className="accent-brand-blue"
          />
          <span className="font-medium">All clients</span>
        </label>
        <label className={`${radioBase} ${!allClients ? radioOn : radioOff}`}>
          <input
            type="radio"
            name={`${idPrefix}-mode`}
            checked={!allClients}
            onChange={() => onAllClientsChange(false)}
            className="accent-brand-blue"
          />
          <span className="font-medium">Only selected clients</span>
        </label>
      </div>

      {allClients ? (
        <p className="text-xs text-neutral-500 dark:text-neutral-400">
          This user can see every client, including ones added later.
        </p>
      ) : (
        <div className="space-y-2.5">
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                id={`${idPrefix}-search`}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search client or group..."
                className="w-full pl-8 pr-3 py-1.5 text-sm border border-neutral-300 dark:border-neutral-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue bg-white dark:bg-neutral-700 text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400"
              />
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-2">
            <select
              id={`${idPrefix}-group-pick`}
              value={groupPick}
              onChange={(e) => setGroupPick(e.target.value)}
              className="flex-1 px-3 py-1.5 text-sm border border-neutral-300 dark:border-neutral-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue bg-white dark:bg-neutral-700 text-neutral-900 dark:text-neutral-100"
            >
              <option value="">All groups</option>
              {sortedGroups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
              <option value="__none__">Unassigned (No Group)</option>
            </select>
            <button
              type="button"
              onClick={selectAllInGroup}
              disabled={!groupPick}
              className="px-3 py-1.5 text-xs font-semibold text-neutral-700 dark:text-neutral-200 bg-neutral-50 dark:bg-neutral-700 border border-neutral-300 dark:border-neutral-600 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-600 transition-colors disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
            >
              Select all in group
            </button>
            <button
              type="button"
              onClick={() => onSelectedIdsChange([])}
              disabled={selectedIds.length === 0}
              className="px-3 py-1.5 text-xs font-semibold text-neutral-700 dark:text-neutral-200 bg-neutral-50 dark:bg-neutral-700 border border-neutral-300 dark:border-neutral-600 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-600 transition-colors disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
            >
              Clear all
            </button>
          </div>

          <div className="max-h-56 overflow-y-auto border border-neutral-200 dark:border-neutral-700 rounded-lg divide-y divide-neutral-100 dark:divide-neutral-700">
            {shownClients.length === 0 ? (
              <div className="p-4 text-center text-xs text-neutral-400 dark:text-neutral-500">
                {clients.length === 0 ? 'No clients exist yet.' : 'No clients match your filter.'}
              </div>
            ) : (
              shownClients.map((c) => {
                const groupName = c.group_id ? groupNameById.get(c.group_id) : null;
                return (
                  <label
                    key={c.id}
                    className="flex items-center gap-2.5 px-3 py-2 text-sm cursor-pointer hover:bg-neutral-50 dark:hover:bg-neutral-700/40 transition-colors"
                  >
                    <input
                      type="checkbox"
                      checked={selectedSet.has(c.id)}
                      onChange={() => toggleClient(c.id)}
                      className="accent-brand-blue"
                    />
                    <span className="flex-1 min-w-0 truncate text-neutral-800 dark:text-neutral-100">{c.name}</span>
                    {c.status === 'inactive' && (
                      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-neutral-100 dark:bg-neutral-700 text-neutral-500 dark:text-neutral-300">
                        inactive
                      </span>
                    )}
                    {groupName && (
                      <span className="text-[11px] text-neutral-500 dark:text-neutral-400 truncate max-w-[140px]">
                        {groupName}
                      </span>
                    )}
                  </label>
                );
              })
            )}
          </div>

          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            {selectedIds.length === 0
              ? 'No clients selected — this user will see no clients until you assign some.'
              : `${selectedIds.length} ${selectedIds.length === 1 ? 'client' : 'clients'} selected`}
          </p>
        </div>
      )}
    </div>
  );
};
