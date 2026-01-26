const express = require('express');
const router = express.Router();
const { optionalAuth } = require('../middleware/auth');
const prisma = require('../lib/prisma');

// Helper function to format zone for response
function formatZone(zone) {
  return {
    id: zone.id,
    name: zone.name,
    description: zone.description || undefined,
    type: zone.type.toLowerCase(), // Convert RECTANGLE to rectangle
    color: zone.color,
    bounds: {
      north: zone.boundsNorth,
      south: zone.boundsSouth,
      east: zone.boundsEast,
      west: zone.boundsWest
    },
    center: zone.centerLat && zone.centerLng ? {
      lat: zone.centerLat,
      lng: zone.centerLng
    } : undefined,
    radius: zone.radius || undefined,
    polygon: zone.polygon || undefined,
    createdAt: zone.createdAt.toISOString(),
    updatedAt: zone.updatedAt.toISOString()
  };
}

// GET /api/zones - Get all zones
router.get('/', optionalAuth, async (req, res) => {
  try {
    const zones = await prisma.zone.findMany({
      orderBy: {
        createdAt: 'desc'
      }
    });

    const formattedZones = zones.map(formatZone);

    res.json({
      success: true,
      zones: formattedZones
    });
  } catch (error) {
    console.error('Error fetching zones:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch zones'
    });
  }
});

// GET /api/zones/:id - Get a specific zone
router.get('/:id', optionalAuth, async (req, res) => {
  try {
    const { id } = req.params;

    const zone = await prisma.zone.findUnique({
      where: { id }
    });

    if (!zone) {
      return res.status(404).json({
        success: false,
        error: 'Zone not found'
      });
    }

    res.json({
      success: true,
      zone: formatZone(zone)
    });
  } catch (error) {
    console.error('Error fetching zone:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch zone'
    });
  }
});

// POST /api/zones - Create a new zone
router.post('/', optionalAuth, async (req, res) => {
  try {
    const {
      name,
      description,
      type,
      color,
      bounds,
      center,
      radius,
      polygon
    } = req.body;

    // Validation
    if (!name || !type || !color || !bounds) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: name, type, color, bounds'
      });
    }

    if (!['rectangle', 'circle', 'polygon'].includes(type.toLowerCase())) {
      return res.status(400).json({
        success: false,
        error: 'Invalid zone type. Must be rectangle, circle, or polygon'
      });
    }

    // Validate bounds
    if (!bounds.north || !bounds.south || !bounds.east || !bounds.west) {
      return res.status(400).json({
        success: false,
        error: 'Bounds must include north, south, east, and west coordinates'
      });
    }

    // Create zone
    const zone = await prisma.zone.create({
      data: {
        name,
        description: description || null,
        type: type.toUpperCase(), // Store as RECTANGLE, CIRCLE, POLYGON
        color,
        boundsNorth: bounds.north,
        boundsSouth: bounds.south,
        boundsEast: bounds.east,
        boundsWest: bounds.west,
        centerLat: center?.lat || null,
        centerLng: center?.lng || null,
        radius: radius || null,
        polygon: polygon || null
      }
    });

    res.status(201).json({
      success: true,
      zone: formatZone(zone)
    });
  } catch (error) {
    console.error('Error creating zone:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create zone'
    });
  }
});

// PUT /api/zones/:id - Update a zone
router.put('/:id', optionalAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name,
      description,
      type,
      color,
      bounds,
      center,
      radius,
      polygon
    } = req.body;

    // Check if zone exists
    const existingZone = await prisma.zone.findUnique({
      where: { id }
    });

    if (!existingZone) {
      return res.status(404).json({
        success: false,
        error: 'Zone not found'
      });
    }

    // Build update data
    const updateData = {};

    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description || null;
    if (type !== undefined) {
      if (!['rectangle', 'circle', 'polygon'].includes(type.toLowerCase())) {
        return res.status(400).json({
          success: false,
          error: 'Invalid zone type. Must be rectangle, circle, or polygon'
        });
      }
      updateData.type = type.toUpperCase();
    }
    if (color !== undefined) updateData.color = color;

    if (bounds !== undefined) {
      if (!bounds.north || !bounds.south || !bounds.east || !bounds.west) {
        return res.status(400).json({
          success: false,
          error: 'Bounds must include north, south, east, and west coordinates'
        });
      }
      updateData.boundsNorth = bounds.north;
      updateData.boundsSouth = bounds.south;
      updateData.boundsEast = bounds.east;
      updateData.boundsWest = bounds.west;
    }

    if (center !== undefined) {
      updateData.centerLat = center?.lat || null;
      updateData.centerLng = center?.lng || null;
    }
    if (radius !== undefined) updateData.radius = radius || null;
    if (polygon !== undefined) updateData.polygon = polygon || null;

    // Update zone
    const zone = await prisma.zone.update({
      where: { id },
      data: updateData
    });

    res.json({
      success: true,
      zone: formatZone(zone)
    });
  } catch (error) {
    console.error('Error updating zone:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update zone'
    });
  }
});

// DELETE /api/zones/:id - Delete a zone
router.delete('/:id', optionalAuth, async (req, res) => {
  try {
    const { id } = req.params;

    // Check if zone exists
    const existingZone = await prisma.zone.findUnique({
      where: { id }
    });

    if (!existingZone) {
      return res.status(404).json({
        success: false,
        error: 'Zone not found'
      });
    }

    // Delete zone
    await prisma.zone.delete({
      where: { id }
    });

    res.json({
      success: true,
      message: 'Zone deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting zone:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete zone'
    });
  }
});

module.exports = router;
