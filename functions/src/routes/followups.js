const express = require('express');
const router = express.Router();
const { authenticateToken, optionalAuth } = require('../middleware/auth');
const prisma = require('../lib/prisma');

// GET /api/followups?month=2026-02
router.get('/', optionalAuth, async (req, res) => {
  try {
    const { month } = req.query;
    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({ error: 'month query param required (YYYY-MM format)' });
    }

    const [year, mon] = month.split('-').map(Number);
    const startDate = new Date(year, mon - 1, 1);
    const endDate = new Date(year, mon, 1);

    const followUps = await prisma.followUp.findMany({
      where: {
        date: { gte: startDate, lt: endDate },
      },
      include: {
        property: {
          select: {
            id: true,
            propertyAddress: true,
            ownerName: true,
            workflowStage: true,
            status: true,
          },
        },
        preForeclosure: {
          select: {
            id: true,
            documentNumber: true,
            address: true,
            city: true,
            zip: true,
            ownerName: true,
            workflowStage: true,
            type: true,
          },
        },
        createdBy: {
          select: { id: true, username: true },
        },
      },
      orderBy: { date: 'asc' },
    });

    res.json(followUps);
  } catch (error) {
    console.error('[FOLLOWUPS] Fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch follow-ups' });
  }
});

// POST /api/followups
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { date, note, propertyId, documentNumber } = req.body;

    if (!date) {
      return res.status(400).json({ error: 'date is required' });
    }
    if (!propertyId && !documentNumber) {
      return res.status(400).json({ error: 'propertyId or documentNumber is required' });
    }

    let preforeclosureId = null;
    if (documentNumber) {
      const pf = await prisma.preForeclosure.findUnique({
        where: { documentNumber },
        select: { id: true },
      });
      if (!pf) {
        return res.status(404).json({ error: 'Pre-foreclosure record not found' });
      }
      preforeclosureId = pf.id;
    }

    const followUp = await prisma.followUp.create({
      data: {
        date: new Date(date),
        note: note || null,
        propertyId: propertyId || null,
        preforeclosureId: preforeclosureId,
        createdById: req.user.id,
      },
      include: {
        property: { select: { id: true, propertyAddress: true, ownerName: true, workflowStage: true } },
        preForeclosure: { select: { id: true, documentNumber: true, address: true, workflowStage: true } },
        createdBy: { select: { id: true, username: true } },
      },
    });

    res.status(201).json(followUp);
  } catch (error) {
    console.error('[FOLLOWUPS] Create error:', error);
    res.status(500).json({ error: 'Failed to create follow-up' });
  }
});

// PUT /api/followups/:id
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { completed, note, date } = req.body;

    const existing = await prisma.followUp.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ error: 'Follow-up not found' });
    }

    const updateData = {};
    if (completed !== undefined) {
      updateData.completed = completed;
      updateData.completedAt = completed ? new Date() : null;
    }
    if (note !== undefined) updateData.note = note;
    if (date !== undefined) updateData.date = new Date(date);

    const updated = await prisma.followUp.update({
      where: { id },
      data: updateData,
      include: {
        property: { select: { id: true, propertyAddress: true, ownerName: true, workflowStage: true } },
        preForeclosure: { select: { id: true, documentNumber: true, address: true, workflowStage: true } },
        createdBy: { select: { id: true, username: true } },
      },
    });

    res.json(updated);
  } catch (error) {
    console.error('[FOLLOWUPS] Update error:', error);
    res.status(500).json({ error: 'Failed to update follow-up' });
  }
});

// DELETE /api/followups/:id
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    const existing = await prisma.followUp.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ error: 'Follow-up not found' });
    }

    await prisma.followUp.delete({ where: { id } });
    res.json({ success: true });
  } catch (error) {
    console.error('[FOLLOWUPS] Delete error:', error);
    res.status(500).json({ error: 'Failed to delete follow-up' });
  }
});

module.exports = router;
