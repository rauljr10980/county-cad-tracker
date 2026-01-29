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
      // Default: only return PENDING tasks if no status filter specified
      const where = {};
      if (status) {
        where.status = status;
      } else {
        // Default to PENDING tasks only
        where.status = 'PENDING';
      }
      if (priority) where.priority = priority;
      if (actionType) where.actionType = actionType;
      if (assignedToId) where.assignedToId = assignedToId;
      if (propertyId) where.propertyId = propertyId;

      if (dueFrom || dueTo) {
        where.dueTime = {};
        if (dueFrom) where.dueTime.gte = new Date(dueFrom);
        if (dueTo) where.dueTime.lte = new Date(dueTo);
      }

      // Frontend expects all tasks, not paginated
      // Fetch all tasks matching the filter (no pagination for frontend)
      const tasks = await prisma.task.findMany({
        where,
        include: {
          property: {
            select: {
              id: true,
              accountNumber: true,
              ownerName: true,
              propertyAddress: true,
              mailingAddress: true,
              status: true,
              totalDue: true,
              percentageDue: true,
              marketValue: true,
              landValue: true,
              improvementValue: true,
              notes: true,
              phoneNumbers: true,
              ownerPhoneIndex: true,
              link: true,
              ownerAddress: true,
              latitude: true,
              longitude: true,
              exemptions: true,
              jurisdictions: true,
              lastPaymentDate: true,
              lastPaymentAmount: true,
              taxYear: true,
              legalDescription: true
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
        orderBy: { dueTime: 'asc' }
      });

      // Also fetch pre-foreclosure records with tasks (actionType and dueTime)
      const preForeclosureWhere = {
        actionType: { not: null },
        dueTime: { not: null }
      };

      // Apply filters to pre-foreclosure records
      if (actionType) {
        preForeclosureWhere.actionType = actionType;
      }
      if (priority) {
        // Map priority filter: HIGH -> HIGH, MEDIUM -> MEDIUM, LOW -> LOW
        preForeclosureWhere.priority = priority;
      }
      // Note: assignedToId filter is not applied to pre-foreclosure records
      // since pre-foreclosure uses string assignment ('Luciano' or 'Raul')
      // and the frontend filters client-side by assignedTo string
      if (dueFrom || dueTo) {
        preForeclosureWhere.dueTime = {};
        if (dueFrom) preForeclosureWhere.dueTime.gte = new Date(dueFrom);
        if (dueTo) preForeclosureWhere.dueTime.lte = new Date(dueTo);
      }

      const preForeclosureTasks = await prisma.preForeclosure.findMany({
        where: preForeclosureWhere,
        select: {
          id: true,
          documentNumber: true,
          type: true,
          address: true,
          city: true,
          zip: true,
          filingMonth: true,
          county: true,
          latitude: true,
          longitude: true,
          schoolDistrict: true,
          internalStatus: true,
          notes: true,
          phoneNumbers: true,
          ownerPhoneIndex: true,
          lastActionDate: true,
          nextFollowUpDate: true,
          actionType: true,
          priority: true,
          dueTime: true,
          assignedTo: true,
          visited: true,
          visitedAt: true,
          visitedBy: true,
          firstSeenMonth: true,
          lastSeenMonth: true,
          inactive: true,
        },
        orderBy: { dueTime: 'asc' }
      });

      // Transform property tasks to Property format expected by frontend
      const propertiesWithTasks = tasks.map(task => {
        const property = task.property;
        // Get last outcome from activities
        const lastOutcomeActivity = task.activities?.find(a => a.action === 'OUTCOME_RECORDED');
        
        return {
          ...property,
          // Include task ID for deletion
          taskId: task.id,
          // Map task fields to property fields (frontend expects these on Property)
          actionType: task.actionType.toLowerCase(), // CALL -> call
          priority: task.priority === 'MEDIUM' ? 'med' : task.priority.toLowerCase(), // HIGH -> high, MEDIUM -> med, LOW -> low
          dueTime: task.dueTime.toISOString(),
          assignedTo: task.assignedTo?.username || null,
          attempts: task.attempts || 0,
          lastOutcome: task.lastOutcome ? task.lastOutcome.toLowerCase().replace(/_/g, '_') : null,
          lastOutcomeDate: lastOutcomeActivity?.createdAt?.toISOString() || null,
          // Map totalDue to totalAmountDue for frontend
          totalAmountDue: property.totalDue || 0,
          // Map percentageDue to totalPercentage for frontend
          totalPercentage: property.percentageDue || 0,
        };
      });

      // Transform pre-foreclosure tasks to Property format expected by frontend
      const preForeclosurePropertiesWithTasks = preForeclosureTasks.map(pf => {
        // Map pre-foreclosure to Property-like format (for task list)
        // Also include snake_case fields for PreForeclosureDetailsModal compatibility
        return {
          id: pf.id,
          accountNumber: pf.documentNumber, // Use documentNumber as accountNumber
          ownerName: '', // Pre-foreclosure doesn't have ownerName
          propertyAddress: pf.address || '', // Use address as propertyAddress
          mailingAddress: '',
          status: pf.internalStatus || 'UNKNOWN',
          totalAmountDue: 0, // Pre-foreclosure doesn't have amount due
          marketValue: null,
          notes: pf.notes || null,
          phoneNumbers: pf.phoneNumbers || null,
          ownerPhoneIndex: pf.ownerPhoneIndex || null,
          link: null,
          exemptions: null,
          jurisdictions: null,
          lastPaymentDate: null,
          lastPaymentAmount: null,
          taxYear: null,
          legalDescription: null,
          latitude: pf.latitude || null,
          longitude: pf.longitude || null,
          // Map task fields
          actionType: pf.actionType ? pf.actionType.toLowerCase() : null,
          priority: pf.priority === 'MEDIUM' ? 'med' : (pf.priority ? pf.priority.toLowerCase() : 'med'),
          dueTime: pf.dueTime ? pf.dueTime.toISOString() : null,
          assignedTo: pf.assignedTo || null,
          attempts: 0,
          lastOutcome: null,
          lastOutcomeDate: null,
          // Add pre-foreclosure specific fields in BOTH formats for compatibility
          // camelCase for Property interface
          documentNumber: pf.documentNumber,
          type: pf.type,
          city: pf.city,
          zip: pf.zip,
          filingMonth: pf.filingMonth,
          county: pf.county,
          schoolDistrict: pf.schoolDistrict,
          internalStatus: pf.internalStatus,
          lastActionDate: pf.lastActionDate ? pf.lastActionDate.toISOString() : null,
          nextFollowUpDate: pf.nextFollowUpDate ? pf.nextFollowUpDate.toISOString() : null,
          visited: pf.visited,
          visitedAt: pf.visitedAt ? pf.visitedAt.toISOString() : null,
          visitedBy: pf.visitedBy,
          // snake_case for PreForeclosure interface (matching preforeclosure route format)
          document_number: pf.documentNumber,
          filing_month: pf.filingMonth || '',
          school_district: pf.schoolDistrict || null,
          internal_status: pf.internalStatus || 'New',
          last_action_date: pf.lastActionDate ? pf.lastActionDate.toISOString() : null,
          next_follow_up_date: pf.nextFollowUpDate ? pf.nextFollowUpDate.toISOString() : null,
          visited_at: pf.visitedAt ? pf.visitedAt.toISOString() : null,
          visited_by: pf.visitedBy || null,
          first_seen_month: pf.firstSeenMonth || '',
          last_seen_month: pf.lastSeenMonth || '',
          inactive: pf.inactive || false,
        };
      });

      // Combine both arrays and sort by dueTime
      const allTasks = [...propertiesWithTasks, ...preForeclosurePropertiesWithTasks];
      allTasks.sort((a, b) => {
        if (!a.dueTime) return 1;
        if (!b.dueTime) return -1;
        return new Date(a.dueTime).getTime() - new Date(b.dueTime).getTime();
      });

      // Frontend expects array directly (not wrapped in object)
      res.json(allTasks);
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
