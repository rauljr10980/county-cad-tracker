const express = require('express');
const router = express.Router();
const { optionalAuth } = require('../middleware/auth');
const prisma = require('../lib/prisma');

// GET /api/routes - Get all routes (active by default, or all if status query param)
router.get('/', optionalAuth, async (req, res) => {
  try {
    const { status } = req.query;
    const where = status ? { status: status.toUpperCase() } : {};
    
    const routes = await prisma.route.findMany({
      where,
      include: {
        records: {
          include: {
            preForeclosure: {
              select: {
                id: true,
                documentNumber: true,
                address: true,
                city: true,
                zip: true,
                latitude: true,
                longitude: true,
                visited: true,
                visitedAt: true,
                visitedBy: true,
              }
            }
          },
          orderBy: {
            orderIndex: 'asc'
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    // Format response
    const formattedRoutes = routes.map(route => ({
      id: route.id,
      driver: route.driver,
      status: route.status,
      routeData: route.routeData,
      createdAt: route.createdAt,
      finishedAt: route.finishedAt,
      updatedAt: route.updatedAt,
      recordCount: route.records.length,
      records: route.records.map(rr => ({
        id: rr.id,
        orderIndex: rr.orderIndex,
        isDepot: rr.isDepot,
        record: rr.preForeclosure ? {
          id: rr.preForeclosure.id,
          document_number: rr.preForeclosure.documentNumber,
          documentNumber: rr.preForeclosure.documentNumber, // Also include camelCase for compatibility
          address: rr.preForeclosure.address,
          city: rr.preForeclosure.city,
          zip: rr.preForeclosure.zip,
          latitude: rr.preForeclosure.latitude,
          longitude: rr.preForeclosure.longitude,
          visited: rr.preForeclosure.visited || false,
          visited_at: rr.preForeclosure.visitedAt ? rr.preForeclosure.visitedAt.toISOString() : null,
          visited_by: rr.preForeclosure.visitedBy || null,
          visitedAt: rr.preForeclosure.visitedAt ? rr.preForeclosure.visitedAt.toISOString() : null, // Also include camelCase
          visitedBy: rr.preForeclosure.visitedBy || null // Also include camelCase
        } : null
      }))
    }));

    res.json(formattedRoutes);
  } catch (error) {
    console.error('[ROUTES] Fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch routes' });
  }
});

// GET /api/routes/active - Get only active routes
router.get('/active', optionalAuth, async (req, res) => {
  try {
    const routes = await prisma.route.findMany({
      where: {
        status: 'ACTIVE'
      },
      include: {
        records: {
          include: {
            preForeclosure: {
              select: {
                id: true,
                documentNumber: true,
                address: true,
                city: true,
                zip: true,
                latitude: true,
                longitude: true,
                visited: true,
                visitedAt: true,
                visitedBy: true,
              }
            }
          },
          orderBy: {
            orderIndex: 'asc'
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    // Format response
    const formattedRoutes = routes.map(route => ({
      id: route.id,
      driver: route.driver,
      status: route.status,
      routeData: route.routeData,
      createdAt: route.createdAt,
      recordCount: route.records.length,
      records: route.records.map(rr => ({
        id: rr.id,
        orderIndex: rr.orderIndex,
        isDepot: rr.isDepot,
        record: rr.preForeclosure ? {
          id: rr.preForeclosure.id,
          document_number: rr.preForeclosure.documentNumber,
          documentNumber: rr.preForeclosure.documentNumber, // Also include camelCase for compatibility
          address: rr.preForeclosure.address,
          city: rr.preForeclosure.city,
          zip: rr.preForeclosure.zip,
          latitude: rr.preForeclosure.latitude,
          longitude: rr.preForeclosure.longitude,
          visited: rr.preForeclosure.visited || false,
          visited_at: rr.preForeclosure.visitedAt ? rr.preForeclosure.visitedAt.toISOString() : null,
          visited_by: rr.preForeclosure.visitedBy || null,
          visitedAt: rr.preForeclosure.visitedAt ? rr.preForeclosure.visitedAt.toISOString() : null, // Also include camelCase
          visitedBy: rr.preForeclosure.visitedBy || null // Also include camelCase
        } : null
      }))
    }));

    res.json(formattedRoutes);
  } catch (error) {
    console.error('[ROUTES] Active routes fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch active routes' });
  }
});

// POST /api/routes - Create a new route
router.post('/', optionalAuth, async (req, res) => {
  try {
    const { driver, routeData, recordIds } = req.body;

    if (!driver || !routeData || !recordIds || !Array.isArray(recordIds)) {
      return res.status(400).json({ error: 'driver, routeData, and recordIds array are required' });
    }

    // Validate driver name
    if (driver !== 'Luciano' && driver !== 'Raul') {
      return res.status(400).json({ error: 'driver must be "Luciano" or "Raul"' });
    }

    // Verify all records exist
    const records = await prisma.preForeclosure.findMany({
      where: {
        documentNumber: { in: recordIds }
      }
    });

    if (records.length !== recordIds.length) {
      return res.status(400).json({ error: 'Some records not found' });
    }

    // Create route with records
    const route = await prisma.route.create({
      data: {
        driver,
        status: 'ACTIVE',
        routeData,
        records: {
          create: recordIds.map((documentNumber, index) => {
            const record = records.find(r => r.documentNumber === documentNumber);
            if (!record) {
              throw new Error(`Record ${documentNumber} not found`);
            }
            // Find if this is the depot in routeData
            const isDepot = routeData.routes?.[0]?.waypoints?.[0]?.id === documentNumber ||
                           routeData.routes?.[0]?.waypoints?.[0]?.originalId === documentNumber;
            
            return {
              preForeclosureId: record.id,
              orderIndex: index,
              isDepot: isDepot || false
            };
          })
        }
      },
      include: {
        records: {
          include: {
            preForeclosure: {
              select: {
                id: true,
                documentNumber: true,
                address: true,
                city: true,
                zip: true,
                latitude: true,
                longitude: true,
              }
            }
          }
        }
      }
    });

    res.json({
      id: route.id,
      driver: route.driver,
      status: route.status,
      createdAt: route.createdAt,
      recordCount: route.records.length
    });
  } catch (error) {
    console.error('[ROUTES] Create error:', error);
    res.status(500).json({ error: 'Failed to create route' });
  }
});

// PUT /api/routes/:id/finish - Mark route as finished
router.put('/:id/finish', optionalAuth, async (req, res) => {
  try {
    const { id } = req.params;

    const route = await prisma.route.update({
      where: { id },
      data: {
        status: 'FINISHED',
        finishedAt: new Date()
      }
    });

    res.json(route);
  } catch (error) {
    console.error('[ROUTES] Finish route error:', error);
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Route not found' });
    }
    res.status(500).json({ error: 'Failed to finish route' });
  }
});

// PUT /api/routes/:id/cancel - Cancel route
router.put('/:id/cancel', optionalAuth, async (req, res) => {
  try {
    const { id } = req.params;

    const route = await prisma.route.update({
      where: { id },
      data: {
        status: 'CANCELLED',
        finishedAt: new Date()
      }
    });

    res.json(route);
  } catch (error) {
    console.error('[ROUTES] Cancel route error:', error);
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Route not found' });
    }
    res.status(500).json({ error: 'Failed to cancel route' });
  }
});

// DELETE /api/routes/:id - Delete route (preserves pre-foreclosure records and their visited status)
router.delete('/:id', optionalAuth, async (req, res) => {
  try {
    const { id } = req.params;

    // Delete the route - this will cascade delete RouteRecord entries
    // but NOT the PreForeclosure records themselves, preserving visited status and details
    await prisma.route.delete({
      where: { id }
    });

    res.json({ success: true, message: 'Route deleted successfully' });
  } catch (error) {
    console.error('[ROUTES] Delete route error:', error);
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Route not found' });
    }
    res.status(500).json({ error: 'Failed to delete route' });
  }
});

module.exports = router;

