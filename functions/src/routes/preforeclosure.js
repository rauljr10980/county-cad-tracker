/**
 * Pre-Foreclosure Management Routes
 * Handle pre-foreclosure file uploads and record management
 */

const express = require('express');
const { body, query, validationResult } = require('express-validator');
const { optionalAuth, authenticateToken } = require('../middleware/auth');
const prisma = require('../lib/prisma');
const XLSX = require('xlsx');

const router = express.Router();

// ============================================================================
// GET ALL PRE-FORECLOSURE RECORDS
// ============================================================================

router.get('/', optionalAuth, async (req, res) => {
  try {
    const { address, city, zip } = req.query;
    
    // Build where clause for filtering
    const where = {};
    if (address) {
      where.address = { contains: address, mode: 'insensitive' };
    }
    if (city) {
      where.city = { contains: city, mode: 'insensitive' };
    }
    if (zip) {
      where.zip = zip;
    }

    const records = await prisma.preForeclosure.findMany({
      where: Object.keys(where).length > 0 ? where : undefined,
      orderBy: { createdAt: 'desc' }
    });

    // Map database format to frontend format
    const mappedRecords = records.map(record => ({
      document_number: record.documentNumber,
      type: record.type,
      address: record.address,
      city: record.city,
      zip: record.zip,
      filing_month: record.filingMonth,
      county: record.county,
      latitude: record.latitude,
      longitude: record.longitude,
      school_district: record.schoolDistrict,
      internal_status: record.internalStatus,
      notes: record.notes,
      last_action_date: record.lastActionDate ? record.lastActionDate.toISOString() : null,
      next_follow_up_date: record.nextFollowUpDate ? record.nextFollowUpDate.toISOString() : null,
      actionType: record.actionType ? record.actionType.toLowerCase() : undefined,
      priority: record.priority ? record.priority.toLowerCase() : undefined,
      dueTime: record.dueTime ? record.dueTime.toISOString() : undefined,
      assignedTo: record.assignedTo,
      inactive: record.inactive,
      first_seen_month: record.firstSeenMonth,
      last_seen_month: record.lastSeenMonth,
      created_at: record.createdAt.toISOString(),
      updated_at: record.updatedAt.toISOString(),
    }));

    res.json(mappedRecords);
  } catch (error) {
    console.error('[PRE-FORECLOSURE] Fetch error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[PRE-FORECLOSURE] Error details:', {
      message: errorMessage,
      stack: error instanceof Error ? error.stack : undefined,
      name: error instanceof Error ? error.name : undefined
    });
    res.status(500).json({ 
      error: 'Failed to fetch pre-foreclosure records',
      details: errorMessage
    });
  }
});

// ============================================================================
// UPLOAD PRE-FORECLOSURE FILE
// ============================================================================

router.post('/upload', optionalAuth, async (req, res) => {
  try {
    const { filename, fileData } = req.body;

    if (!filename || !fileData) {
      return res.status(400).json({ error: 'Filename and fileData are required' });
    }

    // Decode base64 file data
    const buffer = Buffer.from(fileData, 'base64');
    
    // Parse Excel/CSV file
    let workbook;
    try {
      // Try to detect if it's CSV or Excel
      const isCSV = filename.toLowerCase().endsWith('.csv');
      if (isCSV) {
        // For CSV, read as string first
        const csvString = buffer.toString('utf-8');
        workbook = XLSX.read(csvString, { type: 'string' });
      } else {
        // For Excel files, read as buffer
        workbook = XLSX.read(buffer, { type: 'buffer' });
      }
    } catch (parseError) {
      console.error('[PRE-FORECLOSURE] Parse error:', parseError);
      return res.status(400).json({ error: 'Invalid file format. Please upload a valid Excel or CSV file.' });
    }

    if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
      return res.status(400).json({ error: 'File has no sheets' });
    }

    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(worksheet, { defval: null, raw: false });

    if (rows.length === 0) {
      return res.status(400).json({ error: 'File is empty or has no data rows' });
    }

    // Get current month for default filing month
    const now = new Date();
    const currentMonth = now.toLocaleString('default', { month: 'long', year: 'numeric' });

    // Process records
    const processedRecords = [];
    const errors = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      
      try {
        // Get column names from the row (handle case-insensitive matching)
        const rowKeys = Object.keys(row);
        
        // Find document number field - exact match first, then case-insensitive
        let documentNumber = row['Doc Number'] || row['Document Number'] || row['doc number'] || row['document_number'];
        if (!documentNumber) {
          const docKey = rowKeys.find(key => 
            key.toLowerCase().replace(/\s+/g, ' ') === 'doc number' ||
            key.toLowerCase().replace(/\s+/g, ' ') === 'document number'
          );
          documentNumber = docKey ? row[docKey] : null;
        }
        
        if (!documentNumber) {
          errors.push(`Row ${i + 2}: Missing document number`);
          continue;
        }

        // Find type field - exact match first, then case-insensitive
        let type = row['Type'] || row['type'] || row['TYPE'];
        if (!type) {
          const typeKey = rowKeys.find(key => key.toLowerCase() === 'type');
          type = typeKey ? row[typeKey] : null;
        }
        
        if (!type) {
          errors.push(`Row ${i + 2}: Missing type`);
          continue;
        }
        
        type = String(type).trim().toUpperCase();
        if (type !== 'MORTGAGE' && type !== 'TAX') {
          errors.push(`Row ${i + 2}: Invalid type "${type}" (must be MORTGAGE or TAX)`);
          continue;
        }
        // Convert to proper case: MORTGAGE -> Mortgage, TAX -> Tax
        type = type.charAt(0) + type.slice(1).toLowerCase();

        // Find address fields - exact match first, then case-insensitive
        let address = row['Address'] || row['address'] || row['ADDRESS'];
        if (!address) {
          const addrKey = rowKeys.find(key => key.toLowerCase() === 'address');
          address = addrKey ? row[addrKey] : '';
        }
        
        let city = row['City'] || row['city'] || row['CITY'];
        if (!city) {
          const cityKey = rowKeys.find(key => key.toLowerCase() === 'city');
          city = cityKey ? row[cityKey] : '';
        }
        
        let zip = row['ZIP'] || row['zip'] || row['Zip'] || row['ZIP Code'] || row['zip code'];
        if (!zip) {
          const zipKey = rowKeys.find(key => 
            key.toLowerCase() === 'zip' || 
            key.toLowerCase() === 'zip code' ||
            key.toLowerCase() === 'zipcode'
          );
          zip = zipKey ? row[zipKey] : '';
        }
        
        // Filing Month is optional - default to current month
        let filingMonth = row['Filing Month'] || row['Filing Month'] || row['filing_month'] || row['FilingMonth'];
        if (!filingMonth) {
          const filingKey = rowKeys.find(key => 
            key.toLowerCase().includes('filing') && key.toLowerCase().includes('month')
          );
          filingMonth = filingKey ? row[filingKey] : currentMonth;
        }
        if (!filingMonth) filingMonth = currentMonth;
        
        // County is optional - default to Bexar
        let county = row['County'] || row['county'] || row['COUNTY'] || 'Bexar';
        if (!county) {
          const countyKey = rowKeys.find(key => key.toLowerCase() === 'county');
          county = countyKey ? row[countyKey] : 'Bexar';
        }
        if (!county) county = 'Bexar';

        if (!address) {
          errors.push(`Row ${i + 2}: Missing address`);
          continue;
        }

        // Parse latitude and longitude (optional)
        let latitude = row['Lat'] || row['lat'] || row['Latitude'] || row['latitude'] || row['LAT'];
        let longitude = row['Long'] || row['long'] || row['Longitude'] || row['longitude'] || row['LONG'];
        if (!latitude) {
          const latKey = rowKeys.find(key => key.toLowerCase() === 'lat' || key.toLowerCase() === 'latitude');
          latitude = latKey ? row[latKey] : null;
        }
        if (!longitude) {
          const longKey = rowKeys.find(key => key.toLowerCase() === 'long' || key.toLowerCase() === 'longitude');
          longitude = longKey ? row[longKey] : null;
        }

        // Parse school district (optional)
        let schoolDistrict = row['School District'] || row['school district'] || row['SchoolDistrict'] || row['school_district'];
        if (!schoolDistrict) {
          const schoolKey = rowKeys.find(key => 
            key.toLowerCase().includes('school') && key.toLowerCase().includes('district')
          );
          schoolDistrict = schoolKey ? row[schoolKey] : null;
        }

        processedRecords.push({
          documentNumber: String(documentNumber).trim(),
          type: type,
          address: String(address).trim(),
          city: String(city).trim(),
          zip: String(zip).trim(),
          filingMonth: String(filingMonth).trim(),
          county: String(county).trim(),
          latitude: latitude ? parseFloat(String(latitude).trim()) : null,
          longitude: longitude ? parseFloat(String(longitude).trim()) : null,
          schoolDistrict: schoolDistrict ? String(schoolDistrict).trim() : null,
        });
      } catch (rowError) {
        errors.push(`Row ${i + 2}: ${rowError.message}`);
      }
    }

    if (processedRecords.length === 0) {
      return res.status(400).json({ 
        error: 'No valid records found in file',
        errors: errors.slice(0, 10) // Return first 10 errors
      });
    }

    // Get all existing document numbers
    const existingRecords = await prisma.preForeclosure.findMany({
      select: { documentNumber: true }
    });
    const existingDocNumbers = new Set(existingRecords.map(r => r.documentNumber));

    // Mark missing records as inactive
    const newDocNumbers = new Set(processedRecords.map(r => r.documentNumber));
    const missingDocNumbers = Array.from(existingDocNumbers).filter(doc => !newDocNumbers.has(doc));

    if (missingDocNumbers.length > 0) {
      await prisma.preForeclosure.updateMany({
        where: {
          documentNumber: { in: missingDocNumbers }
        },
        data: {
          inactive: true,
          updatedAt: new Date()
        }
      });
    }

    // Upsert records (create or update)
    let created = 0;
    let updated = 0;
    const dbErrors = [];

    for (const record of processedRecords) {
      try {
        const existing = await prisma.preForeclosure.findUnique({
          where: { documentNumber: record.documentNumber }
        });

        if (existing) {
        // Update existing record
        await prisma.preForeclosure.update({
          where: { documentNumber: record.documentNumber },
          data: {
            type: record.type,
            address: record.address,
            city: record.city,
            zip: record.zip,
            filingMonth: record.filingMonth,
            county: record.county,
            latitude: record.latitude,
            longitude: record.longitude,
            schoolDistrict: record.schoolDistrict,
            inactive: false,
            lastSeenMonth: currentMonth,
            updatedAt: new Date()
          }
        });
          updated++;
        } else {
        // Create new record
        await prisma.preForeclosure.create({
          data: {
            documentNumber: record.documentNumber,
            type: record.type,
            address: record.address,
            city: record.city,
            zip: record.zip,
            filingMonth: record.filingMonth,
            county: record.county,
            latitude: record.latitude,
            longitude: record.longitude,
            schoolDistrict: record.schoolDistrict,
            internalStatus: 'New',
            inactive: false,
            firstSeenMonth: currentMonth,
            lastSeenMonth: currentMonth
          }
        });
          created++;
        }
      } catch (dbError) {
        console.error(`[PRE-FORECLOSURE] Database error for record ${record.documentNumber}:`, dbError);
        dbErrors.push(`Failed to save record ${record.documentNumber}: ${dbError.message}`);
      }
    }

    if (created === 0 && updated === 0 && dbErrors.length > 0) {
      return res.status(500).json({ 
        error: 'Failed to save records to database',
        errors: dbErrors.slice(0, 10)
      });
    }

    // Get counts
    const totalRecords = await prisma.preForeclosure.count();
    const activeRecords = await prisma.preForeclosure.count({ where: { inactive: false } });
    const inactiveRecords = await prisma.preForeclosure.count({ where: { inactive: true } });

    console.log(`[PRE-FORECLOSURE] Upload complete: ${created} created, ${updated} updated, ${processedRecords.length} processed`);

    res.json({
      success: true,
      fileId: filename,
      recordsProcessed: processedRecords.length,
      totalRecords,
      activeRecords,
      inactiveRecords,
      created,
      updated,
      errors: errors.length > 0 ? errors.slice(0, 10) : undefined,
      dbErrors: dbErrors.length > 0 ? dbErrors.slice(0, 10) : undefined
    });
  } catch (error) {
    console.error('[PRE-FORECLOSURE] Upload error:', error);
    console.error('[PRE-FORECLOSURE] Error stack:', error.stack);
    res.status(500).json({ 
      error: 'Failed to process pre-foreclosure file',
      details: error.message,
      stack: process.env.NODE_ENV !== 'production' ? error.stack : undefined
    });
  }
});

// ============================================================================
// UPDATE PRE-FORECLOSURE RECORD
// ============================================================================

router.put('/:documentNumber', optionalAuth, async (req, res) => {
  try {
    const { documentNumber } = req.params;
    const updates = req.body;

    // Map frontend fields to database fields
    const dbUpdates = {};
    if (updates.internal_status !== undefined) dbUpdates.internalStatus = updates.internal_status;
    if (updates.notes !== undefined) dbUpdates.notes = updates.notes;
    if (updates.last_action_date !== undefined) {
      dbUpdates.lastActionDate = updates.last_action_date ? new Date(updates.last_action_date) : null;
    }
    if (updates.next_follow_up_date !== undefined) {
      dbUpdates.nextFollowUpDate = updates.next_follow_up_date ? new Date(updates.next_follow_up_date) : null;
    }
    
    // Action/Task fields
    if (updates.actionType !== undefined) {
      if (updates.actionType) {
        // Map frontend values to enum: 'call' -> 'CALL', 'text' -> 'TEXT', etc.
        const actionMap = {
          'call': 'CALL',
          'text': 'TEXT',
          'mail': 'MAIL',
          'driveby': 'DRIVEBY',
          'drive-by': 'DRIVEBY' // Handle hyphenated version
        };
        const normalizedAction = updates.actionType.toLowerCase().replace(/-/g, '');
        dbUpdates.actionType = actionMap[normalizedAction] || updates.actionType.toUpperCase();
      } else {
        dbUpdates.actionType = null;
      }
    }
    if (updates.priority !== undefined) {
      if (updates.priority) {
        // Map frontend values to enum: 'med' -> 'MEDIUM', 'high' -> 'HIGH', 'low' -> 'LOW'
        const priorityMap = {
          'med': 'MEDIUM',
          'medium': 'MEDIUM',
          'high': 'HIGH',
          'low': 'LOW'
        };
        dbUpdates.priority = priorityMap[updates.priority.toLowerCase()] || updates.priority.toUpperCase();
      } else {
        dbUpdates.priority = null;
      }
    }
    if (updates.dueTime !== undefined) {
      if (updates.dueTime) {
        try {
          dbUpdates.dueTime = new Date(updates.dueTime);
          if (isNaN(dbUpdates.dueTime.getTime())) {
            throw new Error('Invalid date format');
          }
        } catch (dateError) {
          console.error('[PRE-FORECLOSURE] Invalid dueTime format:', updates.dueTime);
          return res.status(400).json({ error: 'Invalid dueTime format. Expected ISO date string.' });
        }
      } else {
        dbUpdates.dueTime = null;
      }
    }
    if (updates.assignedTo !== undefined) {
      dbUpdates.assignedTo = updates.assignedTo || null;
    }
    
    console.log('[PRE-FORECLOSURE] Update request:', {
      documentNumber,
      dbUpdates,
      originalUpdates: updates
    });

    const record = await prisma.preForeclosure.update({
      where: { documentNumber },
      data: dbUpdates
    });

    // Map back to frontend format
    res.json({
      document_number: record.documentNumber,
      type: record.type,
      address: record.address,
      city: record.city,
      zip: record.zip,
      filing_month: record.filingMonth,
      county: record.county,
      latitude: record.latitude,
      longitude: record.longitude,
      school_district: record.schoolDistrict,
      internal_status: record.internalStatus,
      notes: record.notes,
      last_action_date: record.lastActionDate ? record.lastActionDate.toISOString() : null,
      next_follow_up_date: record.nextFollowUpDate ? record.nextFollowUpDate.toISOString() : null,
      actionType: record.actionType ? record.actionType.toLowerCase() : undefined,
      priority: record.priority ? record.priority.toLowerCase() === 'medium' ? 'med' : record.priority.toLowerCase() : undefined,
      dueTime: record.dueTime ? record.dueTime.toISOString() : undefined,
      assignedTo: record.assignedTo,
      inactive: record.inactive,
      first_seen_month: record.firstSeenMonth,
      last_seen_month: record.lastSeenMonth,
      created_at: record.createdAt.toISOString(),
      updated_at: record.updatedAt.toISOString(),
    });
  } catch (error) {
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Pre-foreclosure record not found' });
    }
    console.error('[PRE-FORECLOSURE] Update error:', error);
    console.error('[PRE-FORECLOSURE] Update error details:', {
      code: error.code,
      message: error.message,
      meta: error.meta,
      stack: error.stack
    });
    const errorMessage = error.message || 'Failed to update pre-foreclosure record';
    res.status(500).json({ error: errorMessage });
  }
});

// ============================================================================
// DELETE ALL PRE-FORECLOSURE RECORDS
// ============================================================================

router.delete('/', optionalAuth, async (req, res) => {
  try {
    await prisma.preForeclosure.deleteMany({});
    res.json({ success: true, message: 'All pre-foreclosure records deleted' });
  } catch (error) {
    console.error('[PRE-FORECLOSURE] Delete error:', error);
    res.status(500).json({ error: 'Failed to delete pre-foreclosure records' });
  }
});

module.exports = router;

