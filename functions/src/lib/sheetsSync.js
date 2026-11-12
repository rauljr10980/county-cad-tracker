const { SPREADSHEET_ID, TABS, loadTab, allowedTab } = require('./sheetsCrm');
const { SheetsError, publicError, getConnectionStatus } = require('./googleSheets');

const SYNC_INTERVAL_MS = 5 * 60 * 1000;
const SYNC_LOCK_ID = 360462047;

function createSheetsSync({ db, load = loadTab, now = () => new Date() }) {
  let inFlight = null;
  const whereFor = sheetId => ({ spreadsheetId_sheetId: { spreadsheetId: SPREADSHEET_ID, sheetId } });

  async function sync(sheetId) {
    if (sheetId != null) allowedTab(sheetId);
    if (inFlight) return { busy: true, successful: 0, failed: 0 };
    inFlight = db.$transaction(async tx => {
      // PostgreSQL's transaction lock also prevents overlap across API replicas.
      const [lock] = await tx.$queryRawUnsafe('SELECT pg_try_advisory_xact_lock($1::integer) AS locked', SYNC_LOCK_ID);
      if (!lock.locked) return { busy: true, successful: 0, failed: 0 };
      const result = { busy: false, successful: 0, failed: 0 };
      for (const tab of TABS.filter(tab => sheetId == null || tab.sheetId === sheetId)) {
        const attemptedAt = now();
        let grid;
        try {
          grid = await load(tab.sheetId);
          // Never label a partial read as a complete import or replace good data
          // with a clipped copy if the source grows beyond the supported bound.
          if (grid.truncated) throw new SheetsError('This worksheet exceeds the 50,000-row import limit. The previous imported copy was kept.', 409);
        } catch (error) {
          const lastError = publicError(error).message;
          await tx.googleSheetSnapshot.upsert({
            where: whereFor(tab.sheetId),
            create: { spreadsheetId: SPREADSHEET_ID, sheetId: tab.sheetId, tabTitle: tab.title, lastAttemptAt: attemptedAt, lastError },
            update: { lastAttemptAt: attemptedAt, lastError },
          });
          result.failed++;
          continue;
        }
        const data = {
          workbookTitle: grid.title, tabTitle: grid.tab.title, headers: grid.headers,
          rows: grid.rows, rowCount: grid.rows.length, syncedAt: now(), lastAttemptAt: attemptedAt, lastError: null,
        };
        await tx.googleSheetSnapshot.upsert({ where: whereFor(tab.sheetId), create: { spreadsheetId: SPREADSHEET_ID, sheetId: tab.sheetId, ...data }, update: data });
        result.successful++;
      }
      return result;
    }, { timeout: 180000, maxWait: 5000 });
    try { return await inFlight; }
    finally { inFlight = null; }
  }

  async function loadStoredTab(sheetId) {
    const tab = allowedTab(sheetId);
    const row = await db.googleSheetSnapshot.findUnique({ where: whereFor(sheetId) });
    if (!row?.syncedAt) throw new SheetsError(row?.lastError || 'The first import has not finished. Click Sync now to load this worksheet.', 503);
    return {
      title: row.workbookTitle, tab: { ...tab, title: row.tabTitle }, headers: row.headers, rows: row.rows,
      truncated: false, refreshedAt: row.syncedAt.toISOString(), storage: 'postgresql',
      lastError: row.lastError, lastAttemptAt: row.lastAttemptAt?.toISOString() ?? null,
    };
  }

  async function getStatus() {
    const rows = await db.googleSheetSnapshot.findMany({ where: { spreadsheetId: SPREADSHEET_ID }, select: { sheetId: true, rowCount: true, syncedAt: true, lastAttemptAt: true, lastError: true } });
    return { storage: 'postgresql', autoSyncMinutes: SYNC_INTERVAL_MS / 60000, busy: Boolean(inFlight), worksheets: TABS.map(tab => ({ ...tab, rowCount: 0, syncedAt: null, lastAttemptAt: null, lastError: null, ...rows.find(row => row.sheetId === tab.sheetId) })) };
  }
  return { sync, loadStoredTab, getStatus };
}

let service;
function getSheetsSync() {
  return service ??= createSheetsSync({ db: require('./prisma') });
}

function startSheetsSync({ syncService, configured = () => getConnectionStatus().configured } = {}) {
  const run = async () => {
    if (!configured()) return;
    try {
      const result = await (syncService ?? getSheetsSync()).sync();
      console.log(`[SHEETS-SYNC] successful=${result.successful} failed=${result.failed} busy=${result.busy}`);
    } catch (error) { console.error('[SHEETS-SYNC] Import could not finish:', error.code || 'database unavailable'); }
  };
  void run();
  const timer = setInterval(run, SYNC_INTERVAL_MS);
  timer.unref?.();
  return () => clearInterval(timer);
}

module.exports = { createSheetsSync, getSheetsSync, startSheetsSync, SYNC_INTERVAL_MS };
