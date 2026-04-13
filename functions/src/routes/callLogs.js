const express = require('express');
const router = express.Router();
const { optionalAuth } = require('../middleware/auth');
const prisma = require('../lib/prisma');

// POST /api/call-logs — record a call
router.post('/', optionalAuth, async (req, res) => {
  try {
    const { propertyId, drivingLeadId, phoneNumber } = req.body;
    const log = await prisma.callLog.create({
      data: {
        propertyId: propertyId || null,
        drivingLeadId: drivingLeadId || null,
        phoneNumber: phoneNumber || null,
        userId: req.user?.id || null,
      },
    });
    res.json(log);
  } catch (error) {
    console.error('[CALL_LOGS] Error logging call:', error);
    res.status(500).json({ error: 'Failed to log call' });
  }
});

// GET /api/call-logs/stats — daily / weekly / monthly counts
router.get('/stats', optionalAuth, async (req, res) => {
  try {
    const now = new Date();

    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);

    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay()); // Sunday
    startOfWeek.setHours(0, 0, 0, 0);

    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [daily, weekly, monthly] = await Promise.all([
      prisma.callLog.count({ where: { calledAt: { gte: startOfDay } } }),
      prisma.callLog.count({ where: { calledAt: { gte: startOfWeek } } }),
      prisma.callLog.count({ where: { calledAt: { gte: startOfMonth } } }),
    ]);

    res.json({ daily, weekly, monthly });
  } catch (error) {
    console.error('[CALL_LOGS] Error fetching stats:', error);
    res.status(500).json({ error: 'Failed to fetch call stats' });
  }
});

// GET /api/call-logs/activity — calls per day for the last 14 days, broken down by user
router.get('/activity', optionalAuth, async (req, res) => {
  try {
    const now = new Date();
    const since = new Date(now);
    since.setDate(now.getDate() - 13); // 14 days including today
    since.setHours(0, 0, 0, 0);

    const logs = await prisma.callLog.findMany({
      where: { calledAt: { gte: since } },
      select: { calledAt: true, userId: true, user: { select: { username: true } } },
      orderBy: { calledAt: 'asc' },
    });

    // Build a map: date string → { total, perUser: { username: count } }
    const days = {};
    for (let i = 0; i < 14; i++) {
      const d = new Date(since);
      d.setDate(since.getDate() + i);
      const key = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      days[key] = { date: key, total: 0 };
    }

    for (const log of logs) {
      const key = new Date(log.calledAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      if (!days[key]) continue;
      days[key].total++;
      const name = log.user?.username || 'Unknown';
      days[key][name] = (days[key][name] || 0) + 1;
    }

    res.json(Object.values(days));
  } catch (error) {
    console.error('[CALL_LOGS] Activity error:', error);
    res.status(500).json({ error: 'Failed to fetch call activity' });
  }
});

module.exports = router;
