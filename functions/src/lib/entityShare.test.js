import { describe, it, expect } from 'vitest';
import {
  groupContactsByNormalizedName,
  needsLookup,
  selectLookupCandidates,
  pickSharedEntityFields,
  findSuccessfulSibling,
  SHARED_ENTITY_FIELDS,
} from './entityShare.js';

describe('groupContactsByNormalizedName', () => {
  it('groups a company owning several listings into one lookup unit', () => {
    // Same company, punctuation-inconsistent the way the Comptroller
    // registry actually is: "NAME, LLC" vs "NAME LLC" (see comptroller.js).
    const contacts = [
      { id: 'a', name: 'Baabco Properties II, LLC' },
      { id: 'b', name: 'BAABCO PROPERTIES II LLC' },
      { id: 'c', name: 'baabco   properties ii llc' },
    ];
    const groups = groupContactsByNormalizedName(contacts);
    expect(groups).toHaveLength(1);
    expect(groups[0].contacts.map((c) => c.id)).toEqual(['a', 'b', 'c']);
  });

  it('keeps a same-search sibling with a genuinely different name as its own group', () => {
    const contacts = [
      { id: 'a', name: 'BAABCO PROPERTIES II, LLC' },
      { id: 'b', name: 'BAABCO PROPERTIES III, LLC' },
    ];
    const groups = groupContactsByNormalizedName(contacts);
    expect(groups).toHaveLength(2);
  });

  it('preserves first-seen order of groups and of contacts within a group', () => {
    const contacts = [
      { id: 'a', name: 'Zeta LLC' },
      { id: 'b', name: 'Alpha LLC' },
      { id: 'c', name: 'ZETA LLC' },
    ];
    const groups = groupContactsByNormalizedName(contacts);
    expect(groups.map((g) => g.normalizedName)).toEqual(['ZETA LLC', 'ALPHA LLC']);
    expect(groups[0].contacts.map((c) => c.id)).toEqual(['a', 'c']);
  });

  it('drops a contact whose name normalises to blank rather than grouping it', () => {
    const groups = groupContactsByNormalizedName([{ id: 'a', name: '' }, { id: 'b', name: '   ' }, null]);
    expect(groups).toEqual([]);
  });

  it('returns an empty array for a non-array input', () => {
    expect(groupContactsByNormalizedName(undefined)).toEqual([]);
    expect(groupContactsByNormalizedName(null)).toEqual([]);
  });
});

describe('needsLookup / selectLookupCandidates', () => {
  it('excludes an already-success contact', () => {
    expect(needsLookup({ entityLookupStatus: 'success' })).toBe(false);
  });

  it('includes a pending contact (no entityLookupStatus yet)', () => {
    expect(needsLookup({ entityLookupStatus: null })).toBe(true);
    expect(needsLookup({})).toBe(true);
  });

  it('excludes failed/not_found/ambiguous contacts unless retryFailed is set', () => {
    expect(needsLookup({ entityLookupStatus: 'failed' })).toBe(false);
    expect(needsLookup({ entityLookupStatus: 'not_found' })).toBe(false);
    expect(needsLookup({ entityLookupStatus: 'ambiguous' })).toBe(false);

    expect(needsLookup({ entityLookupStatus: 'failed' }, { retryFailed: true })).toBe(true);
    expect(needsLookup({ entityLookupStatus: 'not_found' }, { retryFailed: true })).toBe(true);
    expect(needsLookup({ entityLookupStatus: 'ambiguous' }, { retryFailed: true })).toBe(true);
  });

  it('never re-includes success even when retryFailed is set', () => {
    expect(needsLookup({ entityLookupStatus: 'success' }, { retryFailed: true })).toBe(false);
  });

  it('filters a mixed contact list down to only what still needs a lookup', () => {
    const contacts = [
      { id: 'a', entityLookupStatus: 'success' },
      { id: 'b', entityLookupStatus: null },
      { id: 'c', entityLookupStatus: 'failed' },
      { id: 'd', entityLookupStatus: 'not_found' },
    ];
    expect(selectLookupCandidates(contacts).map((c) => c.id)).toEqual(['b']);
    expect(selectLookupCandidates(contacts, { retryFailed: true }).map((c) => c.id)).toEqual(['b', 'c', 'd']);
  });

  it('a rerun with no retryFailed skips everything that already resolved or already failed', () => {
    // The exact "rerun skips what already succeeded" scenario: a bulk run
    // already processed this filtered set once, so nothing should be
    // eligible a second time without retryFailed.
    const contacts = [
      { id: 'a', entityLookupStatus: 'success' },
      { id: 'b', entityLookupStatus: 'failed' },
      { id: 'c', entityLookupStatus: 'not_found' },
    ];
    expect(selectLookupCandidates(contacts)).toEqual([]);
  });
});

describe('pickSharedEntityFields', () => {
  const fullContact = {
    id: 'source',
    name: 'BAABCO PROPERTIES II, LLC',
    // Per-property fields that must NOT propagate:
    contacts: { phoneRows: [{ number: '210-555-0100' }], emailRows: [] },
    notes: 'Called the tenant, left a voicemail about this specific unit',
    workflowStage: 'contacted',
    // Registry-derived fields that must propagate:
    mailingAddress: '797 CROWN JEWEL, BOERNE, TX 78006',
    entityTaxpayerNumber: '32085984956',
    entityFileNumber: '0804695894',
    entityStatus: 'ACTIVE',
    entityLookupAt: '2026-09-01T00:00:00.000Z',
    entityLookupStatus: 'success',
    registeredAgentName: 'ALEX J MIHAILA',
    registeredOfficeAddress: '797 CROWN JEWEL, BOERNE, TX 78006',
    stateOfFormation: 'IL',
    sosRegistrationStatus: 'ACTIVE',
    sosRegistrationDate: '08/22/2022',
    rightToTransact: 'ACTIVE',
    officers: [{ name: 'ALEX J MIHAILA', title: 'DIRECTOR', address: '797 CROWN JEWEL, BOERNE, TX 78006' }],
  };

  it('carries every registry-derived field', () => {
    const picked = pickSharedEntityFields(fullContact);
    for (const key of SHARED_ENTITY_FIELDS) {
      expect(picked).toHaveProperty(key, fullContact[key]);
    }
  });

  it('never includes contacts or notes — those are per-property working notes, not registry facts', () => {
    const picked = pickSharedEntityFields(fullContact);
    expect(picked).not.toHaveProperty('contacts');
    expect(picked).not.toHaveProperty('notes');
    expect(picked).not.toHaveProperty('workflowStage');
    expect(picked).not.toHaveProperty('name');
    expect(picked).not.toHaveProperty('id');
  });

  it('handles a null/undefined contact without throwing', () => {
    const picked = pickSharedEntityFields(null);
    expect(picked.mailingAddress).toBeUndefined();
    expect(picked).not.toHaveProperty('contacts');
  });
});

describe('findSuccessfulSibling', () => {
  it('finds the already-resolved member of a sibling group', () => {
    const contacts = [
      { id: 'a', entityLookupStatus: 'failed' },
      { id: 'b', entityLookupStatus: 'success' },
      { id: 'c', entityLookupStatus: null },
    ];
    expect(findSuccessfulSibling(contacts)?.id).toBe('b');
  });

  it('returns null when nothing in the group has succeeded yet', () => {
    const contacts = [{ id: 'a', entityLookupStatus: 'failed' }, { id: 'b', entityLookupStatus: null }];
    expect(findSuccessfulSibling(contacts)).toBeNull();
  });

  it('returns null for an empty or missing group', () => {
    expect(findSuccessfulSibling([])).toBeNull();
    expect(findSuccessfulSibling(undefined)).toBeNull();
  });
});
