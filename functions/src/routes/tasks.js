/**
 * Task Management Routes
 * Task delegation, status tracking, and full audit trail
 */

const express = require('express');
const { body, query, validationResult } = require('express-validator');
const { authenticateToken, optionalAuth } = require('../middleware/auth');
const prisma = require('../lib/prisma');

const router = express.Router();

// ============================================================================
// GET ALL TASKS (with filtering and pagination)
// ============================================================================

router.get('/',
  optionalAuth,
  [
    query('page').optional().isInt({ min: 1 }).toInt(),
    query('limit').optional().isInt({ min: 1, max: 1000 }).toInt(),
    query('status').optional().isIn(['PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'SNOOZED']),
    query('priority').optional().isIn(['HIGH', 'MEDIUM', 'LOW']),
    query('actionType').optional().isIn(['CALL', 'TEXT', 'MAIL', 'DRIVEBY']),
    query('assignedToId').optional().isString(),
    query('propertyId').optional().isString(),
    query('dueFrom').optional().isISO8601(),
    query('dueTo').optional().isISO8601()
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ error: errors.array()[0].msg });
      }

      const {
        page = 1,
        limit = 100,
        status,
        priority,
        actionType,
        assignedToId,
        propertyId,
        dueFrom,
        dueTo,
        sortBy = 'dueTime',
        sortOrder = 'asc'
      } = req.query;

      // Build where clause
      const where = {};
      if (status) where.status = status;
      if (priority) where.priority = priority;
      if (actionType) where.actionType = actionType;
      if (assignedToId) where.assignedToId = assignedToId;
      if (propertyId) where.propertyId = propertyId;

      if (dueFrom || dueTo) {
        where.dueTime = {};
        if (dueFrom) where.dueTime.gte = new Date(dueFrom);
        if (dueTo) where.dueTime.lte = new Date(dueTo);
      }

      // Get total count
      const total = await prisma.task.count({ where });

      // Get tasks with relations
      const tasks = await prisma.task.findMany({
        where,
        include: {
          property: {
            select: {
              id: true,
              accountNumber: true,
              ownerName: true,
              propertyAddress: true,
              status: true,
              totalDue: true
            }
          },
          assignedTo: {
            select: {
              id: true,
              username: true,
              email: true
            }
          },
          createdBy: {
            select: {
              id: true,
              username: true
            }
          },
          activities: {
            take: 5,
            orderBy: { createdAt: 'desc' },
            include: {
              user: {
                select: {
                  id: true,
                  username: true
                }
              }
            }
          }
        },
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { [sortBy]: sortOrder }
      });

      res.json({
        tasks,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit)
        }
      });
    } catch (error) {
      console.error('[TASKS] Fetch error:', error);
      res.status(500).json({ error: 'Failed to fetch tasks' });
    }
  }
);

// ============================================================================
// GET SINGLE TASK
// ============================================================================

router.get('/:id', optionalAuth, async (req, res) => {
  try {
    const task = await prisma.task.findUnique({
      where: { id: req.params.id },
      include: {
        property: true,
        assignedTo: {
          select: { id: true, username: true, email: true }
        },
        createdBy: {
          select: { id: true, username: true }
        },
        activities: {
          orderBy: { createdAt: 'desc' },
          include: {
            user: {
              select: { id: true, username: true }
            }
          }
        }
      }
    });

    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    res.json(task);
  } catch (error) {
    console.error('[TASKS] Fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch task' });
  }
});

// ============================================================================
// CREATE TASK
// ============================================================================

router.post('/',
  authenticateToken,
  [
    body('propertyId').isString().notEmpty(),
    body('actionType').isIn(['CALL', 'TEXT', 'MAIL', 'DRIVEBY']),
    body('priority').optional().isIn(['HIGH', 'MEDIUM', 'LOW']),
    body('dueTime').isISO8601(),
    body('assignedToId').optional().isString()
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ error: errors.array()[0].msg });
      }

      const { propertyId, actionType, priority, dueTime, assignedToId } = req.body;

      // Verify property exists
      const property = await prisma.property.findUnique({
        where: { id: propertyId }
      });

      if (!property) {
        return res.status(404).json({ error: 'Property not found' });
      }

      // Create task with activity log
      const task = await prisma.task.create({
        data: {
          propertyId,
          actionType,
          priority: priority || 'MEDIUM',
          dueTime: new Date(dueTime),
          assignedToId,
          createdById: req.user.id,
          status: 'PENDING',
          activities: {
            create: {
              action: 'CREATED',
              description: `Task created: ${actionType} scheduled for ${new Date(dueTime).toLocaleDateString()}`,
              userId: req.user.id
            }
          }
        },
        include: {
          property: {
            select: {
              id: true,
              accountNumber: true,
              ownerName: true,
              propertyAddress: true
            }
          },
          assignedTo: {
            select: { id: true, username: true }
          },
          activities: {
            include: {
              user: {
                select: { id: true, username: true }
              }
            }
          }
        }
      });

      res.status(201).json(task);
    } catch (error) {
      console.error('[TASKS] Create error:', error);
      res.status(500).json({ error: 'Failed to create task' });
    }
  }
);

// ============================================================================
// UPDATE TASK
// ============================================================================

router.put('/:id',
  authenticateToken,
  [
    body('status').optional().isIn(['PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'SNOOZED']),
    body('priority').optional().isIn(['HIGH', 'MEDIUM', 'LOW']),
    body('dueTime').optional().isISO8601(),
    body('assignedToId').optional().isString(),
    body('actionType').optional().isIn(['CALL', 'TEXT', 'MAIL', 'DRIVEBY'])
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ error: errors.array()[0].msg });
      }

      const { id } = req.params;
      const updates = req.body;

      // Get current task
      const currentTask = await prisma.task.findUnique({
        where: { id }
      });

      if (!currentTask) {
        return res.status(404).json({ error: 'Task not found' });
      }

      // Build activity logs for changes
      const activities = [];

      if (updates.status && updates.status !== currentTask.status) {
        activities.push({
          action: 'STATUS_CHANGED',
          oldValue: currentTask.status,
          newValue: updates.status,
          description: `Status changed from ${currentTask.status} to ${updates.status}`,
          userId: req.user.id
        });
      }

      if (updates.priority && updates.priority !== currentTask.priority) {
        activities.push({
          action: 'PRIORITY_CHANGED',
          oldValue: currentTask.priority,
          newValue: updates.priority,
          description: `Priority changed from ${currentTask.priority} to ${updates.priority}`,
          userId: req.user.id
        });
      }

      if (updates.assignedToId && updates.assignedToId !== currentTask.assignedToId) {
        activities.push({
          action: currentTask.assignedToId ? 'REASSIGNED' : 'ASSIGNED',
          oldValue: currentTask.assignedToId || null,
          newValue: updates.assignedToId,
          description: `Task ${currentTask.assignedToId ? 'reassigned' : 'assigned'}`,
          userId: req.user.id
        });
      }

      if (updates.dueTime && new Date(updates.dueTime).getTime() !== currentTask.dueTime.getTime()) {
        activities.push({
          action: 'DUE_DATE_CHANGED',
          oldValue: currentTask.dueTime.toISOString(),
          newValue: new Date(updates.dueTime).toISOString(),
          description: `Due date changed`,
          userId: req.user.id
        });
      }

      // Update task with activity logs
      const updateData = { ...updates };
      if (updates.dueTime) {
        updateData.dueTime = new Date(updates.dueTime);
      }
      if (updates.status === 'COMPLETED' && !currentTask.completedAt) {
        updateData.completedAt = new Date();
      }

      const task = await prisma.task.update({
        where: { id },
        data: {
          ...updateData,
          activities: {
            create: activities
          }
        },
        include: {
          property: {
            select: {
              id: true,
              accountNumber: true,
              ownerName: true,
              propertyAddress: true
            }
          },
          assignedTo: {
            select: { id: true, username: true }
          },
          activities: {
            take: 10,
            orderBy: { createdAt: 'desc' },
            include: {
              user: {
                select: { id: true, username: true }
              }
            }
          }
        }
      });

      res.json(task);
    } catch (error) {
      console.error('[TASKS] Update error:', error);
      res.status(500).json({ error: 'Failed to update task' });
    }
  }
);

// ============================================================================
// RECORD TASK OUTCOME
// ============================================================================

router.post('/:id/outcome',
  authenticateToken,
  [
    body('outcome').isIn(['NO_ANSWER', 'VOICEMAIL', 'TEXT_SENT', 'SPOKE_OWNER', 'WRONG_NUMBER', 'NOT_INTERESTED', 'NEW_OWNER', 'CALL_BACK_LATER']),
    body('notes').optional().isString()
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ error: errors.array()[0].msg });
      }

      const { id } = req.params;
      const { outcome, notes } = req.body;

      const task = await prisma.task.update({
        where: { id },
        data: {
          lastOutcome: outcome,
          attempts: { increment: 1 },
          activities: {
            create: {
              action: 'OUTCOME_RECORDED',
              newValue: outcome,
              description: `Outcome: ${outcome}${notes ? ` - ${notes}` : ''}`,
              userId: req.user.id
            }
          }
        },
        include: {
          property: true,
          activities: {
            take: 10,
            orderBy: { createdAt: 'desc' },
            include: {
              user: {
                select: { id: true, username: true }
              }
            }
          }
        }
      });

      res.json(task);
    } catch (error) {
      console.error('[TASKS] Outcome error:', error);
      res.status(500).json({ error: 'Failed to record outcome' });
    }
  }
);

// ============================================================================
// DELETE TASK
// ============================================================================

router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    await prisma.task.delete({
      where: { id: req.params.id }
    });

    res.json({ success: true, message: 'Task deleted' });
  } catch (error) {
    console.error('[TASKS] Delete error:', error);
    res.status(500).json({ error: 'Failed to delete task' });
  }
});

module.exports = router;
