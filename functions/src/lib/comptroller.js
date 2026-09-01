/**
 * Texas Comptroller franchise-tax lookup, used to resolve an entity owner
 * ("Baabco Properties II LLC") to its Registered Agent — a real person, at a
 * real street address — plus the entity's own mailing address as a fallback.
 *
 * The flow is two calls. `searchEntity` hits the search endpoint with a name
 * and returns a table of candidates (name, taxpayer number, mailing address).
 * Once a single taxpayer number is chosen, `getEntity` hits the detail
 * endpoint and returns the full Franchise Tax Account Status record,
 * including the Registered Agent Name and Registered Office Street Address
 * — confirmed present on the live site for real entities (e.g. Mihaila
 * Holdings Corp: Alex J Mihaila, 797 Crown Jewel, Boerne, TX 78006).
 *
 * The two routes below were confirmed to exist by probing without a key: AWS
 * API Gateway answers "Forbidden" for a real route and "Missing Authentication
 * Token" for one that does not exist. The search query parameter name and both
 * response shapes could NOT be confirmed that way, so all are handled
 * defensively and the raw body is logged when it does not match.
 */

const COMPTROLLER_BASE = 'https://api.comptroller.texas.gov/public-data/v1/public/franchise-tax';
const DEFAULT_PARAM = 'name';
const DEFAULT_HEADER = 'x-api-key';

const str = (value) => (value == null ? '' : String(value).trim());

const normalizeEntity = (raw) => {
  const row = raw && typeof raw === 'object' ? raw : {};
  const pick = (...keys) => {
    for (const key of keys) if (row[key] != null) return str(row[key]);
    return '';
  };
  return {
    taxpayerNumber: pick('taxpayerNumber', 'taxpayer_number', 'texasTaxpayerNumber', 'texas_taxpayer_number'),
    name: pick('taxpayerName', 'taxpayer_name'),
    address: pick('taxpayerAddress', 'taxpayer_address'),
    city: pick('taxpayerCity', 'taxpayer_city'),
    state: pick('taxpayerState', 'taxpayer_state'),
    zip: pick('taxpayerZip', 'taxpayer_zip'),
    fileNumber: pick(
      'fileNumber', 'secretary_of_state_sos_or_coa_file_number',
      'sosFileNumber', 'sos_file_number', 'texasSosFileNumber', 'texas_sos_file_number',
    ),
    status: pick('status', 'right_to_transact_business_code'),
    // Franchise Tax Account Status detail fields — the registered agent is
    // the single most valuable field this module returns: a named person at
    // a real address, not just an entity's mailing address.
    registeredAgentName: pick(
      'registeredAgentName', 'registered_agent_name',
      'agentName', 'agent_name',
      'raName', 'ra_name',
    ),
    registeredOfficeAddress: pick(
      'registeredOfficeAddress', 'registered_office_address',
      'registeredOfficeStreetAddress', 'registered_office_street_address',
      'agentAddress', 'agent_address',
      'raAddress', 'ra_address',
    ),
    stateOfFormation: pick('stateOfFormation', 'state_of_formation'),
    sosRegistrationStatus: pick('sosRegistrationStatus', 'sos_registration_status'),
    sosRegistrationDate: pick(
      'sosRegistrationDate', 'sos_registration_date',
      'effectiveSosRegistrationDate', 'effective_sos_registration_date',
    ),
    rightToTransact: pick(
      'rightToTransact', 'right_to_transact',
      'rightToTransactBusiness', 'right_to_transact_business',
      'rightToTransactBusinessInTexas', 'right_to_transact_business_in_texas',
    ),
  };
};

// The API's envelope is unverified, so accept the three plausible shapes and
// treat anything else as empty rather than throwing on a live lookup.
const extractRows = (body) => {
  if (Array.isArray(body)) return body;
  if (body && Array.isArray(body.data)) return body.data;
  if (body && Array.isArray(body.results)) return body.results;
  return null;
};

// The detail endpoint returns a single record rather than a collection. Its
// envelope is equally unverified, so this accepts a bare object, or one
// nested under a plausible wrapper key, and otherwise returns null so the
// caller can log the raw shape instead of guessing at it.
const extractRecord = (body) => {
  if (Array.isArray(body)) {
    return body[0] && typeof body[0] === 'object' && !Array.isArray(body[0]) ? body[0] : null;
  }
  if (!body || typeof body !== 'object') return null;
  if (Array.isArray(body.data)) {
    return body.data[0] && typeof body.data[0] === 'object' && !Array.isArray(body.data[0]) ? body.data[0] : null;
  }
  if (body.data && typeof body.data === 'object') return body.data;
  if (body.result && typeof body.result === 'object') return body.result;
  if (body.entity && typeof body.entity === 'object') return body.entity;
  return body;
};

const resolveOptions = (options) => ({
  apiKey: options.apiKey ?? process.env.COMPTROLLER_API_KEY ?? '',
  fetchImpl: options.fetchImpl ?? fetch,
  header: options.header ?? process.env.COMPTROLLER_API_KEY_HEADER ?? DEFAULT_HEADER,
});

const searchEntity = async (name, options = {}) => {
  const { apiKey, fetchImpl, header } = resolveOptions(options);
  const param = options.param ?? process.env.COMPTROLLER_SEARCH_PARAM ?? DEFAULT_PARAM;

  const term = str(name);
  if (!apiKey) return { ok: false, results: [], error: 'COMPTROLLER_API_KEY is not set' };
  if (!term) return { ok: false, results: [], error: 'An entity name is required' };

  const url = `${COMPTROLLER_BASE}/search?${new URLSearchParams({ [param]: term })}`;

  try {
    const res = await fetchImpl(url, { headers: { [header]: apiKey, Accept: 'application/json' } });
    if (!res.ok) {
      // Deliberately does not include the key or the header value.
      return { ok: false, results: [], error: `Comptroller lookup failed (${res.status})` };
    }
    const body = await res.json();
    const rows = extractRows(body);
    if (!rows) {
      console.warn('[COMPTROLLER] unrecognised search response shape:', JSON.stringify(body).slice(0, 400));
      return { ok: true, results: [] };
    }
    return { ok: true, results: rows.map(normalizeEntity) };
  } catch (err) {
    return { ok: false, results: [], error: err instanceof Error ? err.message : 'Comptroller lookup failed' };
  }
};

// Detail lookup for a single taxpayer number — the Franchise Tax Account
// Status record, including the Registered Agent Name and Registered Office
// Street Address that `searchEntity`'s candidate rows do not carry.
const getEntity = async (taxpayerNumber, options = {}) => {
  const { apiKey, fetchImpl, header } = resolveOptions(options);

  const id = str(taxpayerNumber);
  if (!apiKey) return { ok: false, entity: null, error: 'COMPTROLLER_API_KEY is not set' };
  if (!id) return { ok: false, entity: null, error: 'A taxpayer number is required' };

  const url = `${COMPTROLLER_BASE}/${encodeURIComponent(id)}`;

  try {
    const res = await fetchImpl(url, { headers: { [header]: apiKey, Accept: 'application/json' } });
    if (!res.ok) {
      // Deliberately does not include the key or the header value.
      return { ok: false, entity: null, error: `Comptroller lookup failed (${res.status})` };
    }
    const body = await res.json();
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
