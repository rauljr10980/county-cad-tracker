/**
 * File Upload Routes
 * Handle Excel file uploads for property data
 */

const express = require('express');
const multer = require('multer');
const XLSX = require('xlsx');
const { authenticateToken, optionalAuth } = require('../middleware/auth');
const prisma = require('../lib/prisma');

const router = express.Router();

// Configure multer for memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 100 * 1024 * 1024 // 100MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
        file.mimetype === 'application/vnd.ms-excel' ||
        file.originalname.endsWith('.xlsx') ||
        file.originalname.endsWith('.xls')) {
      cb(null, true);
    } else {
      cb(new Error('Only Excel files (.xlsx, .xls) are allowed'));
    }
  }
});

// Helper function to generate unique file ID
function generateFileId() {
  return `file_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// ============================================================================
// UPLOAD EXCEL FILE (Base64 JSON format - used by frontend)
// ============================================================================

router.post('/', optionalAuth, async (req, res) => {
  try {
    const { filename, fileData } = req.body;

    if (!filename || !fileData) {
      return res.status(400).json({ error: 'Missing filename or fileData' });
    }

    console.log(`[UPLOAD] Processing base64 file: ${filename}`);

    // Generate unique file ID
    const fileId = generateFileId();

    // Create file upload record
    const fileUpload = await prisma.fileUpload.create({
      data: {
        filename,
        fileId,
        status: 'PROCESSING',
        totalRecords: null,
        processedRecords: 0,
        errorCount: 0
      }
    });

    console.log(`[UPLOAD] Created file upload record: ${fileId}`);

    // Decode base64 to buffer
    const buffer = Buffer.from(fileData, 'base64');

    // Parse Excel file
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(worksheet);

    console.log(`[UPLOAD] Found ${data.length} rows in Excel file`);

    // Log first row to see column names
    if (data.length > 0) {
      console.log('[UPLOAD] First row columns:', Object.keys(data[0]));
      console.log('[UPLOAD] First row sample:', JSON.stringify(data[0], null, 2));
    }

    if (data.length === 0) {
      await prisma.fileUpload.update({
        where: { id: fileUpload.id },
        data: {
          status: 'FAILED',
          errorMessage: 'Excel file is empty',
          completedAt: new Date()
        }
      });
      return res.status(400).json({ error: 'Excel file is empty' });
    }

    // Update total records
    await prisma.fileUpload.update({
      where: { id: fileUpload.id },
      data: {
        totalRecords: data.length
      }
    });

    // Process and insert properties
    let inserted = 0;
    let updated = 0;
    let skipped = 0;
    const errors = [];

    // Safe parse helpers (defined once before loop)
    const safeParseFloat = (value) => {
      if (value === null || value === undefined || value === '') return 0;
      const parsed = parseFloat(String(value).replace(/[$,]/g, '')); // Remove $ and commas
      return isNaN(parsed) ? 0 : parsed;
    };

    const safeString = (value, defaultValue = '') => {
      if (value === null || value === undefined || value === '') return defaultValue;
      return String(value).trim();
    };

    const normalizeStatus = (value) => {
      const status = safeString(value, 'ACTIVE').toUpperCase();
      // Map common status values
      if (status.includes('JUDG')) return 'JUDGMENT';
      if (status.includes('ACT')) return 'ACTIVE';
      if (status.includes('PEND')) return 'PENDING';
      if (status.includes('PAID')) return 'PAID';
      if (status.includes('REM')) return 'REMOVED';
      // If it's a single letter, map: J=JUDGMENT, A=ACTIVE, P=PENDING
      if (status === 'J') return 'JUDGMENT';
      if (status === 'A') return 'ACTIVE';
      if (status === 'P') return 'PENDING';
      return status;
    };

    // Helper to parse owner name and mailing address from ADDRSTRING
    const parseAddrString = (addrString) => {
      if (!addrString) return { ownerName: 'Unknown', mailingAddress: null };
      const str = String(addrString).trim();
      // ADDRSTRING format: "OWNER NAME full mailing address"
      // Extract owner name (first part before address numbers)
      const parts = str.split(/\s+\d+/); // Split on first number (address starts with number)
      const ownerName = parts[0] || 'Unknown';
      const mailingAddress = str || null;
      return { ownerName, mailingAddress };
    };

    for (const row of data) {
      try {
        // Map Excel columns to database fields - try many variations
        const accountNumber = safeString(
          row['CAN'] ||  // DTR Summary format
          row['Account Number'] ||
          row['ACCOUNT NUMBER'] ||
          row['accountNumber'] ||
          row['Account #'] ||
          row['ACCOUNT #'] ||
          row['Acct Number'] ||
          row['ACCT NUMBER'] ||
          row['AccountNumber']
        );

        if (!accountNumber) {
          skipped++;
          continue;
        }

        // Parse ADDRSTRING if available (DTR Summary format)
        const addrInfo = parseAddrString(row['ADDRSTRING'] || row['addrString']);

        const propertyData = {
          accountNumber,
          ownerName: safeString(
            row['Owner Name'] ||
            row['OWNER NAME'] ||
            row['ownerName'] ||
            row['Owner'] ||
            row['OWNER'] ||
            row['Name'] ||
            row['NAME'] ||
            addrInfo.ownerName,  // From ADDRSTRING
            'Unknown'
          ),
          propertyAddress: safeString(
            row['PSTRNAME'] ||  // DTR Summary property street name
            row['pstrName'] ||
            row['Property Address'] ||
            row['PROPERTY ADDRESS'] ||
            row['propertyAddress'] ||
            row['Address'] ||
            row['ADDRESS'] ||
            row['Property Addr'] ||
            row['PROPERTY ADDR'] ||
            row['Situs Address'] ||
            row['SITUS ADDRESS']
          ),
          mailingAddress: safeString(
            row['Mailing Address'] ||
            row['MAILING ADDRESS'] ||
            row['mailingAddress'] ||
            row['Mail Address'] ||
            row['MAIL ADDRESS'] ||
            row['Owner Address'] ||
            row['OWNER ADDRESS'] ||
            addrInfo.mailingAddress ||  // From ADDRSTRING
            null
          ),
          totalDue: safeParseFloat(
            row['TOT_PERCAN'] ||  // DTR Summary total per account
            row['LEVY_BALANCE'] ||  // DTR Summary levy balance
            row['Total Due'] ||
            row['TOTAL DUE'] ||
            row['totalDue'] ||
            row['Amount Due'] ||
            row['AMOUNT DUE'] ||
            row['Total Amount'] ||
            row['TOTAL AMOUNT'] ||
            row['Balance'] ||
            row['BALANCE'] ||
            row['Amount'] ||
            row['AMOUNT']
          ),
          percentageDue: safeParseFloat(
            row['Percentage Due'] ||
            row['PERCENTAGE DUE'] ||
            row['percentageDue'] ||
            row['Percent'] ||
            row['PERCENT'] ||
            row['%'] ||
            row['Pct'] ||
            row['PCT']
          ),
          status: normalizeStatus(
            row['LEGALSTATUS'] ||  // DTR Summary legal status (P/A/J)
            row['legalStatus'] ||
            row['Status'] ||
            row['STATUS'] ||
            row['status'] ||
            row['Tax Status'] ||
            row['TAX STATUS']
          ),
          taxYear: parseInt(
            row['YEAR'] ||  // DTR Summary year
            row['Tax Year'] ||
            row['TAX YEAR'] ||
            row['taxYear'] ||
            row['Year']
          ) || new Date().getFullYear(),
          legalDescription: safeString(
            row['LGLSTRING'] ||  // DTR Summary legal string
            row['lglString'] ||
            row['Legal Description'] ||
            row['LEGAL DESCRIPTION'] ||
            row['legalDescription'] ||
            row['Legal Desc'] ||
            row['LEGAL DESC'] ||
            row['Legal'] ||
            row['LEGAL'] ||
            null
          ),
          phoneNumbers: [],
          isNew: false,
          isRemoved: false,
          statusChanged: false,
          percentageChanged: false
        };

        // Upsert property (insert or update if exists)
        const property = await prisma.property.upsert({
          where: { accountNumber },
          update: {
            ...propertyData,
            updatedAt: new Date()
          },
          create: propertyData
        });

        if (property.createdAt.getTime() === property.updatedAt.getTime()) {
          inserted++;
        } else {
          updated++;
        }

      } catch (error) {
        errors.push({
          accountNumber: row['Account Number'] || 'Unknown',
          error: error.message
        });
        skipped++;
      }
    }

    // Update file upload record with results
    await prisma.fileUpload.update({
      where: { id: fileUpload.id },
      data: {
        status: 'COMPLETED',
        processedRecords: inserted + updated,
        errorCount: errors.length,
        errorMessage: errors.length > 0 ? `${errors.length} errors encountered` : null,
        completedAt: new Date()
      }
    });

    console.log(`[UPLOAD] Complete - File ID: ${fileId}, Inserted: ${inserted}, Updated: ${updated}, Skipped: ${skipped}`);

    res.json({
      success: true,
      fileId,
      message: 'File uploaded and processed successfully',
      stats: {
        totalRows: data.length,
        inserted,
        updated,
        skipped,
        errors: errors.length
      },
      errors: errors.slice(0, 10) // Return first 10 errors only
    });

  } catch (error) {
    console.error('[UPLOAD] Error:', error);
    res.status(500).json({
      error: 'Failed to process file',
      message: error.message
    });
  }
});

// ============================================================================
// UPLOAD EXCEL FILE (Multipart form-data format)
// ============================================================================

router.post('/excel', authenticateToken, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    console.log(`[UPLOAD] Processing file: ${req.file.originalname}, size: ${req.file.size} bytes`);

    // Parse Excel file
    const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(worksheet);

    console.log(`[UPLOAD] Found ${data.length} rows in Excel file`);

    if (data.length === 0) {
      return res.status(400).json({ error: 'Excel file is empty' });
    }

    // Process and insert properties
    let inserted = 0;
    let updated = 0;
    let skipped = 0;
    const errors = [];

    for (const row of data) {
      try {
        // Map Excel columns to database fields
        const accountNumber = String(row['Account Number'] || row['ACCOUNT NUMBER'] || row['accountNumber'] || '').trim();

        if (!accountNumber) {
          skipped++;
          continue;
        }

        // Safe parse helpers
        const safeParseFloat = (value) => {
          const parsed = parseFloat(value);
          return isNaN(parsed) ? 0 : parsed;
        };

        const safeString = (value, defaultValue = '') => {
          if (value === null || value === undefined) return defaultValue;
          return String(value).trim();
        };

        const propertyData = {
          accountNumber,
          ownerName: safeString(row['Owner Name'] || row['OWNER NAME'] || row['ownerName'] || row['Owner'], 'Unknown'),
          propertyAddress: safeString(row['Property Address'] || row['PROPERTY ADDRESS'] || row['propertyAddress'] || row['Address'] || row['ADDRESS']),
          mailingAddress: safeString(row['Mailing Address'] || row['MAILING ADDRESS'] || row['mailingAddress']),
          totalDue: safeParseFloat(row['Total Due'] || row['TOTAL DUE'] || row['totalDue'] || row['Amount Due'] || row['AMOUNT DUE']),
          percentageDue: safeParseFloat(row['Percentage Due'] || row['PERCENTAGE DUE'] || row['percentageDue'] || row['Percent'] || row['PERCENT']),
          status: safeString(row['Status'] || row['STATUS'] || row['status'], 'ACTIVE').toUpperCase(),
          taxYear: parseInt(row['Tax Year'] || row['TAX YEAR'] || row['taxYear']) || new Date().getFullYear(),
          legalDescription: safeString(row['Legal Description'] || row['LEGAL DESCRIPTION'] || row['legalDescription']),
          phoneNumbers: [],
          isNew: false,
          isRemoved: false,
          statusChanged: false,
          percentageChanged: false
        };

        // Upsert property (insert or update if exists)
        const property = await prisma.property.upsert({
          where: { accountNumber },
          update: {
            ...propertyData,
            updatedAt: new Date()
          },
          create: propertyData
        });

        if (property.createdAt.getTime() === property.updatedAt.getTime()) {
          inserted++;
        } else {
          updated++;
        }

      } catch (error) {
        errors.push({
          accountNumber: row['Account Number'] || 'Unknown',
          error: error.message
        });
        skipped++;
      }
    }

    console.log(`[UPLOAD] Complete - Inserted: ${inserted}, Updated: ${updated}, Skipped: ${skipped}`);

    res.json({
      success: true,
      message: 'File uploaded and processed successfully',
      stats: {
        totalRows: data.length,
        inserted,
        updated,
        skipped,
        errors: errors.length
      },
      errors: errors.slice(0, 10) // Return first 10 errors only
    });

  } catch (error) {
    console.error('[UPLOAD] Error:', error);
    res.status(500).json({
      error: 'Failed to process file',
      message: error.message
    });
  }
});

// ============================================================================
// CLEAR ALL PROPERTIES (Admin only)
// ============================================================================

router.delete('/properties/all', authenticateToken, async (req, res) => {
  try {
    // Check if user is admin
    if (req.user.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const count = await prisma.property.deleteMany({});

    console.log(`[UPLOAD] Deleted ${count.count} properties by admin ${req.user.username}`);

    res.json({
      success: true,
      message: `Deleted ${count.count} properties`,
      count: count.count
    });

  } catch (error) {
    console.error('[UPLOAD] Delete error:', error);
    res.status(500).json({ error: 'Failed to delete properties' });
  }
});

module.exports = router;
