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
    const records = await prisma.preForeclosure.findMany({
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
      internal_status: record.internalStatus,
      notes: record.notes,
      last_action_date: record.lastActionDate,
      next_follow_up_date: record.nextFollowUpDate,
      inactive: record.inactive,
      first_seen_month: record.firstSeenMonth,
      last_seen_month: record.lastSeenMonth,
      created_at: record.createdAt.toISOString(),
      updated_at: record.updatedAt.toISOString(),
    }));

    res.json(mappedRecords);
  } catch (error) {
    console.error('[PRE-FORECLOSURE] Fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch pre-foreclosure records' });
  }
});

// ============================================================================
// UPLOAD PRE-FORECLOSURE FILE
// ============================================================================

router.post('/upload', authenticateToken, async (req, res) => {
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
      workbook = XLSX.read(buffer, { type: 'buffer' });
    } catch (parseError) {
      return res.status(400).json({ error: 'Invalid file format. Please upload a valid Excel or CSV file.' });
    }

    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(worksheet, { defval: null });

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
        // Find document number field (case-insensitive)
        const docNumberKey = Object.keys(row).find(
          key => key.toLowerCase().includes('doc') && key.toLowerCase().includes('number')
        ) || Object.keys(row).find(key => key.toLowerCase() === 'document_number');
        
        const documentNumber = row[docNumberKey] || row['Document Number'] || row['Doc Number'];
        
        if (!documentNumber) {
          errors.push(`Row ${i + 2}: Missing document number`);
          continue;
        }

        // Find type field
        const typeKey = Object.keys(row).find(key => key.toLowerCase() === 'type');
        let type = row[typeKey] || row['Type'] || '';
        type = String(type).trim();
        if (!type || (type.toLowerCase() !== 'mortgage' && type.toLowerCase() !== 'tax')) {
          errors.push(`Row ${i + 2}: Invalid type (must be Mortgage or Tax)`);
          continue;
        }
        type = type.charAt(0).toUpperCase() + type.slice(1).toLowerCase();

        // Find address fields
        const address = row['Address'] || row['address'] || '';
        const city = row['City'] || row['city'] || '';
        const zip = row['ZIP'] || row['zip'] || row['Zip'] || '';
        const filingMonth = row['Filing Month'] || row['Filing Month'] || row['filing_month'] || currentMonth;
        const county = row['County'] || row['county'] || 'Bexar';

        if (!address) {
          errors.push(`Row ${i + 2}: Missing address`);
          continue;
        }

        processedRecords.push({
          documentNumber: String(documentNumber).trim(),
          type: type,
          address: String(address).trim(),
          city: String(city).trim(),
          zip: String(zip).trim(),
          filingMonth: String(filingMonth).trim(),
          county: String(county).trim(),
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

    for (const record of processedRecords) {
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
            internalStatus: 'New',
            inactive: false,
            firstSeenMonth: currentMonth,
            lastSeenMonth: currentMonth
          }
        });
        created++;
      }
    }

    // Get counts
    const totalRecords = await prisma.preForeclosure.count();
    const activeRecords = await prisma.preForeclosure.count({ where: { inactive: false } });
    const inactiveRecords = await prisma.preForeclosure.count({ where: { inactive: true } });

    res.json({
      success: true,
      fileId: filename,
      recordsProcessed: processedRecords.length,
      totalRecords,
      activeRecords,
      inactiveRecords,
      created,
      updated,
      errors: errors.length > 0 ? errors.slice(0, 10) : undefined
    });
  } catch (error) {
    console.error('[PRE-FORECLOSURE] Upload error:', error);
    res.status(500).json({ error: 'Failed to process pre-foreclosure file' });
  }
});

// ============================================================================
// UPDATE PRE-FORECLOSURE RECORD
// ============================================================================

router.put('/:documentNumber', authenticateToken, async (req, res) => {
  try {
    const { documentNumber } = req.params;
    const updates = req.body;

    // Map frontend fields to database fields
    const dbUpdates = {};
    if (updates.internal_status !== undefined) dbUpdates.internalStatus = updates.internal_status;
    if (updates.notes !== undefined) dbUpdates.notes = updates.notes;
    if (updates.last_action_date !== undefined) dbUpdates.lastActionDate = updates.last_action_date;
    if (updates.next_follow_up_date !== undefined) dbUpdates.nextFollowUpDate = updates.next_follow_up_date;

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
      internal_status: record.internalStatus,
      notes: record.notes,
      last_action_date: record.lastActionDate,
      next_follow_up_date: record.nextFollowUpDate,
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
    res.status(500).json({ error: 'Failed to update pre-foreclosure record' });
  }
});

// ============================================================================
// DELETE ALL PRE-FORECLOSURE RECORDS
// ============================================================================

router.delete('/', authenticateToken, async (req, res) => {
  try {
    await prisma.preForeclosure.deleteMany({});
    res.json({ success: true, message: 'All pre-foreclosure records deleted' });
  } catch (error) {
    console.error('[PRE-FORECLOSURE] Delete error:', error);
    res.status(500).json({ error: 'Failed to delete pre-foreclosure records' });
  }
});

module.exports = router;

