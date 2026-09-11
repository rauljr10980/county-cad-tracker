/**
 * Account-wide settings an ADMIN controls for the whole team.
 *
 * Currently just hiddenTabs (which nav tabs the team sees), stored as one
 * AppSetting row keyed 'hiddenTabs' with a JSON array value. Any signed-in
 * user can read it — the nav has to render correctly for everyone — but only
 * an ADMIN can change it.
 */

const express = require('express');
const router = express.Router();
const prisma = require('../lib/prisma');
const { authenticateToken, requireRole } = require('../middleware/auth');

const HIDDEN_TABS_KEY = 'hiddenTabs';
// Matches the hardcoded default this replaced (src/components/layout/navItems.ts's
// old HIDDEN_TABS constant) so first load behaves the same until an admin
// changes it.
const DEFAULT_HIDDEN_TABS = ['dashboard'];

router.use(authenticateToken);

router.get('/hidden-tabs', async (req, res) => {
  try {
    const row = await prisma.appSetting.findUnique({ where: { key: HIDDEN_TABS_KEY } });
    const hiddenTabs = row ? JSON.parse(row.value) : DEFAULT_HIDDEN_TABS;
    res.json({ hiddenTabs });
  } catch (error) {
    console.error('[SETTINGS] Failed to read hidden tabs:', error);
    res.status(500).json({ error: 'Failed to load tab settings' });
  }
});

router.put('/hidden-tabs', requireRole('ADMIN'), async (req, res) => {
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

module.exports = router;
