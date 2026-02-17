const express = require('express');
const router = express.Router();
const { optionalAuth, authenticateToken } = require('../middleware/auth');
const prisma = require('../lib/prisma');
const { batchGeocodeCensus, batchGeocodeNominatim, batchGeocodeArcGIS } = require('../lib/censusGeocode');

// ============================================================================
// DRIVING FOR DOLLARS - CRUD ROUTES
// ============================================================================

// Simple address parser: "123 Main St, San Antonio, TX 78201"
function parseAddress(raw) {
  const parts = raw.split(',').map(s => s.trim());
  const street = parts[0] || raw;
  const city = parts[1] || 'San Antonio';

  let state = 'TX';
  let zip = '';
  if (parts.length >= 3) {
    const lastPart = parts[parts.length - 1];
    const stateZipMatch = lastPart.match(/^([A-Z]{2})\s+(\d{5}(-\d{4})?)$/i);
    if (stateZipMatch) {
      state = stateZipMatch[1].toUpperCase();
      zip = stateZipMatch[2];
    } else if (/^\d{5}/.test(lastPart)) {
      zip = lastPart.match(/\d{5}/)[0];
    } else if (lastPart.length === 2) {
      state = lastPart.toUpperCase();
    }
    // If there's a separate state part before zip
    if (parts.length >= 4) {
      const statePart = parts[2].trim();
      if (statePart.length === 2) {
        state = statePart.toUpperCase();
      }
    }
  }

  return { street, city, state, zip };
}

// Geocode a single lead (Census -> ArcGIS -> Nominatim fallback)
async function geocodeLead(leadId, parsed) {
  const addressObj = {
    id: leadId,
    street: parsed.street,
    city: parsed.city,
    state: parsed.state,
    zip: parsed.zip,
  };

  let results = await batchGeocodeCensus([addressObj]);

  if (!results.has(leadId)) {
    results = await batchGeocodeArcGIS([addressObj]);
  }

  if (!results.has(leadId)) {
    results = await batchGeocodeNominatim([addressObj]);
  }

  if (results.has(leadId)) {
    const { latitude, longitude } = results.get(leadId);
    await prisma.drivingLead.update({
      where: { id: leadId },
      data: { latitude, longitude },
    });
    console.log(`[D4D] Geocoded ${leadId}: ${latitude}, ${longitude}`);
  } else {
    console.log(`[D4D] Could not geocode ${leadId}: ${parsed.street}`);
  }
}

// GET /api/driving - List all driving leads
router.get('/', optionalAuth, async (req, res) => {
  try {
    const leads = await prisma.drivingLead.findMany({
      orderBy: { createdAt: 'desc' },
    });
    res.json(leads);
  } catch (error) {
    console.error('[D4D] Fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch driving leads' });
  }
});

// POST /api/driving - Create a new lead
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { address, notes, loggedBy } = req.body;

    if (!address || !address.trim()) {
      return res.status(400).json({ error: 'Address is required' });
    }

    const rawAddress = address.trim();
    const parsed = parseAddress(rawAddress);

    const lead = await prisma.drivingLead.create({
      data: {
        rawAddress,
        street: parsed.street,
        city: parsed.city,
        state: parsed.state,
        zip: parsed.zip,
        notes: notes || null,
        loggedBy: loggedBy || null,
      },
    });

    // Fire-and-forget geocoding
    geocodeLead(lead.id, parsed).catch(err =>
      console.error(`[D4D] Geocode failed for ${lead.id}:`, err.message)
    );

    res.status(201).json(lead);
  } catch (error) {
    console.error('[D4D] Create error:', error);
    res.status(500).json({ error: 'Failed to create driving lead' });
  }
});

// PUT /api/driving/:id - Update a lead
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { status, notes } = req.body;

    const existing = await prisma.drivingLead.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    const updateData = {};
    if (status !== undefined) updateData.status = status;
    if (notes !== undefined) updateData.notes = notes;

    const updated = await prisma.drivingLead.update({
      where: { id },
      data: updateData,
    });

    res.json(updated);
  } catch (error) {
    console.error('[D4D] Update error:', error);
    res.status(500).json({ error: 'Failed to update driving lead' });
  }
});

// DELETE /api/driving/:id - Delete a lead
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    const existing = await prisma.drivingLead.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    await prisma.drivingLead.delete({ where: { id } });
    res.json({ success: true });
  } catch (error) {
    console.error('[D4D] Delete error:', error);
    res.status(500).json({ error: 'Failed to delete driving lead' });
  }
});

module.exports = router;
