// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSheetsSync, startSheetsSync, SYNC_INTERVAL_MS } from './sheetsSync.js';
import { TABS } from './sheetsCrm.js';

const grid = (sheetId, rows = [{ rowNumber: 2, version: 'v1', cells: [{ value: '123 Main St', editable: true }] }]) => ({ title: 'Workbook', tab: TABS.find(tab => tab.sheetId === sheetId), headers: ['Address'], rows, truncated: false });
function database() {
  const snapshots = new Map();
  const googleSheetSnapshot = {
    upsert: vi.fn(async ({ where, create, update }) => {
      const id = where.spreadsheetId_sheetId.sheetId;
      snapshots.set(id, snapshots.has(id) ? { ...snapshots.get(id), ...update } : { headers: [], rows: [], rowCount: 0, syncedAt: null, ...create });
    }),
    findUnique: vi.fn(async ({ where }) => snapshots.get(where.spreadsheetId_sheetId.sheetId)),
    findMany: vi.fn(async () => [...snapshots.values()]),
  };
  const lock = vi.fn().mockResolvedValue([{ locked: true }]);
  return { snapshots, googleSheetSnapshot, lock, $transaction: vi.fn(fn => fn({ googleSheetSnapshot, $queryRawUnsafe: lock })) };
}
afterEach(() => vi.useRealTimers());
describe('Google Sheets PostgreSQL import', () => {
  it('imports all worksheets and serves CRM rows from the stored copy without contacting Google', async () => {
    const db = database(), load = vi.fn(async id => grid(id));
    const sync = createSheetsSync({ db, load, now: () => new Date('2026-11-12T20:00:00Z') });
    expect(await sync.sync()).toMatchObject({ successful: 3, failed: 0, busy: false });
    expect(db.snapshots.size).toBe(3);
    load.mockClear();
    const result = await sync.loadStoredTab(TABS[0].sheetId);
    expect(result).toMatchObject({ storage: 'postgresql', rows: grid(TABS[0].sheetId).rows, refreshedAt: '2026-11-12T20:00:00.000Z' });
    expect(load).not.toHaveBeenCalled();
  });
  it('reflects new, edited, moved and removed source rows without accumulating duplicates', async () => {
    const db = database(), load = vi.fn(async id => grid(id));
    const sync = createSheetsSync({ db, load }); const id = TABS[0].sheetId;
    await sync.sync();
    load.mockImplementation(async id => grid(id, [{ rowNumber: 2, version: 'v2', cells: [{ value: 'New parcel' }] }, { rowNumber: 3, version: 'v3', cells: [{ value: '123 Main St updated' }] }]));
    await sync.sync(); await sync.sync();
    expect(db.snapshots.size).toBe(3);
    expect(db.snapshots.get(id).rowCount).toBe(2);
    load.mockImplementation(async id => grid(id, []));
    await sync.sync();
    expect((await sync.loadStoredTab(id)).rows).toEqual([]);
  });
  it('keeps the last successful rows and timestamp when a later source read fails', async () => {
    const db = database(), load = vi.fn(async id => grid(id));
    const sync = createSheetsSync({ db, load }); const id = TABS[0].sheetId;
    await sync.sync(); const before = { ...db.snapshots.get(id) };
    load.mockImplementation(async sourceId => { if (sourceId === id) throw new Error('Untrusted provider error'); return grid(sourceId); });
    expect(await sync.sync()).toMatchObject({ successful: 2, failed: 1 });
    expect(db.snapshots.get(id)).toMatchObject({ rows: before.rows, syncedAt: before.syncedAt, lastError: 'Could not reach Google Sheets. Please try again.' });
    expect((await sync.getStatus()).worksheets[0]).toMatchObject({ rowCount: 1, lastError: 'Could not reach Google Sheets. Please try again.' });
  });
  it('does not replace good data with a truncated import', async () => {
    const db = database(), load = vi.fn(async id => grid(id));
    const sync = createSheetsSync({ db, load }); const id = TABS[0].sheetId;
    await sync.sync();
    load.mockResolvedValue({ ...grid(id, []), truncated: true });
    expect(await sync.sync(id)).toMatchObject({ successful: 0, failed: 1 });
    expect(db.snapshots.get(id).rowCount).toBe(1);
    expect(db.snapshots.get(id).lastError).toContain('50,000-row');
  });
  it('skips an overlapping replica using a PostgreSQL advisory lock', async () => {
    const db = database(), load = vi.fn(); db.lock.mockResolvedValue([{ locked: false }]);
    const sync = createSheetsSync({ db, load });
    expect(await sync.sync()).toMatchObject({ busy: true });
    expect(load).not.toHaveBeenCalled();
  });
  it('reports a pending first import and rejects unknown worksheets', async () => {
    const sync = createSheetsSync({ db: database() });
    await expect(sync.loadStoredTab(TABS[0].sheetId)).rejects.toMatchObject({ status: 503 });
    await expect(sync.loadStoredTab(123)).rejects.toMatchObject({ status: 404 });
  });
  it('runs on startup and every five minutes without an open browser', async () => {
    vi.useFakeTimers();
    const service = { sync: vi.fn().mockResolvedValue({ successful: 3, failed: 0, busy: false }) };
    const stop = startSheetsSync({ syncService: service, configured: () => true });
    expect(service.sync).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(SYNC_INTERVAL_MS);
    expect(service.sync).toHaveBeenCalledTimes(2);
    stop(); await vi.advanceTimersByTimeAsync(SYNC_INTERVAL_MS);
    expect(service.sync).toHaveBeenCalledTimes(2);
  });
});
