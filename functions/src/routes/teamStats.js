const express = require('express');
const router = express.Router();
const { optionalAuth } = require('../middleware/auth');
const prisma = require('../lib/prisma');

// GET /api/team-stats — per-user stats across calls, D4D leads, follow-ups, notes, properties
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

    // Run all data queries in parallel
    const [
      monthCalls,
      monthLeads,
      allLeadsByUser,
      followUpsThisMonth,
      notesThisMonth,
      propertiesAssigned,
      allPreForeclosures,
    ] = await Promise.all([
      // Call logs this month with userId
      prisma.callLog.findMany({
        where: { calledAt: { gte: startOfMonth }, userId: { not: null } },
        select: { userId: true, calledAt: true },
      }),

      // D4D leads created this month
      prisma.drivingLead.findMany({
        where: { createdAt: { gte: startOfMonth }, createdById: { not: null } },
        select: { createdById: true, createdAt: true, status: true },
      }),

      // All-time D4D lead pipeline per user
      prisma.drivingLead.groupBy({
        by: ['createdById', 'status'],
        where: { createdById: { not: null } },
        _count: { id: true },
      }),

      // Follow-ups created this month (has createdById relation)
      prisma.followUp.findMany({
        where: { createdAt: { gte: startOfMonth } },
        select: {
          createdById: true,
          createdAt: true,
          completed: true,
          completedAt: true,
        },
      }),

      // Notes written this month
      prisma.note.findMany({
        where: { createdAt: { gte: startOfMonth } },
        select: { authorId: true, createdAt: true },
      }),

      // Properties currently assigned (by username string — best effort match)
      prisma.property.findMany({
        where: { assignedTo: { not: null } },
        select: { assignedTo: true },
      }),

      // Pre-foreclosure records with assignedTo + equity fields
      prisma.preForeclosure.findMany({
        where: { inactive: false, assignedTo: { not: null } },
        select: {
          assignedTo: true,
          loanAmount: true,
          appraisedValue: true,
        },
      }),
    ]);

    // Build username → id map for properties assigned (assignedTo is a string username)
    const usernameToId = {};
    users.forEach(u => { usernameToId[u.username.toLowerCase()] = u.id; });

    // Count properties assigned per userId
    const propertiesPerUser = {};
    propertiesAssigned.forEach(p => {
      const uid = usernameToId[(p.assignedTo || '').toLowerCase()];
      if (uid) propertiesPerUser[uid] = (propertiesPerUser[uid] || 0) + 1;
    });

    // Build per-user stats
    const userStats = users.map(user => {
      // Calls
      const userCalls = monthCalls.filter(c => c.userId === user.id);
      const callsToday = userCalls.filter(c => new Date(c.calledAt) >= startOfDay).length;
      const callsWeek  = userCalls.filter(c => new Date(c.calledAt) >= startOfWeek).length;
      const callsMonth = userCalls.length;

      // D4D leads
      const userLeads = monthLeads.filter(l => l.createdById === user.id);
      const leadsWeek  = userLeads.filter(l => new Date(l.createdAt) >= startOfWeek).length;
      const leadsMonth = userLeads.length;

      // Follow-ups
      const userFollowUps = followUpsThisMonth.filter(f => f.createdById === user.id);
      const followUpsCreatedWeek  = userFollowUps.filter(f => new Date(f.createdAt) >= startOfWeek).length;
      const followUpsCreatedMonth = userFollowUps.length;
      const followUpsCompletedWeek = userFollowUps.filter(f =>
        f.completed && f.completedAt && new Date(f.completedAt) >= startOfWeek
      ).length;
      const followUpsCompletedMonth = userFollowUps.filter(f => f.completed).length;

      // Notes written
      const userNotes = notesThisMonth.filter(n => n.authorId === user.id);
      const notesWeek  = userNotes.filter(n => new Date(n.createdAt) >= startOfWeek).length;
      const notesMonth = userNotes.length;

      // Properties assigned (all time, current)
      const propertiesCount = propertiesPerUser[user.id] || 0;

      // Pre-foreclosure research (matched by username string in assignedTo)
      const userPreFc = allPreForeclosures.filter(r =>
        r.assignedTo && r.assignedTo.toLowerCase() === user.username.toLowerCase()
      );
      const preForeclosureTotal = userPreFc.length;
      // Researched = has both loan amount AND appraised value filled in
      const researched = userPreFc.filter(r => r.loanAmount != null && r.appraisedValue != null);
      const preForeclosureResearched = researched.length;
      const preForeclosureWithEquity = researched.filter(r => r.appraisedValue > r.loanAmount).length;
      const preForeclosureUnderwater = researched.filter(r => r.loanAmount >= r.appraisedValue).length;

      // D4D pipeline (all time)
      const pipeline = {};
      allLeadsByUser
        .filter(r => r.createdById === user.id)
        .forEach(r => { pipeline[r.status] = r._count.id; });

      // Conversion rate: CONTACTED / total leads they added
      const totalLeads = Object.values(pipeline).reduce((s, n) => s + n, 0);
      const contactedLeads = (pipeline['CONTACTED'] || 0) + (pipeline['UNDER_CONTRACT'] || 0);
      const conversionRate = totalLeads > 0 ? Math.round((contactedLeads / totalLeads) * 100) : 0;

      return {
        id: user.id,
        username: user.username,
        role: user.role,
        calls: { today: callsToday, week: callsWeek, month: callsMonth },
        d4dLeads: { week: leadsWeek, month: leadsMonth, total: totalLeads },
        followUps: {
          createdWeek: followUpsCreatedWeek,
          createdMonth: followUpsCreatedMonth,
          completedWeek: followUpsCompletedWeek,
          completedMonth: followUpsCompletedMonth,
        },
        notes: { week: notesWeek, month: notesMonth },
        propertiesAssigned: propertiesCount,
        conversionRate,
        pipeline,
        preForeclosure: {
          total: preForeclosureTotal,
          researched: preForeclosureResearched,
          withEquity: preForeclosureWithEquity,
          underwater: preForeclosureUnderwater,
        },
      };
    });

    res.json(userStats);
  } catch (error) {
    console.error('[TEAM_STATS] Error:', error);
    res.status(500).json({ error: 'Failed to fetch team stats' });
  }
});

module.exports = router;
