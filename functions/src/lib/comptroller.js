/**
 * Texas Comptroller franchise-tax lookup, used to resolve an entity owner
 * ("Baabco Properties II LLC") to a mailing address.
 *
 * It does NOT return officers or a registered agent — no such field exists on
 * this API or on the open data portal. An entity resolves to an address, which
 * for a small landlord LLC is usually the owner's home, CPA, or attorney, and
 * is then fed to the address-based people search. Two hops by nature.
 *
 * The two routes below were confirmed to exist by probing without a key: AWS
 * API Gateway answers "Forbidden" for a real route and "Missing Authentication
 * Token" for one that does not exist. The search query parameter name and the
 * response shape could NOT be confirmed that way, so both are handled
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
    taxpayerNumber: pick('taxpayerNumber', 'taxpayer_number'),
    name: pick('taxpayerName', 'taxpayer_name'),
    address: pick('taxpayerAddress', 'taxpayer_address'),
    city: pick('taxpayerCity', 'taxpayer_city'),
    state: pick('taxpayerState', 'taxpayer_state'),
    zip: pick('taxpayerZip', 'taxpayer_zip'),
    fileNumber: pick('fileNumber', 'secretary_of_state_sos_or_coa_file_number'),
    status: pick('status', 'right_to_transact_business_code'),
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

const searchEntity = async (name, options = {}) => {
  const {
    apiKey = process.env.COMPTROLLER_API_KEY || '',
    fetchImpl = fetch,
    param = process.env.COMPTROLLER_SEARCH_PARAM || DEFAULT_PARAM,
    header = process.env.COMPTROLLER_API_KEY_HEADER || DEFAULT_HEADER,
  } = options;

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
      console.warn('[COMPTROLLER] unrecognised response shape:', JSON.stringify(body).slice(0, 400));
      return { ok: true, results: [] };
    }
    return { ok: true, results: rows.map(normalizeEntity) };
  } catch (err) {
    return { ok: false, results: [], error: err instanceof Error ? err.message : 'Comptroller lookup failed' };
  }
};

module.exports = { searchEntity, normalizeEntity, COMPTROLLER_BASE };
