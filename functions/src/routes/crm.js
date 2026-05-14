const express = require('express');
const router = express.Router();
const prisma = require('../lib/prisma');
const { authenticateToken } = require('../middleware/auth');

// GET /api/crm/state - fetch full CRM state
router.get('/state', authenticateToken, async (req, res) => {
  try {
    const [leads, deals, tasks, activities] = await Promise.all([
      prisma.crmLead.findMany({ orderBy: { createdAt: 'asc' } }),
      prisma.crmDeal.findMany({ orderBy: { createdAt: 'asc' } }),
      prisma.crmTask.findMany({ orderBy: { dueAt: 'asc' } }),
      prisma.crmActivity.findMany({ orderBy: { timestamp: 'asc' } }),
    ]);

    // Serialize dates to ISO strings to match frontend types
    const serializeLead = (l) => ({
      ...l,
      lastContactedAt: l.lastContactedAt ? l.lastContactedAt.toISOString() : null,
      createdAt: l.createdAt.toISOString(),
    });
    const serializeDeal = (d) => ({
      ...d,
      createdAt: d.createdAt.toISOString(),
      updatedAt: d.updatedAt.toISOString(),
    });
    const serializeTask = (t) => ({
      ...t,
      dueAt: t.dueAt.toISOString(),
      completedAt: t.completedAt ? t.completedAt.toISOString() : null,
      createdAt: t.createdAt.toISOString(),
    });
    const serializeActivity = (a) => ({
      ...a,
      timestamp: a.timestamp.toISOString(),
    });

    res.json({
      leads: leads.map(serializeLead),
      deals: deals.map(serializeDeal),
      tasks: tasks.map(serializeTask),
      activities: activities.map(serializeActivity),
      settings: {
        theme: 'dark',
        defaultRetailLetterCadenceDays: 90,
        defaultOpportunityOutreachMessage:
          "Hi, it was great meeting you. You mentioned you were thinking about buying — I'd love to sit down and chat to see how I can help. When would be a good time to connect?",
      },
    });
  } catch (err) {
    console.error('[CRM] GET /state error:', err);
    res.status(500).json({ error: 'Failed to load CRM state' });
  }
});

// PUT /api/crm/state - bulk sync full CRM state
router.put('/state', authenticateToken, async (req, res) => {
  const { leads = [], deals = [], tasks = [], activities = [] } = req.body;

  try {
    await prisma.$transaction(async (tx) => {
      const incomingLeadIds = leads.map((l) => l.id);
      const incomingDealIds = deals.map((d) => d.id);
      const incomingTaskIds = tasks.map((t) => t.id);
      const incomingActivityIds = activities.map((a) => a.id);

      // Delete records removed on the client
      await tx.crmActivity.deleteMany({ where: { id: { notIn: incomingActivityIds } } });
      await tx.crmTask.deleteMany({ where: { id: { notIn: incomingTaskIds } } });
      await tx.crmDeal.deleteMany({ where: { id: { notIn: incomingDealIds } } });
      await tx.crmLead.deleteMany({ where: { id: { notIn: incomingLeadIds } } });

      // Upsert leads
      for (const lead of leads) {
        const data = {
          businessName: lead.businessName ?? '',
          ownerName: lead.ownerName,
          jobTitleIndustry: lead.jobTitleIndustry ?? '',
          firm: lead.firm ?? '',
          phone: lead.phone ?? '',
          email: lead.email ?? '',
          industry: lead.industry ?? 'Other',
          city: lead.city ?? '',
          asset: lead.asset ?? '',
          specialization: lead.specialization ?? '',
          metPersonally: lead.metPersonally ?? '',
          source: lead.source ?? 'Referral',
          websiteStatus: lead.websiteStatus ?? 'This Month',
          connectionRating: lead.connectionRating ?? 'none',
          lastConversationNotes: lead.lastConversationNotes ?? '',
          notes: lead.notes ?? '',
          kind: lead.kind ?? 'industry',
          ageRange: lead.ageRange ?? null,
          letterCadenceDays: lead.letterCadenceDays ?? null,
          lastContactedAt: lead.lastContactedAt ? new Date(lead.lastContactedAt) : null,
          createdAt: new Date(lead.createdAt),
        };
        await tx.crmLead.upsert({ where: { id: lead.id }, create: { id: lead.id, ...data }, update: data });
      }

      // Upsert deals
      for (const deal of deals) {
        const data = {
          leadId: deal.leadId,
          stage: deal.stage ?? 'New Prospect',
          value: deal.value ?? 0,
          expectedCloseDate: deal.expectedCloseDate,
          probability: deal.probability ?? 20,
          createdAt: new Date(deal.createdAt),
        };
        await tx.crmDeal.upsert({ where: { id: deal.id }, create: { id: deal.id, ...data }, update: data });
      }

      // Upsert tasks
      for (const task of tasks) {
        const data = {
          leadId: task.leadId,
          type: task.type,
          dueAt: new Date(task.dueAt),
          completed: task.completed ?? false,
          completedAt: task.completedAt ? new Date(task.completedAt) : null,
          notes: task.notes ?? '',
          createdAt: task.createdAt ? new Date(task.createdAt) : new Date(),
        };
        await tx.crmTask.upsert({ where: { id: task.id }, create: { id: task.id, ...data }, update: data });
      }

      // Upsert activities
      for (const activity of activities) {
        const data = {
          leadId: activity.leadId,
          kind: activity.kind,
          body: activity.body,
          timestamp: new Date(activity.timestamp),
        };
        await tx.crmActivity.upsert({ where: { id: activity.id }, create: { id: activity.id, ...data }, update: data });
      }
    });

    res.json({ ok: true });
  } catch (err) {
    console.error('[CRM] PUT /state error:', err);
    res.status(500).json({ error: 'Failed to sync CRM state' });
  }
});

module.exports = router;
