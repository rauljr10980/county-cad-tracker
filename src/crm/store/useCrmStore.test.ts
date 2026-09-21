import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useCrmStore } from './useCrmStore';
import { dataService } from '../data/dataService';
import { EMPTY_STATE, type Lead } from '../data/types';
import { VIEW_AS_STORAGE_KEY } from '@/lib/api';

vi.mock('../data/dataService', () => ({
  dataService: {
    load: vi.fn(),
    save: vi.fn(),
    clear: vi.fn(),
  },
}));

const now = new Date('2026-08-25T12:00:00Z');
const ownerKey = 'user-1';

// Mirrors src/lib/api.test.ts's stub: a fresh in-memory store per test, kept
// local via vi.stubGlobal rather than a shared setupFiles entry (rejected
// earlier in this plan).
function stubLocalStorage(initial: Record<string, string> = {}) {
  const store: Record<string, string> = { ...initial };

  vi.stubGlobal('localStorage', {
    getItem: (key: string) => (Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null),
    setItem: (key: string, value: string) => {
      store[key] = String(value);
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      Object.keys(store).forEach((key) => delete store[key]);
    },
    key: (index: number) => Object.keys(store)[index] || null,
    length: 0,
  });
}

const newLeadInput: Omit<Lead, 'id' | 'createdAt' | 'lastContactedAt' | 'kind'> = {
  businessName: 'Acme Co',
  ownerName: 'Jane Prospect',
  jobTitleIndustry: '',
  firm: '',
  phone: '',
  email: '',
  industry: 'Other',
  city: '',
  secondaryPhone: '',
  website: '',
  streetAddress: '',
  state: '',
  zip: '',
  linkedIn: '',
  relationshipType: '',
  asset: '',
  specialization: '',
  metPersonally: '',
  source: 'Referral',
  websiteStatus: 'This Month',
  connectionRating: 'none',
  lastConversationNotes: '',
  notes: '',
};

describe('useCrmStore.hydrate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useCrmStore.setState({ ...EMPTY_STATE, hydrated: false, hydrateError: null });
  });

  it('does not seed demo data on a failed load, and blocks the next save from reaching the server', async () => {
    vi.mocked(dataService.load).mockResolvedValue({ ok: false, error: 'network down' });

    await useCrmStore.getState().hydrate(now, ownerKey);

    const afterFailure = useCrmStore.getState();
    expect(afterFailure.hydrated).toBe(false);
    expect(afterFailure.hydrateError).toBe('network down');
    // No seed content was generated — the account's real (still unseen) data
    // is not represented by a non-empty local state that could overwrite it.
    expect(afterFailure.leads).toEqual([]);

    // This is the destructive path F2 closes off: before the fix, any user
    // action here would call dataService.save() with a payload that doesn't
    // match the server's real records, and the server's per-user delete
    // would remove every real lead the account owns.
    useCrmStore.getState().addLead(newLeadInput);

    expect(dataService.save).not.toHaveBeenCalled();
  });

  it('seeds demo data only when the load succeeds and the account is genuinely empty', async () => {
    vi.mocked(dataService.load).mockResolvedValue({
      ok: true,
      state: { leads: [], deals: [], tasks: [], activities: [], settings: undefined as never },
    });

    await useCrmStore.getState().hydrate(now, ownerKey);

    const state = useCrmStore.getState();
    expect(state.hydrated).toBe(true);
    expect(state.hydrateError).toBeNull();
    expect(state.leads.length).toBeGreaterThan(0);
    // Every seeded id is namespaced under this owner's key.
    expect(state.leads.every((lead) => lead.id.startsWith(`network-${ownerKey}-`))).toBe(true);
  });

  it('allows saves again once a hydrate succeeds after an earlier failure', async () => {
    vi.mocked(dataService.load).mockResolvedValueOnce({ ok: false, error: 'network down' });
    await useCrmStore.getState().hydrate(now, ownerKey);
    expect(useCrmStore.getState().hydrated).toBe(false);

    vi.mocked(dataService.load).mockResolvedValueOnce({
      ok: true,
      state: { leads: [], deals: [], tasks: [], activities: [], settings: undefined as never },
    });
    await useCrmStore.getState().hydrate(now, ownerKey);
    expect(useCrmStore.getState().hydrated).toBe(true);

    useCrmStore.getState().addLead(newLeadInput);
    expect(dataService.save).toHaveBeenCalledTimes(1);
  });

  it('loads existing records, marks the store hydrated, and lets edits save', async () => {
    const existingLead: Lead = {
      id: 'lead-1',
      ...newLeadInput,
      kind: 'industry',
      lastContactedAt: null,
      createdAt: now.toISOString(),
    };
    vi.mocked(dataService.load).mockResolvedValue({
      ok: true,
      state: {
        leads: [existingLead],
        deals: [],
        tasks: [],
        activities: [],
        settings: {
          theme: 'dark',
          defaultRetailLetterCadenceDays: 90,
          defaultOpportunityOutreachMessage: 'hi',
        },
      },
    });

    await useCrmStore.getState().hydrate(now, ownerKey);

    const state = useCrmStore.getState();
    expect(state.hydrated).toBe(true);
    expect(state.leads.some((lead) => lead.id === 'lead-1')).toBe(true);

    useCrmStore.getState().updateLead('lead-1', { notes: 'called today' });
    expect(dataService.save).toHaveBeenCalledTimes(1);
  });

  it('does not seed network contacts on a genuinely empty account when no owner key is available', async () => {
    vi.mocked(dataService.load).mockResolvedValue({
      ok: true,
      state: { leads: [], deals: [], tasks: [], activities: [], settings: undefined as never },
    });

    // No ownerKey passed — e.g. hydrate fired before useAuth() resolved a user.
    await useCrmStore.getState().hydrate(now);

    const state = useCrmStore.getState();
    // Hydrated (and therefore save-eligible) even though nothing was injected —
    // injecting un-namespaced network ids would be the bug; injecting nothing
    // is safe and recoverable on the next hydrate.
    expect(state.hydrated).toBe(true);
    expect(state.leads).toEqual([]);
  });

  it('does not merge network contacts into an existing account when no owner key is available', async () => {
    const existingLead: Lead = {
      id: 'lead-1',
      ...newLeadInput,
      kind: 'industry',
      lastContactedAt: null,
      createdAt: now.toISOString(),
    };
    vi.mocked(dataService.load).mockResolvedValue({
      ok: true,
      state: {
        leads: [existingLead],
        deals: [],
        tasks: [],
        activities: [],
        settings: undefined as never,
      },
    });

    await useCrmStore.getState().hydrate(now);

    const state = useCrmStore.getState();
    expect(state.hydrated).toBe(true);
    // Only the account's own real lead — no network-* leads were merged in.
    expect(state.leads).toEqual([existingLead]);
  });
});

describe('useCrmStore.hydrate while a Manager is viewing a teammate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useCrmStore.setState({ ...EMPTY_STATE, hydrated: false, hydrateError: null });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('namespaces merged network ids under the viewed teammate, not the passed-in ownerKey', async () => {
    stubLocalStorage({ [VIEW_AS_STORAGE_KEY]: 'teammate-9' });

    const existingLead: Lead = {
      id: 'lead-1',
      ...newLeadInput,
      kind: 'industry',
      lastContactedAt: null,
      createdAt: now.toISOString(),
    };
    vi.mocked(dataService.load).mockResolvedValue({
      ok: true,
      state: { leads: [existingLead], deals: [], tasks: [], activities: [], settings: undefined as never },
    });

    // ownerKey here is the Manager's own id — hydrate must not use it to mint
    // network-* ids while a teammate is being viewed.
    await useCrmStore.getState().hydrate(now, 'manager-1');

    const state = useCrmStore.getState();
    expect(state.hydrated).toBe(true);
    const networkLeads = state.leads.filter((lead) => lead.id.startsWith('network-'));
    expect(networkLeads.length).toBeGreaterThan(0);
    expect(networkLeads.every((lead) => lead.id.startsWith('network-teammate-9-'))).toBe(true);
    expect(networkLeads.some((lead) => lead.id.startsWith('network-manager-1-'))).toBe(false);
  });

  it('does not seed demo data into a genuinely empty account while viewing a teammate', async () => {
    stubLocalStorage({ [VIEW_AS_STORAGE_KEY]: 'teammate-9' });

    vi.mocked(dataService.load).mockResolvedValue({
      ok: true,
      state: { leads: [], deals: [], tasks: [], activities: [], settings: undefined as never },
    });

    await useCrmStore.getState().hydrate(now, 'manager-1');

    const state = useCrmStore.getState();
    expect(state.hydrated).toBe(true);
    expect(state.hydrateError).toBeNull();
    expect(state.leads).toEqual([]);
    expect(state.deals).toEqual([]);
    expect(state.tasks).toEqual([]);
    expect(state.activities).toEqual([]);
  });

  it('still seeds demo data for a genuinely empty account when no teammate is being viewed', async () => {
    stubLocalStorage();

    vi.mocked(dataService.load).mockResolvedValue({
      ok: true,
      state: { leads: [], deals: [], tasks: [], activities: [], settings: undefined as never },
    });

    await useCrmStore.getState().hydrate(now, ownerKey);

    const state = useCrmStore.getState();
    expect(state.hydrated).toBe(true);
    expect(state.leads.length).toBeGreaterThan(0);
    expect(state.leads.every((lead) => lead.id.startsWith(`network-${ownerKey}-`))).toBe(true);
  });
});
