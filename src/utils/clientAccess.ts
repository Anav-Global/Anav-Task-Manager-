import { useCallback, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import type { UserDoc } from '../types';

/**
 * Per-user client access — the ONE place this rule lives.
 *
 *   all_clients === false  -> the user may only see the clients listed in client_ids
 *   anything else          -> (true, or the field is missing) the user sees every client
 *
 * A missing all_clients field means "all clients" on purpose, so nobody loses access
 * when this ships; managers then switch users to "Only selected clients" one by one.
 * With no user document at all we fail closed (nothing is visible).
 */
export function hasAllClientAccess(userDoc: Pick<UserDoc, 'all_clients'> | null | undefined): boolean {
  if (!userDoc) return false;
  return userDoc.all_clients !== false;
}

export function useClientAccess() {
  const { userDoc } = useAuth();
  const hasAllClients = hasAllClientAccess(userDoc);
  const clientIds = userDoc?.client_ids;

  const allowedIds = useMemo(() => new Set(clientIds ?? []), [clientIds]);

  const canSeeClient = useCallback(
    (clientId: string | null | undefined): boolean => {
      if (hasAllClients) return true;
      if (!clientId) return false;
      return allowedIds.has(clientId);
    },
    [hasAllClients, allowedIds]
  );

  const filterVisibleClients = useCallback(
    <T extends { id: string }>(clients: T[]): T[] =>
      hasAllClients ? clients : clients.filter((c) => allowedIds.has(c.id)),
    [hasAllClients, allowedIds]
  );

  return { hasAllClients, canSeeClient, filterVisibleClients };
}
