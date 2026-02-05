/**
 * Bexar County Public Search Scraper
 * Scrapes foreclosure records from https://bexar.tx.publicsearch.us
 * Uses Puppeteer to render JavaScript and extract table data
 */

const puppeteer = require('puppeteer');

const BROWSER_ARGS = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-dev-shm-usage',
  '--disable-gpu',
  '--disable-extensions',
  '--single-process',
];

// Use system Chromium in Docker, fallback to Puppeteer's bundled Chrome locally
function getChromiumPath() {
  const fs = require('fs');
  const systemPaths = [
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/google-chrome',
  ];
  for (const p of systemPaths) {
    if (fs.existsSync(p)) {
      console.log(`[BEXAR-SCRAPER] Using system browser at: ${p}`);
      return p;
    }
  }
  console.log('[BEXAR-SCRAPER] No system browser found, using Puppeteer default');
  return process.env.PUPPETEER_EXECUTABLE_PATH || undefined;
}

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

/**
 * Scrape foreclosure records from Bexar County Public Search
 * @param {Object} options - Scraping options
 * @param {string} options.startDate - Start date for recorded date range (YYYYMMDD)
 * @param {string} options.endDate - End date for recorded date range (YYYYMMDD)
 * @param {number} options.limit - Max results per page (default 250)
 * @returns {Promise<Object>} Object with success flag and records array
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

  const baseUrl = 'https://bexar.tx.publicsearch.us/results';
  const params = new URLSearchParams({
    department: 'FC', // Foreclosures
    instrumentDateRange: '20000404,20260707',
    limit: String(limit),
    recordedDateRange: `${recordedStart},${recordedEnd}`,
    searchType: 'advancedSearch',
  });

  const url = `${baseUrl}?${params.toString()}`;
  console.log(`[BEXAR-SCRAPER] Fetching: ${url}`);

  let browser;
  try {
    console.log('[BEXAR-SCRAPER] Launching browser...');
    browser = await puppeteer.launch({
      headless: 'new',
      args: BROWSER_ARGS,
      executablePath: getChromiumPath(),
    });

    const page = await browser.newPage();
    await page.setUserAgent(USER_AGENT);
    await page.setViewport({ width: 1280, height: 800 });

    console.log('[BEXAR-SCRAPER] Navigating to page...');
    await page.goto(url, {
      waitUntil: 'networkidle2',
      timeout: 30000,
    });

    // Wait for the table to load (the a11y-table with results)
    console.log('[BEXAR-SCRAPER] Waiting for table to load...');
    await page.waitForSelector('tbody tr', { timeout: 15000 }).catch(() => {
      console.log('[BEXAR-SCRAPER] No table rows found after waiting');
    });

    // Give a bit more time for all rows to render
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Extract data from the table
    // Based on user's screenshots:
    // td.col-3 = recorded date
    // td.col-4 = sale date (may have span inside)
    // td.col-6 = doc number (has span inside)
    // td.col-8 = property address (has span inside)
    console.log('[BEXAR-SCRAPER] Extracting records from table...');
    const records = await page.evaluate(() => {
      const results = [];
      const rows = document.querySelectorAll('tbody tr');

      rows.forEach((row) => {
        // Get text content from each column, handling nested spans
        const getColText = (colClass) => {
          const cell = row.querySelector(`td.${colClass}`);
          if (!cell) return '';
          // Check for span first
          const span = cell.querySelector('span');
          return (span ? span.textContent : cell.textContent)?.trim() || '';
        };

        const recordedDate = getColText('col-3');
        const saleDate = getColText('col-4') || getColText('col-5'); // col-5 also has sale date sometimes
        const docNumber = getColText('col-6');
        const propertyAddress = getColText('col-8');

        // Skip if no doc number (header row or empty)
        if (!docNumber || docNumber.length < 5) {
          return;
        }

        results.push({
          documentNumber: docNumber,
          recordedDate,
          saleDate,
          rawAddress: propertyAddress,
        });
      });

      return results;
    });

    console.log(`[BEXAR-SCRAPER] Found ${records.length} rows in table`);

    // Process records - parse dates and addresses
    const processedRecords = records.map(record => {
      const addressParts = parseAddress(record.rawAddress);
      return {
        documentNumber: record.documentNumber,
        recordedDate: parseDate(record.recordedDate),
        saleDate: parseDate(record.saleDate),
        rawAddress: record.rawAddress,
        address: addressParts.street,
        city: addressParts.city,
        state: addressParts.state,
        zip: addressParts.zip,
        docType: 'NOTICE OF FORECLOSURE',
      };
    });

    console.log(`[BEXAR-SCRAPER] Processed ${processedRecords.length} records`);
    return { success: true, records: processedRecords, count: processedRecords.length };

  } catch (error) {
    console.error('[BEXAR-SCRAPER] Error:', error.message);
    return { success: false, error: error.message, records: [] };
  } finally {
    if (browser) {
      await browser.close();
    }
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
