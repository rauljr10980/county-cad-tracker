/**
 * Bexar County Public Search Scraper
 * Scrapes foreclosure records from https://bexar.tx.publicsearch.us
 * Uses fetch + cheerio to extract embedded JSON data
 */

const cheerio = require('cheerio');

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

/**
 * Scrape foreclosure records from Bexar County Public Search
 * @param {Object} options - Scraping options
 * @param {string} options.startDate - Start date for recorded date range (YYYYMMDD)
 * @param {string} options.endDate - End date for recorded date range (YYYYMMDD)
 * @param {number} options.limit - Max results per page (default 250)
 * @returns {Promise<Array>} Array of foreclosure records
 */
async function scrapeBexarForeclosures(options = {}) {
  const {
    startDate = null,
    endDate = null,
    limit = 250,
  } = options;

  // Build the URL with date range
  // Default: last 30 days if no dates provided
  const today = new Date();
  const thirtyDaysAgo = new Date(today);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const formatDate = (d) => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}${month}${day}`;
  };

  const recordedStart = startDate || formatDate(thirtyDaysAgo);
  const recordedEnd = endDate || formatDate(today);

  // The URL structure from the screenshots
  const baseUrl = 'https://bexar.tx.publicsearch.us/results';
  const params = new URLSearchParams({
    department: 'FC', // Foreclosures
    instrumentDateRange: '20000404,20260707', // Wide range for instrument dates
    limit: String(limit),
    recordedDateRange: `${recordedStart},${recordedEnd}`,
    searchType: 'advancedSearch',
  });

  const url = `${baseUrl}?${params.toString()}`;
  console.log(`[BEXAR-SCRAPER] Fetching: ${url}`);

  try {
    // First, try to get JSON directly (some APIs respond with JSON if requested)
    console.log(`[BEXAR-SCRAPER] Trying JSON API request...`);
    const jsonResponse = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'en-US,en;q=0.5',
        'X-Requested-With': 'XMLHttpRequest',
      },
    });

    if (jsonResponse.ok) {
      const contentType = jsonResponse.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const jsonData = await jsonResponse.json();
        console.log(`[BEXAR-SCRAPER] Got JSON response!`);
        const records = extractRecordsFromData(jsonData);
        if (records.length > 0) {
          console.log(`[BEXAR-SCRAPER] Extracted ${records.length} records from JSON`);
          return { success: true, records, count: records.length };
        }
      }
    }

    // Fallback to HTML parsing
    console.log(`[BEXAR-SCRAPER] Fetching HTML page...`);
    const response = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const html = await response.text();
    console.log(`[BEXAR-SCRAPER] Received ${html.length} bytes`);

    // Parse the HTML
    const $ = cheerio.load(html);
    let records = [];

    // Method 1: Look for embedded JSON data in script tags
    // React apps often embed initial state as window.__data, __PRELOADED_STATE__, etc.
    $('script').each((i, script) => {
      const scriptContent = $(script).html() || '';

      // Look for window.__data or similar patterns
      const patterns = [
        /window\.__data\s*=\s*(\{[\s\S]*?\});/,
        /window\.__PRELOADED_STATE__\s*=\s*(\{[\s\S]*?\});/,
        /window\.___INITIAL_STATE___\s*=\s*(\{[\s\S]*?\});/,
        /__NEXT_DATA__.*?(\{[\s\S]*?\})<\/script>/,
      ];

      for (const pattern of patterns) {
        const match = scriptContent.match(pattern);
        if (match) {
          try {
            const data = JSON.parse(match[1]);
            console.log(`[BEXAR-SCRAPER] Found embedded JSON data`);

            // Try to find records in the data structure
            const foundRecords = extractRecordsFromData(data);
            if (foundRecords.length > 0) {
              records = foundRecords;
              return false; // break cheerio loop
            }
          } catch (e) {
            console.log(`[BEXAR-SCRAPER] Failed to parse embedded JSON: ${e.message}`);
          }
        }
      }

      // Also look for JSON arrays that might contain records
      const jsonArrayMatch = scriptContent.match(/\[\s*\{[^[\]]*"documentNumber"[^[\]]*\}[\s\S]*?\]/);
      if (jsonArrayMatch) {
        try {
          const arr = JSON.parse(jsonArrayMatch[0]);
          if (Array.isArray(arr) && arr.length > 0) {
            console.log(`[BEXAR-SCRAPER] Found JSON array with ${arr.length} items`);
            records = arr.map(item => normalizeRecord(item));
            return false;
          }
        } catch (e) {
          // Not valid JSON
        }
      }
    });

    // Method 2: If no embedded data found, try DOM parsing (fallback)
    if (records.length === 0) {
      console.log(`[BEXAR-SCRAPER] No embedded JSON found, trying DOM parsing...`);

      $('tbody tr').each((index, row) => {
        const $row = $(row);
        const recordedDate = $row.find('td.col-3').text().trim();
        const saleDate = $row.find('td.col-4').text().trim();
        const docNumber = $row.find('td.col-6').text().trim();
        const propertyAddress = $row.find('td.col-8').text().trim();
        const docType = $row.find('td.col-0').text().trim();

        if (!docNumber || docNumber.length < 5) {
          return;
        }

        const addressParts = parseAddress(propertyAddress);
        records.push({
          documentNumber: docNumber,
          recordedDate: parseDate(recordedDate),
          saleDate: parseDate(saleDate),
          rawAddress: propertyAddress,
          address: addressParts.street,
          city: addressParts.city,
          state: addressParts.state,
          zip: addressParts.zip,
          docType,
        });
      });
    }

    // Method 3: Log what we found for debugging
    if (records.length === 0) {
      // Log some diagnostic info
      const scriptCount = $('script').length;
      const tbodyRows = $('tbody tr').length;
      console.log(`[BEXAR-SCRAPER] Debug: ${scriptCount} script tags, ${tbodyRows} tbody rows`);

      // Log first 500 chars of each script to help debug
      $('script').each((i, script) => {
        const content = $(script).html() || '';
        if (content.length > 0 && !content.includes('gtag') && !content.includes('analytics')) {
          console.log(`[BEXAR-SCRAPER] Script ${i} (${content.length} chars): ${content.substring(0, 300)}...`);
        }
      });

      // Check if page requires authentication or has error
      const pageText = $.text().toLowerCase();
      if (pageText.includes('sign in') || pageText.includes('login')) {
        console.log(`[BEXAR-SCRAPER] Page may require authentication`);
      }
      if (pageText.includes('error') || pageText.includes('no results')) {
        console.log(`[BEXAR-SCRAPER] Page may have error or no results`);
      }

      // Log the title and any obvious page state
      const title = $('title').text();
      console.log(`[BEXAR-SCRAPER] Page title: ${title}`);
    }

    console.log(`[BEXAR-SCRAPER] Parsed ${records.length} records`);
    return { success: true, records, count: records.length };

  } catch (error) {
    console.error('[BEXAR-SCRAPER] Error:', error.message);
    return { success: false, error: error.message, records: [] };
  }
}

/**
 * Try to extract records from embedded JSON data structure
 */
function extractRecordsFromData(data) {
  const records = [];

  // Try common data structure patterns
  const possibleArrays = [
    data.results,
    data.records,
    data.documents,
    data.searchResults,
    data.data?.results,
    data.data?.records,
    data.state?.results,
    data.initialState?.results,
  ];

  for (const arr of possibleArrays) {
    if (Array.isArray(arr) && arr.length > 0) {
      for (const item of arr) {
        const record = normalizeRecord(item);
        if (record && record.documentNumber) {
          records.push(record);
        }
      }
      if (records.length > 0) break;
    }
  }

  // Recursive search if nothing found yet
  if (records.length === 0) {
    const found = findRecordsRecursive(data);
    records.push(...found);
  }

  return records;
}

/**
 * Recursively search for record arrays in nested data
 */
function findRecordsRecursive(obj, depth = 0) {
  if (depth > 5 || !obj || typeof obj !== 'object') return [];

  // Check if this is an array of records
  if (Array.isArray(obj)) {
    const firstItem = obj[0];
    if (firstItem && (firstItem.documentNumber || firstItem.docNumber || firstItem.recordedDate)) {
      return obj.map(item => normalizeRecord(item)).filter(r => r && r.documentNumber);
    }
  }

  // Search nested objects
  const results = [];
  for (const key of Object.keys(obj)) {
    const found = findRecordsRecursive(obj[key], depth + 1);
    if (found.length > 0) {
      results.push(...found);
      break;
    }
  }
  return results;
}

/**
 * Normalize a record object from various possible formats
 */
function normalizeRecord(item) {
  if (!item) return null;

  const docNumber = item.documentNumber || item.docNumber || item.doc_number || item.instrumentNumber || '';
  const recordedDate = item.recordedDate || item.recorded_date || item.filedDate || '';
  const saleDate = item.saleDate || item.sale_date || '';
  const rawAddress = item.propertyAddress || item.property_address || item.address || item.rawAddress || '';

  const addressParts = parseAddress(rawAddress);

  return {
    documentNumber: String(docNumber),
    recordedDate: parseDate(recordedDate),
    saleDate: parseDate(saleDate),
    rawAddress,
    address: addressParts.street,
    city: addressParts.city,
    state: addressParts.state,
    zip: addressParts.zip,
    docType: item.docType || item.documentType || item.type || 'NOTICE OF FORECLOSURE',
  };
}

/**
 * Parse a date string like "2/3/2026" into ISO format
 */
function parseDate(dateStr) {
  if (!dateStr) return null;

  // Handle MM/DD/YYYY format
  const parts = dateStr.split('/');
  if (parts.length === 3) {
    const [month, day, year] = parts;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  return dateStr;
}

/**
 * Parse an address string like "6122 VALLEY TREE, SAN ANTONIO, TEXAS 78250"
 */
function parseAddress(rawAddress) {
  if (!rawAddress) {
    return { street: '', city: '', state: '', zip: '' };
  }

  // Common patterns:
  // "6122 VALLEY TREE, SAN ANTONIO, TEXAS 78250"
  // "711 W NORWOOD CT, SAN ANTONIO, TX 78212"

  const parts = rawAddress.split(',').map(p => p.trim());

  if (parts.length >= 2) {
    const street = parts[0];
    const city = parts[1];

    // Last part might be "TEXAS 78250" or "TX 78212"
    let state = 'TX';
    let zip = '';

    if (parts.length >= 3) {
      const lastPart = parts[parts.length - 1];
      // Extract zip code (5 digits)
      const zipMatch = lastPart.match(/\b(\d{5})(-\d{4})?\b/);
      if (zipMatch) {
        zip = zipMatch[1];
      }
      // Extract state
      const stateMatch = lastPart.match(/\b(TX|TEXAS)\b/i);
      if (stateMatch) {
        state = 'TX';
      }
    }

    return { street, city, state, zip };
  }

  // Fallback: just use the whole thing as street
  return { street: rawAddress, city: 'SAN ANTONIO', state: 'TX', zip: '' };
}

module.exports = { scrapeBexarForeclosures };
