const { createHash } = require('crypto');
const { getSheetsClient, inspectSpreadsheet, SheetsError, publicError, columnName } = require('./googleSheets');

// Bound to the workbook explicitly selected by the owner. Request parameters
// can never select a different spreadsheet accessible to the service account.
const SPREADSHEET_ID = '1D8RLGLbgM3BQOzdM8chK-i_zUuTw9gviO2KfuZm1gy0';
const TABS = [
  { sheetId: 46204754, title: 'Parcels', keyColumn: 0 },
  { sheetId: 1602785828, title: 'Research Queue', keyColumn: 1 },
  { sheetId: 2090779059, title: 'Outreach Pipeline', keyColumn: 0 },
];
const MAX_ROWS = 50000;
const MAX_COLS = 26;
const locks = new Map();

function allowedTab(sheetId) {
  const tab = TABS.find((item) => item.sheetId === sheetId);
  if (!tab) throw new SheetsError('Unknown CRM tab.', 404);
  return tab;
}

function rowVersion(headers, cells) {
  return createHash('sha256').update(JSON.stringify({
    headers, cells: cells.map((cell) => ({ value: cell.userEnteredValue ?? null, validation: cell.dataValidation ?? null })),
  })).digest('hex');
}

function cellDescriptor(cell = {}) {
  const formula = Boolean(cell.userEnteredValue?.formulaValue);
  const rule = cell.dataValidation?.condition;
  const options = rule?.type === 'ONE_OF_LIST' ? (rule.values ?? []).map((value) => value.userEnteredValue ?? '') : null;
  const checkbox = rule?.type === 'BOOLEAN';
  // Custom formulas and range-based validation cannot be safely evaluated
  // here; keep those cells editable only in Google Sheets.
  const unsupported = Boolean(rule && !options && !checkbox);
  return {
    value: String(cell.formattedValue ?? cell.userEnteredValue?.stringValue ?? cell.userEnteredValue?.numberValue ?? cell.userEnteredValue?.boolValue ?? ''),
    editable: !formula && !unsupported,
    options,
    checkbox,
    numeric: typeof cell.userEnteredValue?.numberValue === 'number',
  };
}

async function readGrid(sheetId, sheets, rowNumber) {
  const configured = allowedTab(sheetId);
  const metadata = await inspectSpreadsheet(SPREADSHEET_ID, sheets);
  const tab = metadata.tabs.find((item) => item.sheetId === sheetId);
  if (!tab) throw new SheetsError('The connected tab was removed from Google Sheets.', 404);
  if (tab.columnCount > MAX_COLS) throw new SheetsError('This CRM supports up to 26 columns. Open the workbook to review its structure.', 409);
  if (rowNumber != null && (!Number.isSafeInteger(rowNumber) || rowNumber < 2 || rowNumber > Math.min(tab.rowCount, MAX_ROWS + 1))) throw new SheetsError('Invalid row number.');
  const quoted = `'${tab.title.replace(/'/g, "''")}'`;
  const lastColumn = columnName(tab.columnCount);
  const ranges = rowNumber ? [`${quoted}!A1:${lastColumn}1`, `${quoted}!A${rowNumber}:${lastColumn}${rowNumber}`] : [`${quoted}!A1:${lastColumn}${Math.min(tab.rowCount, MAX_ROWS + 1)}`];
  const { data } = await sheets.spreadsheets.get({
    spreadsheetId: SPREADSHEET_ID, ranges,
    fields: 'sheets(properties(sheetId),data(startRow,rowData(values(formattedValue,userEnteredValue,dataValidation))))',
  }, { timeout: 20000 });
  const blocks = data.sheets?.find((sheet) => sheet.properties.sheetId === sheetId)?.data ?? [];
  const headerBlock = blocks.find((block) => (block.startRow ?? 0) === 0);
  const headerCells = headerBlock?.rowData?.[0]?.values ?? [];
  let lastHeader = headerCells.length - 1;
  while (lastHeader >= 0 && !cellDescriptor(headerCells[lastHeader]).value.trim()) lastHeader--;
  const headers = headerCells.slice(0, lastHeader + 1).map((cell) => cellDescriptor(cell).value.trim());
  if (!headers.length || !headers[configured.keyColumn]) throw new SheetsError('The tab’s header row has changed. Review row 1 in Google Sheets.', 409);
  const result = [];
  for (const block of blocks) {
    for (const [offset, row] of (block.rowData ?? []).entries()) {
      const number = (block.startRow ?? 0) + offset + 1;
      if (number === 1 || (rowNumber && number !== rowNumber)) continue;
      const cells = Array.from({ length: headers.length }, (_, index) => row.values?.[index] ?? {});
      if (!cells.some((cell) => cellDescriptor(cell).value !== '')) continue;
      result.push({ rowNumber: number, version: rowVersion(headers, cells), cells: cells.map(cellDescriptor), rawCells: cells });
    }
  }
  return { title: metadata.title, tab: { sheetId, title: tab.title, keyColumn: configured.keyColumn }, headers, rows: result, truncated: tab.rowCount > MAX_ROWS + 1 };
}

async function loadTab(sheetId, sheets = getSheetsClient()) {
  try {
    const grid = await readGrid(sheetId, sheets);
    return { ...grid, rows: grid.rows.map(({ rawCells, ...row }) => row), refreshedAt: new Date().toISOString() };
  } catch (error) { throw publicError(error); }
}

function enteredValue(value, descriptor, header) {
  if (typeof value !== 'string' || value.length > 10000) throw new SheetsError('Each field must be text of at most 10,000 characters.');
  if (!descriptor.editable) throw new SheetsError(`${header} is calculated or validated in Google Sheets. Edit it there.`);
  if (value === '') return {};
  if (descriptor.options && !descriptor.options.includes(value)) throw new SheetsError(`Choose an allowed value for ${header}.`);
  if (descriptor.checkbox) {
    if (!['TRUE', 'FALSE'].includes(value)) throw new SheetsError(`Choose TRUE or FALSE for ${header}.`);
    return { boolValue: value === 'TRUE' };
  }
  const numeric = descriptor.numeric || /^(BCAD Appraised Value|Valuation Year|Lot Size \(sf\)|Asking Price|Indicative Offer)$/.test(header);
  if (numeric) {
    const cleaned = value.replace(/[$,\s]/g, '');
    if (!/^-?(?:\d+(?:\.\d*)?|\.\d+)$/.test(cleaned) || !Number.isFinite(Number(cleaned))) throw new SheetsError(`${header} must be a number.`);
    return { numberValue: Number(cleaned) };
  }
  // Values that start with '=' remain literal text, never injected formulas.
  return { stringValue: value };
}

async function withLock(sheetId, operation) {
  const previous = locks.get(sheetId) ?? Promise.resolve();
  let release;
  const current = new Promise((resolve) => { release = resolve; });
  locks.set(sheetId, current);
  await previous;
  try { return await operation(); }
  finally { release(); if (locks.get(sheetId) === current) locks.delete(sheetId); }
}

async function updateRow(sheetId, rowNumber, payload, sheets = getSheetsClient(true)) {
  allowedTab(sheetId);
  return withLock(sheetId, async () => {
    try {
      if (!payload || typeof payload.version !== 'string' || !Array.isArray(payload.changes) || !payload.changes.length || payload.changes.length > MAX_COLS) throw new SheetsError('Supply the current record version and changed fields.');
      const grid = await readGrid(sheetId, sheets, rowNumber);
      const row = grid.rows.find((item) => item.rowNumber === rowNumber);
      if (!row || row.version !== payload.version) throw new SheetsError('This record changed in Google Sheets. Refresh it before saving again.', 409);
      const seen = new Set();
      const requests = payload.changes.map(({ columnIndex, value }) => {
        if (!Number.isSafeInteger(columnIndex) || columnIndex < 0 || columnIndex >= grid.headers.length || !grid.headers[columnIndex] || seen.has(columnIndex)) throw new SheetsError('Invalid field selection.');
        seen.add(columnIndex);
        const userEnteredValue = enteredValue(value, row.cells[columnIndex], grid.headers[columnIndex]);
        if (columnIndex === grid.tab.keyColumn && !value.trim()) throw new SheetsError(`${grid.headers[columnIndex]} is required.`);
        return { updateCells: {
          range: { sheetId, startRowIndex: rowNumber - 1, endRowIndex: rowNumber, startColumnIndex: columnIndex, endColumnIndex: columnIndex + 1 },
          rows: [{ values: [{ userEnteredValue }] }], fields: 'userEnteredValue',
        } };
      });
      await sheets.spreadsheets.batchUpdate({ spreadsheetId: SPREADSHEET_ID, requestBody: { requests } }, { timeout: 20000 });
      return { success: true };
    } catch (error) { throw publicError(error); }
  });
}

async function addRow(sheetId, payload, sheets = getSheetsClient(true)) {
  allowedTab(sheetId);
  return withLock(sheetId, async () => {
    try {
      const grid = await readGrid(sheetId, sheets);
      if (!payload || !Array.isArray(payload.values) || payload.values.length !== grid.headers.length || !payload.values.every((value) => typeof value === 'string')) throw new SheetsError('Supply a value for each record field.');
      if (!payload.values[grid.tab.keyColumn].trim()) throw new SheetsError(`${grid.headers[grid.tab.keyColumn]} is required.`);
      if ((grid.rows.at(-1)?.rowNumber ?? 1) >= MAX_ROWS + 1) throw new SheetsError('This tab has reached the CRM’s 50,000-record limit.', 409);
      const values = payload.values.map((value, index) => {
        const descriptor = grid.rows[0]?.cells[index] ?? cellDescriptor();
        if (!grid.headers[index] || !descriptor.editable) {
          if (value) throw new SheetsError('Calculated or unnamed fields must be left blank.');
          return '';
        }
        const entered = enteredValue(value, descriptor, grid.headers[index]);
        return entered.numberValue ?? entered.boolValue ?? entered.stringValue ?? '';
      });
      const name = `'${grid.tab.title.replace(/'/g, "''")}'`;
      await sheets.spreadsheets.values.append({
        spreadsheetId: SPREADSHEET_ID, range: `${name}!A1:${columnName(grid.headers.length)}`,
        valueInputOption: 'RAW', insertDataOption: 'INSERT_ROWS', requestBody: { values: [values] },
      }, { timeout: 20000 });
      return { success: true };
    } catch (error) { throw publicError(error); }
  });
}

module.exports = { SPREADSHEET_ID, TABS, loadTab, updateRow, addRow, rowVersion, enteredValue, cellDescriptor, allowedTab };
