import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useCrmStore } from './useCrmStore';
import { dataService } from '../data/dataService';
import { EMPTY_STATE, type Lead } from '../data/types';

vi.mock('../data/dataService', () => ({
  dataService: {
    load: vi.fn(),
    save: vi.fn(),
    clear: vi.fn(),
  },
}));

const now = new Date('2026-08-25T12:00:00Z');
const ownerKey = 'user-1';

const newLeadInput: Omit<Lead, 'id' | 'createdAt' | 'lastContactedAt' | 'kind'> = {
  businessName: 'Acme Co',
  ownerName: 'Jane Prospect',
  jobTitleIndustry: '',
  firm: '',
  phone: '',
  email: '',
  industry: 'Other',
  city: '',
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
