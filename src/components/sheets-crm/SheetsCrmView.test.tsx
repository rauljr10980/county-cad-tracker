import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import SheetsCrmView from './SheetsCrmView';
import { getSheetsCrmConnection, getSheetsCrmRows, updateSheetsCrmRow, addSheetsCrmRow } from './api';

vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'manager', role: 'ADMIN' } }) }));
vi.mock('@/contexts/ViewAsContext', () => ({ useViewAs: () => ({ viewAsUserId: null }) }));
vi.mock('@/hooks/use-toast', () => ({ toast: vi.fn() }));
vi.mock('./api', () => ({ getSheetsCrmConnection: vi.fn(), getSheetsCrmRows: vi.fn(), updateSheetsCrmRow: vi.fn(), addSheetsCrmRow: vi.fn() }));

const cell = (value: string, editable = true) => ({ value, editable, options: null, checkbox: false, numeric: false });
const row = { rowNumber: 2, version: 'snapshot', cells: [cell('302 Nika'), cell('City'), cell('Research'), cell('Check ownership'), cell('Computed', false)] };
const grid = {
  title: 'Government Hill', tab: { sheetId: 46204754, title: 'Parcels', keyColumn: 0 },
  headers: ['Address', 'Owner Name', 'Acquisition Stage', 'Notes', 'Formula'], rows: [row], truncated: false, refreshedAt: '2026-11-12T03:00:00Z',
};

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={client}><SheetsCrmView /></QueryClientProvider>);
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getSheetsCrmConnection).mockResolvedValue({ configured: true, serviceAccountEmail: 'service@example.test', spreadsheetUrl: 'https://docs.google.com/spreadsheets/d/example/edit', title: 'Government Hill', tabs: [grid.tab, { sheetId: 1602785828, title: 'Research Queue', keyColumn: 1 }, { sheetId: 2090779059, title: 'Outreach Pipeline', keyColumn: 0 }] });
  vi.mocked(getSheetsCrmRows).mockResolvedValue(grid);
  vi.mocked(updateSheetsCrmRow).mockResolvedValue({ success: true });
  vi.mocked(addSheetsCrmRow).mockResolvedValue({ success: true });
});
afterEach(cleanup);

describe('Government Hill CRM view', () => {
  it('loads the selected worksheet, searches records, and switches to Research Queue', async () => {
    const user = userEvent.setup();
    mount();
    await screen.findByText('302 Nika');
    await user.type(screen.getByRole('textbox', { name: /Search Government Hill/ }), 'not-a-match');
    expect(screen.getByText('No records match your search.')).toBeTruthy();
    await user.click(screen.getByRole('tab', { name: 'Research Queue' }));
    await waitFor(() => expect(getSheetsCrmRows).toHaveBeenCalledWith(1602785828));
  });

  it('locks formula fields and sends an edited record with its original version', async () => {
    const user = userEvent.setup();
    mount();
    await user.click(await screen.findByRole('button', { name: 'Edit 302 Nika' }));
    expect((screen.getByLabelText('Formula') as HTMLInputElement).readOnly).toBe(true);
    await user.clear(screen.getByLabelText('Notes'));
    await user.type(screen.getByLabelText('Notes'), 'Call the City');
    await user.click(screen.getByRole('button', { name: 'Save to sheet' }));
    await waitFor(() => expect(updateSheetsCrmRow).toHaveBeenCalledWith(46204754, row, ['302 Nika', 'City', 'Research', 'Call the City', 'Computed']));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('keeps the draft open when Google rejects an update', async () => {
    vi.mocked(updateSheetsCrmRow).mockRejectedValue(new Error('This record changed in Google Sheets.'));
    const user = userEvent.setup();
    mount();
    await user.click(await screen.findByRole('button', { name: 'Edit 302 Nika' }));
    await user.type(screen.getByLabelText('Notes'), ' more');
    await user.click(screen.getByRole('button', { name: 'Save to sheet' }));
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'This record changed in Google Sheets.');
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect((screen.getByLabelText('Notes') as HTMLTextAreaElement).value).toBe('Check ownership more');
  });

  it('creates a record in the current worksheet without calling the existing CRM APIs', async () => {
    const user = userEvent.setup();
    mount();
    await screen.findByText('302 Nika');
    await user.click(screen.getByRole('button', { name: 'Add record' }));
    await user.type(screen.getByLabelText('Address *'), 'New parcel');
    await user.click(screen.getByRole('button', { name: 'Save to sheet' }));
    await waitFor(() => expect(addSheetsCrmRow).toHaveBeenCalledWith(46204754, ['New parcel', '', '', '', '']));
    expect(updateSheetsCrmRow).not.toHaveBeenCalled();
  });
});
