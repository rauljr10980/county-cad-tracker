/**
 * US Census Bureau Batch Geocoding
 * Uses the Census Geocoder API to convert addresses to coordinates.
 * Batch endpoint handles up to 10,000 addresses per request.
 * No API key required.
 */

const CENSUS_BATCH_URL = 'https://geocoding.geo.census.gov/geocoder/locations/addressbatch';

/**
 * Batch geocode addresses using the US Census Bureau API.
 * @param {Array<{id: string, street: string, city: string, state: string, zip: string}>} addresses
 * @returns {Promise<Map<string, {latitude: number, longitude: number, matchedAddress: string}>>}
 */
async function batchGeocodeCensus(addresses) {
  const results = new Map();

  if (!addresses || addresses.length === 0) {
    return results;
  }

  // Census batch API format: Unique ID, Street Address, City, State, ZIP
  const csvLines = addresses.map(a =>
    `"${a.id}","${(a.street || '').replace(/"/g, '')}","${(a.city || '').replace(/"/g, '')}","${(a.state || 'TX').replace(/"/g, '')}","${(a.zip || '').replace(/"/g, '')}"`
  );
  const csvContent = csvLines.join('\n');

  const form = new FormData();
  form.append('addressFile', new Blob([csvContent], { type: 'text/csv' }), 'addresses.csv');
  form.append('benchmark', 'Public_AR_Current');

  const response = await fetch(CENSUS_BATCH_URL, {
    method: 'POST',
    body: form,
  });

  if (!response.ok) {
    throw new Error(`Census API returned ${response.status}: ${response.statusText}`);
  }

  const responseText = await response.text();

  // Parse CSV response
  // Format: "ID","Input Address","Match","Match Type","Matched Address","Coordinates","TIGER Line ID","Side"
  // Coordinates are "longitude,latitude" (note: lon first!)
  const lines = responseText.split('\n').filter(l => l.trim());

  for (const line of lines) {
    const fields = parseCSVLine(line);
    if (fields.length < 6) continue;

    const id = fields[0].replace(/"/g, '').trim();
    const matchIndicator = fields[2].replace(/"/g, '').trim();

    if (matchIndicator === 'Match') {
      const coordStr = fields[5].replace(/"/g, '').trim();
      const [lonStr, latStr] = coordStr.split(',');
      const latitude = parseFloat(latStr);
      const longitude = parseFloat(lonStr);

      if (!isNaN(latitude) && !isNaN(longitude)) {
        results.set(id, {
          latitude,
          longitude,
          matchedAddress: fields[4].replace(/"/g, '').trim(),
        });
      }
    }
  }

  console.log(`[CENSUS GEOCODE] Processed ${addresses.length} addresses, matched ${results.size}`);
  return results;
}

/**
 * Parse a CSV line handling quoted fields.
 */
function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

/**
 * Nominatim fallback geocoder for addresses Census couldn't match.
 * Processes sequentially with 1-second delay between requests (Nominatim rate limit).
 * @param {Array<{id: string, street: string, city: string, state: string, zip: string}>} addresses
 * @returns {Promise<Map<string, {latitude: number, longitude: number, matchedAddress: string}>>}
 */
async function batchGeocodeNominatim(addresses) {
  const results = new Map();

  if (!addresses || addresses.length === 0) {
    return results;
  }

  for (let i = 0; i < addresses.length; i++) {
    const a = addresses[i];
    try {
      const searchQuery = [a.street, a.city, a.state || 'TX', a.zip].filter(Boolean).join(', ');
      const url = `https://nominatim.openstreetmap.org/search?` + new URLSearchParams({
        q: searchQuery,
        format: 'json',
        limit: '1',
        countrycodes: 'us',
      });

      const response = await fetch(url, {
        headers: { 'User-Agent': 'County-CAD-Tracker/1.0' },
      });

      if (response.ok) {
        const data = await response.json();
        if (data && data.length > 0) {
          const lat = parseFloat(data[0].lat);
          const lon = parseFloat(data[0].lon);
          if (!isNaN(lat) && !isNaN(lon)) {
            results.set(a.id, {
              latitude: lat,
              longitude: lon,
              matchedAddress: data[0].display_name || '',
            });
          }
        }
      }
    } catch (err) {
      // Skip this address on error
    }

    // Rate limit: 1 request per second (Nominatim policy)
    if (i < addresses.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  console.log(`[NOMINATIM GEOCODE] Processed ${addresses.length} addresses, matched ${results.size}`);
  return results;
}

/**
 * Geocode a single address via Google Maps HTML scraping.
 * Fetches the Google Maps search page and extracts @lat,lng from the response.
 * No API key required.
 */
async function geocodeViaGoogleMaps(street, city, state, zip) {
  const query = [street, city, state || 'TX', zip].filter(Boolean).join(', ');
  const url = `https://www.google.com/maps/search/${encodeURIComponent(query)}`;

  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml',
      'Accept-Language': 'en-US,en;q=0.9',
    },
    redirect: 'follow',
  });

  if (!response.ok) return null;

  // Check the final URL for @lat,lng pattern
  const finalUrl = response.url || '';
  const urlMatch = finalUrl.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (urlMatch) {
    const lat = parseFloat(urlMatch[1]);
    const lng = parseFloat(urlMatch[2]);
    if (!isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
      return { latitude: lat, longitude: lng };
    }
  }

  // Parse HTML body for coordinate patterns
  const html = await response.text();

  // Pattern: /@lat,lng, in any URL within the HTML
  const htmlMatch = html.match(/@(-?\d+\.\d{4,}),(-?\d+\.\d{4,})/);
  if (htmlMatch) {
    const lat = parseFloat(htmlMatch[1]);
    const lng = parseFloat(htmlMatch[2]);
    if (!isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
      return { latitude: lat, longitude: lng };
    }
  }

  // Pattern: [null,null,lat,lng] in embedded JSON data
  const jsonMatch = html.match(/\[null,null,(-?\d+\.\d{4,}),(-?\d+\.\d{4,})\]/);
  if (jsonMatch) {
    const lat = parseFloat(jsonMatch[1]);
    const lng = parseFloat(jsonMatch[2]);
    if (!isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
      return { latitude: lat, longitude: lng };
    }
  }

  return null;
}

/**
 * Batch geocode via Google Maps HTML scraping.
 * Processes sequentially with 500ms delay to avoid rate limiting.
 * @param {Array<{id: string, street: string, city: string, state: string, zip: string}>} addresses
 * @returns {Promise<Map<string, {latitude: number, longitude: number}>>}
 */
async function batchGeocodeGoogleMaps(addresses) {
  const results = new Map();

  if (!addresses || addresses.length === 0) {
    return results;
  }

  for (let i = 0; i < addresses.length; i++) {
    const a = addresses[i];
    try {
      const result = await geocodeViaGoogleMaps(a.street, a.city, a.state, a.zip);
      if (result) {
        results.set(a.id, result);
      }
    } catch (err) {
      // Skip on error
    }

    if (i < addresses.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  console.log(`[GOOGLE MAPS GEOCODE] Processed ${addresses.length} addresses, matched ${results.size}`);
  return results;
}

module.exports = { batchGeocodeCensus, batchGeocodeNominatim, batchGeocodeGoogleMaps };
