import { useCallback, useState } from 'react';

/**
 * Tracks whether the user has satisfied the Evictions CRM password prompt.
 *
 * This is a UI gate, not access control. The app's JWT already authorizes every
 * /api/evictions call, so the data is reachable with that token regardless. The
 * grant lives in sessionStorage and dies with the tab.
 */

const KEY = 'evictionsCrmGrant';
export const GRANT_TTL_MS = 8 * 60 * 60 * 1000;

export const readGrant = (): boolean => {
  const raw = sessionStorage.getItem(KEY);
  if (!raw) return false;
  const expiresAt = Number(raw);
  if (!Number.isFinite(expiresAt)) return false;
  return Date.now() < expiresAt;
};

export const writeGrant = () => sessionStorage.setItem(KEY, String(Date.now() + GRANT_TTL_MS));

export const clearGrant = () => sessionStorage.removeItem(KEY);

export const useCrmGrant = () => {
  const [hasGrant, setHasGrant] = useState(readGrant);

  const grant = useCallback(() => { writeGrant(); setHasGrant(true); }, []);
  const revoke = useCallback(() => { clearGrant(); setHasGrant(false); }, []);

  return { hasGrant, grant, revoke };
};
