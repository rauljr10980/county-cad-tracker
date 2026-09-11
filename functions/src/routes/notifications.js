const express = require('express');
const router = express.Router();
const prisma = require('../lib/prisma');
const { authenticateToken } = require('../middleware/auth');
const { mapFollowUpNotification, mapInboxNotification, sortByTimestampDesc } = require('../lib/notificationFeed');

router.use(authenticateToken);

// Unscoped by userId, matching FollowUp/PublicSubmission's existing
// team-wide visibility elsewhere in the app (see functions/src/routes/followups.js,
// which also doesn't filter by user) — this is not new sharing, it mirrors
// what's already true.
router.get('/', async (req, res) => {
  try {
    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999);

    const [dueFollowUps, newSubmissions] = await Promise.all([
      prisma.followUp.findMany({
        where: { completed: false, date: { lte: endOfToday } },
        orderBy: { date: 'asc' },
        take: 5,
        include: {
          property: { select: { propertyAddress: true } },
          preForeclosure: { select: { address: true } },
          drivingLead: { select: { rawAddress: true } },
        },
      }),
      prisma.publicSubmission.findMany({
        where: { status: 'new' },
        orderBy: { createdAt: 'desc' },
        take: 5,
      }),
    ]);

    const notifications = sortByTimestampDesc([
      ...dueFollowUps.map(mapFollowUpNotification),
      ...newSubmissions.map(mapInboxNotification),
    ]).slice(0, 10);

    res.json({ notifications, count: dueFollowUps.length + newSubmissions.length });
  } catch (error) {
    console.error('[NOTIFICATIONS] Failed:', error);
    res.status(500).json({ error: 'Failed to load notifications' });
  }
});

module.exports = router;
