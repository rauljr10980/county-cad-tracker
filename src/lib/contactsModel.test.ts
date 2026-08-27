import { describe, it, expect } from 'vitest';
import {
  normalizeContacts,
  recordAttempt,
  setDisposition,
  setPhoneNote,
  setEmailNote,
} from './contactsModel';

const legacy = {
  phoneRows: [{ name: 'Petra Martinez', phones: [{ number: '(903) 714-4811', status: '', source: 'TruePeopleSearch' }] }],
  emailRows: [{ name: 'Petra Martinez', emails: ['petramartinez53@yahoo.com', '1953pmtz@gmail.com'] }],
};

describe('normalizeContacts', () => {
  it('turns legacy bare-string emails into entries', () => {
    const result = normalizeContacts(legacy);
    expect(result.emailRows[0].emails).toEqual([
      { address: 'petramartinez53@yahoo.com' },
      { address: '1953pmtz@gmail.com' },
    ]);
  });

  it('leaves already-normalised emails alone, keeping their notes', () => {
    const result = normalizeContacts({
      phoneRows: [],
      emailRows: [{ name: 'X', emails: [{ address: 'a@b.com', note: 'bounced' }] }],
    });
    expect(result.emailRows[0].emails).toEqual([{ address: 'a@b.com', note: 'bounced' }]);
  });

  it('defaults attempts to 0 on a phone that has never been called', () => {
    expect(normalizeContacts(legacy).phoneRows[0].phones[0].attempts).toBe(0);
  });

  it('survives null, undefined, and a missing key', () => {
    expect(normalizeContacts(null)).toEqual({ phoneRows: [], emailRows: [] });
    expect(normalizeContacts(undefined)).toEqual({ phoneRows: [], emailRows: [] });
    expect(normalizeContacts({})).toEqual({ phoneRows: [], emailRows: [] });
  });

  it('drops a phone with no number rather than rendering a blank line', () => {
    const result = normalizeContacts({ phoneRows: [{ name: 'X', phones: [{ number: '' }, { number: '555' }] }], emailRows: [] });
    expect(result.phoneRows[0].phones).toHaveLength(1);
  });
});

describe('recordAttempt', () => {
  it('increments the count and stamps the time', () => {
    const now = new Date('2026-08-26T15:00:00Z');
    const result = recordAttempt(normalizeContacts(legacy), 0, 0, now);
    expect(result.phoneRows[0].phones[0].attempts).toBe(1);
    expect(result.phoneRows[0].phones[0].lastAttemptAt).toBe('2026-08-26T15:00:00.000Z');
  });

  it('counts up across repeated calls', () => {
    const now = new Date('2026-08-26T15:00:00Z');
    let c = normalizeContacts(legacy);
    c = recordAttempt(c, 0, 0, now);
    c = recordAttempt(c, 0, 0, now);
    c = recordAttempt(c, 0, 0, now);
    expect(c.phoneRows[0].phones[0].attempts).toBe(3);
  });

  it('leaves other numbers untouched', () => {
    const two = normalizeContacts({
      phoneRows: [{ name: 'X', phones: [{ number: '111' }, { number: '222' }] }],
      emailRows: [],
    });
    const result = recordAttempt(two, 0, 1, new Date());
    expect(result.phoneRows[0].phones[0].attempts).toBe(0);
    expect(result.phoneRows[0].phones[1].attempts).toBe(1);
  });

  it('does not mutate the input', () => {
    const before = normalizeContacts(legacy);
    recordAttempt(before, 0, 0, new Date());
    expect(before.phoneRows[0].phones[0].attempts).toBe(0);
  });
});

describe('setDisposition', () => {
  it('records right, then wrong, ending at wrong', () => {
    let c = normalizeContacts(legacy);
    c = setDisposition(c, 0, 0, 'right');
    expect(c.phoneRows[0].phones[0].status).toBe('right');
    c = setDisposition(c, 0, 0, 'wrong');
    expect(c.phoneRows[0].phones[0].status).toBe('wrong');
  });

  it('clears back to undecided', () => {
    let c = setDisposition(normalizeContacts(legacy), 0, 0, 'wrong');
    c = setDisposition(c, 0, 0, '');
    expect(c.phoneRows[0].phones[0].status).toBe('');
  });

  it('does not change the attempt count', () => {
    const c = setDisposition(recordAttempt(normalizeContacts(legacy), 0, 0, new Date()), 0, 0, 'wrong');
    expect(c.phoneRows[0].phones[0].attempts).toBe(1);
  });
});

describe('notes', () => {
  it('sets a note on one phone line only', () => {
    const two = normalizeContacts({ phoneRows: [{ name: 'X', phones: [{ number: '111' }, { number: '222' }] }], emailRows: [] });
    const result = setPhoneNote(two, 0, 0, 'said he owns no rentals');
    expect(result.phoneRows[0].phones[0].note).toBe('said he owns no rentals');
    expect(result.phoneRows[0].phones[1].note).toBeUndefined();
  });

  it('sets a note on an email line', () => {
    const result = setEmailNote(normalizeContacts(legacy), 0, 1, 'bounced');
    expect(result.emailRows[0].emails[1].note).toBe('bounced');
    expect(result.emailRows[0].emails[0].note).toBeUndefined();
  });
});
