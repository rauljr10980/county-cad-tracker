/**
 * Bexar County Public Search Scraper
 * Scrapes foreclosure records from https://bexar.tx.publicsearch.us
 * Uses Playwright to intercept WebSocket data (site loads via WS, not HTTP)
 */

const { chromium } = require('playwright');

/**
 * Scrape foreclosure records from Bexar County Public Search
 * @param {Object} options - Scraping options
 * @param {string} options.startDate - Start date (YYYYMMDD)
 * @param {string} options.endDate - End date (YYYYMMDD)
 * @param {number} options.limit - Max results (default 250)
 * @returns {Promise<Object>} Object with success flag and records array
 */
async function scrapeBexarForeclosures(options = {}) {
  const {
    startDate = null,
    endDate = null,
    limit = 250,
  } = options;

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

  const url = `https://bexar.tx.publicsearch.us/results?department=FC&limit=${limit}&recordedDateRange=${recordedStart},${recordedEnd}&searchType=advancedSearch`;
  console.log(`[BEXAR-SCRAPER] Fetching: ${url}`);

  let browser;
  try {
    console.log('[BEXAR-SCRAPER] Launching browser...');
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
    });

    const page = await browser.newPage();

    // Intercept WebSocket data - the site loads records via WebSocket
    let documentData = null;
    page.on('websocket', ws => {
      ws.on('framereceived', e => {
        const str = e.payload.toString();
        if (str.includes('FETCH_DOCUMENTS_FULFILLED')) {
          try { documentData = JSON.parse(str); } catch (_) {}
        }
      });
    });

    console.log('[BEXAR-SCRAPER] Navigating...');
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

    // Wait for WebSocket data (up to 30 seconds)
    console.log('[BEXAR-SCRAPER] Waiting for WebSocket data...');
    for (let i = 0; i < 30; i++) {
      if (documentData) break;
      await page.waitForTimeout(1000);
    }

    if (!documentData) {
      throw new Error('No data received from WebSocket after 30 seconds');
    }

    const docs = documentData.payload.data.byHash || {};
    console.log(`[BEXAR-SCRAPER] Got ${Object.keys(docs).length} documents from WebSocket`);

    // Log a sample record for debugging
    const sampleDoc = Object.values(docs)[0];
    if (sampleDoc) {
      console.log('[BEXAR-SCRAPER] Sample record keys:', Object.keys(sampleDoc));
      console.log('[BEXAR-SCRAPER] Sample propAddress:', JSON.stringify(sampleDoc.propAddress));
      console.log('[BEXAR-SCRAPER] Sample propertyAddress:', JSON.stringify(sampleDoc.propertyAddress));
      console.log('[BEXAR-SCRAPER] Sample legalDescription:', sampleDoc.legalDescription);
      console.log('[BEXAR-SCRAPER] Sample instrumentDate:', sampleDoc.instrumentDate);
      console.log('[BEXAR-SCRAPER] Sample recordedDate:', sampleDoc.recordedDate);
    }

    const records = Object.values(docs).map(doc => {
      const addr = doc.propAddress?.[0] || {};
      const fullAddress = doc.propertyAddress?.[0] || '';

      // Use structured address first, fall back to parsing the full address string
      let street = addr.address1 || '';
      let city = addr.city || '';
      let zip = addr.zip || '';

      if (!street && fullAddress) {
        // Parse full address like "1300 PATRICIA, SAN ANTONIO, TX 78213"
        const parsed = parseFullAddress(fullAddress);
        street = parsed.street;
        city = city || parsed.city;
        zip = zip || parsed.zip;
      }

      return {
        documentNumber: doc.instrumentNumber || doc.docNumber || String(doc.id),
        recordedDate: parseDate(doc.recordedDate),
        saleDate: parseDate(doc.instrumentDate) || parseDate(doc.saleDate),
        rawAddress: fullAddress,
        address: street,
        city: city,
        state: 'TX',
        zip: zip,
        docType: doc.docType || 'NOTICE OF FORECLOSURE',
        grantor: (doc.grantor || []).filter(g => g && g !== '.').join(', '),
        grantee: (doc.grantee || []).filter(g => g && g !== '.').join(', '),
      };
    });

    console.log(`[BEXAR-SCRAPER] Processed ${records.length} records`);
    return { success: true, records, count: records.length };

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
 * Parse a date string like "1/5/2026" or "01/05/2026" into ISO format
 */
function parseDate(dateStr) {
  if (!dateStr) return null;
  const parts = dateStr.split('/');
  if (parts.length === 3) {
    const [month, day, year] = parts;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }
  return dateStr;
}

/**
 * Parse a full address string like "1300 PATRICIA, SAN ANTONIO, TX 78213"
 */
function parseFullAddress(fullAddress) {
  const result = { street: '', city: '', zip: '' };
  if (!fullAddress) return result;

  // Try "STREET, CITY, STATE ZIP" format
  const parts = fullAddress.split(',').map(s => s.trim());
  if (parts.length >= 2) {
    result.street = parts[0];
    // Last part might be "TX 78213" or just "SAN ANTONIO"
    const lastPart = parts[parts.length - 1];
    const zipMatch = lastPart.match(/(\d{5})/);
    if (zipMatch) result.zip = zipMatch[1];
    const stateMatch = lastPart.match(/^([A-Z]{2})\s/);
    if (stateMatch && parts.length >= 3) {
      result.city = parts[parts.length - 2];
    } else if (parts.length === 2) {
      result.city = lastPart.replace(/\s*TX\s*\d{5}/, '').trim();
    }
  } else {
    result.street = fullAddress;
  }
  return result;
}

module.exports = { scrapeBexarForeclosures };
