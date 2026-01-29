/**
 * Geocoding utilities for converting addresses to coordinates
 */

export interface GeocodeResult {
  latitude: number;
  longitude: number;
  displayName: string;
  confidence: number; // 0-1 score
}

export interface GeocodeError {
  error: string;
  message: string;
}

/**
 * Geocode an address using Nominatim (OpenStreetMap)
 * Free service with usage limits (1 request/second)
 */
export async function geocodeAddress(
  address: string,
  city?: string,
  state?: string,
  zip?: string
): Promise<GeocodeResult | GeocodeError> {
  try {
    // Build search query
    const parts = [address];
    if (city) parts.push(city);
    if (state) parts.push(state);
    if (zip) parts.push(zip);

    const searchQuery = parts.join(', ');

    // Nominatim API (free, no API key required)
    const url = `https://nominatim.openstreetmap.org/search?` + new URLSearchParams({
      q: searchQuery,
      format: 'json',
      limit: '1',
      addressdetails: '1',
    });

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'County-CAD-Tracker/1.0', // Required by Nominatim
      },
    });

    if (!response.ok) {
      return {
        error: 'API_ERROR',
        message: `Geocoding service returned ${response.status}`,
      };
    }

    const data = await response.json();

    if (!data || data.length === 0) {
      return {
        error: 'NOT_FOUND',
        message: 'Address not found',
      };
    }

    const result = data[0];

    return {
      latitude: parseFloat(result.lat),
      longitude: parseFloat(result.lon),
      displayName: result.display_name,
      confidence: parseFloat(result.importance || '0.5'), // Nominatim importance as confidence
    };
  } catch (error) {
    return {
      error: 'NETWORK_ERROR',
      message: error instanceof Error ? error.message : 'Failed to geocode address',
    };
  }
}

/**
 * Batch geocode multiple addresses with parallel processing and rate limiting
 * Uses batches of 5 concurrent requests with 250ms delays for better performance
 */
export async function batchGeocodeAddresses(
  addresses: Array<{
    id: string;
    address: string;
    city?: string;
    state?: string;
    zip?: string;
  }>,
  onProgress?: (completed: number, total: number, current: string) => void,
  shouldCancel?: () => boolean
): Promise<Map<string, GeocodeResult>> {
  const results = new Map<string, GeocodeResult>();
  const BATCH_SIZE = 5; // Process 5 addresses at a time
  const DELAY_MS = 250; // 250ms between batches (allows ~4 batches/second = ~20 addresses/second)

  let completed = 0;

  // Process addresses in batches
  for (let i = 0; i < addresses.length; i += BATCH_SIZE) {
    // Check if cancelled before processing next batch
    if (shouldCancel && shouldCancel()) {
      break;
    }

    const batch = addresses.slice(i, i + BATCH_SIZE);

    // Process batch in parallel
    const batchPromises = batch.map(async (item) => {
      const result = await geocodeAddress(
        item.address,
        item.city,
        item.state || 'TX',
        item.zip
      );

      if ('latitude' in result) {
        results.set(item.id, result);
      }

      completed++;
      if (onProgress) {
        onProgress(completed, addresses.length, item.address);
      }

      return result;
    });

    // Wait for all geocoding in this batch to complete
    await Promise.all(batchPromises);

    // Rate limiting: wait between batches (except for last batch)
    if (i + BATCH_SIZE < addresses.length) {
      await new Promise(resolve => setTimeout(resolve, DELAY_MS));
    }
  }

  if (onProgress) {
    onProgress(addresses.length, addresses.length, 'Complete');
  }

  return results;
}

/**
 * Geocode an address using US Census Bureau API (single address)
 * Free service, no API key required.
 */
export async function geocodeAddressCensus(
  address: string,
  city?: string,
  state?: string,
  zip?: string
): Promise<GeocodeResult | GeocodeError> {
  try {
    const fullAddress = [address, city, state, zip].filter(Boolean).join(', ');
    const url = `https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?` + new URLSearchParams({
      address: fullAddress,
      benchmark: 'Public_AR_Current',
      format: 'json',
    });

    const response = await fetch(url);
    if (!response.ok) {
      return { error: 'API_ERROR', message: `Census API returned ${response.status}` };
    }

    const data = await response.json();
    const matches = data?.result?.addressMatches;
    if (!matches || matches.length === 0) {
      return { error: 'NOT_FOUND', message: 'Address not found' };
    }

    const match = matches[0];
    return {
      latitude: match.coordinates.y,
      longitude: match.coordinates.x,
      displayName: match.matchedAddress,
      confidence: 1.0,
    };
  } catch (error) {
    return {
      error: 'NETWORK_ERROR',
      message: error instanceof Error ? error.message : 'Failed to geocode address',
    };
  }
}

/**
 * Batch geocode using US Census API (individual requests, 10 concurrent)
 * Census API has no strict rate limit, so we can process faster than Nominatim.
 */
export async function batchGeocodeAddressesCensus(
  addresses: Array<{
    id: string;
    address: string;
    city?: string;
    state?: string;
    zip?: string;
  }>,
  onProgress?: (completed: number, total: number, current: string) => void,
  shouldCancel?: () => boolean
): Promise<Map<string, GeocodeResult>> {
  const results = new Map<string, GeocodeResult>();
  const BATCH_SIZE = 10;

  let completed = 0;

  for (let i = 0; i < addresses.length; i += BATCH_SIZE) {
    if (shouldCancel && shouldCancel()) break;

    const batch = addresses.slice(i, i + BATCH_SIZE);

    const batchPromises = batch.map(async (item) => {
      const result = await geocodeAddressCensus(
        item.address,
        item.city,
        item.state || 'TX',
        item.zip
      );

      if ('latitude' in result) {
        results.set(item.id, result);
      }

      completed++;
      if (onProgress) {
        onProgress(completed, addresses.length, item.address);
      }
    });

    await Promise.all(batchPromises);
  }

  if (onProgress) {
    onProgress(addresses.length, addresses.length, 'Complete');
  }

  return results;
}

/**
 * Batch geocode with fallback: Census API first, then Nominatim for failures.
 * This ensures near-100% success rate since Nominatim is more forgiving
 * with abbreviated street names and non-standard addresses.
 */
export async function batchGeocodeWithFallback(
  addresses: Array<{
    id: string;
    address: string;
    city?: string;
    state?: string;
    zip?: string;
  }>,
  onProgress?: (completed: number, total: number, current: string) => void,
  shouldCancel?: () => boolean
): Promise<Map<string, GeocodeResult>> {
  const results = new Map<string, GeocodeResult>();
  const total = addresses.length;
  let completed = 0;

  // Phase 1: Census API (fast, 10 concurrent, no rate limit)
  const CENSUS_BATCH = 10;
  const censusFailures: typeof addresses = [];

  for (let i = 0; i < addresses.length; i += CENSUS_BATCH) {
    if (shouldCancel?.()) break;
    const batch = addresses.slice(i, i + CENSUS_BATCH);

    const batchPromises = batch.map(async (item) => {
      const result = await geocodeAddressCensus(
        item.address, item.city, item.state || 'TX', item.zip
      );
      if ('latitude' in result) {
        results.set(item.id, result);
      } else {
        censusFailures.push(item);
      }
      completed++;
      onProgress?.(completed, total, `Census: ${item.address}`);
    });
    await Promise.all(batchPromises);
  }

  // Phase 2: Nominatim fallback for Census failures (rate-limited, 2 concurrent + 500ms delay)
  if (censusFailures.length > 0 && !shouldCancel?.()) {
    const NOM_BATCH = 2;
    const NOM_DELAY = 500;

    for (let i = 0; i < censusFailures.length; i += NOM_BATCH) {
      if (shouldCancel?.()) break;
      const batch = censusFailures.slice(i, i + NOM_BATCH);

      const batchPromises = batch.map(async (item) => {
        const result = await geocodeAddress(
          item.address, item.city, item.state || 'TX', item.zip
        );
        if ('latitude' in result) {
          results.set(item.id, result);
        }
        onProgress?.(completed, total, `Nominatim: ${item.address}`);
      });
      await Promise.all(batchPromises);

      if (i + NOM_BATCH < censusFailures.length) {
        await new Promise(resolve => setTimeout(resolve, NOM_DELAY));
      }
    }
  }

  onProgress?.(total, total, 'Complete');
  return results;
}

/**
 * Reverse geocode: convert coordinates to address
 */
export async function reverseGeocode(
  latitude: number,
  longitude: number
): Promise<{ address: string; city: string; state: string; zip: string } | GeocodeError> {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?` + new URLSearchParams({
      lat: latitude.toString(),
      lon: longitude.toString(),
      format: 'json',
      addressdetails: '1',
    });

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'County-CAD-Tracker/1.0',
      },
    });

    if (!response.ok) {
      return {
        error: 'API_ERROR',
        message: `Reverse geocoding service returned ${response.status}`,
      };
    }

    const data = await response.json();

    if (!data || !data.address) {
      return {
        error: 'NOT_FOUND',
        message: 'Location not found',
      };
    }

    const addr = data.address;

    return {
      address: `${addr.house_number || ''} ${addr.road || ''}`.trim() || data.display_name,
      city: addr.city || addr.town || addr.village || '',
      state: addr.state || '',
      zip: addr.postcode || '',
    };
  } catch (error) {
    return {
      error: 'NETWORK_ERROR',
      message: error instanceof Error ? error.message : 'Failed to reverse geocode',
    };
  }
}
