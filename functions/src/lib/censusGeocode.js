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

module.exports = { batchGeocodeCensus, batchGeocodeNominatim };
