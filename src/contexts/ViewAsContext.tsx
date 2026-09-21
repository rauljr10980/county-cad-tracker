import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { getUsers, VIEW_AS_STORAGE_KEY, type TeamMember } from '@/lib/api';

interface ViewAsContextType {
  viewAsUserId: string | null;
  viewAsUser: TeamMember | null;
  teamMembers: TeamMember[];
  setViewAs: (userId: string | null) => void;
}

const ViewAsContext = createContext<ViewAsContextType | undefined>(undefined);

const readStored = (): string | null => {
  try {
    return localStorage.getItem(VIEW_AS_STORAGE_KEY);
  } catch {
    return null;
  }
};

const clearStored = () => {
  try {
    localStorage.removeItem(VIEW_AS_STORAGE_KEY);
  } catch {
    /* storage unavailable — nothing to clear */
  }
};

export function ViewAsProvider({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const [viewAsUserId, setViewAsUserId] = useState<string | null>(null);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);

  // localStorage is the source of truth (getAuthHeaders reads it directly).
  // This only mirrors it for rendering, and prunes values that must not stand:
  // a demoted Manager's leftover selection, or a stale self-selection.
  useEffect(() => {
    // Auth resolves asynchronously on every page load, and `user` is null until
    // it does. Clearing storage during that window would wipe the selection on
    // every refresh — the exact opposite of persist-until-exit.
    if (isLoading) return;

    if (!user) {
      clearStored();
      setViewAsUserId(null);
      return;
    }

    const stored = readStored();
    if (!stored) {
      setViewAsUserId(null);
      return;
    }

    if (!isAdmin || stored === user.id) {
      clearStored();
      setViewAsUserId(null);
      return;
    }

    setViewAsUserId(stored);
  }, [user, isAdmin, isLoading]);

  useEffect(() => {
    if (!isAdmin || !user) {
      setTeamMembers([]);
      return;
    }
    let cancelled = false;
    getUsers()
      .then((res) => {
        if (!cancelled) setTeamMembers(res.users.filter((m) => m.id !== user.id));
      })
      .catch(() => {
        if (!cancelled) setTeamMembers([]);
      });
    return () => {
      cancelled = true;
    };
  }, [isAdmin, user]);

  /**
   * Reloads so every cached record in the app refetches under the new account
   * at once. Threading an invalidation signal into useCrmStore, the calendar
   * hook and the MLS fetcher instead would leave any hook we missed showing one
   * teammate's data under a banner naming another. The selection lives in
   * localStorage, so it survives the reload and the switch looks seamless.
   */
  const setViewAs = useCallback((userId: string | null) => {
    if (userId) {
      try {
        localStorage.setItem(VIEW_AS_STORAGE_KEY, userId);
      } catch {
        /* storage unavailable — the switch cannot persist, so do not reload */
        return;
      }
    } else {
      clearStored();
    }
    window.location.reload();
  }, []);

  const viewAsUser = teamMembers.find((m) => m.id === viewAsUserId) ?? null;

  return (
    <ViewAsContext.Provider value={{ viewAsUserId, viewAsUser, teamMembers, setViewAs }}>
      {children}
    </ViewAsContext.Provider>
  );
}

export function useViewAs() {
  const context = useContext(ViewAsContext);
  if (context === undefined) {
    throw new Error('useViewAs must be used within a ViewAsProvider');
  }
  return context;
}
