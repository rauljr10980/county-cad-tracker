/**
 * Pure logic behind sharing a Comptroller entity-lookup result across every
 * MlsContact owned by the same user whose name normalises identically — the
 * same company ("BAABCO PROPERTIES II, LLC") frequently owns several
 * listings, and looking it up once per listing wastes calls against a
 * public, unauthenticated endpoint. See mlsLeads.js's POST
 * /entity-lookup/bulk and the propagation added to the existing
 * /contacts/:contactId/entity-lookup and /entity-select routes for how this
 * gets wired to prisma; everything here is deliberately DB-free so it can be
 * unit tested directly.
 *
 * Reuses comptroller.js's punctuation-insensitive `normalizeNameForMatch`
 * rather than a second normaliser — that's what already defeats the "NAME,
 * LLC" vs "NAME LLC" registry inconsistency, and it's exactly the same
 * question being asked here: are these two contacts' names the same
 * company?
 */

const { normalizeNameForMatch } = require('./comptroller');

// Groups an array of contact-like objects ({ name, ... }) by
// normalizeNameForMatch(name), preserving first-seen order of both the
// groups and the contacts within each group. A contact whose name
// normalises to '' (blank/unnamed) is dropped — there's nothing to group it
// with.
//
// A company owning 40 listings yields one group of 40 contacts here, which
// is what makes it one lookup unit rather than 40.
function groupContactsByNormalizedName(contacts) {
  const order = [];
  const byKey = new Map();
  for (const contact of contacts || []) {
    if (!contact) continue;
    const key = normalizeNameForMatch(contact.name);
    if (!key) continue;
    let group = byKey.get(key);
    if (!group) {
      group = { normalizedName: key, contacts: [] };
      byKey.set(key, group);
      order.push(key);
    }
    group.contacts.push(contact);
  }
  return order.map((key) => byKey.get(key));
}

// The skip rule for a bulk (or pre-lookup-sibling-check) run: a contact
// already resolved (`success`) is never re-looked-up. A contact that
// previously came back `failed` or `not_found` is skipped too, UNLESS the
// caller explicitly asked to retry — otherwise a rerun just wastes the
// whole batch re-failing the same names. `ambiguous` also needs a human to
// pick a candidate, so it's excluded the same way as failed/not_found
// (retryFailed lets it be attempted again from scratch). A contact with no
// entityLookupStatus yet (`pending`) is always eligible.
function needsLookup(contact, { retryFailed = false } = {}) {
  if (!contact) return false;
  const status = contact.entityLookupStatus;
  if (status === 'success') return false;
  if (!status) return true;
  if (retryFailed) return true;
  return false;
}

function selectLookupCandidates(contacts, options = {}) {
  return (contacts || []).filter((contact) => needsLookup(contact, options));
}

// The fields a shared result propagates to a sibling contact — every
// registry-derived fact from the Comptroller lookup, plus the lookup
// bookkeeping itself. Deliberately excludes `contacts` (the phones/emails
// blob) and `notes`: those are per-property working notes the user typed
// for *that* listing, not facts about the company, and copying them across
// properties would silently overwrite one property's call notes with
// another's.
const SHARED_ENTITY_FIELDS = [
  'mailingAddress',
  'entityTaxpayerNumber',
  'entityFileNumber',
  'entityStatus',
  'entityLookupAt',
  'entityLookupStatus',
  'registeredAgentName',
  'registeredOfficeAddress',
  'stateOfFormation',
  'sosRegistrationStatus',
  'sosRegistrationDate',
  'rightToTransact',
  'officers',
];

function pickSharedEntityFields(contact) {
  const picked = {};
  for (const key of SHARED_ENTITY_FIELDS) {
    picked[key] = contact ? contact[key] : undefined;
  }
  return picked;
}

// A sibling group's already-resolved member, if any — the "check before
// calling the Comptroller at all" step that makes a bulk run cheap. Returns
// null when nothing in the group has succeeded yet.
function findSuccessfulSibling(contacts) {
  return (contacts || []).find((c) => c && c.entityLookupStatus === 'success') || null;
}

module.exports = {
  groupContactsByNormalizedName,
  needsLookup,
  selectLookupCandidates,
  pickSharedEntityFields,
  findSuccessfulSibling,
  SHARED_ENTITY_FIELDS,
};
