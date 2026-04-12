const express = require('express');
const router = express.Router();
const { optionalAuth } = require('../middleware/auth');
const prisma = require('../lib/prisma');

// GET /api/team-stats — per-user call counts + D4D lead counts + pipeline breakdown
router.get('/', optionalAuth, async (req, res) => {
  try {
    const now = new Date();

    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);

    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());
    startOfWeek.setHours(0, 0, 0, 0);

    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    // Get all users
    const users = await prisma.user.findMany({
      select: { id: true, username: true, role: true },
      orderBy: { username: 'asc' },
    });

    // Get all call logs for the month (one query, group in JS)
    const monthCalls = await prisma.callLog.findMany({
      where: { calledAt: { gte: startOfMonth }, userId: { not: null } },
      select: { userId: true, calledAt: true },
    });

    // Get all D4D leads created this month
    const monthLeads = await prisma.drivingLead.findMany({
      where: { createdAt: { gte: startOfMonth }, createdById: { not: null } },
      select: { createdById: true, createdAt: true, status: true },
    });

    // Build per-user stats
    const userStats = users.map(user => {
      const userCalls = monthCalls.filter(c => c.userId === user.id);
      const callsToday = userCalls.filter(c => new Date(c.calledAt) >= startOfDay).length;
      const callsWeek  = userCalls.filter(c => new Date(c.calledAt) >= startOfWeek).length;
      const callsMonth = userCalls.length;

      const userLeads = monthLeads.filter(l => l.createdById === user.id);
      const leadsWeek  = userLeads.filter(l => new Date(l.createdAt) >= startOfWeek).length;
      const leadsMonth = userLeads.length;

      // Pipeline breakdown for ALL their leads (not just this month)
      return {
        id: user.id,
        username: user.username,
        role: user.role,
        calls: { today: callsToday, week: callsWeek, month: callsMonth },
        d4dLeads: { week: leadsWeek, month: leadsMonth },
      };
    });

    // Get total pipeline breakdown per user (all time) — separate query
    const allLeadsByUser = await prisma.drivingLead.groupBy({
      by: ['createdById', 'status'],
      where: { createdById: { not: null } },
      _count: { id: true },
    });

    // Attach pipeline to each user
    const result = userStats.map(u => {
      const pipeline = {};
      allLeadsByUser
        .filter(r => r.createdById === u.id)
        .forEach(r => { pipeline[r.status] = r._count.id; });
      return { ...u, pipeline };
    });

    res.json(result);
  } catch (error) {
    console.error('[TEAM_STATS] Error:', error);
    res.status(500).json({ error: 'Failed to fetch team stats' });
  }
});

module.exports = router;
