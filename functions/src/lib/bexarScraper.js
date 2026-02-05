/**
 * Bexar County Public Search Scraper
 * Scrapes foreclosure records from https://bexar.tx.publicsearch.us
 * Uses fetch + cheerio (no browser needed)
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
    const records = [];

    // Find the results table - based on screenshots, it's the main table with foreclosure data
    // Each row is a <tr> with cells for each column
    // col-0: checkbox, col-1: doc type dropdown, col-2: dropdown, col-3: recorded date,
    // col-4: sale date, col-5: ?, col-6: doc number, col-7: remarks time, col-8: property address

    $('tbody tr').each((index, row) => {
      const $row = $(row);

      // Extract data from each column
      const recordedDate = $row.find('td.col-3').text().trim();
      const saleDate = $row.find('td.col-4').text().trim();
      const docNumber = $row.find('td.col-6').text().trim();
      const propertyAddress = $row.find('td.col-8').text().trim();
      const docType = $row.find('td.col-0').text().trim();

      // Skip if no doc number (header row or empty)
      if (!docNumber || docNumber.length < 5) {
        return;
      }

      // Parse the property address to extract street, city, state, zip
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

    console.log(`[BEXAR-SCRAPER] Parsed ${records.length} records`);
    return { success: true, records, count: records.length };

  } catch (error) {
    console.error('[BEXAR-SCRAPER] Error:', error.message);
    return { success: false, error: error.message, records: [] };
  }
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
