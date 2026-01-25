const express = require('express');
const router = express.Router();
const { optionalAuth } = require('../middleware/auth');
const prisma = require('../lib/prisma');

// Helper function to format route record based on type
function formatRouteRecord(routeRecord) {
  if (routeRecord.preForeclosure) {
    return {
      id: routeRecord.preForeclosure.id,
      document_number: routeRecord.preForeclosure.documentNumber,
      documentNumber: routeRecord.preForeclosure.documentNumber,
      address: routeRecord.preForeclosure.address,
      city: routeRecord.preForeclosure.city,
      zip: routeRecord.preForeclosure.zip,
      latitude: routeRecord.preForeclosure.latitude,
      longitude: routeRecord.preForeclosure.longitude,
      visited: routeRecord.preForeclosure.visited || false,
      visited_at: routeRecord.preForeclosure.visitedAt ? routeRecord.preForeclosure.visitedAt.toISOString() : null,
      visited_by: routeRecord.preForeclosure.visitedBy || null,
      visitedAt: routeRecord.preForeclosure.visitedAt ? routeRecord.preForeclosure.visitedAt.toISOString() : null,
      visitedBy: routeRecord.preForeclosure.visitedBy || null
    };
  } else if (routeRecord.property) {
    return {
      id: routeRecord.property.id,
      accountNumber: routeRecord.property.accountNumber,
      ownerName: routeRecord.property.ownerName,
      propertyAddress: routeRecord.property.propertyAddress,
      address: routeRecord.property.propertyAddress, // Alias for compatibility
      latitude: routeRecord.property.latitude,
      longitude: routeRecord.property.longitude,
      totalDue: routeRecord.property.totalDue,
      status: routeRecord.property.status,
      // Include visited status from RouteRecord (for properties, stored on RouteRecord)
      visited: routeRecord.visited || false,
      visited_at: routeRecord.visitedAt ? routeRecord.visitedAt.toISOString() : null,
      visited_by: routeRecord.visitedBy || null,
      visitedAt: routeRecord.visitedAt ? routeRecord.visitedAt.toISOString() : null,
      visitedBy: routeRecord.visitedBy || null
    };
  }
  return null;
}

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
            },
            property: {
              select: {
                id: true,
                accountNumber: true,
                ownerName: true,
                propertyAddress: true,
                latitude: true,
                longitude: true,
                totalDue: true,
                status: true,
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
      routeType: route.routeType,
      routeData: route.routeData,
      createdAt: route.createdAt,
      finishedAt: route.finishedAt,
      updatedAt: route.updatedAt,
      recordCount: route.records.length,
      records: route.records.map(rr => ({
        id: rr.id,
        orderIndex: rr.orderIndex,
        isDepot: rr.isDepot,
        visited: rr.visited || false, // Include visited status from RouteRecord (for properties)
        visitedAt: rr.visitedAt ? rr.visitedAt.toISOString() : null,
        visitedBy: rr.visitedBy || null,
        record: formatRouteRecord(rr)
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
            },
            property: {
              select: {
                id: true,
                accountNumber: true,
                ownerName: true,
                propertyAddress: true,
                latitude: true,
                longitude: true,
                totalDue: true,
                status: true,
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
      routeType: route.routeType,
      routeData: route.routeData,
      createdAt: route.createdAt,
      recordCount: route.records.length,
      records: route.records.map(rr => ({
        id: rr.id,
        orderIndex: rr.orderIndex,
        isDepot: rr.isDepot,
        visited: rr.visited || false, // Include visited status from RouteRecord (for properties)
        visitedAt: rr.visitedAt ? rr.visitedAt.toISOString() : null,
        visitedBy: rr.visitedBy || null,
        record: formatRouteRecord(rr)
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
    const { driver, routeData, recordIds, routeType = 'PREFORECLOSURE' } = req.body;

    if (!driver || !routeData || !recordIds || !Array.isArray(recordIds)) {
      return res.status(400).json({ error: 'driver, routeData, and recordIds array are required' });
    }

    // Validate driver name
    if (driver !== 'Luciano' && driver !== 'Raul') {
      return res.status(400).json({ error: 'driver must be "Luciano" or "Raul"' });
    }

    // Validate routeType
    if (routeType !== 'PROPERTY' && routeType !== 'PREFORECLOSURE') {
      return res.status(400).json({ error: 'routeType must be "PROPERTY" or "PREFORECLOSURE"' });
    }

    let records;
    let routeRecordsData;

    if (routeType === 'PROPERTY') {
      // For properties, recordIds are property IDs
      records = await prisma.property.findMany({
        where: {
          id: { in: recordIds }
        }
      });

      if (records.length !== recordIds.length) {
        return res.status(400).json({ error: 'Some property records not found' });
      }

      routeRecordsData = recordIds.map((propertyId, index) => {
        const record = records.find(r => r.id === propertyId);
        if (!record) {
          throw new Error(`Property ${propertyId} not found`);
        }
        // Find if this is the depot in routeData
        const isDepot = routeData.routes?.[0]?.waypoints?.[0]?.id === propertyId ||
                       routeData.routes?.[0]?.waypoints?.[0]?.originalId === propertyId;

        return {
          propertyId: record.id,
          orderIndex: index,
          isDepot: isDepot || false
        };
      });
    } else {
      // For pre-foreclosures, recordIds are document numbers
      records = await prisma.preForeclosure.findMany({
        where: {
          documentNumber: { in: recordIds }
        }
      });

      if (records.length !== recordIds.length) {
        return res.status(400).json({ error: 'Some pre-foreclosure records not found' });
      }

      routeRecordsData = recordIds.map((documentNumber, index) => {
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
      });
    }

    // Create route with records
    const route = await prisma.route.create({
      data: {
        driver,
        status: 'ACTIVE',
        routeType,
        routeData,
        records: {
          create: routeRecordsData
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
            },
            property: {
              select: {
                id: true,
                accountNumber: true,
                ownerName: true,
                propertyAddress: true,
                latitude: true,
                longitude: true,
                totalDue: true,
                status: true,
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
      routeType: route.routeType,
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

// DELETE /api/routes/:routeId/records/:recordId - Remove a specific record from a route
router.delete('/:routeId/records/:recordId', optionalAuth, async (req, res) => {
  try {
    const { routeId, recordId } = req.params;

    // Verify route exists
    const route = await prisma.route.findUnique({
      where: { id: routeId },
      include: {
        records: {
          where: { id: recordId }
        }
      }
    });

    if (!route) {
      return res.status(404).json({ error: 'Route not found' });
    }

    if (route.records.length === 0) {
      return res.status(404).json({ error: 'Record not found in route' });
    }

    const recordToRemove = route.records[0];

    // IMPORTANT: Only delete the RouteRecord entry (the association between route and pre-foreclosure record)
    // DO NOT delete the PreForeclosure record itself - this preserves all property information
    // including visited status, notes, dates, and other details
    await prisma.routeRecord.delete({
      where: { id: recordId }
    });

    // Get updated route with remaining records
    const updatedRoute = await prisma.route.findUnique({
      where: { id: routeId },
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
            },
            property: {
              select: {
                id: true,
                accountNumber: true,
                ownerName: true,
                propertyAddress: true,
                latitude: true,
                longitude: true,
                totalDue: true,
                status: true,
              }
            }
          },
          orderBy: {
            orderIndex: 'asc'
          }
        }
      }
    });

    // Reorder remaining records (update orderIndex to be sequential)
    if (updatedRoute && updatedRoute.records.length > 0) {
      await Promise.all(
        updatedRoute.records.map((rr, index) => {
          return prisma.routeRecord.update({
            where: { id: rr.id },
            data: { orderIndex: index }
          });
        })
      );
    }

    // Format response
    const formattedRoute = {
      id: updatedRoute.id,
      driver: updatedRoute.driver,
      status: updatedRoute.status,
      routeType: updatedRoute.routeType,
      routeData: updatedRoute.routeData,
      createdAt: updatedRoute.createdAt,
      finishedAt: updatedRoute.finishedAt,
      updatedAt: updatedRoute.updatedAt,
      recordCount: updatedRoute.records.length,
      records: updatedRoute.records.map(rr => ({
        id: rr.id,
        orderIndex: rr.orderIndex,
        isDepot: rr.isDepot,
        record: formatRouteRecord(rr)
      }))
    };

    res.json({ success: true, route: formattedRoute, message: 'Record removed from route successfully' });
  } catch (error) {
    console.error('[ROUTES] Remove record from route error:', error);
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Route or record not found' });
    }
    res.status(500).json({ error: 'Failed to remove record from route' });
  }
});

// PUT /api/routes/:routeId/records/:recordId/reorder - Reorder a record in a route
router.put('/:routeId/records/:recordId/reorder', optionalAuth, async (req, res) => {
  try {
    const { routeId, recordId } = req.params;
    const { newOrderIndex } = req.body;

    if (typeof newOrderIndex !== 'number' || newOrderIndex < 0) {
      return res.status(400).json({ error: 'newOrderIndex must be a non-negative number' });
    }

    // Get the route with all records
    const route = await prisma.route.findUnique({
      where: { id: routeId },
      include: {
        records: {
          orderBy: {
            orderIndex: 'asc'
          }
        }
      }
    });

    if (!route) {
      return res.status(404).json({ error: 'Route not found' });
    }

    // Find the record to move
    const recordToMove = route.records.find(rr => rr.id === recordId);
    if (!recordToMove) {
      return res.status(404).json({ error: 'Record not found in route' });
    }

    const oldOrderIndex = recordToMove.orderIndex;
    const maxIndex = route.records.length - 1;

    // Clamp newOrderIndex to valid range
    const clampedNewIndex = Math.min(Math.max(0, newOrderIndex), maxIndex);

    if (oldOrderIndex === clampedNewIndex) {
      // No change needed
      const updatedRoute = await prisma.route.findUnique({
        where: { id: routeId },
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
              },
              property: {
                select: {
                  id: true,
                  accountNumber: true,
                  ownerName: true,
                  propertyAddress: true,
                  latitude: true,
                  longitude: true,
                  totalDue: true,
                  status: true,
                }
              }
            },
            orderBy: {
              orderIndex: 'asc'
            }
          }
        }
      });

      const formattedRoute = {
        id: updatedRoute.id,
        driver: updatedRoute.driver,
        status: updatedRoute.status,
        routeType: updatedRoute.routeType,
        routeData: updatedRoute.routeData,
        createdAt: updatedRoute.createdAt,
        finishedAt: updatedRoute.finishedAt,
        updatedAt: updatedRoute.updatedAt,
        recordCount: updatedRoute.records.length,
        records: updatedRoute.records.map(rr => ({
          id: rr.id,
          orderIndex: rr.orderIndex,
          isDepot: rr.isDepot,
          visited: rr.visited || false,
          visitedAt: rr.visitedAt ? rr.visitedAt.toISOString() : null,
          visitedBy: rr.visitedBy || null,
          record: formatRouteRecord(rr)
        }))
      };

      return res.json({ success: true, route: formattedRoute });
    }

    // Reorder: shift records between old and new positions
    const recordsToUpdate = route.records.map(rr => {
      if (rr.id === recordId) {
        return { ...rr, orderIndex: clampedNewIndex };
      } else if (oldOrderIndex < clampedNewIndex) {
        // Moving down: shift records up
        if (rr.orderIndex > oldOrderIndex && rr.orderIndex <= clampedNewIndex) {
          return { ...rr, orderIndex: rr.orderIndex - 1 };
        }
      } else {
        // Moving up: shift records down
        if (rr.orderIndex >= clampedNewIndex && rr.orderIndex < oldOrderIndex) {
          return { ...rr, orderIndex: rr.orderIndex + 1 };
        }
      }
      return rr;
    });

    // Update all affected records
    await Promise.all(
      recordsToUpdate.map(rr => 
        prisma.routeRecord.update({
          where: { id: rr.id },
          data: { orderIndex: rr.orderIndex }
        })
      )
    );

    // Get updated route
    const updatedRoute = await prisma.route.findUnique({
      where: { id: routeId },
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
            },
            property: {
              select: {
                id: true,
                accountNumber: true,
                ownerName: true,
                propertyAddress: true,
                latitude: true,
                longitude: true,
                totalDue: true,
                status: true,
              }
            }
          },
          orderBy: {
            orderIndex: 'asc'
          }
        }
      }
    });

    const formattedRoute = {
      id: updatedRoute.id,
      driver: updatedRoute.driver,
      status: updatedRoute.status,
      routeType: updatedRoute.routeType,
      routeData: updatedRoute.routeData,
      createdAt: updatedRoute.createdAt,
      finishedAt: updatedRoute.finishedAt,
      updatedAt: updatedRoute.updatedAt,
      recordCount: updatedRoute.records.length,
      records: updatedRoute.records.map(rr => ({
        id: rr.id,
        orderIndex: rr.orderIndex,
        isDepot: rr.isDepot,
        record: formatRouteRecord(rr)
      }))
    };

    res.json({ success: true, route: formattedRoute });
  } catch (error) {
    console.error('[Routes] Error reordering record:', error);
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Route or record not found' });
    }
    res.status(500).json({ error: 'Failed to reorder record in route' });
  }
});

module.exports = router;

