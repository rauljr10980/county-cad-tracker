const express = require('express');
const router = express.Router();
const prisma = require('../lib/prisma');
const { authenticateToken } = require('../middleware/auth');
const {
  leadWhere,
  childWhere,
  leadDeleteWhere,
  childDeleteWhere,
  isEmptyPayloadBlocked,
  EMPTY_PAYLOAD_CODE,
  FOREIGN_ID_CODE,
} = require('../lib/crmScope');

// GET /api/crm/state - fetch full CRM state
router.get('/state', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const [leads, deals, tasks, activities] = await Promise.all([
      prisma.crmLead.findMany({ where: leadWhere(userId), orderBy: { createdAt: 'asc' } }),
      prisma.crmDeal.findMany({ where: childWhere(userId), orderBy: { createdAt: 'asc' } }),
      prisma.crmTask.findMany({ where: childWhere(userId), orderBy: { dueAt: 'asc' } }),
      prisma.crmActivity.findMany({ where: childWhere(userId), orderBy: { timestamp: 'asc' } }),
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

// Rejects a child payload (deals/tasks/activities) that references, by primary
// key, a row already owned by a different account. upsert() addresses rows by
// id alone, so without this check a client could send another account's
// child id and repoint its leadId onto its own lead.
async function assertChildrenOwned(tx, model, ids, userId) {
  if (!ids.length) return;
  const existing = await tx[model].findMany({
    where: { id: { in: ids } },
    select: { id: true, lead: { select: { userId: true } } },
  });
  const foreign = existing.some((row) => row.lead.userId !== userId);
  if (foreign) {
    const err = new Error('Payload references records owned by another account');
    err.code = FOREIGN_ID_CODE;
    throw err;
  }
}

// PUT /api/crm/state - bulk sync full CRM state
router.put('/state', authenticateToken, async (req, res) => {
  const { leads = [], deals = [], tasks = [], activities = [] } = req.body;
  const userId = req.user.id;

  try {
    await prisma.$transaction(async (tx) => {
      const incomingLeadIds = leads.map((l) => l.id);
      const incomingDealIds = deals.map((d) => d.id);
      const incomingTaskIds = tasks.map((t) => t.id);
      const incomingActivityIds = activities.map((a) => a.id);

      // Refuse a wipe caused by a failed load rather than a real edit.
      // Counted inside the transaction so the check and the deletes see the
      // same snapshot, and so throwing rolls back before anything is removed.
      if (leads.length === 0) {
        const existingLeads = await tx.crmLead.count({ where: leadWhere(userId) });
        if (isEmptyPayloadBlocked({ incomingLeads: 0, existingLeads })) {
          const err = new Error('Refusing to delete every lead on an empty payload');
          err.code = EMPTY_PAYLOAD_CODE;
          throw err;
        }
      }

      // Scoping the deletes stops cross-account wipes, but the upserts below
      // address rows by primary key alone. Without this check a client could
      // send another user's lead id and take ownership of that row.
      if (incomingLeadIds.length) {
        const existing = await tx.crmLead.findMany({
          where: { id: { in: incomingLeadIds } },
          select: { id: true, userId: true },
        });
        const foreign = existing.filter((row) => row.userId !== userId);
        if (foreign.length) {
          const err = new Error('Payload references leads owned by another account');
          err.code = FOREIGN_ID_CODE;
          throw err;
        }
      }

      // Every child must hang off a lead this caller will own. At this point
      // the lead foreign-id check above has proven every incoming lead id is
      // either the caller's own or new (about to be created, owned, by the
      // lead upsert loop below), so membership in incomingLeadIds is exactly
      // "a lead this caller will own." Without this, a payload could create
      // a child under another account's lead by leadId alone.
      const knownLeadIds = new Set(incomingLeadIds);
      const hasForeignLeadId = [...deals, ...tasks, ...activities].some(
        (child) => !knownLeadIds.has(child.leadId)
      );
      if (hasForeignLeadId) {
        const err = new Error('Payload references a lead not present in this save');
        err.code = FOREIGN_ID_CODE;
        throw err;
      }

      // A child id could still name a row another account already owns —
      // upsert() addresses rows by id alone, so that would update the
      // victim's row and repoint its leadId onto the caller's lead.
      await assertChildrenOwned(tx, 'crmDeal', incomingDealIds, userId);
      await assertChildrenOwned(tx, 'crmTask', incomingTaskIds, userId);
      await assertChildrenOwned(tx, 'crmActivity', incomingActivityIds, userId);

      // Delete records removed on the client, within this account only
      await tx.crmActivity.deleteMany({ where: childDeleteWhere(userId, incomingActivityIds) });
      await tx.crmTask.deleteMany({ where: childDeleteWhere(userId, incomingTaskIds) });
      await tx.crmDeal.deleteMany({ where: childDeleteWhere(userId, incomingDealIds) });
      await tx.crmLead.deleteMany({ where: leadDeleteWhere(userId, incomingLeadIds) });

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
        await tx.crmLead.upsert({
          where: { id: lead.id },
          create: { id: lead.id, userId, ...data },
          update: { ...data, userId },
        });
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
    if (err.code === EMPTY_PAYLOAD_CODE) {
      return res.status(409).json({
        error: 'Refusing to clear the CRM on an empty save. Reload and try again.',
      });
    }
    if (err.code === FOREIGN_ID_CODE) {
      return res.status(409).json({ error: err.message });
    }
    console.error('[CRM] PUT /state error:', err);
    res.status(500).json({ error: 'Failed to sync CRM state' });
  }
});

module.exports = router;
