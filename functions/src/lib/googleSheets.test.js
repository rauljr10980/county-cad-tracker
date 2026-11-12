import { describe, expect, it, vi } from 'vitest';
import { getConnectionStatus, inspectSpreadsheet, parseSpreadsheetId, previewSpreadsheet, publicError } from './googleSheets.js';

const ID = '1ExampleSpreadsheetIdentifier_1234567890';
function mockSheets() {
  return { spreadsheets: {
    get: vi.fn().mockResolvedValue({ data: {
      spreadsheetId: ID, spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${ID}/edit`, properties: { title: 'Leads' },
      sheets: [{ properties: { sheetId: 17, title: "Owner's Leads", sheetType: 'GRID', gridProperties: { rowCount: 5000, columnCount: 200 } } }],
    } }),
    values: { get: vi.fn().mockResolvedValue({ data: { values: [['Name', 'Phone'], ['Sample', '(210) 555-0100'], [], ['Another']] } }) },
  } };
}

describe('Google Sheets connection', () => {
  it('accepts a sheet URL or ID and rejects external URLs and published-page IDs', () => {
    expect(parseSpreadsheetId(ID)).toBe(ID);
    expect(parseSpreadsheetId(`https://docs.google.com/spreadsheets/d/${ID}/edit#gid=17`)).toBe(ID);
    for (const input of [`https://example.com/spreadsheets/d/${ID}`, `https://docs.google.com.evil.test/spreadsheets/d/${ID}`, 'file:///etc/passwd', 'https://docs.google.com/spreadsheets/d/e/published/pubhtml', null]) {
      expect(() => parseSpreadsheetId(input)).toThrow(/valid Google Sheets|Enter a Google Sheets/);
    }
  });

  it('reports setup status without exposing credentials', () => {
    const status = getConnectionStatus({ GOOGLE_CLIENT_EMAIL: 'sync@example.iam.gserviceaccount.com', GOOGLE_PRIVATE_KEY: 'secret' });
    expect(status).toEqual({ configured: true, serviceAccountEmail: 'sync@example.iam.gserviceaccount.com' });
    expect(JSON.stringify(status)).not.toContain('secret');
    expect(getConnectionStatus({})).toEqual({ configured: false, serviceAccountEmail: null });
    expect(getConnectionStatus({ GOOGLE_SHEETS_CREDENTIALS_JSON: '{invalid' }).configured).toBe(false);
  });

  it('requests metadata without reading spreadsheet cells', async () => {
    const sheets = mockSheets();
    const metadata = await inspectSpreadsheet(ID, sheets);
    expect(metadata.tabs[0].sheetId).toBe(17);
    expect(sheets.spreadsheets.get.mock.calls[0][0]).not.toHaveProperty('includeGridData');
    expect(sheets.spreadsheets.values.get).not.toHaveBeenCalled();
  });

  it('reads a bounded range from the exact selected tab, escaping apostrophes and preserving row positions', async () => {
    const sheets = mockSheets();
    const preview = await previewSpreadsheet({ spreadsheetId: ID, sheetId: 17, headerRow: 4, limit: 25 }, sheets);
    expect(sheets.spreadsheets.values.get.mock.calls[0][0]).toMatchObject({ range: "'Owner''s Leads'!A4:CV29", valueRenderOption: 'FORMATTED_VALUE' });
    expect(preview.rows).toEqual([
      { rowNumber: 5, values: ['Sample', '(210) 555-0100'] },
      { rowNumber: 6, values: ['', ''] },
      { rowNumber: 7, values: ['Another', ''] },
    ]);
    expect(preview.truncatedColumns).toBe(true);
  });

  it('rejects unknown tabs and oversized reads before requesting cells', async () => {
    const sheets = mockSheets();
    await expect(previewSpreadsheet({ spreadsheetId: ID, sheetId: 18 }, sheets)).rejects.toThrow(/no longer exists/);
    await expect(previewSpreadsheet({ spreadsheetId: ID, sheetId: 17, limit: 101 }, sheets)).rejects.toThrow(/at most/);
    await expect(previewSpreadsheet({ spreadsheetId: ID, sheetId: 17, headerRow: 6000 }, sheets)).rejects.toThrow(/outside/);
    expect(sheets.spreadsheets.values.get).not.toHaveBeenCalled();
  });

  it('shows actionable Google errors without leaking provider request details', () => {
    expect(publicError({ code: 403, message: 'private key request details' }).message).toMatch(/share the sheet/);
    expect(publicError({ response: { status: 403, data: { error: { details: [{ reason: 'SERVICE_DISABLED' }] } } } }).message).toMatch(/Enable the Google Sheets API/);
    expect(publicError({ code: 429 }).status).toBe(429);
    expect(publicError(new Error('secret-token')).message).not.toContain('secret-token');
  });
});
