import { API_BASE_URL, getAuthHeaders } from '@/lib/api';

export interface SheetsCrmTab { sheetId: number; title: string; keyColumn: number }
export interface SheetsCrmConnection {
  sync?: {
    storage: 'postgresql'; autoSyncMinutes: number; busy: boolean;
    worksheets: { sheetId: number; title: string; rowCount: number; syncedAt: string | null; lastAttemptAt: string | null; lastError: string | null }[];
  };
  configured: boolean;
  serviceAccountEmail: string | null;
  error?: string;
  spreadsheetUrl: string;
  title: string;
  tabs: SheetsCrmTab[];
}
export interface SheetsCrmCell { value: string; editable: boolean; options: string[] | null; checkbox: boolean; numeric: boolean }
export interface SheetsCrmRow { rowNumber: number; version: string; cells: SheetsCrmCell[] }
export interface SheetsCrmGrid {
  storage?: 'postgresql';
  lastError?: string | null;
  title: string; tab: SheetsCrmTab; headers: string[]; rows: SheetsCrmRow[]; truncated: boolean; refreshedAt: string;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE_URL}/api/sheets-crm${path}`, { ...options, headers: getAuthHeaders() });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(body?.error || 'Could not connect to the Government Hill CRM. Please try again.');
  return body as T;
}

export const getSheetsCrmConnection = () => request<SheetsCrmConnection>('');
export const getSheetsCrmRows = (sheetId: number) => request<SheetsCrmGrid>(`/tabs/${sheetId}/rows`);
export const syncSheetsCrm = () => request<{ busy: boolean; successful: number; failed: number }>('/sync', { method: 'POST', body: '{}' });
export const updateSheetsCrmRow = (sheetId: number, row: SheetsCrmRow, values: string[]) => request<{ success: boolean; syncPending?: boolean }>(`/tabs/${sheetId}/rows/${row.rowNumber}`, {
  method: 'PATCH',
  body: JSON.stringify({ version: row.version, changes: values.flatMap((value, columnIndex) => value !== row.cells[columnIndex].value ? [{ columnIndex, value }] : []) }),
});
export const addSheetsCrmRow = (sheetId: number, values: string[]) => request<{ success: boolean; syncPending?: boolean }>(`/tabs/${sheetId}/rows`, { method: 'POST', body: JSON.stringify({ values }) });
