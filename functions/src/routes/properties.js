/**
 * Property Management Routes
 * CRUD operations for properties with advanced filtering
 */

const express = require('express');
const { body, query, validationResult } = require('express-validator');
const { PrismaClient } = require('@prisma/client');
const { optionalAuth, authenticateToken } = require('../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();

// ============================================================================
// GET ALL PROPERTIES (with filtering and pagination)
// ============================================================================

router.get('/',
  optionalAuth,
  [
    query('page').optional().isInt({ min: 1 }).toInt(),
    query('limit').optional().isInt({ min: 1, max: 1000 }).toInt(),
    query('status').optional().isIn(['JUDGMENT', 'ACTIVE', 'PENDING', 'PAID', 'REMOVED']),
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
        limit = 100,
        status,
        dealStage,
        search,
        sortBy = 'createdAt',
        sortOrder = 'desc'
      } = req.query;

      // Build where clause
      const where = {};
      if (status) where.status = status;
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

      // Get properties
      const properties = await prisma.property.findMany({
        where,
        include: {
          _count: {
            select: {
              notes: true,
              tasks: true
            }
          }
        },
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { [sortBy]: sortOrder }
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

      res.json({
        properties,
        total,
        totalUnfiltered: total, // For now, same as total (can be optimized later)
        totalPages: Math.ceil(total / limit),
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

    res.json(property);
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
