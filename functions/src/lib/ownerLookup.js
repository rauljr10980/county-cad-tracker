/**
 * Owner Lookup Pipeline
 * Phase 1: Bexar County Tax Assessor (bexar.acttax.com) → owner name + mailing address
 * Phase 2: TruePeopleSearch → phone numbers + emails
 */

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const { fuzzyNameMatch, NAME_MATCH_THRESHOLD } = require('./nameMatch');

puppeteer.use(StealthPlugin());

const BROWSER_ARGS = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-dev-shm-usage',
  '--disable-gpu',
  '--disable-extensions',
  '--single-process',
];

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================================================
// PHASE 1: Bexar County Tax Assessor Lookup
// ============================================================================

async function lookupBexarTaxAssessor(address, city, zip) {
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: 'new',
      args: BROWSER_ARGS,
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    });
    const page = await browser.newPage();
    await page.setUserAgent(USER_AGENT);
    await page.setViewport({ width: 1280, height: 800 });

    console.log(`[OWNER-LOOKUP] Tax assessor: searching for "${address}"`);

    // Navigate to the search page
    await page.goto('https://bexar.acttax.com/act_webdev/bexar/index.jsp', {
      waitUntil: 'networkidle2',
      timeout: 15000,
    });

    // Select "Property Address" from the dropdown (value="3")
    await page.select('select#searchby', '3');
    await delay(300);

    // Type the street address in the criteria input
    const searchAddress = address.toUpperCase().trim();
    await page.type('input[name="criteria"]', searchAddress);
    await delay(300);

    // Click the Search button to submit
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }),
      page.click('input[type="submit"][value="Search"]'),
    ]);

    // Check if we landed on a results list (showlist.jsp)
    const currentUrl = page.url();
    console.log(`[OWNER-LOOKUP] Tax assessor result URL: ${currentUrl}`);

    // Parse the results table for owner info
    const ownerData = await page.evaluate((targetAddress) => {
      const debug = {
        pageTitle: document.title,
        url: window.location.href,
        bodyText: document.body.innerText.substring(0, 500),
      };

      // Check for "no results" message first
      const pageText = document.body.innerText.toLowerCase();
      if (pageText.includes('no match') || pageText.includes('0 match') || pageText.includes('no records')) {
        return { success: false, error: 'No property found', debug };
      }

      // Strategy 1: Look for td.owner-responsive
      const ownerCell = document.querySelector('td.owner-responsive');
      if (ownerCell) {
        const lines = ownerCell.innerText.split('\n').map(l => l.trim()).filter(Boolean);
        if (lines.length >= 1) {
          return { success: true, ownerName: lines[0], ownerAddress: lines.slice(1).join(', '), strategy: 'owner-responsive' };
        }
      }

      // Strategy 2: Look for td[data-label="Owner"]
      const ownerDataCell = document.querySelector('td[data-label="Owner"]');
      if (ownerDataCell) {
        const lines = ownerDataCell.innerText.split('\n').map(l => l.trim()).filter(Boolean);
        if (lines.length >= 1) {
          return { success: true, ownerName: lines[0], ownerAddress: lines.slice(1).join(', '), strategy: 'data-label' };
        }
      }

      // Strategy 3: Look for table rows and find "Owner" header column
      const tables = document.querySelectorAll('table');
      for (const table of tables) {
        const headerRow = table.querySelector('tr');
        if (!headerRow) continue;

        const headers = Array.from(headerRow.querySelectorAll('th, td')).map(cell => cell.innerText.trim().toLowerCase());
        const ownerIndex = headers.findIndex(h => h.includes('owner'));

        if (ownerIndex >= 0) {
          // Found owner column, get the first data row
          const dataRows = Array.from(table.querySelectorAll('tr')).slice(1);
          if (dataRows.length > 0) {
            const cells = dataRows[0].querySelectorAll('td');
            if (cells[ownerIndex]) {
              const lines = cells[ownerIndex].innerText.split('\n').map(l => l.trim()).filter(Boolean);
              if (lines.length >= 1) {
                return { success: true, ownerName: lines[0], ownerAddress: lines.slice(1).join(', '), strategy: 'table-header' };
              }
            }
          }
        }
      }

      // Strategy 4: Look for any cell that looks like it contains an owner (multiple lines with address pattern)
      const allCells = document.querySelectorAll('td');
      for (const cell of allCells) {
        const text = cell.innerText.trim();
        const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
        // Owner cells typically have: NAME, then address lines (look for city/state/zip pattern)
        if (lines.length >= 2) {
          const lastLine = lines[lines.length - 1];
          // Check if last line looks like "CITY, ST ZIPCODE" or contains a zip
          if (/\b\d{5}(-\d{4})?\b/.test(lastLine) || /,\s*[A-Z]{2}\s+\d{5}/.test(lastLine)) {
            // First line is likely the name
            const ownerName = lines[0];
            // Skip if it looks like a property address (contains the search address)
            if (!ownerName.toLowerCase().includes(targetAddress.toLowerCase().split(' ')[0])) {
              return { success: true, ownerName, ownerAddress: lines.slice(1).join(', '), strategy: 'zip-pattern' };
            }
          }
        }
      }

      // Strategy 5: Check if there's an account link to click for more details
      const accountLink = document.querySelector('a[href*="showdetail"]');
      if (accountLink) {
        return { needsNavigation: true, detailUrl: accountLink.href, debug };
      }

      // Debug: capture table structure
      const tableInfo = Array.from(document.querySelectorAll('table')).map(t => ({
        rows: t.querySelectorAll('tr').length,
        firstRowText: t.querySelector('tr')?.innerText?.substring(0, 200)
      }));
      debug.tables = tableInfo;

      return { success: false, error: 'Could not parse tax assessor results', debug };
    }, searchAddress);

    console.log('[OWNER-LOOKUP] Tax assessor parse result:', JSON.stringify(ownerData));

    // If we need to navigate to a detail page
    if (ownerData.needsNavigation && ownerData.detailUrl) {
      console.log(`[OWNER-LOOKUP] Navigating to detail page: ${ownerData.detailUrl}`);
      await page.goto(ownerData.detailUrl, {
        waitUntil: 'networkidle2',
        timeout: 15000,
      });

      // Extract owner info from detail page
      const detailData = await page.evaluate(() => {
        const debug = { pageTitle: document.title, url: window.location.href };

        // Strategy 1: td.owner-responsive
        const ownerCell = document.querySelector('td.owner-responsive');
        if (ownerCell) {
          const lines = ownerCell.innerText.split('\n').map(l => l.trim()).filter(Boolean);
          if (lines.length >= 1) {
            return { success: true, ownerName: lines[0], ownerAddress: lines.slice(1).join(', '), strategy: 'detail-owner-responsive' };
          }
        }

        // Strategy 2: Look for "Owner" label in table rows
        const rows = document.querySelectorAll('tr');
        for (const row of rows) {
          const cells = row.querySelectorAll('td, th');
          for (let i = 0; i < cells.length - 1; i++) {
            const labelText = cells[i].innerText.toLowerCase().trim();
            if (labelText === 'owner' || labelText === 'owner name' || labelText.includes('owner:')) {
              const valueCell = cells[i + 1];
              if (valueCell) {
                const lines = valueCell.innerText.split('\n').map(l => l.trim()).filter(Boolean);
                if (lines.length >= 1) {
                  return { success: true, ownerName: lines[0], ownerAddress: lines.slice(1).join(', '), strategy: 'detail-label-match' };
                }
              }
            }
          }
        }

        // Strategy 3: Look for cells with address pattern
        const allCells = document.querySelectorAll('td');
        for (const cell of allCells) {
          const lines = cell.innerText.split('\n').map(l => l.trim()).filter(Boolean);
          if (lines.length >= 2) {
            const lastLine = lines[lines.length - 1];
            if (/\b\d{5}(-\d{4})?\b/.test(lastLine)) {
              return { success: true, ownerName: lines[0], ownerAddress: lines.slice(1).join(', '), strategy: 'detail-zip-pattern' };
            }
          }
        }

        return { success: false, error: 'Could not find owner on detail page', debug };
      });

      console.log('[OWNER-LOOKUP] Tax assessor detail page result:', JSON.stringify(detailData));
      return detailData;
    }

    return ownerData;
  } catch (error) {
    console.error('[OWNER-LOOKUP] Tax assessor error:', error.message);
    return { success: false, error: error.message };
  } finally {
    if (browser) await browser.close();
  }
}

// ============================================================================
// PHASE 2: TruePeopleSearch Lookup (by Address)
// ============================================================================

async function lookupTruePeopleSearch(ownerName, address, city, state, zip) {
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: 'new',
      args: BROWSER_ARGS,
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    });
    const page = await browser.newPage();
    await page.setUserAgent(USER_AGENT);
    await page.setViewport({ width: 1280, height: 800 });

    console.log(`[OWNER-LOOKUP] TruePeopleSearch: searching address "${address}" for owner "${ownerName}"`);

    // Navigate to TruePeopleSearch homepage
    await page.goto('https://www.truepeoplesearch.com', {
      waitUntil: 'networkidle2',
      timeout: 20000
    });

    // Check for Cloudflare / CAPTCHA
    const isBlocked = await page.evaluate(() => {
      const title = document.title.toLowerCase();
      return title.includes('attention') ||
             title.includes('just a moment') ||
             title.includes('challenge') ||
             !!document.querySelector('.cf-browser-verification') ||
             !!document.querySelector('#challenge-form');
    });

    if (isBlocked) {
      console.log('[OWNER-LOOKUP] TruePeopleSearch: blocked by anti-bot on homepage');
      return { success: false, error: 'Anti-bot challenge detected' };
    }

    await delay(1000 + Math.random() * 1000);

    // Click on the "Address" tab to switch search mode
    await page.evaluate(() => {
      const addressTab = Array.from(document.querySelectorAll('a, button, div'))
        .find(el => el.textContent.trim() === 'Address');
      if (addressTab) addressTab.click();
    });
    await delay(500);

    // Now fill in the address search form
    // The address input field (id="id-mf-n" on mobile full container)
    const addressInput = await page.$('input[aria-label="Name"], input#id-mf-n, input[name="streetaddress"]');
    if (addressInput) {
      await addressInput.click({ clickCount: 3 }); // Select all
      await addressInput.type(address);
    } else {
      // Try alternative: find the visible address input
      await page.evaluate((addr) => {
        const inputs = document.querySelectorAll('input[type="text"], input[placeholder*="address" i], input[placeholder*="street" i]');
        for (const input of inputs) {
          if (input.offsetParent !== null) { // visible
            input.value = addr;
            input.dispatchEvent(new Event('input', { bubbles: true }));
            break;
          }
        }
      }, address);
    }
    await delay(300);

    // Fill in the city/state/zip field
    const locationInput = await page.$('input[aria-label*="city" i], input[placeholder*="city" i], input[name="citystatezip"]');
    if (locationInput) {
      await locationInput.click({ clickCount: 3 });
      await locationInput.type(`${city}, ${state} ${zip}`);
    } else {
      await page.evaluate((loc) => {
        const inputs = document.querySelectorAll('input[type="text"]');
        // Second visible input is usually the location
        const visibleInputs = Array.from(inputs).filter(i => i.offsetParent !== null);
        if (visibleInputs.length > 1) {
          visibleInputs[1].value = loc;
          visibleInputs[1].dispatchEvent(new Event('input', { bubbles: true }));
        }
      }, `${city}, ${state} ${zip}`);
    }
    await delay(500);

    // Click search button
    const searchButton = await page.$('button#btnSubmit-mf-n, button[type="submit"], button.search-button, button.btn-success');
    if (searchButton) {
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 20000 }).catch(() => {}),
        searchButton.click(),
      ]);
    } else {
      await page.evaluate(() => {
        const btn = document.querySelector('button[type="submit"], .search-button, [class*="submit"]');
        if (btn) btn.click();
      });
      await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 20000 }).catch(() => {});
    }

    await delay(1500 + Math.random() * 1000);

    // Check for anti-bot on results page
    const isBlockedResults = await page.evaluate(() => {
      const title = document.title.toLowerCase();
      return title.includes('attention') || title.includes('just a moment');
    });

    if (isBlockedResults) {
      return { success: false, error: 'Anti-bot challenge on results page' };
    }

    // Find person cards and match against owner name
    const bestMatch = await page.evaluate((targetOwnerName) => {
      // Normalize function for matching
      function normalize(name) {
        return name.toLowerCase().replace(/[^a-z\s]/g, '').split(/\s+/).filter(Boolean);
      }

      function fuzzyMatch(name1, name2) {
        const tokens1 = normalize(name1);
        const tokens2 = normalize(name2);
        if (tokens1.length < 2 || tokens2.length < 2) return 0;

        const firstName1 = tokens1[0];
        const lastName1 = tokens1[tokens1.length - 1];
        const firstName2 = tokens2[0];
        const lastName2 = tokens2[tokens2.length - 1];

        if (lastName1 !== lastName2) return 0;
        if (firstName1 !== firstName2) return 0;
        return 0.8; // Base match on first + last name
      }

      // Look for person cards with content-header containing the name
      const cards = document.querySelectorAll('.card, [class*="card-summary"], .content-container');
      let bestScore = 0;
      let bestLink = null;
      let bestName = null;

      for (const card of cards) {
        // Find the name in the card (div.content-header or h4)
        const nameEl = card.querySelector('.content-header, h4, [class*="name"]');
        if (!nameEl) continue;
        const name = nameEl.textContent.trim();

        // Find the "View Details" link
        const detailLink = card.querySelector('a.btn.detail-link, a[href*="/find/person/"]');
        if (!detailLink) continue;

        const score = fuzzyMatch(name, targetOwnerName);
        if (score > bestScore) {
          bestScore = score;
          bestLink = detailLink.href;
          bestName = name;
        }
      }

      // If no cards matched, try to find any person link
      if (!bestLink) {
        const anyLink = document.querySelector('a[href*="/find/person/"]');
        if (anyLink) {
          const parentCard = anyLink.closest('.card, [class*="card"]');
          const nameEl = parentCard?.querySelector('.content-header, h4');
          return {
            detailUrl: anyLink.href,
            name: nameEl?.textContent?.trim() || 'Unknown',
            score: 0.5
          };
        }
      }

      if (bestLink) {
        return { detailUrl: bestLink, name: bestName, score: bestScore };
      }

      return null;
    }, ownerName);

    if (!bestMatch || !bestMatch.detailUrl) {
      console.log('[OWNER-LOOKUP] TruePeopleSearch: no matching person found');
      return { success: false, error: 'No matching person found' };
    }

    console.log(`[OWNER-LOOKUP] TruePeopleSearch: found match "${bestMatch.name}" (score: ${bestMatch.score})`);

    // Navigate to the person detail page
    await delay(500 + Math.random() * 1000);
    await page.goto(bestMatch.detailUrl, { waitUntil: 'networkidle2', timeout: 20000 });

    // Check for anti-bot again on detail page
    const isBlockedDetail = await page.evaluate(() => {
      const title = document.title.toLowerCase();
      return title.includes('attention') || title.includes('just a moment');
    });

    if (isBlockedDetail) {
      return { success: false, error: 'Anti-bot challenge on detail page' };
    }

    await delay(1000 + Math.random() * 1000);

    // Extract phone numbers and emails from the detail page
    const contactInfo = await page.evaluate(() => {
      const phones = [];
      const emails = [];

      // Phone numbers are in #toc-phones section
      // Each phone is in an <a href="/find/phone/..."> with a <span> containing the number
      const phoneSection = document.querySelector('#toc-phones');
      if (phoneSection) {
        const phoneLinks = phoneSection.querySelectorAll('a[href*="/find/phone/"]');
        for (const link of phoneLinks) {
          const spans = link.querySelectorAll('span');
          for (const span of spans) {
            const text = span.textContent.trim();
            // Match phone pattern like (210) 435-5765
            const phoneMatch = text.match(/\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/);
            if (phoneMatch && !phones.includes(phoneMatch[0])) {
              phones.push(phoneMatch[0]);
            }
          }
        }
      }

      // Fallback: scan for any phone patterns on the page
      if (phones.length === 0) {
        const allPhoneLinks = document.querySelectorAll('a[href*="/find/phone/"], [data-link-to-more="phone"]');
        for (const el of allPhoneLinks) {
          const text = el.textContent.trim();
          const phoneMatch = text.match(/\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/);
          if (phoneMatch && !phones.includes(phoneMatch[0])) {
            phones.push(phoneMatch[0]);
          }
        }
      }

      // Emails are in #toc-emails section or mailto links
      const emailSection = document.querySelector('#toc-emails');
      if (emailSection) {
        const emailLinks = emailSection.querySelectorAll('a[href^="mailto:"], a[href*="email"]');
        for (const link of emailLinks) {
          const href = link.getAttribute('href');
          if (href && href.startsWith('mailto:')) {
            const email = href.replace('mailto:', '').split('?')[0].trim();
            if (email && !emails.includes(email)) emails.push(email);
          } else {
            const text = link.textContent.trim();
            const emailMatch = text.match(/[\w.-]+@[\w.-]+\.\w+/);
            if (emailMatch && !emails.includes(emailMatch[0])) {
              emails.push(emailMatch[0]);
            }
          }
        }
      }

      // Fallback: scan for any emails
      if (emails.length === 0) {
        const allMailtos = document.querySelectorAll('a[href^="mailto:"]');
        for (const el of allMailtos) {
          const href = el.getAttribute('href');
          const email = href.replace('mailto:', '').split('?')[0].trim();
          if (email && !emails.includes(email)) emails.push(email);
        }
      }

      return { phones: phones.slice(0, 10), emails: emails.slice(0, 10) };
    });

    console.log(`[OWNER-LOOKUP] TruePeopleSearch: found ${contactInfo.phones.length} phones, ${contactInfo.emails.length} emails`);

    return {
      success: true,
      phoneNumbers: contactInfo.phones,
      emails: contactInfo.emails,
    };
  } catch (error) {
    console.error('[OWNER-LOOKUP] TruePeopleSearch error:', error.message);
    return { success: false, error: error.message };
  } finally {
    if (browser) await browser.close();
  }
}

module.exports = { lookupBexarTaxAssessor, lookupTruePeopleSearch };
