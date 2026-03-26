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

module.exports = router;
