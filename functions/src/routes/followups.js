const express = require('express');
const router = express.Router();
const { authenticateToken, optionalAuth } = require('../middleware/auth');
const { resolveViewAs } = require('../middleware/viewAs');
const prisma = require('../lib/prisma');
const { createCalendarEvent } = require('../lib/googleCalendar');
const { calendarVisibility, canManageAppointment } = require('../lib/appointments');

// GET /api/followups?month=2026-02
// Personal follow-ups stay scoped to their owner; team appointments are visible
// to every authenticated teammate. Managers retain the full monthly overview.
router.get('/', authenticateToken, resolveViewAs, async (req, res) => {
  try {
    const { month } = req.query;
    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({ error: 'month query param required (YYYY-MM format)' });
    }

    const [year, mon] = month.split('-').map(Number);
    if (mon < 1 || mon > 12) return res.status(400).json({ error: 'Invalid calendar month.' });
    const startDate = req.query.start ? new Date(req.query.start) : new Date(year, mon - 1, 1);
    const endDate = req.query.end ? new Date(req.query.end) : new Date(year, mon, 1);
    if (!Number.isFinite(startDate.getTime()) || !Number.isFinite(endDate.getTime()) || endDate <= startDate || endDate - startDate > 35 * 86400000) return res.status(400).json({ error: 'Invalid calendar range.' });

    const followUps = await prisma.followUp.findMany({
      where: {
        date: { gte: startDate, lt: endDate },
        // View-as scopes personal follow-ups while retaining shared appointments.
        ...calendarVisibility(req.user, req.effectiveUserId),
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
        drivingLead: {
          select: {
            id: true,
            rawAddress: true,
            street: true,
            city: true,
            state: true,
            zip: true,
            ownerName: true,
            status: true,
            notes: true,
            phoneNumbers: true,
            ownerPhoneIndex: true,
            emails: true,
            contacts: true,
            latitude: true,
            longitude: true,
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

// GET /api/followups/d4d - All follow-ups for D4$ leads (no month filter)
router.get('/d4d', optionalAuth, async (req, res) => {
  try {
    const followUps = await prisma.followUp.findMany({
      where: { drivingLeadId: { not: null } },
      select: {
        id: true,
        date: true,
        note: true,
        completed: true,
        drivingLeadId: true,
      },
      orderBy: { date: 'asc' },
    });
    res.json(followUps);
  } catch (error) {
    console.error('[FOLLOWUPS] D4$ fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch D4$ follow-ups' });
  }
});

// GET /api/followups/by-property/:propertyId - All follow-ups for a specific property
router.get('/by-property/:propertyId', optionalAuth, async (req, res) => {
  try {
    const { propertyId } = req.params;
    const followUps = await prisma.followUp.findMany({
      where: { propertyId },
      select: {
        id: true,
        date: true,
        note: true,
        completed: true,
        completedAt: true,
        createdBy: { select: { id: true, username: true } },
      },
      orderBy: { date: 'asc' },
    });
    res.json(followUps);
  } catch (error) {
    console.error('[FOLLOWUPS] By-property fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch follow-ups' });
  }
});

// POST /api/followups
router.post('/', authenticateToken, resolveViewAs, async (req, res) => {
  try {
    const { date, note, propertyId, documentNumber, drivingLeadId } = req.body;

    if (!date) {
      return res.status(400).json({ error: 'date is required' });
    }
    if (!propertyId && !documentNumber && !drivingLeadId) {
      return res.status(400).json({ error: 'propertyId, documentNumber, or drivingLeadId is required' });
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

    if (drivingLeadId) {
      const dl = await prisma.drivingLead.findUnique({
        where: { id: drivingLeadId },
        select: { id: true },
      });
      if (!dl) {
        return res.status(404).json({ error: 'Driving lead not found' });
      }
    }

    const followUp = await prisma.followUp.create({
      data: {
        date: new Date(date),
        note: note || null,
        propertyId: propertyId || null,
        preforeclosureId: preforeclosureId,
        drivingLeadId: drivingLeadId || null,
        createdById: req.effectiveUserId,
      },
      include: {
        property: { select: { id: true, propertyAddress: true, ownerName: true, workflowStage: true } },
        preForeclosure: { select: { id: true, documentNumber: true, address: true, workflowStage: true } },
        drivingLead: { select: { id: true, rawAddress: true, street: true, city: true, state: true, zip: true, ownerName: true, status: true, notes: true, phoneNumbers: true, ownerPhoneIndex: true, emails: true, contacts: true, latitude: true, longitude: true } },
        createdBy: { select: { id: true, username: true } },
      },
    });

    // Fire-and-forget: create Google Calendar event for the follow-up
    const label =
      followUp.property?.ownerName ||
      followUp.property?.propertyAddress ||
      followUp.preForeclosure?.address ||
      followUp.drivingLead?.rawAddress ||
      followUp.drivingLead?.street ||
      'Property';
    createCalendarEvent({
      title: `Follow-up: ${label}`,
      description: note || '',
      start: new Date(date),
    });

    res.status(201).json(followUp);
  } catch (error) {
    console.error('[FOLLOWUPS] Create error:', error);
    res.status(500).json({ error: 'Failed to create follow-up' });
  }
});

// PUT /api/followups/:id
router.put('/:id', authenticateToken, resolveViewAs, async (req, res) => {
  try {
    const { id } = req.params;
    const { completed, note, date } = req.body;

    const existing = await prisma.followUp.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ error: 'Follow-up not found' });
    }

    if (existing.isTeamAppointment && !canManageAppointment(req.user, existing)) return res.status(403).json({ error: 'Only the organizer or a manager can change this appointment.' });

    const updateData = {};
    if (completed !== undefined) {
      updateData.completed = completed;
      updateData.completedAt = completed ? new Date() : null;
    }
    if (note !== undefined) updateData.note = note;
    if (date !== undefined) {
      const start = new Date(date);
      if (!Number.isFinite(start.getTime())) return res.status(400).json({ error: 'Invalid calendar date.' });
      updateData.date = start;
      if (existing.isTeamAppointment) updateData.endAt = new Date(start.getTime() + (new Date(existing.endAt).getTime() - new Date(existing.date).getTime()));
    }

    const updated = await prisma.followUp.update({
      where: { id },
      data: updateData,
      include: {
        property: { select: { id: true, propertyAddress: true, ownerName: true, workflowStage: true } },
        preForeclosure: { select: { id: true, documentNumber: true, address: true, workflowStage: true } },
        drivingLead: { select: { id: true, rawAddress: true, street: true, city: true, state: true, zip: true, ownerName: true, status: true, notes: true, phoneNumbers: true, ownerPhoneIndex: true, emails: true, contacts: true, latitude: true, longitude: true } },
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
router.delete('/:id', authenticateToken, resolveViewAs, async (req, res) => {
  try {
    const { id } = req.params;

    const existing = await prisma.followUp.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ error: 'Follow-up not found' });
    }

    if (existing.isTeamAppointment && !canManageAppointment(req.user, existing)) return res.status(403).json({ error: 'Only the organizer or a manager can remove this appointment.' });

    await prisma.followUp.delete({ where: { id } });
    res.json({ success: true });
  } catch (error) {
    console.error('[FOLLOWUPS] Delete error:', error);
    res.status(500).json({ error: 'Failed to delete follow-up' });
  }
});

module.exports = router;
