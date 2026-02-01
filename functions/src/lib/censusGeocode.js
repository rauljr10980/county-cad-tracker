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
 * Geocode a single address via ArcGIS World Geocoding Service.
 * Free, no API key required. Uses commercial data (TomTom/HERE)
 * which covers new subdivisions much better than Census/OSM.
 */
async function geocodeViaArcGIS(street, city, state, zip) {
  const singleLine = [street, city, state || 'TX', zip].filter(Boolean).join(', ');
  const url = `https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/findAddressCandidates?` + new URLSearchParams({
    SingleLine: singleLine,
    f: 'json',
    maxLocations: '1',
    outFields: 'Match_addr,Addr_type',
  });

  const response = await fetch(url, {
    headers: { 'User-Agent': 'County-CAD-Tracker/1.0' },
  });

  if (!response.ok) return null;

  const data = await response.json();
  if (!data.candidates || data.candidates.length === 0) return null;

  const best = data.candidates[0];
  // Only accept point-level matches (not city/zip level)
  const goodTypes = ['PointAddress', 'StreetAddress', 'StreetName', 'Subaddress'];
  if (best.attributes && best.attributes.Addr_type && !goodTypes.includes(best.attributes.Addr_type)) {
    return null;
  }

  const lat = best.location?.y;
  const lng = best.location?.x;
  if (lat != null && lng != null && !isNaN(lat) && !isNaN(lng)) {
    return {
      latitude: lat,
      longitude: lng,
      matchedAddress: best.attributes?.Match_addr || best.address || '',
    };
  }
  return null;
}

/**
 * Batch geocode via ArcGIS. Processes 5 concurrently (ArcGIS allows high throughput).
 * @param {Array<{id: string, street: string, city: string, state: string, zip: string}>} addresses
 * @returns {Promise<Map<string, {latitude: number, longitude: number, matchedAddress: string}>>}
 */
async function batchGeocodeArcGIS(addresses) {
  const results = new Map();

  if (!addresses || addresses.length === 0) {
    return results;
  }

  const BATCH_SIZE = 5;
  for (let i = 0; i < addresses.length; i += BATCH_SIZE) {
    const batch = addresses.slice(i, i + BATCH_SIZE);
    const promises = batch.map(async (a) => {
      try {
        const result = await geocodeViaArcGIS(a.street, a.city, a.state, a.zip);
        if (result) {
          results.set(a.id, result);
        }
      } catch (err) {
        // Skip on error
      }
    });
    await Promise.all(promises);

    // Small delay between batches
    if (i + BATCH_SIZE < addresses.length) {
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }

  console.log(`[ARCGIS GEOCODE] Processed ${addresses.length} addresses, matched ${results.size}`);
  return results;
}

module.exports = { batchGeocodeCensus, batchGeocodeNominatim, batchGeocodeArcGIS };
