import { describe, expect, it, vi } from 'vitest';
import { SPREADSHEET_ID, loadTab, updateRow, addRow } from './sheetsCrm.js';

const TAB = 46204754;
const str = (value) => ({ formattedValue: value, userEnteredValue: { stringValue: value } });
const headers = ['Address', 'Owner Name', 'BCAD Appraised Value', 'Notes', 'Calculated', 'Contact Status'].map(str);
const cells = [str('302 Nika'), str('Example Owner'), { formattedValue: '$114,100', userEnteredValue: { numberValue: 114100 } }, str('Original note'), { formattedValue: '42', userEnteredValue: { formulaValue: '=SUM(A3:A4)' } }, { ...str('New'), dataValidation: { condition: { type: 'ONE_OF_LIST', values: [{ userEnteredValue: 'New' }, { userEnteredValue: 'Contacted' }] } } }];

function mockSheets() {
  const sheets = { spreadsheets: { get: vi.fn(), batchUpdate: vi.fn().mockResolvedValue({}), values: { append: vi.fn().mockResolvedValue({}) } } };
  sheets.spreadsheets.get.mockImplementation(async (args) => {
    if (!args.ranges) return { data: { spreadsheetId: SPREADSHEET_ID, properties: { title: 'Government Hill' }, sheets: [{ properties: { sheetId: TAB, title: 'Parcels', gridProperties: { rowCount: 1000, columnCount: 26 } } }] } };
    return { data: { sheets: [{ properties: { sheetId: TAB }, data: args.ranges.length === 2
      ? [{ startRow: 0, rowData: [{ values: headers }] }, { startRow: 1, rowData: [{ values: cells }] }]
      : [{ startRow: 0, rowData: [{ values: headers }, { values: cells }, {}, { values: [str('Another parcel')] }] }] }] } };
  });
  return sheets;
}

describe('Government Hill Sheets CRM', () => {
  it('reads only the selected workbook and allowed tab, preserves physical row numbers, and identifies formulas', async () => {
    const sheets = mockSheets();
    const grid = await loadTab(TAB, sheets);
    expect(grid.rows.map((row) => row.rowNumber)).toEqual([2, 4]);
    expect(grid.rows[0].cells[4].editable).toBe(false);
    expect(grid.rows[0]).not.toHaveProperty('rawCells');
    for (const [args] of sheets.spreadsheets.get.mock.calls) expect(args.spreadsheetId).toBe(SPREADSHEET_ID);
    await expect(loadTab(1234, sheets)).rejects.toMatchObject({ status: 404 });
  });

  it('updates only changed cells and leaves formulas, formats, validation, and other rows untouched', async () => {
    const sheets = mockSheets();
    const grid = await loadTab(TAB, sheets);
    await updateRow(TAB, 2, { version: grid.rows[0].version, changes: [{ columnIndex: 3, value: 'Updated note' }] }, sheets);
    expect(sheets.spreadsheets.batchUpdate).toHaveBeenCalledWith({
      spreadsheetId: SPREADSHEET_ID, requestBody: { requests: [{ updateCells: {
        range: { sheetId: TAB, startRowIndex: 1, endRowIndex: 2, startColumnIndex: 3, endColumnIndex: 4 },
        rows: [{ values: [{ userEnteredValue: { stringValue: 'Updated note' } }] }], fields: 'userEnteredValue',
      } }] },
    }, { timeout: 20000 });
  });

  it('rejects stale edits, formula changes, invalid dropdown choices, header writes, and duplicate field writes', async () => {
    const sheets = mockSheets();
    const grid = await loadTab(TAB, sheets);
    const version = grid.rows[0].version;
    await expect(updateRow(TAB, 2, { version: 'stale', changes: [{ columnIndex: 3, value: 'Overwrite' }] }, sheets)).rejects.toMatchObject({ status: 409 });
    await expect(updateRow(TAB, 2, { version, changes: [{ columnIndex: 4, value: 'Delete formula' }] }, sheets)).rejects.toThrow(/calculated/);
    await expect(updateRow(TAB, 2, { version, changes: [{ columnIndex: 5, value: 'Invalid' }] }, sheets)).rejects.toThrow(/allowed value/);
    await expect(updateRow(TAB, 1, { version, changes: [{ columnIndex: 0, value: 'Header' }] }, sheets)).rejects.toThrow(/row number/);
    await expect(updateRow(TAB, 2, { version, changes: [{ columnIndex: 3, value: 'A' }, { columnIndex: 3, value: 'B' }] }, sheets)).rejects.toThrow(/Invalid field/);
    expect(sheets.spreadsheets.batchUpdate).not.toHaveBeenCalled();
  });

  it('saves numeric fields as numbers and user text as literal text, including formula-like text', async () => {
    const sheets = mockSheets();
    const grid = await loadTab(TAB, sheets);
    await updateRow(TAB, 2, { version: grid.rows[0].version, changes: [{ columnIndex: 2, value: '$125,000' }, { columnIndex: 3, value: '=IMPORTXML("untrusted")' }] }, sheets);
    const requests = sheets.spreadsheets.batchUpdate.mock.calls[0][0].requestBody.requests;
    expect(requests[0].updateCells.rows[0].values[0].userEnteredValue).toEqual({ numberValue: 125000 });
    expect(requests[1].updateCells.rows[0].values[0].userEnteredValue).toEqual({ stringValue: '=IMPORTXML("untrusted")' });
  });

  it('appends records without replacing existing rows, with RAW input and required identity', async () => {
    const sheets = mockSheets();
    await addRow(TAB, { values: ['New address', 'Owner', '200000', '=literal', '', 'New'] }, sheets);
    expect(sheets.spreadsheets.values.append.mock.calls[0][0]).toMatchObject({
      spreadsheetId: SPREADSHEET_ID, valueInputOption: 'RAW', insertDataOption: 'INSERT_ROWS',
      requestBody: { values: [['New address', 'Owner', 200000, '=literal', '', 'New']] },
    });
    await expect(addRow(TAB, { values: ['', '', '', '', '', ''] }, sheets)).rejects.toThrow(/required/);
  });
});
