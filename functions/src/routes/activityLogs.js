const express = require('express');
const router = express.Router();
const { optionalAuth } = require('../middleware/auth');
const prisma = require('../lib/prisma');
const { createCalendarEvent } = require('../lib/googleCalendar');

const VALID_TYPES = ['CONTACT_MADE', 'APPOINTMENT_SET', 'CONTRACT_SIGNED'];

// POST /api/activity-logs — record a contact, appointment, or contract
router.post('/', optionalAuth, async (req, res) => {
  try {
    const { type, propertyId, drivingLeadId, notes } = req.body;
    if (!VALID_TYPES.includes(type)) {
      return res.status(400).json({ error: `Invalid type. Must be one of: ${VALID_TYPES.join(', ')}` });
    }
    const log = await prisma.activityLog.create({
      data: {
        type,
        propertyId: propertyId || null,
        drivingLeadId: drivingLeadId || null,
        notes: notes || null,
        userId: req.user?.id || null,
      },
    });
    // Create calendar event for appointments and contracts
    if (type === 'APPOINTMENT_SET' || type === 'CONTRACT_SIGNED') {
      const label = type === 'CONTRACT_SIGNED' ? 'Contract Signed' : 'Appointment';
      createCalendarEvent({
        title: `${label}${notes ? `: ${notes}` : ''}`,
        description: notes || '',
        start: new Date(),
      });
    }

    res.json(log);
  } catch (error) {
    console.error('[ACTIVITY_LOGS] Error logging activity:', error);
    res.status(500).json({ error: 'Failed to log activity' });
  }
});

// GET /api/activity-logs/stats — counts by type for current user (or all if admin)
router.get('/stats', optionalAuth, async (req, res) => {
  try {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const logs = await prisma.activityLog.findMany({
      where: { createdAt: { gte: startOfMonth } },
      select: { type: true, userId: true },
    });

    const counts = { CONTACT_MADE: 0, APPOINTMENT_SET: 0, CONTRACT_SIGNED: 0 };
    logs.forEach(l => { if (counts[l.type] !== undefined) counts[l.type]++; });

    res.json(counts);
  } catch (error) {
    console.error('[ACTIVITY_LOGS] Stats error:', error);
    res.status(500).json({ error: 'Failed to fetch activity stats' });
  }
});

module.exports = router;
