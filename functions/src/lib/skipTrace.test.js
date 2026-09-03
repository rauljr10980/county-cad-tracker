import { describe, it, expect } from 'vitest';
import { groupContactsByNormalizedName } from './entityShare.js';
import {
  normalizeContacts,
  hasAnyContactInfo,
  isSearchable,
  needsTracing,
  selectTracingCandidates,
  diffNewFacts,
  hasNewFacts,
  applyFactsToContacts,
} from './skipTrace.js';

const EMPTY = { phoneRows: [], emailRows: [] };
const withPhone = (number) => ({ phoneRows: [{ name: 'x', phones: [{ number }] }], emailRows: [] });
const withEmail = (address) => ({ phoneRows: [], emailRows: [{ name: 'x', emails: [{ address }] }] });

describe('normalizeContacts', () => {
  it('handles a missing/malformed blob without throwing', () => {
    expect(normalizeContacts(null)).toEqual(EMPTY);
    expect(normalizeContacts(undefined)).toEqual(EMPTY);
    expect(normalizeContacts({})).toEqual(EMPTY);
  });

  it('accepts bare-string legacy phone/email rows', () => {
    const c = normalizeContacts({ phoneRows: [{ name: 'x', phones: ['210-555-0100'] }], emailRows: [{ name: 'x', emails: ['a@b.com'] }] });
    expect(c.phoneRows[0].phones).toEqual([{ number: '210-555-0100', status: '', attempts: 0, lastAttemptAt: null }]);
    expect(c.emailRows[0].emails).toEqual([{ address: 'a@b.com' }]);
  });

  it('drops a phone/email entry with no number/address', () => {
    const c = normalizeContacts({ phoneRows: [{ name: 'x', phones: [{ status: 'right' }, ''] }], emailRows: [{ name: 'x', emails: [{}, '  '] }] });
    expect(c.phoneRows[0].phones).toEqual([]);
    expect(c.emailRows[0].emails).toEqual([]);
  });
});

describe('hasAnyContactInfo', () => {
  it('is false for an empty blob, and for rows that only contain empty phones/emails arrays', () => {
    expect(hasAnyContactInfo(normalizeContacts(EMPTY))).toBe(false);
    expect(hasAnyContactInfo(normalizeContacts({ phoneRows: [{ name: 'x', phones: [] }], emailRows: [] }))).toBe(false);
  });

  it('is true once any row carries a real phone or email', () => {
    expect(hasAnyContactInfo(normalizeContacts(withPhone('210-555-0100')))).toBe(true);
    expect(hasAnyContactInfo(normalizeContacts(withEmail('a@b.com')))).toBe(true);
  });
});

describe('isSearchable / needsTracing — junk/addressLike/blank exclusion', () => {
  it('excludes junk, addressLike, and blank nameKinds even when contacts is empty', () => {
    for (const nameKind of ['junk', 'addressLike', 'blank']) {
      const contact = { nameKind, contacts: EMPTY };
      expect(isSearchable(contact)).toBe(false);
      expect(needsTracing(contact)).toBe(false);
    }
  });

  it('includes person and entity nameKinds when contacts is empty', () => {
    for (const nameKind of ['person', 'entity']) {
      const contact = { nameKind, contacts: EMPTY };
      expect(isSearchable(contact)).toBe(true);
      expect(needsTracing(contact)).toBe(true);
    }
  });

  it('a searchable contact that already has a phone or email does not need tracing', () => {
    expect(needsTracing({ nameKind: 'person', contacts: withPhone('210-555-0100') })).toBe(false);
    expect(needsTracing({ nameKind: 'person', contacts: withEmail('a@b.com') })).toBe(false);
  });

  it('handles a null/undefined contact without throwing', () => {
    expect(isSearchable(null)).toBe(false);
    expect(needsTracing(undefined)).toBe(false);
  });
});

describe('selectTracingCandidates', () => {
  it('filters a mixed roster down to only what still needs tracing', () => {
    const contacts = [
      { id: 'a', nameKind: 'person', contacts: EMPTY },
      { id: 'b', nameKind: 'person', contacts: withPhone('210-555-0100') },
      { id: 'c', nameKind: 'junk', contacts: EMPTY },
      { id: 'd', nameKind: 'addressLike', contacts: EMPTY },
      { id: 'e', nameKind: 'blank', contacts: EMPTY },
      { id: 'f', nameKind: 'entity', contacts: EMPTY },
    ];
    expect(selectTracingCandidates(contacts).map((c) => c.id)).toEqual(['a', 'f']);
  });
});

describe('selectTracingCandidates + groupContactsByNormalizedName — one person, several listings', () => {
  it('groups a person who owns five listings into a single queue entry carrying all five contact ids', () => {
    const contacts = Array.from({ length: 5 }, (_, i) => ({
      id: `contact-${i}`,
      mlsLeadId: `lead-${i}`,
      name: i % 2 === 0 ? 'Baugher Jason E' : 'BAUGHER JASON E',
      nameKind: 'person',
      contacts: EMPTY,
    }));
    const groups = groupContactsByNormalizedName(selectTracingCandidates(contacts));
    expect(groups).toHaveLength(1);
    expect(groups[0].contacts.map((c) => c.id)).toEqual(contacts.map((c) => c.id));
  });

  it('only surfaces the listings that still need tracing when some of a person’s contacts already have data', () => {
    const contacts = [
      { id: 'a', mlsLeadId: 'lead-1', name: 'Jason Baugher', nameKind: 'person', contacts: EMPTY },
      { id: 'b', mlsLeadId: 'lead-2', name: 'Jason Baugher', nameKind: 'person', contacts: withPhone('210-555-0100') },
    ];
    const groups = groupContactsByNormalizedName(selectTracingCandidates(contacts));
    expect(groups).toHaveLength(1);
    expect(groups[0].contacts.map((c) => c.id)).toEqual(['a']);
  });

  it('keeps two different people (a genuinely different name) as separate queue entries', () => {
    const contacts = [
      { id: 'a', mlsLeadId: 'lead-1', name: 'Jason Baugher', nameKind: 'person', contacts: EMPTY },
      { id: 'b', mlsLeadId: 'lead-2', name: 'Maria Gonzalez', nameKind: 'person', contacts: EMPTY },
    ];
    const groups = groupContactsByNormalizedName(selectTracingCandidates(contacts));
    expect(groups).toHaveLength(2);
  });
});

describe('diffNewFacts', () => {
  it('reports a freshly-extracted phone/email as new', () => {
    const facts = diffNewFacts(EMPTY, { phoneRows: [{ name: 'x', phones: [{ number: '(210) 555-0100' }] }], emailRows: [{ name: 'x', emails: [{ address: 'Jane@Example.com' }] }] });
    expect(facts.phones).toEqual(['(210) 555-0100']);
    expect(facts.emails).toEqual(['Jane@Example.com']);
  });

  it('reports nothing when the number already existed, even if formatted differently', () => {
    const previous = withPhone('(210) 555-0100');
    const next = { phoneRows: [{ name: 'x', phones: [{ number: '210-555-0100' }] }], emailRows: [] };
    expect(diffNewFacts(previous, next)).toEqual({ phones: [], emails: [] });
  });

  it('adding a note or a right/wrong disposition to an already-known number produces no new facts', () => {
    const previous = { phoneRows: [{ name: 'x', phones: [{ number: '210-555-0100', status: '', note: '' }] }], emailRows: [] };
    const next = { phoneRows: [{ name: 'x', phones: [{ number: '210-555-0100', status: 'right', note: 'said he sold that one' }] }], emailRows: [] };
    expect(diffNewFacts(previous, next)).toEqual({ phones: [], emails: [] });
  });

  it('dedupes within the new set itself', () => {
    const next = { phoneRows: [{ name: 'x', phones: [{ number: '210-555-0100' }, { number: '2105550100' }] }], emailRows: [] };
    expect(diffNewFacts(EMPTY, next).phones).toEqual(['210-555-0100']);
  });
});

describe('hasNewFacts', () => {
  it('is false for an empty diff and true once either side has something', () => {
    expect(hasNewFacts({ phones: [], emails: [] })).toBe(false);
    expect(hasNewFacts({ phones: ['210-555-0100'], emails: [] })).toBe(true);
    expect(hasNewFacts({ phones: [], emails: ['a@b.com'] })).toBe(true);
    expect(hasNewFacts(null)).toBe(false);
  });
});

describe('applyFactsToContacts — sharing propagates phones/emails but not notes/dispositions', () => {
  it('appends new facts as a fresh row under the sibling’s own name, leaving existing rows untouched', () => {
    const siblingExisting = {
      phoneRows: [{ name: 'Jason Baugher', phones: [{ number: '210-555-9999', status: 'wrong', note: 'said he sold that one', attempts: 2, lastAttemptAt: '2026-01-01T00:00:00.000Z' }] }],
      emailRows: [],
    };
    const facts = { phones: ['210-555-0100'], emails: ['jane@example.com'] };
    const result = applyFactsToContacts(siblingExisting, facts, 'Jason Baugher');

    expect(result.changed).toBe(true);
    // The pre-existing phone row — including its note, disposition, and
    // attempt count — passes through byte-for-byte.
    expect(result.contacts.phoneRows[0]).toEqual(siblingExisting.phoneRows[0]);
    // The new phone lands in its own row, with no note/disposition/attempts
    // carried over from anywhere — it's a brand-new fact on this contact.
    expect(result.contacts.phoneRows[1]).toEqual({
      name: 'Jason Baugher',
      phones: [{ number: '210-555-0100', status: '', source: 'TruePeopleSearch', attempts: 0, lastAttemptAt: null }],
    });
    expect(result.contacts.emailRows).toEqual([{ name: 'Jason Baugher', emails: [{ address: 'jane@example.com' }] }]);
  });

  it('skips a fact the sibling already independently has, and reports changed: false when nothing new applies', () => {
    const siblingExisting = withPhone('210-555-0100');
    const result = applyFactsToContacts(siblingExisting, { phones: ['(210) 555-0100'], emails: [] }, 'Jason Baugher');
    expect(result.changed).toBe(false);
    expect(result.contacts).toEqual(normalizeContacts(siblingExisting));
  });

  it('never introduces a note or disposition field on a newly-added entry', () => {
    const result = applyFactsToContacts(EMPTY, { phones: ['210-555-0100'], emails: [] }, 'Someone');
    const phone = result.contacts.phoneRows[0].phones[0];
    expect(phone.note).toBeUndefined();
    expect(phone.status).toBe('');
  });
});
