/**
 * Nominatim geocoding helpers.
 *
 * The pure pieces live here so they can be unit tested without touching the
 * network. The batch route owns rate limiting and persistence.
 */

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';

/**
 * Nominatim asks every caller to identify itself. A generic or missing
 * User-Agent is the documented way to get blocked.
 */
const USER_AGENT = process.env.GEOCODER_USER_AGENT
  || 'county-cad-tracker/1.0 (eviction landlord mapping; contact via repository owner)';

/** Their published limit is one request per second. */
const MIN_REQUEST_INTERVAL_MS = 1100;

/**
 * Builds the free-form query string for one address.
 *
 * Returns null when there is not enough to search on. A bare city/state pair
 * would geocode to the middle of San Antonio and put a pin on a landlord who
 * has no usable address, which is worse than showing nothing.
 */
function buildGeocodeQuery({ address, city, state, zip }) {
  const street = String(address || '').trim();
  if (!street) return null;

  const parts = [street, String(city || '').trim(), String(state || '').trim(), String(zip || '').trim()]
    .filter(Boolean);

  return parts.join(', ');
}

/**
 * Pulls coordinates out of a Nominatim response.
 *
 * Returns null for an empty result or for coordinates that do not parse, so
 * the caller records a clean 'failed' rather than storing NaN.
 */
function parseGeocodeResponse(payload) {
  if (!Array.isArray(payload) || !payload.length) return null;

  const latitude = Number.parseFloat(payload[0].lat);
  const longitude = Number.parseFloat(payload[0].lon);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

  // Anything outside these bounds is not a Texas address and almost certainly
  // a mis-parse; storing it would drag the map's auto-fit across the planet.
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;

  return { latitude, longitude };
}

/** Geocodes one address. Resolves to coordinates, or null when unresolvable. */
async function geocodeAddress(addressParts) {
  const query = buildGeocodeQuery(addressParts);
  if (!query) return null;

  const url = `${NOMINATIM_URL}?format=json&limit=1&countrycodes=us&q=${encodeURIComponent(query)}`;
  const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'en' } });
  if (!response.ok) throw new Error(`Geocoder responded ${response.status}`);

  return parseGeocodeResponse(await response.json());
}

module.exports = {
  buildGeocodeQuery,
  parseGeocodeResponse,
  geocodeAddress,
  MIN_REQUEST_INTERVAL_MS,
};
