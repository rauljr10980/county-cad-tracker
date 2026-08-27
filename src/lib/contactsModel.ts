/**
 * The `contacts` column on an eviction landlord is an unvalidated JSON blob
 * written by several versions of this app. Emails and phones were both stored
 * as bare strings before per-line notes/attempts existed, so every read goes
 * through normalizeContacts — a reader that assumes the current shape throws
 * on real rows, and a normalise-then-rewrite that silently erases a shape it
 * doesn't recognise.
 */

export type PhoneEntry = {
  number: string;
  status?: string;
  type?: string;
  source?: string;
  note?: string;
  attempts?: number;
  lastAttemptAt?: string | null;
};

export type EmailEntry = { address: string; note?: string };

export type NormalizedContacts = {
  phoneRows: { name: string; phones: PhoneEntry[] }[];
  emailRows: { name: string; emails: EmailEntry[] }[];
};

const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

const normalizePhone = (raw: unknown): PhoneEntry | null => {
  if (typeof raw === 'string') {
    const number = raw.trim();
    return number ? { number, status: '', attempts: 0, lastAttemptAt: null } : null;
  }
  if (!raw || typeof raw !== 'object') return null;
  const p = raw as Record<string, unknown>;
  const number = typeof p.number === 'string' ? p.number.trim() : '';
  if (!number) return null;
  return {
    number,
    status: typeof p.status === 'string' ? p.status : '',
    type: typeof p.type === 'string' ? p.type : undefined,
    source: typeof p.source === 'string' ? p.source : undefined,
    note: typeof p.note === 'string' && p.note ? p.note : undefined,
    attempts: typeof p.attempts === 'number' && p.attempts > 0 ? p.attempts : 0,
    lastAttemptAt: typeof p.lastAttemptAt === 'string' ? p.lastAttemptAt : null,
  };
};

const normalizeEmail = (raw: unknown): EmailEntry | null => {
  if (typeof raw === 'string') {
    const address = raw.trim();
    return address ? { address } : null;
  }
  if (!raw || typeof raw !== 'object') return null;
  const e = raw as Record<string, unknown>;
  const address = typeof e.address === 'string' ? e.address.trim() : '';
  if (!address) return null;
  return typeof e.note === 'string' && e.note ? { address, note: e.note } : { address };
};

export const normalizeContacts = (raw: unknown): NormalizedContacts => {
  const source = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  return {
    phoneRows: asArray(source.phoneRows).map((row) => {
      const r = (row && typeof row === 'object' ? row : {}) as Record<string, unknown>;
      return {
        name: typeof r.name === 'string' ? r.name : '',
        phones: asArray(r.phones).map(normalizePhone).filter((p): p is PhoneEntry => p !== null),
      };
    }),
    emailRows: asArray(source.emailRows).map((row) => {
      const r = (row && typeof row === 'object' ? row : {}) as Record<string, unknown>;
      return {
        name: typeof r.name === 'string' ? r.name : '',
        emails: asArray(r.emails).map(normalizeEmail).filter((e): e is EmailEntry => e !== null),
      };
    }),
  };
};

// Every mutator returns a new object. The profile keeps the contacts blob in
// React state and PATCHes it whole, so in-place mutation would not re-render.
const mapPhone = (
  contacts: NormalizedContacts,
  rowIndex: number,
  phoneIndex: number,
  change: (phone: PhoneEntry) => PhoneEntry
): NormalizedContacts => ({
  ...contacts,
  phoneRows: contacts.phoneRows.map((row, ri) =>
    ri !== rowIndex
      ? row
      : { ...row, phones: row.phones.map((phone, pi) => (pi === phoneIndex ? change(phone) : phone)) }
  ),
});

export const recordAttempt = (
  contacts: NormalizedContacts,
  rowIndex: number,
  phoneIndex: number,
  now: Date
): NormalizedContacts =>
  mapPhone(contacts, rowIndex, phoneIndex, (phone) => ({
    ...phone,
    attempts: (phone.attempts ?? 0) + 1,
    lastAttemptAt: now.toISOString(),
  }));

export const setDisposition = (
  contacts: NormalizedContacts,
  rowIndex: number,
  phoneIndex: number,
  status: string
): NormalizedContacts => mapPhone(contacts, rowIndex, phoneIndex, (phone) => ({ ...phone, status }));

export const setPhoneNote = (
  contacts: NormalizedContacts,
  rowIndex: number,
  phoneIndex: number,
  note: string
): NormalizedContacts =>
  mapPhone(contacts, rowIndex, phoneIndex, (phone) => ({ ...phone, note: note || undefined }));

export const setEmailNote = (
  contacts: NormalizedContacts,
  rowIndex: number,
  emailIndex: number,
  note: string
): NormalizedContacts => ({
  ...contacts,
  emailRows: contacts.emailRows.map((row, ri) =>
    ri !== rowIndex
      ? row
      : {
          ...row,
          emails: row.emails.map((email, ei) =>
            ei === emailIndex ? { ...email, note: note || undefined } : email
          ),
        }
  ),
});
