import { useCallback, useEffect, useState } from 'react';

/**
 * Tracks whether the user has satisfied the Evictions CRM password prompt.
 *
 * This is a UI gate, not access control. The app's JWT already authorizes every
 * /api/evictions call, so the data is reachable with that token regardless. The
 * grant lives in sessionStorage and dies with the tab.
 */

const KEY = 'evictionsCrmGrant';
export const GRANT_TTL_MS = 8 * 60 * 60 * 1000;

// sessionStorage access can throw (strict privacy modes, some enterprise
// policies). Fail closed: a read that throws behaves as "no grant"; a write
// or clear that throws is swallowed since there's nothing useful to do with it.
export const readGrant = (): boolean => {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return false;
    const expiresAt = Number(raw);
    if (!Number.isFinite(expiresAt)) return false;
    return Date.now() < expiresAt;
  } catch {
    return false;
  }
};

export const writeGrant = () => {
  try {
    sessionStorage.setItem(KEY, String(Date.now() + GRANT_TTL_MS));
  } catch {
    // swallowed — see file header
  }
};

export const clearGrant = () => {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // swallowed — see file header
  }
};

export const useCrmGrant = () => {
  const [hasGrant, setHasGrant] = useState(readGrant);

  const grant = useCallback(() => { writeGrant(); setHasGrant(true); }, []);
  const revoke = useCallback(() => { clearGrant(); setHasGrant(false); }, []);

  // A tab left open across the TTL boundary (or backgrounded, then returned
  // to) won't re-render on its own — sessionStorage doesn't push updates.
  // Re-check on focus/visibility so a stale "granted" state doesn't linger.
  useEffect(() => {
    const revalidate = () => setHasGrant(readGrant());
    window.addEventListener('focus', revalidate);
    document.addEventListener('visibilitychange', revalidate);
    return () => {
      window.removeEventListener('focus', revalidate);
      document.removeEventListener('visibilitychange', revalidate);
    };
  }, []);

  return { hasGrant, grant, revoke };
};
