const express = require('express');
const router = express.Router();
const prisma = require('../lib/prisma');
const { authenticateToken } = require('../middleware/auth');
const {
  isQueryTooShort,
  mapPropertyResult,
  mapPreForeclosureResult,
  mapCrmLeadResult,
  mapMlsLeadResult,
} = require('../lib/searchResults');

router.use(authenticateToken);

// Property and PreForeclosure are shared/team-wide today (not yet scoped to
// userId — see the data-isolation epic noted in this phase's spec). CrmLead
// and MlsLead already are. This matches, not invents, the app's current
// per-model scoping.
router.get('/', async (req, res) => {
  const q = req.query.q;
  if (isQueryTooShort(q)) return res.json({ results: [] });

  const contains = { contains: q.trim(), mode: 'insensitive' };
  const userId = req.user.id;

  try {
    const [properties, preforeclosures, crmLeads, mlsLeads] = await Promise.all([
      prisma.property.findMany({
        where: { OR: [{ propertyAddress: contains }, { ownerName: contains }, { accountNumber: contains }] },
        take: 5,
        select: { id: true, propertyAddress: true, ownerName: true },
      }),
      prisma.preForeclosure.findMany({
        where: { OR: [{ address: contains }, { city: contains }, { documentNumber: contains }] },
        take: 5,
        select: { id: true, address: true, city: true },
      }),
      prisma.crmLead.findMany({
        where: { userId, OR: [{ ownerName: contains }, { businessName: contains }, { phone: contains }, { email: contains }, { streetAddress: contains }] },
        take: 5,
        select: { id: true, ownerName: true, businessName: true, phone: true, email: true },
      }),
      prisma.mlsLead.findMany({
        where: { userId, hidden: false, address: contains },
        take: 5,
        select: { id: true, address: true, status: true },
      }),
    ]);

    const results = [
      ...properties.map(mapPropertyResult),
      ...preforeclosures.map(mapPreForeclosureResult),
      ...crmLeads.map(mapCrmLeadResult),
      ...mlsLeads.map(mapMlsLeadResult),
    ];
    res.json({ results });
  } catch (error) {
    console.error('[SEARCH] Failed:', error);
    res.status(500).json({ error: 'Search failed' });
  }
});

module.exports = router;
