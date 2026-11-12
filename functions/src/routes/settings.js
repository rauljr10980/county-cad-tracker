/**
 * Account-wide settings an ADMIN controls for the whole team.
 *
 * tabMembers stores per-tab subscriber IDs. hiddenTabs remains the legacy
 * default for tabs without an explicit membership list. Only managers can
 * read the full assignment grid or change it; teammates get their own tabs.
 */

const express = require('express');
const { readTabSettings, hiddenTabsFor, validateTabMembers } = require('../lib/tabAccess');

function createSettingsRouter({ db, authenticate, admin, viewAs } = {}) {
  const prisma = db ?? require('../lib/prisma');
  if (!authenticate || !admin) {
    const { authenticateToken, requireRole } = require('../middleware/auth');
    authenticate ??= authenticateToken;
    admin ??= requireRole('ADMIN');
  }
  viewAs ??= require('../middleware/viewAs').resolveViewAs;
  const router = express.Router();

  const HIDDEN_TABS_KEY = 'hiddenTabs';

  router.use(authenticate);

  router.get('/hidden-tabs', viewAs, async (req, res) => {
    try {
      res.set('Cache-Control', 'no-store');
      const hiddenTabs = hiddenTabsFor(await readTabSettings(prisma), req.effectiveUserId);
      res.json({ hiddenTabs });
    } catch (error) {
      console.error('[SETTINGS] Failed to read hidden tabs:', error);
      res.status(500).json({ error: 'Failed to load tab settings' });
    }
  });

  router.get('/tab-members', admin, async (req, res) => {
    try {
      res.set('Cache-Control', 'no-store');
      const [settings, users] = await Promise.all([
        readTabSettings(prisma),
        prisma.user.findMany({ where: { isActive: true }, select: { id: true, username: true, role: true }, orderBy: { username: 'asc' } }),
      ]);
      res.json({ ...settings, users });
    } catch { res.status(500).json({ error: 'Could not load team tab assignments.' }); }
  });

  router.put('/tab-members', admin, async (req, res) => {
    try {
      const users = await prisma.user.findMany({ where: { isActive: true }, select: { id: true } });
      let tabMembers;
      try { tabMembers = validateTabMembers(req.body?.tabMembers, users); }
      catch (error) { return res.status(400).json({ error: error.message }); }
      await prisma.appSetting.upsert({ where: { key: 'tabMembers' }, create: { key: 'tabMembers', value: JSON.stringify(tabMembers) }, update: { value: JSON.stringify(tabMembers) } });
      res.json({ success: true });
    } catch { res.status(500).json({ error: 'Could not save team tab assignments.' }); }
  });

  router.put('/hidden-tabs', admin, async (req, res) => {
    const { hiddenTabs } = req.body;
    if (!Array.isArray(hiddenTabs) || !hiddenTabs.every((id) => typeof id === 'string')) {
      return res.status(400).json({ error: 'hiddenTabs must be an array of strings' });
    }

    try {
      await prisma.appSetting.upsert({
        where: { key: HIDDEN_TABS_KEY },
        create: { key: HIDDEN_TABS_KEY, value: JSON.stringify(hiddenTabs) },
        update: { value: JSON.stringify(hiddenTabs) },
      });
      res.json({ hiddenTabs });
    } catch (error) {
      console.error('[SETTINGS] Failed to save hidden tabs:', error);
      res.status(500).json({ error: 'Failed to save tab settings' });
    }
  });

  return router;
}
module.exports = { createSettingsRouter };
