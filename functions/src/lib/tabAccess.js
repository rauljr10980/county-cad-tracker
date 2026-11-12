const TAB_IDS = ['dashboard', 'calendar', 'properties', 'preforeclosure', 'crm', 'sheetsCrm', 'driving', 'evictions', 'mls', 'inbox', 'publicSite'];
const DEFAULT_HIDDEN = ['dashboard'];

async function readTabSettings(db) {
  const rows = await db.appSetting.findMany({ where: { key: { in: ['hiddenTabs', 'tabMembers'] } } });
  const values = Object.fromEntries(rows.map(row => [row.key, JSON.parse(row.value)]));
  return { hiddenTabs: values.hiddenTabs ?? DEFAULT_HIDDEN, tabMembers: values.tabMembers ?? {} };
}

function hiddenTabsFor(settings, userId) {
  const hidden = new Set(settings.hiddenTabs);
  for (const [tab, ids] of Object.entries(settings.tabMembers)) {
    if (ids.includes(userId)) hidden.delete(tab); else hidden.add(tab);
  }
  return [...hidden];
}

async function canAccessTab(db, userId, tab) {
  return !hiddenTabsFor(await readTabSettings(db), userId).includes(tab);
}

function requireTabAccess(tab, db) {
  return async (req, res, next) => {
    try {
      db ??= require('./prisma');
      if (!await canAccessTab(db, req.effectiveUserId ?? req.user.id, tab)) return res.status(403).json({ error: 'You are not subscribed to this tab. Ask a manager to enable it.' });
      next();
    } catch { res.status(500).json({ error: 'Could not verify tab access.' }); }
  };
}

function validateTabMembers(value, users) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Choose team members for each tab.');
  const validIds = new Set(users.map(user => user.id));
  for (const [tab, ids] of Object.entries(value)) {
    if (!TAB_IDS.includes(tab) || !Array.isArray(ids) || ids.some(id => typeof id !== 'string' || !validIds.has(id)) || new Set(ids).size !== ids.length) throw new Error('Choose valid team members for each tab.');
  }
  if (TAB_IDS.some(tab => !Object.hasOwn(value, tab))) throw new Error('Include assignments for every tab.');
  return value;
}

module.exports = { TAB_IDS, readTabSettings, hiddenTabsFor, canAccessTab, requireTabAccess, validateTabMembers };
