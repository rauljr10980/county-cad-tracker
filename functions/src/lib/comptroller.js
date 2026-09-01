/**
 * Texas Comptroller franchise-tax lookup, used to resolve an entity owner
 * ("Baabco Properties II LLC") to its Registered Agent — a real person, at a
 * real street address — plus its officers, and the entity's own mailing
 * address as a fallback.
 *
 * This targets the public, keyless data-search API confirmed live at
 * comptroller.texas.gov (not the authenticated api.comptroller.texas.gov
 * endpoint the previous version used, which needed a key nobody had — that
 * left the feature dead in production). No API key, no header: this is a
 * plain unauthenticated GET.
 *
 * The flow is two calls. `searchEntity` hits the search endpoint with a name
 * and returns a table of candidates (name, taxpayer id, mailing zip). Once a
 * single taxpayer id is chosen, `getEntity` hits the detail endpoint and
 * returns the full Franchise Tax Account Status record, including the
 * Registered Agent Name, Registered Office Street Address, and the officer
 * roster — confirmed live for Mihaila Holdings Corp (Alex J Mihaila, 797
 * Crown Jewel, Boerne, TX 78006).
 *
 * The response envelope is `{ success, data, ... }` on both endpoints, and
 * `success: false` (observed on a malformed query, HTTP 400) carries an
 * `error` string that gets surfaced as-is. Everything else still gets the
 * defensive treatment: an unrecognised shape logs a truncated body and
 * returns an empty/failed result rather than throwing on a live lookup.
 */

const COMPTROLLER_BASE = 'https://comptroller.texas.gov/data-search/franchise-tax';

const str = (value) => (value == null ? '' : String(value).trim());

const joinParts = (...parts) => parts.map(str).filter(Boolean).join(', ');

// "TX" + "78006" -> "TX 78006" (space-joined, not comma-joined, since it's
// meant to be the last comma-separated segment of a street/city/state-zip
// address string).
const stateZip = (state, zip) => [str(state), str(zip)].filter(Boolean).join(' ');

// Officer/agent rows from officerInfo[] — the sample carries the same person
// twice under different titles (DIRECTOR, PRESIDENT), which is meaningful
// and kept; exact duplicate name+title rows are not.
const normalizeOfficers = (rows) => {
  if (!Array.isArray(rows)) return [];
  const seen = new Set();
  const officers = [];
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const name = str(row.AGNT_NM);
    const title = str(row.AGNT_TITL_TX);
    const address = joinParts(row.AD_STR_POB_TX, row.CITY_NM, stateZip(row.ST_CD, row.AD_ZP));
    const key = `${name}|${title}`;
    if (seen.has(key)) continue;
    seen.add(key);
    officers.push({ name, title, address });
  }
  return officers;
};

const normalizeEntity = (raw) => {
  const row = raw && typeof raw === 'object' ? raw : {};
  return {
    taxpayerId: str(row.taxpayerId),
    name: str(row.name),
    mailingAddress: joinParts(
      row.mailingAddressStreet,
      row.mailingAddressCity,
      stateZip(row.mailingAddressState, row.mailingAddressZip),
    ),
    rightToTransact: str(row.rightToTransactTX),
    stateOfFormation: str(row.stateOfFormation),
    sosRegistrationStatus: str(row.sosRegistrationStatus),
    sosRegistrationDate: str(row.effectiveSosRegistrationDate),
    sosFileNumber: str(row.sosFileNumber),
    registeredAgentName: str(row.registeredAgentName),
    registeredOfficeAddress: joinParts(
      row.registeredOfficeAddressStreet,
      row.registeredOfficeAddressCity,
      stateZip(row.registeredOfficeAddressState, row.registeredOfficeAddressZip),
    ),
    officers: normalizeOfficers(row.officerInfo),
  };
};

const normalizeSearchRow = (raw) => {
  const row = raw && typeof raw === 'object' ? raw : {};
  return {
    name: str(row.name),
    taxpayerId: str(row.taxpayerId),
    zip: str(row.mailingAddressZip),
  };
};

// The search endpoint's confirmed shape is `{ success, data: [...], count }`.
// A bare array is also accepted defensively; anything else is treated as an
// unrecognised shape rather than guessed at.
const extractSearchRows = (body) => {
  if (Array.isArray(body)) return body;
  if (body && Array.isArray(body.data)) return body.data;
  return null;
};

// The detail endpoint's confirmed shape is `{ success, data: {...} }`. A bare
// record (no wrapper) or a `data` array's first element are accepted
// defensively; anything else returns null so the caller can log the raw
// shape instead of guessing at it.
const extractRecord = (body) => {
  if (Array.isArray(body)) {
    return body[0] && typeof body[0] === 'object' && !Array.isArray(body[0]) ? body[0] : null;
  }
  if (!body || typeof body !== 'object') return null;
  if (Array.isArray(body.data)) {
    return body.data[0] && typeof body.data[0] === 'object' && !Array.isArray(body.data[0]) ? body.data[0] : null;
  }
  if (body.data && typeof body.data === 'object') return body.data;
  if (typeof body.taxpayerId === 'string') return body;
  return null;
};

// Reads the JSON body if there is one, without throwing on a non-JSON error
// page. `success: false` is respected regardless of HTTP status — the
// malformed-query case observed live is a 400 that still carries a JSON
// `{ success: false, error }` body worth surfacing verbatim.
const readBody = async (res) => {
  try {
    return await res.json();
  } catch {
    return null;
  }
};

const failureFrom = (body, res) => {
  if (body && body.success === false) return str(body.error) || `Comptroller lookup failed (${res.status})`;
  return `Comptroller lookup failed (${res.status})`;
};

const searchEntity = async (name, options = {}) => {
  const fetchImpl = options.fetchImpl ?? fetch;
  const term = str(name);
  if (!term) return { ok: false, results: [], error: 'An entity name is required' };

  const url = `${COMPTROLLER_BASE}?${new URLSearchParams({ name: term })}`;

  try {
    const res = await fetchImpl(url, { headers: { Accept: 'application/json' } });
    const body = await readBody(res);

    if (body && body.success === false) return { ok: false, results: [], error: failureFrom(body, res) };
    if (!res.ok) return { ok: false, results: [], error: failureFrom(body, res) };

    const rows = extractSearchRows(body);
    if (!rows) {
      console.warn('[COMPTROLLER] unrecognised search response shape:', JSON.stringify(body).slice(0, 400));
      return { ok: true, results: [] };
    }
    return { ok: true, results: rows.map(normalizeSearchRow) };
  } catch (err) {
    return { ok: false, results: [], error: err instanceof Error ? err.message : 'Comptroller lookup failed' };
  }
};

// Detail lookup for a single taxpayer id — the Franchise Tax Account Status
// record, including the Registered Agent Name, Registered Office Street
// Address, and officer roster that `searchEntity`'s candidate rows don't
// carry.
const getEntity = async (taxpayerId, options = {}) => {
  const fetchImpl = options.fetchImpl ?? fetch;
  const id = str(taxpayerId);
  if (!id) return { ok: false, entity: null, error: 'A taxpayer id is required' };

  const url = `${COMPTROLLER_BASE}/${encodeURIComponent(id)}`;

  try {
    const res = await fetchImpl(url, { headers: { Accept: 'application/json' } });
    const body = await readBody(res);

    if (body && body.success === false) return { ok: false, entity: null, error: failureFrom(body, res) };
    if (!res.ok) return { ok: false, entity: null, error: failureFrom(body, res) };

    const record = extractRecord(body);
    if (!record) {
      console.warn('[COMPTROLLER] unrecognised entity response shape:', JSON.stringify(body).slice(0, 400));
      return { ok: false, entity: null, error: 'Unrecognised Comptroller response shape' };
    }
    return { ok: true, entity: normalizeEntity(record) };
  } catch (err) {
    return { ok: false, entity: null, error: err instanceof Error ? err.message : 'Comptroller lookup failed' };
  }
};

module.exports = { searchEntity, getEntity, normalizeEntity, COMPTROLLER_BASE };
