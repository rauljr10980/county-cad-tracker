const express = require('express');
const { getConnectionStatus, publicError } = require('../lib/googleSheets');
const { SPREADSHEET_ID, TABS, loadTab, updateRow, addRow } = require('../lib/sheetsCrm');

function createSheetsCrmRouter({ authenticate, access, load = loadTab, update = updateRow, add = addRow, status = getConnectionStatus } = {}) {
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
  router.get('/', (req, res) => res.json({ ...status(), title: 'Government Hill', spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/edit`, tabs: TABS }));
  router.get('/tabs/:sheetId/rows', async (req, res) => {
    try { res.json(await load(Number(req.params.sheetId))); }
    catch (error) { const safe = publicError(error); res.status(safe.status).json({ error: safe.message }); }
  });
  router.patch('/tabs/:sheetId/rows/:rowNumber', async (req, res) => {
    try { res.json(await update(Number(req.params.sheetId), Number(req.params.rowNumber), req.body)); }
    catch (error) { const safe = publicError(error); res.status(safe.status).json({ error: safe.message }); }
  });
  router.post('/tabs/:sheetId/rows', async (req, res) => {
    try { res.status(201).json(await add(Number(req.params.sheetId), req.body)); }
    catch (error) { const safe = publicError(error); res.status(safe.status).json({ error: safe.message }); }
  });
  return router;
}

module.exports = { createSheetsCrmRouter };
