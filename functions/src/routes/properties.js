/**
 * Property Management Routes
 * CRUD operations for properties with advanced filtering
 */

const express = require('express');
const { body, query, validationResult } = require('express-validator');
const { optionalAuth, authenticateToken } = require('../middleware/auth');
const prisma = require('../lib/prisma');

const router = express.Router();

// ============================================================================
// GET ALL PROPERTIES (with filtering and pagination)
// ============================================================================

router.get('/',
  optionalAuth,
  [
    query('page').optional().isInt({ min: 1 }).toInt(),
    query('limit').optional().isInt({ min: 1, max: 50000 }).toInt(), // Increased max to allow fetching all properties
    query('status').optional().custom((value) => {
      // Accept both single letters (P, A, J, U) and full enum names
      const validValues = ['J', 'A', 'P', 'U', 'JUDGMENT', 'ACTIVE', 'PENDING', 'PAID', 'REMOVED', 'UNKNOWN'];
      const upperValue = String(value).toUpperCase().trim();
      return validValues.includes(upperValue) || upperValue.startsWith('JUDG') || upperValue.startsWith('ACTI') || upperValue.startsWith('PEND') || upperValue.startsWith('UNKN');
    }),
    query('dealStage').optional().isIn(['NEW_LEAD', 'CONTACTED', 'INTERESTED', 'OFFER_SENT', 'NEGOTIATING', 'UNDER_CONTRACT', 'CLOSED', 'DEAD']),
    query('search').optional().isString()
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ error: errors.array()[0].msg });
      }

      const {
        page = 1,
        limit: limitParam,
        status: statusParam,
        dealStage,
        search,
        sortBy = 'createdAt',
        sortOrder = 'desc'
      } = req.query;

      // Normalize status parameter: convert single letters (P, A, J, U) to full enum names
      let normalizedStatus = null;
      if (statusParam) {
        const upperStatus = String(statusParam).toUpperCase().trim();
        if (upperStatus === 'J' || upperStatus === 'JUDGMENT' || upperStatus.startsWith('JUDG')) {
          normalizedStatus = 'JUDGMENT';
        } else if (upperStatus === 'A' || upperStatus === 'ACTIVE' || upperStatus.startsWith('ACTI')) {
          normalizedStatus = 'ACTIVE';
        } else if (upperStatus === 'P' || upperStatus === 'PENDING' || upperStatus.startsWith('PEND')) {
          normalizedStatus = 'PENDING';
        } else if (upperStatus === 'U' || upperStatus === 'UNKNOWN' || upperStatus.startsWith('UNKN')) {
          normalizedStatus = 'UNKNOWN';
        } else if (upperStatus === 'PAID') {
          normalizedStatus = 'PAID';
        } else if (upperStatus === 'REMOVED') {
          normalizedStatus = 'REMOVED';
        }
      }

      // When a status filter is provided, fetch ALL properties (no limit)
      // When no status filter but limit is provided, use that limit (for frontend filtering)
      // Otherwise use pagination with default limit of 100
      const isSingleStatusFilter = normalizedStatus !== null && !dealStage && !search;
      const limit = isSingleStatusFilter 
        ? undefined // No limit - fetch all properties with this status
        : (limitParam ? parseInt(limitParam) : 100); // Use provided limit (can be 50000 for frontend filtering) or default to 100

      // Build where clause
      const where = {};
      if (normalizedStatus) where.status = normalizedStatus;
      if (dealStage) where.dealStage = dealStage;

      if (search) {
        where.OR = [
          { ownerName: { contains: search, mode: 'insensitive' } },
          { accountNumber: { contains: search, mode: 'insensitive' } },
          { propertyAddress: { contains: search, mode: 'insensitive' } }
        ];
      }

      // Get total count and status counts in parallel for better performance
      const [total, statusCountsResult] = await Promise.all([
        prisma.property.count({ where }),
        prisma.property.groupBy({
          by: ['status'],
          _count: { status: true }
        })
      ]);

      // Normalize sortBy field: map frontend field names to database field names
      // Frontend uses totalAmountDue, but database uses totalDue
      const normalizedSortBy = sortBy === 'totalAmountDue' ? 'totalDue' : sortBy;

      // Get properties
      // When single status filter is active, fetch ALL properties (no pagination)
      // Otherwise use pagination
      const queryOptions = {
        where,
        include: {
          _count: {
            select: {
              notes: true,
              tasks: true
            }
          }
        },
        orderBy: { [normalizedSortBy]: sortOrder }
      };

      // Only apply pagination if not fetching all properties for single status filter
      // When limit is large (>= 10000), assume frontend filtering and return all (no pagination)
      // Otherwise use pagination
      if (!isSingleStatusFilter && limit) {
        if (limit >= 10000) {
          // Large limit means frontend filtering - return all properties without pagination
          // Don't set skip/take to get all matching properties
        } else {
          // Normal pagination for smaller limits
          queryOptions.skip = (page - 1) * limit;
          queryOptions.take = limit;
        }
      }

      const properties = await prisma.property.findMany(queryOptions);

      // Map database fields to frontend format
      // Map totalDue (database) to totalAmountDue (frontend)
      const mappedProperties = properties.map(prop => ({
        ...prop,
        totalAmountDue: prop.totalDue || 0, // Map totalDue to totalAmountDue for frontend
        // Keep totalDue for backward compatibility but prioritize totalAmountDue
      }));

      // Format status counts to match BOTH old and new frontend (backward compatible)
      const statusCounts = {
        // Old format for cached frontend
        J: 0,
        A: 0,
        P: 0,
        other: 0,
        // New format for updated frontend
        JUDGMENT: 0,
        ACTIVE: 0,
        PENDING: 0,
        UNKNOWN: 0,
        PAID: 0,
        REMOVED: 0
      };
      statusCountsResult.forEach(item => {
        const status = item.status?.toUpperCase();
        if (status === 'JUDGMENT') {
          statusCounts.JUDGMENT = item._count.status;
          statusCounts.J = item._count.status; // Backward compat
        } else if (status === 'ACTIVE') {
          statusCounts.ACTIVE = item._count.status;
          statusCounts.A = item._count.status; // Backward compat
        } else if (status === 'PENDING') {
          statusCounts.PENDING = item._count.status;
          statusCounts.P = item._count.status; // Backward compat
        } else if (status === 'UNKNOWN') {
          statusCounts.UNKNOWN = item._count.status;
          statusCounts.other += item._count.status; // Backward compat
        } else if (status === 'PAID') {
          statusCounts.PAID = item._count.status;
          statusCounts.other += item._count.status; // Backward compat
        } else if (status === 'REMOVED') {
          statusCounts.REMOVED = item._count.status;
          statusCounts.other += item._count.status; // Backward compat
        }
      });

      // Calculate total pages - if fetching all properties, totalPages is 1
      const totalPages = isSingleStatusFilter ? 1 : (limit ? Math.ceil(total / limit) : 1);

      res.json({
        properties: mappedProperties, // Use mapped properties with totalAmountDue
        total,
        totalUnfiltered: total, // For now, same as total (can be optimized later)
        totalPages,
        page: isSingleStatusFilter ? 1 : page, // Always page 1 when fetching all
        statusCounts
      });
    } catch (error) {
      console.error('[PROPERTIES] Fetch error:', error);
      res.status(500).json({ error: 'Failed to fetch properties' });
    }
  }
);

// ============================================================================
// GET SINGLE PROPERTY
// ============================================================================

router.get('/:id', optionalAuth, async (req, res) => {
  try {
    const property = await prisma.property.findUnique({
      where: { id: req.params.id },
      include: {
        notes: {
          include: {
            author: {
              select: { id: true, username: true }
            }
          },
          orderBy: { createdAt: 'desc' }
        },
        tasks: {
          include: {
            assignedTo: {
              select: { id: true, username: true }
            },
            activities: {
              take: 5,
              orderBy: { createdAt: 'desc' }
            }
          },
          orderBy: { dueTime: 'asc' }
        },
        paymentHistory: {
          orderBy: { date: 'desc' }
        }
      }
    });

    if (!property) {
      return res.status(404).json({ error: 'Property not found' });
    }

    // Map database fields to frontend format
    // Map totalDue (database) to totalAmountDue (frontend)
    const mappedProperty = {
      ...property,
      totalAmountDue: property.totalDue || 0, // Map totalDue to totalAmountDue for frontend
      // Keep totalDue for backward compatibility but prioritize totalAmountDue
    };

    res.json(mappedProperty);
  } catch (error) {
    console.error('[PROPERTIES] Fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch property' });
  }
});

// ============================================================================
// CREATE PROPERTY
// ============================================================================

router.post('/',
  authenticateToken,
  [
    body('accountNumber').isString().notEmpty(),
    body('ownerName').isString().notEmpty(),
    body('propertyAddress').isString().notEmpty(),
    body('totalDue').isFloat({ min: 0 }),
    body('percentageDue').isFloat({ min: 0, max: 100 }),
    body('status').isIn(['JUDGMENT', 'ACTIVE', 'PENDING', 'PAID', 'REMOVED'])
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ error: errors.array()[0].msg });
      }

      const data = req.body;

      // Check if property already exists
      const existing = await prisma.property.findUnique({
        where: { accountNumber: data.accountNumber }
      });

      if (existing) {
        return res.status(400).json({ error: 'Property with this account number already exists' });
      }

      const property = await prisma.property.create({
        data: {
          accountNumber: data.accountNumber,
          ownerName: data.ownerName,
          propertyAddress: data.propertyAddress,
          mailingAddress: data.mailingAddress,
          totalDue: data.totalDue,
          percentageDue: data.percentageDue,
          status: data.status,
          previousStatus: data.previousStatus,
          taxYear: data.taxYear,
          legalDescription: data.legalDescription,
          phoneNumbers: data.phoneNumbers || [],
          ownerPhoneIndex: data.ownerPhoneIndex,
          dealStage: data.dealStage,
          estimatedDealValue: data.estimatedDealValue,
          offerAmount: data.offerAmount,
          expectedCloseDate: data.expectedCloseDate ? new Date(data.expectedCloseDate) : undefined,
          isNew: data.isNew,
          isRemoved: data.isRemoved,
          statusChanged: data.statusChanged,
          percentageChanged: data.percentageChanged
        }
      });

      res.status(201).json(property);
    } catch (error) {
      console.error('[PROPERTIES] Create error:', error);
      res.status(500).json({ error: 'Failed to create property' });
    }
  }
);

// ============================================================================
// UPDATE PROPERTY
// ============================================================================

router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    // Convert date fields if present
    if (updates.expectedCloseDate) {
      updates.expectedCloseDate = new Date(updates.expectedCloseDate);
    }

    const property = await prisma.property.update({
      where: { id },
      data: updates
    });

    res.json(property);
  } catch (error) {
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Property not found' });
    }
    console.error('[PROPERTIES] Update error:', error);
    res.status(500).json({ error: 'Failed to update property' });
  }
});

// ============================================================================
// BULK UPDATE PROPERTIES
// ============================================================================

router.post('/bulk-update', authenticateToken, async (req, res) => {
  try {
    const { properties } = req.body;

    if (!Array.isArray(properties) || properties.length === 0) {
      return res.status(400).json({ error: 'Properties array is required' });
    }

    // Use transaction for bulk updates
    const results = await prisma.$transaction(
      properties.map(prop =>
        prisma.property.upsert({
          where: { accountNumber: prop.accountNumber },
          update: {
            ownerName: prop.ownerName,
            propertyAddress: prop.propertyAddress,
            totalDue: prop.totalDue,
            percentageDue: prop.percentageDue,
            status: prop.status,
            previousStatus: prop.previousStatus,
            updatedAt: new Date()
          },
          create: {
            accountNumber: prop.accountNumber,
            ownerName: prop.ownerName,
            propertyAddress: prop.propertyAddress,
            totalDue: prop.totalDue,
            percentageDue: prop.percentageDue,
            status: prop.status,
            isNew: true
          }
        })
      )
    );

    res.json({
      success: true,
      processed: results.length,
      message: `Successfully processed ${results.length} properties`
    });
  } catch (error) {
    console.error('[PROPERTIES] Bulk update error:', error);
    res.status(500).json({ error: 'Failed to bulk update properties' });
  }
});

// ============================================================================
// DELETE PROPERTY
// ============================================================================

router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    await prisma.property.delete({
      where: { id: req.params.id }
    });

    res.json({ success: true, message: 'Property deleted' });
  } catch (error) {
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Property not found' });
    }
    console.error('[PROPERTIES] Delete error:', error);
    res.status(500).json({ error: 'Failed to delete property' });
  }
});

// ============================================================================
// UPDATE/CREATE PROPERTY ACTION (Task)
// ============================================================================

router.put('/:id/action', optionalAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { actionType, priority, dueTime, assignedTo } = req.body;

    // Validate required fields
    if (!actionType || !priority || !dueTime) {
      return res.status(400).json({ error: 'actionType, priority, and dueTime are required' });
    }

    // Validate property exists
    const property = await prisma.property.findUnique({
      where: { id }
    });

    if (!property) {
      return res.status(404).json({ error: 'Property not found' });
    }

    // Get or create user (default user if not authenticated)
    let userId = req.user?.id;
    if (!userId) {
      // Find or create a default system user
      let defaultUser = await prisma.user.findFirst({
        where: { username: 'system' }
      });
      if (!defaultUser) {
        defaultUser = await prisma.user.create({
          data: {
            username: 'system',
            email: 'system@countycadtracker.com',
            password: 'default', // Should be hashed, but for now this works
            role: 'OPERATOR'
          }
        });
      }
      userId = defaultUser.id;
    }

    // Map frontend actionType to database enum
    const actionTypeMap = {
      'call': 'CALL',
      'text': 'TEXT',
      'mail': 'MAIL',
      'driveby': 'DRIVEBY'
    };
    const dbActionType = actionTypeMap[actionType.toLowerCase()];
    if (!dbActionType) {
      return res.status(400).json({ error: 'Invalid actionType. Must be: call, text, mail, or driveby' });
    }

    // Map frontend priority to database enum
    const priorityMap = {
      'high': 'HIGH',
      'med': 'MEDIUM',
      'low': 'LOW'
    };
    const dbPriority = priorityMap[priority.toLowerCase()];
    if (!dbPriority) {
      return res.status(400).json({ error: 'Invalid priority. Must be: high, med, or low' });
    }

    // Handle assignedTo - find user by name or create if doesn't exist
    let assignedToId = null;
    if (assignedTo) {
      const assignedToLower = assignedTo.toLowerCase();
      let assignedUser = await prisma.user.findFirst({
        where: {
          OR: [
            { username: { equals: assignedToLower, mode: 'insensitive' } },
            { username: { equals: assignedTo, mode: 'insensitive' } }
          ]
        }
      });
      if (!assignedUser) {
        // Create user if doesn't exist
        assignedUser = await prisma.user.create({
          data: {
            username: assignedToLower,
            email: `${assignedToLower}@countycadtracker.com`,
            password: 'default', // Should be hashed
            role: 'OPERATOR'
          }
        });
      }
      assignedToId = assignedUser.id;
    }

    // Find existing pending task for this property, or create new one
    const existingTask = await prisma.task.findFirst({
      where: {
        propertyId: id,
        status: 'PENDING'
      }
    });

    const dueDateTime = new Date(dueTime);

    let task;
    if (existingTask) {
      // Update existing task
      task = await prisma.task.update({
        where: { id: existingTask.id },
        data: {
          actionType: dbActionType,
          priority: dbPriority,
          dueTime: dueDateTime,
          assignedToId: assignedToId,
          updatedAt: new Date()
        },
        include: {
          assignedTo: true,
          createdBy: true
        }
      });

      // Log activity
      await prisma.taskActivity.create({
        data: {
          taskId: task.id,
          userId: userId,
          action: 'STATUS_CHANGED',
          oldValue: JSON.stringify({
            actionType: existingTask.actionType,
            priority: existingTask.priority,
            dueTime: existingTask.dueTime
          }),
          newValue: JSON.stringify({
            actionType: dbActionType,
            priority: dbPriority,
            dueTime: dueDateTime
          }),
          description: 'Task updated'
        }
      });
    } else {
      // Create new task
      task = await prisma.task.create({
        data: {
          propertyId: id,
          actionType: dbActionType,
          priority: dbPriority,
          status: 'PENDING',
          dueTime: dueDateTime,
          assignedToId: assignedToId,
          createdById: userId
        },
        include: {
          assignedTo: true,
          createdBy: true
        }
      });

      // Log activity
      await prisma.taskActivity.create({
        data: {
          taskId: task.id,
          userId: userId,
          action: 'CREATED',
          description: `Task created: ${dbActionType} with ${dbPriority} priority`
        }
      });
    }

    res.json(task);
  } catch (error) {
    console.error('[PROPERTIES] Action error:', error);
    res.status(500).json({ error: 'Failed to schedule action' });
  }
});

// ============================================================================
// GET DASHBOARD STATS
// ============================================================================

router.get('/stats/dashboard', optionalAuth, async (req, res) => {
  try {
    // Run all queries in parallel for better performance (4x faster)
    const [statusCounts, dealStageCounts, taskCounts, financialStats] = await Promise.all([
      // Get property counts by status
      prisma.property.groupBy({
        by: ['status'],
        _count: { status: true }
      }),
      // Get deal stage counts
      prisma.property.groupBy({
        by: ['dealStage'],
        _count: { dealStage: true },
        where: {
          dealStage: { not: null }
        }
      }),
      // Get task counts by status
      prisma.task.groupBy({
        by: ['status'],
        _count: { status: true }
      }),
      // Get total properties and financial stats
      prisma.property.aggregate({
        _count: true,
        _sum: {
          totalDue: true,
          estimatedDealValue: true
        },
        _avg: {
          totalDue: true
        }
      })
    ]);

    // Format the response
    const byStatus = {};
    statusCounts.forEach(item => {
      byStatus[item.status.toLowerCase()] = item._count.status;
    });

    const byDealStage = {};
    dealStageCounts.forEach(item => {
      if (item.dealStage) {
        byDealStage[item.dealStage.toLowerCase()] = item._count.dealStage;
      }
    });

    const taskStats = {};
    taskCounts.forEach(item => {
      taskStats[item.status.toLowerCase()] = item._count.status;
    });

    res.json({
      totalProperties: financialStats._count,
      byStatus,
      totalAmountDue: financialStats._sum.totalDue || 0,
      avgAmountDue: financialStats._avg.totalDue || 0,
      pipeline: {
        totalValue: financialStats._sum.estimatedDealValue || 0,
        activeDeals: (byDealStage.contacted || 0) + (byDealStage.interested || 0) + (byDealStage.offer_sent || 0) + (byDealStage.negotiating || 0),
        byStage: byDealStage
      },
      tasks: taskStats
    });
  } catch (error) {
    console.error('[PROPERTIES] Stats error:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard stats' });
  }
});

module.exports = router;
