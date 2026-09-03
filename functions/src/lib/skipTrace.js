/**
 * Pure logic behind the skip-trace queue: which MlsContact rows still need
 * tracing (their normalised `contacts` blob has no phone numbers and no
 * emails), and how a freshly-pasted phone/email fact gets applied to every
 * other contact sharing that person's name without disturbing what's
 * already on their own card.
 *
 * Grouping people who own several listings into one queue entry reuses
 * entityShare.js's `groupContactsByNormalizedName` directly (see
 * mlsLeads.js) rather than a second copy — it's already generic over any
 * `{ name }` object and keyed by comptroller.js's punctuation-insensitive
 * `normalizeNameForMatch`, which is exactly the same question being asked
 * here: are these two contacts the same person?
 *
 * `normalizeContacts` below is a CommonJS port of src/lib/contactsModel.ts's
 * read path (same defensive shape handling — a bare string phone/email left
 * over from an older save, a missing array) since the backend can't import
 * that frontend ESM module. It only reads a blob (to check for emptiness,
 * or to diff two blobs), never mutates a caller's copy — so unlike the
 * frontend model it carries no per-line note/status/attempts mutators.
 */

const asArray = (value) => (Array.isArray(value) ? value : []);

// Mirrors contactsModel.ts's normalizePhone/normalizeEmail field-for-field —
// not just `.number`/`.address` — because applyFactsToContacts below writes
// its result straight back to the DB; dropping a sibling's own
// note/status/attempts here would silently erase them on the very write
// meant to leave them untouched.
const normalizePhone = (raw) => {
  if (typeof raw === 'string') {
    const number = raw.trim();
    return number ? { number, status: '', attempts: 0, lastAttemptAt: null } : null;
  }
  if (!raw || typeof raw !== 'object') return null;
  const number = typeof raw.number === 'string' ? raw.number.trim() : '';
  if (!number) return null;
  return {
    number,
    status: typeof raw.status === 'string' ? raw.status : '',
    type: typeof raw.type === 'string' ? raw.type : undefined,
    source: typeof raw.source === 'string' ? raw.source : undefined,
    note: typeof raw.note === 'string' && raw.note ? raw.note : undefined,
    attempts: typeof raw.attempts === 'number' && raw.attempts > 0 ? raw.attempts : 0,
    lastAttemptAt: typeof raw.lastAttemptAt === 'string' ? raw.lastAttemptAt : null,
  };
};

const normalizeEmail = (raw) => {
  if (typeof raw === 'string') {
    const address = raw.trim();
    return address ? { address } : null;
  }
  if (!raw || typeof raw !== 'object') return null;
  const address = typeof raw.address === 'string' ? raw.address.trim() : '';
  if (!address) return null;
  return typeof raw.note === 'string' && raw.note ? { address, note: raw.note } : { address };
};

function normalizeContacts(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  return {
    phoneRows: asArray(source.phoneRows).map((row) => {
      const r = row && typeof row === 'object' ? row : {};
      return {
        name: typeof r.name === 'string' ? r.name : '',
        phones: asArray(r.phones).map(normalizePhone).filter(Boolean),
      };
    }),
    emailRows: asArray(source.emailRows).map((row) => {
      const r = row && typeof row === 'object' ? row : {};
      return {
        name: typeof r.name === 'string' ? r.name : '',
        emails: asArray(r.emails).map(normalizeEmail).filter(Boolean),
      };
    }),
  };
}

const hasAnyContactInfo = (contacts) =>
  contacts.phoneRows.some((r) => r.phones.length > 0) || contacts.emailRows.some((r) => r.emails.length > 0);

// nameKinds with no one to look up — see mlsOwner.js's classifyOwner. The
// same three kinds are excluded from result-sharing below: a
// junk/addressLike/blank name has no normalised identity worth matching a
// sibling against.
const UNSEARCHABLE_KINDS = ['junk', 'addressLike', 'blank'];
const isSearchable = (contact) => !!contact && !UNSEARCHABLE_KINDS.includes(contact.nameKind);

// The queue's core predicate: a contact needs tracing when it's someone
// worth looking up (see isSearchable) and its own contacts blob is
// currently empty of both phones and emails. Deliberately per-contact, not
// per-person — a person with five listings where one already has a number
// on file still has the other four surfaced individually, so grouping (see
// entityShare.js's groupContactsByNormalizedName, applied after this filter
// — the same compose order the bulk entity lookup already uses) reflects
// exactly which of their listings still need work.
function needsTracing(contact) {
  if (!isSearchable(contact)) return false;
  return !hasAnyContactInfo(normalizeContacts(contact.contacts));
}

function selectTracingCandidates(contacts) {
  return (contacts || []).filter(needsTracing);
}

const phoneKey = (number) => String(number || '').replace(/\D/g, '').slice(-10);
const emailKey = (address) => String(address || '').trim().toLowerCase();

const collectPhoneKeys = (contacts) =>
  new Set(contacts.phoneRows.flatMap((r) => r.phones.map((p) => phoneKey(p.number))).filter(Boolean));
const collectEmailKeys = (contacts) =>
  new Set(contacts.emailRows.flatMap((r) => r.emails.map((e) => emailKey(e.address))).filter(Boolean));

// Phone numbers and email addresses present in `nextRaw` that were absent
// from `previousRaw` — the bare facts a fresh extraction adds, with none of
// the per-line note/status/attempts metadata a caller might also be saving
// in the same write. A note or disposition added to an already-known number
// changes nothing this function reports (the number's key was already in
// `previousRaw`), which is what keeps that edit from propagating — see
// mlsLeads.js's PATCH /contacts/:contactId.
function diffNewFacts(previousRaw, nextRaw) {
  const previous = normalizeContacts(previousRaw);
  const next = normalizeContacts(nextRaw);
  const knownPhones = collectPhoneKeys(previous);
  const knownEmails = collectEmailKeys(previous);

  const phones = [];
  const seenPhones = new Set();
  for (const row of next.phoneRows) {
    for (const phone of row.phones) {
      const key = phoneKey(phone.number);
      if (!key || knownPhones.has(key) || seenPhones.has(key)) continue;
      seenPhones.add(key);
      phones.push(phone.number);
    }
  }

  const emails = [];
  const seenEmails = new Set();
  for (const row of next.emailRows) {
    for (const email of row.emails) {
      const key = emailKey(email.address);
      if (!key || knownEmails.has(key) || seenEmails.has(key)) continue;
      seenEmails.add(key);
      emails.push(email.address);
    }
  }

  return { phones, emails };
}

const hasNewFacts = (facts) => Boolean(facts && (facts.phones.length > 0 || facts.emails.length > 0));

// Applies newly-found facts to a sibling's OWN blob: appended as one new row
// per kind (labelled with the sibling's own name, not the contact the facts
// were extracted from), skipping anything the sibling already independently
// has. Every existing row — including its notes, dispositions, and
// call-attempt counts — passes through completely untouched; this only ever
// appends, never rewrites.
function applyFactsToContacts(existingRaw, facts, rowName) {
  const existing = normalizeContacts(existingRaw);
  const knownPhones = collectPhoneKeys(existing);
  const knownEmails = collectEmailKeys(existing);

  const seenPhones = new Set();
  const newPhones = (facts?.phones || []).filter((number) => {
    const key = phoneKey(number);
    if (!key || knownPhones.has(key) || seenPhones.has(key)) return false;
    seenPhones.add(key);
    return true;
  });

  const seenEmails = new Set();
  const newEmails = (facts?.emails || []).filter((address) => {
    const key = emailKey(address);
    if (!key || knownEmails.has(key) || seenEmails.has(key)) return false;
    seenEmails.add(key);
    return true;
  });

  if (!newPhones.length && !newEmails.length) {
    return { contacts: existing, changed: false };
  }

  const phoneRows = existing.phoneRows.slice();
  if (newPhones.length) {
    phoneRows.push({
      name: rowName || '',
      phones: newPhones.map((number) => ({ number, status: '', source: 'TruePeopleSearch', attempts: 0, lastAttemptAt: null })),
    });
  }

  const emailRows = existing.emailRows.slice();
  if (newEmails.length) {
    emailRows.push({ name: rowName || '', emails: newEmails.map((address) => ({ address })) });
  }

  return { contacts: { phoneRows, emailRows }, changed: true };
}

module.exports = {
  normalizeContacts,
  hasAnyContactInfo,
  isSearchable,
  needsTracing,
  selectTracingCandidates,
  diffNewFacts,
  hasNewFacts,
  applyFactsToContacts,
  UNSEARCHABLE_KINDS,
};
