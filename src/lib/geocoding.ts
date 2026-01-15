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
 * Batch geocode multiple addresses with rate limiting
 * Nominatim requires 1 second between requests
 */
export async function batchGeocodeAddresses(
  addresses: Array<{
    id: string;
    address: string;
    city?: string;
    state?: string;
    zip?: string;
  }>,
  onProgress?: (completed: number, total: number, current: string) => void
): Promise<Map<string, GeocodeResult>> {
  const results = new Map<string, GeocodeResult>();

  for (let i = 0; i < addresses.length; i++) {
    const item = addresses[i];

    if (onProgress) {
      onProgress(i, addresses.length, item.address);
    }

    const result = await geocodeAddress(
      item.address,
      item.city,
      item.state || 'TX', // Default to Texas
      item.zip
    );

    if ('latitude' in result) {
      results.set(item.id, result);
    }

    // Rate limiting: wait 1 second between requests (Nominatim requirement)
    if (i < addresses.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  if (onProgress) {
    onProgress(addresses.length, addresses.length, 'Complete');
  }

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
