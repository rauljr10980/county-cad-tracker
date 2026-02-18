/**
 * Backfill script: Update ownerName with PNUMBER + PSTRNAME from Excel
 *
 * Reads the original Excel file and calls the API to update existing properties
 * so ownerName contains the full situs address (e.g., "203 COLIMA ST" instead of just "COLIMA ST")
 *
 * Usage: node functions/scripts/backfill-pnumber.js
 */

const XLSX = require('xlsx');
const path = require('path');

const EXCEL_PATH = path.resolve(__dirname, '../../TRAINED DTR_Summary.959740.xlsx');
const API_URL = process.env.API_URL || 'https://county-cad-tracker-production.up.railway.app';

async function backfill() {
  console.log('[BACKFILL] Reading Excel file...');
  const workbook = XLSX.readFile(EXCEL_PATH);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rawData = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

  // Find header row
  let headerRow = null;
  let headerIdx = 0;
  for (let i = 0; i < Math.min(10, rawData.length); i++) {
    const row = rawData[i].map(v => String(v).trim().toUpperCase());
    if (row.includes('CAN') && row.includes('PNUMBER')) {
      headerRow = rawData[i].map(v => String(v).trim());
      headerIdx = i;
      break;
    }
  }

  if (!headerRow) {
    console.error('[BACKFILL] Could not find header row with CAN and PNUMBER columns');
    process.exit(1);
  }

  const canCol = headerRow.findIndex(h => h.toUpperCase() === 'CAN');
  const pnumberCol = headerRow.findIndex(h => h.toUpperCase() === 'PNUMBER');
  const pstrnameCol = headerRow.findIndex(h => h.toUpperCase() === 'PSTRNAME');

  console.log(`[BACKFILL] Headers at row ${headerIdx + 1} - CAN: col ${canCol}, PNUMBER: col ${pnumberCol}, PSTRNAME: col ${pstrnameCol}`);

  // Build updates array
  const updates = [];
  for (let i = headerIdx + 1; i < rawData.length; i++) {
    const row = rawData[i];
    const can = String(row[canCol] || '').trim();
    const pNumber = String(row[pnumberCol] || '').trim();
    const pStrName = String(row[pstrnameCol] || '').trim();

    if (can && (pNumber || pStrName)) {
      const situs = [pNumber, pStrName].filter(Boolean).join(' ').trim();
      if (situs) {
        updates.push({ accountNumber: can, ownerName: situs });
      }
    }
  }

  console.log(`[BACKFILL] Built ${updates.length} situs updates from Excel`);

  // Send in chunks to API
  const CHUNK_SIZE = 2000;
  let totalUpdated = 0;

  for (let i = 0; i < updates.length; i += CHUNK_SIZE) {
    const chunk = updates.slice(i, i + CHUNK_SIZE);
    console.log(`[BACKFILL] Sending chunk ${Math.floor(i / CHUNK_SIZE) + 1} (${chunk.length} records)...`);

    const res = await fetch(`${API_URL}/api/properties/backfill-situs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ updates: chunk })
    });

    if (!res.ok) {
      const text = await res.text();
      console.error(`[BACKFILL] API error (${res.status}):`, text);
      continue;
    }

    const result = await res.json();
    totalUpdated += result.updated;
    console.log(`[BACKFILL] Chunk done: ${result.updated} updated`);
  }

  console.log(`[BACKFILL] Complete! Total updated: ${totalUpdated}`);
}

backfill().catch(err => {
  console.error('[BACKFILL] Error:', err);
  process.exit(1);
});
