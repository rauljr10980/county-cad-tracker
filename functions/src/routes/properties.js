/**
 * Property Management Routes
 * CRUD operations for properties with advanced filtering
 */

const express = require('express');
const { body, query, validationResult } = require('express-validator');
const { optionalAuth, authenticateToken } = require('../middleware/auth');
const prisma = require('../lib/prisma');

// Fetch should be available in Node.js 18+, but provide fallback
const useFetch = () => {
  if (typeof globalThis.fetch !== 'undefined') {
    return globalThis.fetch;
  }
  if (typeof fetch !== 'undefined') {
    return fetch;
  }
  try {
    return require('node-fetch');
  } catch (e) {
    throw new Error('Fetch is not available. Node.js 18+ is required or install node-fetch');
  }
};
const fetch = useFetch();

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
              noteRecords: true,  // Count of Note relation records
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
      // Map percentageDue (database) to totalPercentage (frontend)
      // Map dealStage from uppercase (NEW_LEAD) to lowercase (new_lead) for frontend
      // Strip street suffixes for fuzzy address matching
      const STREET_SUFFIXES = /\b(ST|DR|LN|AVE|BLVD|CT|CIR|PL|WAY|RD|TRL|PKWY|HWY|LOOP|COVE|RUN|PASS|PATH|WALK|XING|CV|TER|SQ)\b/g;
      const stripSuffix = (s) => s.replace(STREET_SUFFIXES, '').replace(/\s+/g, ' ').trim();

      const mappedProperties = properties.map(prop => {
        const ownerUpper = (prop.ownerName || '').toUpperCase().trim();
        const addressUpper = (prop.propertyAddress || '').toUpperCase().trim();
        // Compare street names without suffixes (DR vs LN vs ST etc.)
        const ownerStripped = stripSuffix(ownerUpper);
        const addressStripped = stripSuffix(addressUpper);
        const autoDetected = !!(ownerStripped && addressStripped && addressStripped.includes(ownerStripped));
        // Manual override takes precedence over auto-detection
        const isPrimaryProperty = prop.isPrimaryOverride !== null && prop.isPrimaryOverride !== undefined
          ? prop.isPrimaryOverride
          : autoDetected;
        return {
          ...prop,
          totalAmountDue: prop.totalDue || 0,
          totalPercentage: prop.percentageDue || 0,
          isPrimaryProperty,
          // Convert dealStage from uppercase enum to lowercase for frontend
          dealStage: prop.dealStage ? prop.dealStage.toLowerCase() : null,
          // Workflow decision tree fields
          workflow_stage: prop.workflowStage || 'not_started',
          workflow_log: prop.workflowLog || [],
        };
      });

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
        noteRecords: {  // Detailed notes with authors (relation)
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
    // Map percentageDue (database) to totalPercentage (frontend)
    const mappedProperty = {
      ...property,
      totalAmountDue: property.totalDue || 0, // Map totalDue to totalAmountDue for frontend
      totalPercentage: property.percentageDue || 0, // Map percentageDue to totalPercentage for frontend
      // Keep original fields for backward compatibility but prioritize mapped fields
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

      // Map frontend field names to database field names
      // Frontend uses totalAmountDue, database uses totalDue
      // Frontend uses totalPercentage, database uses percentageDue
      const totalDue = data.totalDue !== undefined ? data.totalDue : (data.totalAmountDue || 0);
      const percentageDue = data.percentageDue !== undefined ? data.percentageDue : (data.totalPercentage || 0);

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
          propertyAddress: data.propertyAddress || '',
          mailingAddress: data.mailingAddress,
          totalDue: totalDue,
          percentageDue: percentageDue,
          status: data.status,
          previousStatus: data.previousStatus,
          taxYear: data.taxYear,
          legalDescription: data.legalDescription,
          phoneNumbers: data.phoneNumbers || [],
          ownerPhoneIndex: data.ownerPhoneIndex,
          notes: data.notes || null,
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

    // Map frontend field names to database field names
    const updateData = { ...updates };

    // Map totalAmountDue (frontend) to totalDue (database)
    if (updateData.totalAmountDue !== undefined && updateData.totalDue === undefined) {
      updateData.totalDue = updateData.totalAmountDue;
      delete updateData.totalAmountDue;
    }

    // Map totalPercentage (frontend) to percentageDue (database)
    if (updateData.totalPercentage !== undefined && updateData.percentageDue === undefined) {
      updateData.percentageDue = updateData.totalPercentage;
      delete updateData.totalPercentage;
    }

    // Convert date fields if present
    if (updateData.expectedCloseDate) {
      updateData.expectedCloseDate = new Date(updateData.expectedCloseDate);
    }

    const property = await prisma.property.update({
      where: { id },
      data: updateData
    });

    // Map response back to frontend format
    const mappedProperty = {
      ...property,
      totalAmountDue: property.totalDue || 0,
      totalPercentage: property.percentageDue || 0
    };

    res.json(mappedProperty);
  } catch (error) {
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Property not found' });
    }
    console.error('[PROPERTIES] Update error:', error);
    res.status(500).json({ error: 'Failed to update property' });
  }
});

// PATCH endpoint for partial updates (like geocoding)
router.patch('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    // Map frontend field names to database field names
    const updateData = { ...updates };

    // Map totalAmountDue (frontend) to totalDue (database)
    if (updateData.totalAmountDue !== undefined && updateData.totalDue === undefined) {
      updateData.totalDue = updateData.totalAmountDue;
      delete updateData.totalAmountDue;
    }

    // Map totalPercentage (frontend) to percentageDue (database)
    if (updateData.totalPercentage !== undefined && updateData.percentageDue === undefined) {
      updateData.percentageDue = updateData.totalPercentage;
      delete updateData.totalPercentage;
    }

    // Convert date fields if present
    if (updateData.expectedCloseDate) {
      updateData.expectedCloseDate = new Date(updateData.expectedCloseDate);
    }

    const property = await prisma.property.update({
      where: { id },
      data: updateData
    });

    // Map response back to frontend format
    const mappedProperty = {
      ...property,
      totalAmountDue: property.totalDue || 0,
      totalPercentage: property.percentageDue || 0
    };

    res.json(mappedProperty);
  } catch (error) {
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Property not found' });
    }
    console.error('[PROPERTIES] Patch error:', error);
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

    // Map frontend field names to database field names
    const mappedProperties = properties.map(prop => ({
      ...prop,
      totalDue: prop.totalDue !== undefined ? prop.totalDue : (prop.totalAmountDue || 0),
      percentageDue: prop.percentageDue !== undefined ? prop.percentageDue : (prop.totalPercentage || 0)
    }));

    // Use transaction for bulk updates
    const results = await prisma.$transaction(
      mappedProperties.map(prop =>
        prisma.property.upsert({
          where: { accountNumber: prop.accountNumber },
          update: {
            ownerName: prop.ownerName,
            propertyAddress: prop.propertyAddress || '',
            totalDue: prop.totalDue,
            percentageDue: prop.percentageDue,
            status: prop.status,
            previousStatus: prop.previousStatus,
            updatedAt: new Date()
          },
          create: {
            accountNumber: prop.accountNumber,
            ownerName: prop.ownerName,
            propertyAddress: prop.propertyAddress || '',
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
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

    // Start of current week (Sunday 00:00)
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());
    startOfWeek.setHours(0, 0, 0, 0);

    // Run all queries in parallel for better performance
    // Only use fields that exist in the Property model
    const [
      statusCounts,
      dealStageCounts,
      financialStats,
      newThisMonthCount,
      removedThisMonthCount,
      deadLeadsCount,
      amountDueRanges,
      tasksByUser,
      propertyVisitsThisWeek,
      preForeclosureVisitsThisWeek
    ] = await Promise.all([
      // Get property counts by status (status field exists)
      prisma.property.groupBy({
        by: ['status'],
        _count: { status: true }
      }),
      // Get deal stage counts (dealStage field exists)
      prisma.property.groupBy({
        by: ['dealStage'],
        _count: { dealStage: true },
        where: {
          dealStage: { not: null }
        }
      }),
      // Get total properties and financial stats (totalDue and estimatedDealValue fields exist)
      prisma.property.aggregate({
        _count: true,
        _sum: {
          totalDue: true,
          estimatedDealValue: true
        },
        _avg: {
          totalDue: true
        }
      }),
      // Get new properties this month (createdAt field exists)
      prisma.property.count({
        where: {
          createdAt: {
            gte: startOfMonth,
            lte: endOfMonth
          }
        }
      }),
      // Get removed properties this month (isRemoved and updatedAt fields exist)
      prisma.property.count({
        where: {
          isRemoved: true,
          updatedAt: {
            gte: startOfMonth,
            lte: endOfMonth
          }
        }
      }),
      // Get dead leads (isRemoved and dealStage fields exist)
      prisma.property.count({
        where: {
          OR: [
            { isRemoved: true },
            { dealStage: 'DEAD' }
          ]
        }
      }),
      // Get amount due ranges (totalDue field exists)
      Promise.all([
        prisma.property.count({ where: { totalDue: { gte: 0, lt: 5000 } } }),
        prisma.property.count({ where: { totalDue: { gte: 5000, lt: 10000 } } }),
        prisma.property.count({ where: { totalDue: { gte: 10000, lt: 25000 } } }),
        prisma.property.count({ where: { totalDue: { gte: 25000, lt: 50000 } } }),
        prisma.property.count({ where: { totalDue: { gte: 50000 } } })
      ]),
      // Get tasks by assigned user (from Task model, not Property)
      prisma.task.findMany({
        where: { status: 'PENDING' },
        include: {
          assignedTo: {
            select: {
              username: true
            }
          }
        }
      }),
      // Property visits this week (grouped by user)
      prisma.property.groupBy({
        by: ['visitedBy'],
        where: { visited: true, visitedAt: { gte: startOfWeek }, visitedBy: { not: null } },
        _count: { visitedBy: true }
      }),
      // PreForeclosure visits this week (grouped by user)
      prisma.preForeclosure.groupBy({
        by: ['visitedBy'],
        where: { visited: true, visitedAt: { gte: startOfWeek }, visitedBy: { not: null } },
        _count: { visitedBy: true }
      })
    ]);

    // Format the response - only use fields that exist in Property model
    const byStatus = {};
    if (statusCounts && Array.isArray(statusCounts)) {
      statusCounts.forEach(item => {
        if (item && item.status) {
          byStatus[item.status.toLowerCase()] = item._count?.status || 0;
        }
      });
    }

    const byDealStage = {};
    if (dealStageCounts && Array.isArray(dealStageCounts)) {
      dealStageCounts.forEach(item => {
        if (item && item.dealStage) {
          // Convert NEW_LEAD to new_lead format
          byDealStage[item.dealStage.toLowerCase()] = item._count?.dealStage || 0;
        }
      });
    }

    // Calculate task stats by user (Luciano, Raul)
    const lucianoTasks = Array.isArray(tasksByUser) 
      ? tasksByUser.filter(t => t && t.assignedTo && t.assignedTo.username && t.assignedTo.username.toLowerCase() === 'luciano').length
      : 0;
    const raulTasks = Array.isArray(tasksByUser)
      ? tasksByUser.filter(t => t && t.assignedTo && t.assignedTo.username && t.assignedTo.username.toLowerCase() === 'raul').length
      : 0;

    const taskStats = {
      total: tasksByUser.length,
      luciano: lucianoTasks,
      raul: raulTasks,
      // Keep legacy fields for compatibility
      callsDueToday: 0,
      followUpsThisWeek: 0,
      textsScheduled: 0,
      mailCampaignActive: 0,
      drivebyPlanned: 0
    };

    // Aggregate weekly visits by user (combine Property + PreForeclosure)
    const weeklyVisitsMap = {};
    if (Array.isArray(propertyVisitsThisWeek)) {
      for (const item of propertyVisitsThisWeek) {
        if (item.visitedBy) {
          if (!weeklyVisitsMap[item.visitedBy]) weeklyVisitsMap[item.visitedBy] = { properties: 0, preForeclosures: 0 };
          weeklyVisitsMap[item.visitedBy].properties = item._count.visitedBy;
        }
      }
    }
    if (Array.isArray(preForeclosureVisitsThisWeek)) {
      for (const item of preForeclosureVisitsThisWeek) {
        if (item.visitedBy) {
          if (!weeklyVisitsMap[item.visitedBy]) weeklyVisitsMap[item.visitedBy] = { properties: 0, preForeclosures: 0 };
          weeklyVisitsMap[item.visitedBy].preForeclosures = item._count.visitedBy;
        }
      }
    }
    const weeklyVisits = Object.entries(weeklyVisitsMap).map(([user, counts]) => ({
      user,
      properties: counts.properties,
      preForeclosures: counts.preForeclosures,
      total: counts.properties + counts.preForeclosures
    })).sort((a, b) => b.total - a.total);

    // Format amount due ranges - ensure array exists and has values
    const amountDueDistribution = Array.isArray(amountDueRanges) && amountDueRanges.length >= 5
      ? [
          { range: '$0-$5K', count: amountDueRanges[0] || 0, color: '#3B82F6' },
          { range: '$5K-$10K', count: amountDueRanges[1] || 0, color: '#8B5CF6' },
          { range: '$10K-$25K', count: amountDueRanges[2] || 0, color: '#EC4899' },
          { range: '$25K-$50K', count: amountDueRanges[3] || 0, color: '#F59E0B' },
          { range: '$50K+', count: amountDueRanges[4] || 0, color: '#EF4444' }
        ]
      : [
          { range: '$0-$5K', count: 0, color: '#3B82F6' },
          { range: '$5K-$10K', count: 0, color: '#8B5CF6' },
          { range: '$10K-$25K', count: 0, color: '#EC4899' },
          { range: '$25K-$50K', count: 0, color: '#F59E0B' },
          { range: '$50K+', count: 0, color: '#EF4444' }
        ];

    // Ensure all values are safe numbers
    const totalProperties = financialStats?._count || 0;
    const totalAmountDue = financialStats?._sum?.totalDue || 0;
    const avgAmountDue = financialStats?._avg?.totalDue || 0;
    const totalPipelineValue = financialStats?._sum?.estimatedDealValue || 0;
    const totalTasks = Array.isArray(tasksByUser) ? tasksByUser.length : 0;

    res.json({
      totalProperties,
      byStatus: byStatus || {},
      totalAmountDue,
      avgAmountDue,
      newThisMonth: newThisMonthCount || 0,
      removedThisMonth: removedThisMonthCount || 0,
      deadLeads: deadLeadsCount || 0,
      amountDueDistribution,
      pipeline: {
        totalValue: totalPipelineValue,
        activeDeals: (byDealStage.contacted || 0) + (byDealStage.interested || 0) + (byDealStage.offer_sent || 0) + (byDealStage.negotiating || 0),
        byStage: byDealStage || {},
        conversionRate: totalProperties > 0 
          ? parseFloat((((byDealStage.closed || 0) / totalProperties) * 100).toFixed(1))
          : 0,
        avgDealValue: (byDealStage.closed || 0) > 0
          ? Math.round(totalPipelineValue / (byDealStage.closed || 1))
          : 0
      },
      tasks: {
        total: totalTasks,
        luciano: lucianoTasks,
        raul: raulTasks,
        callsDueToday: 0,
        followUpsThisWeek: 0,
        textsScheduled: 0,
        mailCampaignActive: 0,
        drivebyPlanned: 0
      },
      weeklyVisits: {
        weekStartDate: startOfWeek.toISOString(),
        total: weeklyVisits.reduce((sum, v) => sum + v.total, 0),
        byUser: weeklyVisits
      }
    });
  } catch (error) {
    console.error('[PROPERTIES] Stats error:', error);
    console.error('[PROPERTIES] Error stack:', error.stack);
    // Return default values instead of error to prevent blank page
    res.json({
      totalProperties: 0,
      byStatus: {},
      totalAmountDue: 0,
      avgAmountDue: 0,
      newThisMonth: 0,
      removedThisMonth: 0,
      deadLeads: 0,
      amountDueDistribution: [
        { range: '$0-$5K', count: 0, color: '#3B82F6' },
        { range: '$5K-$10K', count: 0, color: '#8B5CF6' },
        { range: '$10K-$25K', count: 0, color: '#EC4899' },
        { range: '$25K-$50K', count: 0, color: '#F59E0B' },
        { range: '$50K+', count: 0, color: '#EF4444' }
      ],
      pipeline: {
        totalValue: 0,
        activeDeals: 0,
        byStage: {},
        conversionRate: 0,
        avgDealValue: 0
      },
      tasks: {
        total: 0,
        luciano: 0,
        raul: 0,
        callsDueToday: 0,
        followUpsThisWeek: 0,
        textsScheduled: 0,
        mailCampaignActive: 0,
        drivebyPlanned: 0
      },
      weeklyVisits: {
        weekStartDate: new Date().toISOString(),
        total: 0,
        byUser: []
      }
    });
  }
});

// ============================================================================
// UPDATE PROPERTY FOLLOW-UP DATE
// ============================================================================

router.put('/:id/followup', optionalAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { followUpDate } = req.body;

    if (!followUpDate) {
      return res.status(400).json({ error: 'followUpDate is required' });
    }

    // Check if property exists
    const property = await prisma.property.findUnique({
      where: { id }
    });

    if (!property) {
      return res.status(404).json({ error: 'Property not found' });
    }

    // Update the most recent pending task's dueTime, or create a new task if none exists
    const existingTask = await prisma.task.findFirst({
      where: {
        propertyId: id,
        status: 'PENDING'
      },
      orderBy: { createdAt: 'desc' }
    });

    const followUpDateTime = new Date(followUpDate);

    if (existingTask) {
      // Update existing task's due time
      await prisma.task.update({
        where: { id: existingTask.id },
        data: { dueTime: followUpDateTime }
      });
    } else {
      // Create a new task for follow-up (use system user if no auth)
      let userId = req.user?.id;
      if (!userId) {
        const systemUser = await prisma.user.findFirst({ where: { username: 'system' } }) ||
          await prisma.user.create({
            data: {
              username: 'system',
              email: 'system@countycadtracker.com',
              password: 'default',
              role: 'OPERATOR'
            }
          });
        userId = systemUser.id;
      }

      await prisma.task.create({
        data: {
          propertyId: id,
          actionType: 'CALL',
          priority: 'MEDIUM',
          status: 'PENDING',
          dueTime: followUpDateTime,
          createdById: userId
        }
      });
    }

    res.json({ 
      success: true, 
      message: 'Follow-up date updated',
      propertyId: id,
      followUpDate: followUpDateTime.toISOString()
    });
  } catch (error) {
    console.error('[PROPERTIES] Follow-up update error:', error);
    res.status(500).json({ error: 'Failed to update follow-up date' });
  }
});

// ============================================================================
// UPDATE PROPERTY NOTES
// ============================================================================

router.put('/:id/notes', optionalAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { notes } = req.body;

    if (notes === undefined) {
      return res.status(400).json({ error: 'notes field is required' });
    }

    const property = await prisma.property.update({
      where: { id },
      data: { notes: notes || null },
      select: {
        id: true,
        accountNumber: true,
        notes: true
      }
    });

    res.json(property);
  } catch (error) {
    console.error('[PROPERTIES] Notes update error:', error);
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Property not found' });
    }
    res.status(500).json({ error: 'Failed to update notes' });
  }
});

// ============================================================================
// UPDATE PROPERTY PHONE NUMBERS
// ============================================================================

router.put('/:id/phones', optionalAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { phoneNumbers, ownerPhoneIndex, contacts } = req.body;

    if (!Array.isArray(phoneNumbers)) {
      return res.status(400).json({ error: 'phoneNumbers must be an array' });
    }

    const updateData = {
      phoneNumbers: phoneNumbers.filter(p => p && p.trim().length > 0),
    };

    if (ownerPhoneIndex !== undefined) {
      updateData.ownerPhoneIndex = ownerPhoneIndex >= 0 && ownerPhoneIndex < phoneNumbers.length
        ? ownerPhoneIndex
        : null;
    }

    // Also persist structured contacts JSON if provided
    if (contacts !== undefined) {
      updateData.contacts = contacts;
    }

    const property = await prisma.property.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        accountNumber: true,
        phoneNumbers: true,
        ownerPhoneIndex: true,
        contacts: true,
      }
    });

    res.json(property);
  } catch (error) {
    console.error('[PROPERTIES] Phone numbers update error:', error);
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Property not found' });
    }
    res.status(500).json({ error: 'Failed to update phone numbers' });
  }
});

// ============================================================================
// UPDATE PROPERTY EMAILS
// ============================================================================

router.put('/:id/emails', optionalAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { emails, contacts } = req.body;

    if (!Array.isArray(emails)) {
      return res.status(400).json({ error: 'emails must be an array' });
    }

    const updateData = {
      emails: emails.filter(e => e && e.trim().length > 0),
    };

    // Also persist structured contacts JSON if provided
    if (contacts !== undefined) {
      updateData.contacts = contacts;
    }

    const property = await prisma.property.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        accountNumber: true,
        emails: true,
        contacts: true,
      }
    });

    res.json(property);
  } catch (error) {
    console.error('[PROPERTIES] Emails update error:', error);
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Property not found' });
    }
    res.status(500).json({ error: 'Failed to update emails' });
  }
});

// ============================================================================
// UPDATE PROPERTY PRIORITY (updates related task priority)
// ============================================================================

router.put('/:id/priority', optionalAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { priority } = req.body;

    if (!priority) {
      return res.status(400).json({ error: 'priority is required' });
    }

    // Map frontend priority to database enum
    const priorityMap = {
      'high': 'HIGH',
      'med': 'MEDIUM',
      'medium': 'MEDIUM',
      'low': 'LOW'
    };
    const dbPriority = priorityMap[priority.toLowerCase()];
    if (!dbPriority) {
      return res.status(400).json({ error: 'Invalid priority. Must be: high, med, or low' });
    }

    // Check if property exists
    const property = await prisma.property.findUnique({
      where: { id }
    });

    if (!property) {
      return res.status(404).json({ error: 'Property not found' });
    }

    // Find the most recent pending task for this property and update its priority
    const task = await prisma.task.findFirst({
      where: {
        propertyId: id,
        status: 'PENDING'
      },
      orderBy: { createdAt: 'desc' }
    });

    if (task) {
      const updatedTask = await prisma.task.update({
        where: { id: task.id },
        data: { priority: dbPriority },
        include: {
          property: {
            select: { id: true, accountNumber: true }
          }
        }
      });

      res.json(updatedTask);
    } else {
      // No pending task found - return property info
      res.json({
        message: 'No pending task found for this property',
        propertyId: id
      });
    }
  } catch (error) {
    console.error('[PROPERTIES] Priority update error:', error);
    res.status(500).json({ error: 'Failed to update priority' });
  }
});

// ============================================================================
// MARK TASK AS DONE
// ============================================================================

router.put('/:id/task-done', optionalAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { outcome, nextAction } = req.body;

    if (!outcome) {
      return res.status(400).json({ error: 'outcome is required' });
    }

    // Map frontend outcome to database enum (TaskOutcome)
    const outcomeMap = {
      'no_answer': 'NO_ANSWER',
      'voicemail': 'VOICEMAIL',
      'text_sent': 'TEXT_SENT',
      'spoke_owner': 'SPOKE_OWNER',
      'wrong_number': 'WRONG_NUMBER',
      'not_interested': 'NOT_INTERESTED',
      'new_owner': 'NEW_OWNER',
      'call_back_later': 'CALL_BACK_LATER'
    };
    const dbOutcome = outcomeMap[outcome.toLowerCase()];
    if (!dbOutcome) {
      return res.status(400).json({ error: 'Invalid outcome' });
    }

    // Find the most recent pending task for this property
    const task = await prisma.task.findFirst({
      where: {
        propertyId: id,
        status: 'PENDING'
      },
      orderBy: { createdAt: 'desc' }
    });

    if (!task) {
      return res.status(404).json({ error: 'No pending task found for this property' });
    }

    // Update task to completed
    const updateData = {
      status: 'COMPLETED',
      completedAt: new Date(),
      outcome: dbOutcome
    };

    // If nextAction is provided, create a new task
    if (nextAction) {
      const actionTypeMap = {
        'call': 'CALL',
        'text': 'TEXT',
        'mail': 'MAIL',
        'driveby': 'DRIVEBY'
      };
      const dbNextAction = actionTypeMap[nextAction.toLowerCase()];
      if (dbNextAction) {
        // Create new task with next action (due in 7 days by default)
        const nextDueDate = new Date();
        nextDueDate.setDate(nextDueDate.getDate() + 7);
        
        await prisma.task.create({
          data: {
            propertyId: id,
            actionType: dbNextAction,
            priority: task.priority, // Keep same priority
            status: 'PENDING',
            dueTime: nextDueDate,
            assignedToId: task.assignedToId
          }
        });
      }
    }

    const updatedTask = await prisma.task.update({
      where: { id: task.id },
      data: updateData,
      include: {
        property: {
          select: { id: true, accountNumber: true }
        }
      }
    });

    res.json(updatedTask);
  } catch (error) {
    console.error('[PROPERTIES] Task done error:', error);
    res.status(500).json({ error: 'Failed to mark task as done' });
  }
});

// ============================================================================
// UPDATE PROPERTY DEAL STAGE
// ============================================================================

router.put('/:id/deal-stage', optionalAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { dealStage, estimatedDealValue, offerAmount, expectedCloseDate } = req.body;

    if (!dealStage) {
      return res.status(400).json({ error: 'dealStage is required' });
    }

    // Map frontend deal stage to database enum
    const dealStageMap = {
      'new_lead': 'NEW_LEAD',
      'contacted': 'CONTACTED',
      'interested': 'INTERESTED',
      'offer_sent': 'OFFER_SENT',
      'negotiating': 'NEGOTIATING',
      'under_contract': 'UNDER_CONTRACT',
      'closed': 'CLOSED',
      'dead': 'DEAD'
    };
    const dbDealStage = dealStageMap[dealStage.toLowerCase()];
    if (!dbDealStage) {
      return res.status(400).json({ error: 'Invalid deal stage' });
    }

    const updateData = {
      dealStage: dbDealStage
    };

    if (estimatedDealValue !== undefined) {
      updateData.estimatedDealValue = estimatedDealValue;
    }
    if (offerAmount !== undefined) {
      updateData.offerAmount = offerAmount;
    }
    if (expectedCloseDate) {
      updateData.expectedCloseDate = new Date(expectedCloseDate);
    }

    const property = await prisma.property.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        accountNumber: true,
        dealStage: true,
        estimatedDealValue: true,
        offerAmount: true,
        expectedCloseDate: true
      }
    });

    res.json(property);
  } catch (error) {
    console.error('[PROPERTIES] Deal stage update error:', error);
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Property not found' });
    }
    res.status(500).json({ error: 'Failed to update deal stage' });
  }
});

// ============================================================================
// UPDATE PROPERTY WORKFLOW STAGE
// ============================================================================

router.put('/:id/workflow-stage', optionalAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { workflow_stage, workflow_log } = req.body;

    const validStages = [
      'not_started', 'initial_visit', 'waiting_to_be_contacted', 'people_search', 'call_owner',
      'land_records', 'visit_heirs', 'call_heirs', 'negotiating', 'comps', 'sent_offer', 'dead_end'
    ];

    if (!workflow_stage || !validStages.includes(workflow_stage)) {
      return res.status(400).json({ error: 'Invalid workflow_stage' });
    }

    const updateData = { workflowStage: workflow_stage };
    if (workflow_log !== undefined) {
      updateData.workflowLog = workflow_log;
    }

    const property = await prisma.property.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        accountNumber: true,
        workflowStage: true,
        workflowLog: true,
      }
    });

    res.json({
      id: property.id,
      accountNumber: property.accountNumber,
      workflow_stage: property.workflowStage || 'not_started',
      workflow_log: property.workflowLog || [],
    });
  } catch (error) {
    console.error('[PROPERTIES] Workflow stage update error:', error);
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Property not found' });
    }
    res.status(500).json({ error: 'Failed to update workflow stage' });
  }
});

// ============================================================================
// UPDATE PROPERTY VISITED STATUS
// ============================================================================

router.put('/:id/visited', optionalAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { visited, visitedBy } = req.body;

    if (typeof visited !== 'boolean') {
      return res.status(400).json({ error: 'visited must be a boolean' });
    }

    const updateData = {
      visited,
      visitedAt: visited ? new Date() : null,
      visitedBy: visited && visitedBy ? visitedBy : null
    };

    const property = await prisma.property.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        visited: true,
        visitedAt: true,
        visitedBy: true
      }
    });

    res.json({
      success: true,
      property
    });
  } catch (error) {
    console.error('[PROPERTIES] Update visited status error:', error);
    res.status(500).json({ 
      error: 'Failed to update visited status', 
      message: error.message 
    });
  }
});

// Toggle primary/2nd property override
router.put('/:id/primary-override', optionalAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { isPrimary } = req.body; // true = primary, false = 2nd, null = auto-detect

    const property = await prisma.property.update({
      where: { id },
      data: { isPrimaryOverride: isPrimary === null ? null : !!isPrimary },
      select: { id: true, isPrimaryOverride: true }
    });

    res.json({ success: true, property });
  } catch (error) {
    console.error('[PROPERTIES] Update primary override error:', error);
    res.status(500).json({ error: 'Failed to update', message: error.message });
  }
});

// ============================================================================
// BATCH GEOCODE PROPERTIES
// ============================================================================

router.post('/geocode/batch', optionalAuth, async (req, res) => {
  try {
    const { limit: limitParam, offset: offsetParam } = req.body;
    const limit = limitParam ? parseInt(limitParam) : 100; // Default batch size
    const offset = offsetParam ? parseInt(offsetParam) : 0;

    // Fetch properties without coordinates but with addresses
    // Note: propertyAddress is non-nullable (String @default("")), so we filter
    // out empty strings in JavaScript after fetching
    const allProperties = await prisma.property.findMany({
      where: {
        OR: [
          { latitude: null },
          { longitude: null }
        ]
      },
      select: {
        id: true,
        propertyAddress: true,
        accountNumber: true,
        latitude: true,
        longitude: true
      },
      take: limit * 2, // Fetch more to account for filtering
      skip: offset,
      orderBy: { createdAt: 'asc' }
    });
    
    // Filter out empty strings in JavaScript (propertyAddress is non-nullable but can be empty)
    const properties = allProperties.filter(p => 
      p.propertyAddress && p.propertyAddress.trim() !== ''
    ).slice(0, limit); // Take only the requested limit

    if (properties.length === 0) {
      return res.json({
        success: true,
        message: 'No properties need geocoding',
        processed: 0,
        total: 0,
        results: []
      });
    }

    // Geocode addresses using Nominatim
    // IMPORTANT: Nominatim has strict rate limiting (1 request per second)
    // Process sequentially with proper delays to avoid rate limit errors
    const results = [];
    const DELAY_MS = 1100; // 1.1 seconds between requests (slightly more than 1 req/sec)
    const MAX_RETRIES = 3;
    const RETRY_DELAY_MS = 5000; // 5 seconds delay on rate limit errors

    for (let i = 0; i < properties.length; i++) {
      const property = properties[i];
      
      // Skip if already has coordinates
      if (property.latitude && property.longitude) {
        results.push({
          id: property.id,
          accountNumber: property.accountNumber,
          success: true,
          skipped: true,
          message: 'Already has coordinates'
        });
        continue;
      }

      if (!property.propertyAddress || property.propertyAddress.trim() === '') {
        results.push({
          id: property.id,
          accountNumber: property.accountNumber,
          success: false,
          error: 'No address provided'
        });
        continue;
      }

      // Build search query
      const searchQuery = `${property.propertyAddress}, San Antonio, TX`;

      // Geocode using Nominatim with retry logic
      let retries = 0;
      let success = false;
      
      while (retries < MAX_RETRIES && !success) {
        try {
          const params = new URLSearchParams({
            q: searchQuery,
            format: 'json',
            limit: '1',
            addressdetails: '1',
          });
          const url = `https://nominatim.openstreetmap.org/search?${params.toString()}`;

          const response = await fetch(url, {
            headers: {
              'User-Agent': 'County-CAD-Tracker/1.0',
            },
          });

          // Handle rate limiting (HTTP 429)
          if (response.status === 429) {
            retries++;
            if (retries < MAX_RETRIES) {
              console.warn(`[GEOCODE] Rate limited for property ${property.id}, retrying in ${RETRY_DELAY_MS}ms (attempt ${retries + 1}/${MAX_RETRIES})`);
              await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
              continue;
            } else {
              results.push({
                id: property.id,
                accountNumber: property.accountNumber,
                success: false,
                error: 'Rate limit exceeded after retries'
              });
              break;
            }
          }

          if (!response.ok) {
            results.push({
              id: property.id,
              accountNumber: property.accountNumber,
              success: false,
              error: `API returned ${response.status}: ${response.statusText}`
            });
            break;
          }

          const data = await response.json();

          if (!data || data.length === 0) {
            results.push({
              id: property.id,
              accountNumber: property.accountNumber,
              success: false,
              error: 'Address not found'
            });
            break;
          }

          const result = data[0];
          const latitude = parseFloat(result.lat);
          const longitude = parseFloat(result.lon);

          if (isNaN(latitude) || isNaN(longitude)) {
            results.push({
              id: property.id,
              accountNumber: property.accountNumber,
              success: false,
              error: 'Invalid coordinates returned'
            });
            break;
          }

          // Update property with coordinates
          await prisma.property.update({
            where: { id: property.id },
            data: {
              latitude,
              longitude
            }
          });

          results.push({
            id: property.id,
            accountNumber: property.accountNumber,
            success: true,
            latitude,
            longitude,
            displayName: result.display_name
          });
          
          success = true;
        } catch (error) {
          retries++;
          if (retries < MAX_RETRIES) {
            console.warn(`[GEOCODE] Error geocoding property ${property.id}, retrying (attempt ${retries + 1}/${MAX_RETRIES}):`, error.message);
            await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
          } else {
            console.error(`[GEOCODE] Error geocoding property ${property.id} after ${MAX_RETRIES} retries:`, error);
            results.push({
              id: property.id,
              accountNumber: property.accountNumber,
              success: false,
              error: error.message || 'Unknown error'
            });
            break;
          }
        }
      }

      // Rate limiting: wait between requests (except for last one)
      if (i < properties.length - 1) {
        await new Promise(resolve => setTimeout(resolve, DELAY_MS));
      }
    }

    const successCount = results.filter(r => r.success && !r.skipped).length;
    const errorCount = results.filter(r => !r.success).length;
    const skippedCount = results.filter(r => r.skipped).length;

    res.json({
      success: true,
      processed: results.length,
      successful: successCount,
      errors: errorCount,
      skipped: skippedCount,
      results: results
    });
  } catch (error) {
    console.error('[PROPERTIES] Batch geocode error:', error);
    console.error('[PROPERTIES] Error stack:', error.stack);
    res.status(500).json({ 
      error: 'Failed to geocode properties', 
      message: error.message || 'Unknown error',
      details: error.stack
    });
  }
});

// ============================================================================
// GET GEOCODE STATUS (count properties without coordinates)
// ============================================================================

router.get('/geocode/status', optionalAuth, async (req, res) => {
  try {
    const [totalProperties, propertiesWithoutCoords, propertiesWithCoords] = await Promise.all([
      prisma.property.count(),
      prisma.property.count({
        where: {
          OR: [
            { latitude: null },
            { longitude: null }
          ],
          propertyAddress: { not: '' }
        }
      }),
      prisma.property.count({
        where: {
          latitude: { not: null },
          longitude: { not: null }
        }
      })
    ]);

    res.json({
      total: totalProperties,
      withoutCoordinates: propertiesWithoutCoords,
      withCoordinates: propertiesWithCoords,
      percentageComplete: totalProperties > 0 
        ? ((propertiesWithCoords / totalProperties) * 100).toFixed(2)
        : 0
    });
  } catch (error) {
    console.error('[PROPERTIES] Geocode status error:', error);
    res.status(500).json({ error: 'Failed to get geocode status', message: error.message });
  }
});

// One-time sync: backfill Property.visited from RouteRecord data
router.post('/sync-visits', optionalAuth, async (req, res) => {
  try {
    // Find all RouteRecords that are visited and linked to a property
    const visitedRouteRecords = await prisma.routeRecord.findMany({
      where: {
        visited: true,
        propertyId: { not: null },
        visitedAt: { not: null },
      },
      select: {
        propertyId: true,
        visitedAt: true,
        visitedBy: true,
      },
      orderBy: { visitedAt: 'desc' },
    });

    // Group by propertyId, keep the most recent visit
    const latestByProperty = {};
    for (const rr of visitedRouteRecords) {
      if (!latestByProperty[rr.propertyId]) {
        latestByProperty[rr.propertyId] = rr;
      }
    }

    let updated = 0;
    for (const [propertyId, record] of Object.entries(latestByProperty)) {
      await prisma.property.update({
        where: { id: propertyId },
        data: {
          visited: true,
          visitedAt: record.visitedAt,
          visitedBy: record.visitedBy,
        },
      });
      updated++;
    }

    res.json({ success: true, synced: updated, message: `Synced ${updated} property visit records from routes` });
  } catch (error) {
    console.error('[PROPERTIES] Sync visits error:', error);
    res.status(500).json({ error: 'Failed to sync visits', message: error.message });
  }
});

// Backfill ownerName with situs address (PNUMBER + PSTRNAME) from Excel
router.post('/backfill-situs', optionalAuth, async (req, res) => {
  try {
    const { updates } = req.body; // Array of { accountNumber, ownerName, propertyAddress? }
    if (!Array.isArray(updates) || updates.length === 0) {
      return res.status(400).json({ error: 'updates array required' });
    }

    console.log(`[BACKFILL] Received ${updates.length} situs updates`);

    let updated = 0;
    const BATCH_SIZE = 500;

    for (let i = 0; i < updates.length; i += BATCH_SIZE) {
      const batch = updates.slice(i, i + BATCH_SIZE);
      const results = await Promise.allSettled(
        batch.map(item => {
          const data = {};
          if (item.ownerName) data.ownerName = item.ownerName;
          if (item.propertyAddress) data.propertyAddress = item.propertyAddress;
          const where = item.id ? { id: item.id } : { accountNumber: String(item.accountNumber) };
          return item.id
            ? prisma.property.update({ where, data })
            : prisma.property.updateMany({ where, data });
        })
      );
      updated += results.filter(r => r.status === 'fulfilled' && (r.value.count > 0 || r.value.id)).length;
      console.log(`[BACKFILL] Processed ${Math.min(i + BATCH_SIZE, updates.length)} / ${updates.length}`);
    }

    res.json({ success: true, updated, total: updates.length });
  } catch (error) {
    console.error('[BACKFILL] Error:', error);
    res.status(500).json({ error: 'Backfill failed', message: error.message });
  }
});

module.exports = router;
