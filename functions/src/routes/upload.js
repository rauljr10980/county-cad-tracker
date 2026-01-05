/**
 * File Upload Routes
 * Handle Excel file uploads for property data
 */

const express = require('express');
const multer = require('multer');
const XLSX = require('xlsx');
const { PrismaClient } = require('@prisma/client');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();

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

// ============================================================================
// UPLOAD EXCEL FILE
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

        const propertyData = {
          accountNumber,
          ownerName: String(row['Owner Name'] || row['OWNER NAME'] || row['ownerName'] || '').trim(),
          propertyAddress: String(row['Property Address'] || row['PROPERTY ADDRESS'] || row['propertyAddress'] || '').trim(),
          mailingAddress: String(row['Mailing Address'] || row['MAILING ADDRESS'] || row['mailingAddress'] || null),
          totalDue: parseFloat(row['Total Due'] || row['TOTAL DUE'] || row['totalDue'] || 0),
          percentageDue: parseFloat(row['Percentage Due'] || row['PERCENTAGE DUE'] || row['percentageDue'] || 0),
          status: String(row['Status'] || row['STATUS'] || row['status'] || 'ACTIVE').toUpperCase(),
          taxYear: parseInt(row['Tax Year'] || row['TAX YEAR'] || row['taxYear'] || new Date().getFullYear()),
          legalDescription: String(row['Legal Description'] || row['LEGAL DESCRIPTION'] || row['legalDescription'] || null),
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
