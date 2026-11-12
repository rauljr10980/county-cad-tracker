const express = require('express');
const { getConnectionStatus, publicError } = require('../lib/googleSheets');
const { SPREADSHEET_ID, TABS, updateRow, addRow } = require('../lib/sheetsCrm');

function createSheetsCrmRouter({ authenticate, access, load, update = updateRow, add = addRow, status = getConnectionStatus, syncService } = {}) {
  syncService ??= require('../lib/sheetsSync').getSheetsSync();
  load ??= syncService.loadStoredTab;
  if (!authenticate || !access) {
    const { authenticateToken } = require('../middleware/auth');
    const { requireTabAccess } = require('../lib/tabAccess');
    authenticate ??= authenticateToken;
    access ??= requireTabAccess('sheetsCrm');
  }
  const router = express.Router();
  router.use(authenticate, access);
  router.use((req, res, next) => {
    if (['POST', 'PATCH'].includes(req.method) && !['ADMIN', 'OPERATOR'].includes(req.user.role)) return res.status(403).json({ error: 'Viewers cannot edit worksheet records.' });
    next();
  });
  router.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    if (req.headers['x-view-as-user'] && req.headers['x-view-as-user'] !== req.user.id) return res.status(403).json({ error: 'Exit teammate view to open the Government Hill CRM.' });
    next();
  });
  router.get('/', async (req, res) => {
    try { res.json({ ...status(), title: 'Government Hill', spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/edit`, tabs: TABS, sync: await syncService.getStatus() }); }
    catch { res.status(503).json({ error: 'Could not load the PostgreSQL import status.' }); }
  });
  router.post('/sync', async (req, res) => {
    try { res.json(await syncService.sync()); }
    catch { res.status(503).json({ error: 'The import could not finish. The previous imported data was kept.' }); }
  });
  const refreshAfterWrite = async (sheetId) => {
    // A source write already committed. Report a pending import rather than
    // a failed save, which could cause duplicate appends on a user retry.
    try {
      const result = await syncService.sync(sheetId);
      return { syncPending: result.busy || result.failed > 0 };
    } catch { return { syncPending: true }; }
  };
  router.get('/tabs/:sheetId/rows', async (req, res) => {
    try { res.json(await load(Number(req.params.sheetId))); }
    catch (error) { const safe = publicError(error); res.status(safe.status).json({ error: safe.message }); }
  });
  router.patch('/tabs/:sheetId/rows/:rowNumber', async (req, res) => {
    try {
      const sheetId = Number(req.params.sheetId);
      const result = await update(sheetId, Number(req.params.rowNumber), req.body);
      res.json({ ...result, ...await refreshAfterWrite(sheetId) });
    }
    catch (error) { const safe = publicError(error); res.status(safe.status).json({ error: safe.message }); }
  });
  router.post('/tabs/:sheetId/rows', async (req, res) => {
    try {
      const sheetId = Number(req.params.sheetId);
      const result = await add(sheetId, req.body);
      res.status(201).json({ ...result, ...await refreshAfterWrite(sheetId) });
    }
    catch (error) { const safe = publicError(error); res.status(safe.status).json({ error: safe.message }); }
  });
  return router;
}

module.exports = { createSheetsCrmRouter };
