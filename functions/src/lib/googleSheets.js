const { google } = require('googleapis');

const READ_SCOPE = 'https://www.googleapis.com/auth/spreadsheets.readonly';
const MAX_COLUMNS = 100;
const MAX_PREVIEW_ROWS = 100;

class SheetsError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

function readCredentials(env = process.env) {
  const raw = env.GOOGLE_SHEETS_CREDENTIALS_JSON || env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed.type !== 'service_account' || !parsed.client_email || !parsed.private_key) throw new Error();
      return { client_email: parsed.client_email, private_key: parsed.private_key.replace(/\\n/g, '\n') };
    } catch {
      throw new SheetsError('The Google Sheets service account is not configured correctly.', 503);
    }
  }
  if (env.GOOGLE_CLIENT_EMAIL && env.GOOGLE_PRIVATE_KEY) {
    return { client_email: env.GOOGLE_CLIENT_EMAIL, private_key: env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n') };
  }
  return null;
}

function getConnectionStatus(env = process.env) {
  try {
    const credentials = readCredentials(env);
    return { configured: Boolean(credentials), serviceAccountEmail: credentials?.client_email ?? null };
  } catch (error) {
    return { configured: false, serviceAccountEmail: null, error: error.message };
  }
}

function getSheetsClient(write = false) {
  const credentials = readCredentials();
  if (!credentials) throw new SheetsError('Google Sheets credentials need to be configured on the server.', 503);
  const auth = new google.auth.GoogleAuth({ credentials, scopes: [write ? 'https://www.googleapis.com/auth/spreadsheets' : READ_SCOPE] });
  return google.sheets({ version: 'v4', auth });
}

function parseSpreadsheetId(value) {
  if (typeof value !== 'string') throw new SheetsError('Enter a Google Sheets link or spreadsheet ID.');
  const input = value.trim();
  if (/^[A-Za-z0-9_-]{20,200}$/.test(input)) return input;
  try {
    const url = new URL(input);
    const match = url.pathname.match(/^\/spreadsheets\/d\/([A-Za-z0-9_-]{20,200})(?:\/|$)/);
    if (url.protocol === 'https:' && url.hostname === 'docs.google.com' && match) return match[1];
  } catch { /* use the same validation message for all invalid URLs */ }
  throw new SheetsError('Enter a valid Google Sheets link or spreadsheet ID.');
}

function publicError(error) {
  if (error instanceof SheetsError) return error;
  const status = Number(error.response?.status ?? error.code);
  const reason = error.response?.data?.error?.details?.find((item) => item.reason)?.reason;
  if (reason === 'SERVICE_DISABLED' || error.response?.data?.error?.errors?.some((item) => item.reason === 'accessNotConfigured')) {
    return new SheetsError('Enable the Google Sheets API in the service account’s Google Cloud project, then try again.', 503);
  }
  if (status === 403 || status === 404) {
    return new SheetsError('The spreadsheet is unavailable. Check the link and share the sheet with the service account email shown above.', 403);
  }
  if (status === 429) return new SheetsError('Google Sheets is busy. Wait a minute and try again.', 429);
  if (status === 401) return new SheetsError('Google rejected the server’s credentials. Check the service account configuration.', 503);
  return new SheetsError('Could not reach Google Sheets. Please try again.', 502);
}

async function inspectSpreadsheet(value, sheets = getSheetsClient()) {
  const spreadsheetId = parseSpreadsheetId(value);
  try {
    const { data } = await sheets.spreadsheets.get({
      spreadsheetId,
      fields: 'spreadsheetId,spreadsheetUrl,properties(title),sheets(properties(sheetId,title,sheetType,gridProperties(rowCount,columnCount)))',
    }, { timeout: 20000 });
    return {
      spreadsheetId: data.spreadsheetId,
      title: data.properties?.title ?? '',
      url: data.spreadsheetUrl,
      tabs: (data.sheets ?? []).filter((sheet) => sheet.properties.sheetType === 'GRID' || !sheet.properties.sheetType).map(({ properties }) => ({
        sheetId: properties.sheetId,
        title: properties.title,
        rowCount: properties.gridProperties?.rowCount ?? 0,
        columnCount: properties.gridProperties?.columnCount ?? 0,
      })),
    };
  } catch (error) {
    throw publicError(error);
  }
}

function columnName(index) {
  let label = '';
  for (let n = index; n > 0; n = Math.floor((n - 1) / 26)) label = String.fromCharCode(65 + (n - 1) % 26) + label;
  return label;
}

async function previewSpreadsheet({ spreadsheetId, sheetId, headerRow = 1, limit = 25 }, sheets = getSheetsClient()) {
  if (!Number.isSafeInteger(sheetId) || sheetId < 0) throw new SheetsError('Choose a spreadsheet tab.');
  if (!Number.isSafeInteger(headerRow) || headerRow < 1) throw new SheetsError('Header row must be a positive whole number.');
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_PREVIEW_ROWS) throw new SheetsError(`Preview at most ${MAX_PREVIEW_ROWS} rows at a time.`);
  const metadata = await inspectSpreadsheet(spreadsheetId, sheets);
  const tab = metadata.tabs.find((item) => item.sheetId === sheetId);
  if (!tab) throw new SheetsError('That tab no longer exists. Reload the spreadsheet.');
  if (headerRow > tab.rowCount) throw new SheetsError('The header row is outside this tab.');
  const columnCount = Math.min(tab.columnCount, MAX_COLUMNS);
  if (!columnCount) return { ...metadata, tab, headerRow, headers: [], rows: [], truncatedColumns: false };
  const range = `'${tab.title.replace(/'/g, "''")}'!A${headerRow}:${columnName(columnCount)}${Math.min(headerRow + limit, tab.rowCount)}`;
  try {
    const { data } = await sheets.spreadsheets.values.get({
      spreadsheetId: metadata.spreadsheetId,
      range,
      valueRenderOption: 'FORMATTED_VALUE',
      majorDimension: 'ROWS',
    }, { timeout: 20000 });
    const [header = [], ...values] = data.values ?? [];
    const width = Math.max(header.length, ...values.map((row) => row.length), 0);
    return {
      ...metadata, tab, headerRow,
      headers: Array.from({ length: width }, (_, index) => String(header[index] ?? '').trim()),
      rows: values.map((row, index) => ({ rowNumber: headerRow + index + 1, values: Array.from({ length: width }, (_, col) => String(row[col] ?? '')) })),
      truncatedColumns: tab.columnCount > MAX_COLUMNS,
    };
  } catch (error) {
    throw publicError(error);
  }
}

module.exports = { getConnectionStatus, getSheetsClient, parseSpreadsheetId, inspectSpreadsheet, previewSpreadsheet, publicError, SheetsError, columnName };
