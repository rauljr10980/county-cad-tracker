/**
 * File Upload Routes
 * Handle Excel file uploads for property data - PostgreSQL version
 */

const express = require('express');
const multer = require('multer');
const XLSX = require('xlsx');
const { optionalAuth } = require('../middleware/auth');
const prisma = require('../lib/prisma');

const router = express.Router();

// Configure multer for memory storage (for /excel endpoint)
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
// UPLOAD EXCEL FILE (Base64 JSON format - matches frontend)
// ============================================================================

router.post('/', optionalAuth, async (req, res) => {
  try {
    const { filename, fileData } = req.body;
    
    if (!filename || !fileData) {
      return res.status(400).json({ error: 'Filename and fileData are required' });
    }

    console.log(`[UPLOAD] Starting upload for: ${filename}`);

    // Decode base64 file data
    const buffer = Buffer.from(fileData, 'base64');
    console.log(`[UPLOAD] Decoded file, size: ${buffer.length} bytes`);

    // Create file upload record
    const fileId = Date.now().toString();
    const fileUpload = await prisma.fileUpload.create({
      data: {
        fileId,
        filename,
        status: 'PROCESSING',
        totalRecords: 0,
        processedRecords: 0
      }
    });

    // Process file asynchronously (don't block response)
    processFileAsync(fileId, buffer, filename).catch(error => {
      console.error(`[UPLOAD] Error processing file ${fileId}:`, error);
      prisma.fileUpload.update({
        where: { id: fileUpload.id },
        data: {
          status: 'FAILED',
          errorMessage: error.message
        }
      }).catch(console.error);
    });

    // Return immediately
    res.json({
      success: true,
      fileId,
      message: 'File upload started. Processing in background.'
    });

  } catch (error) {
    console.error('[UPLOAD] Error:', error);
    res.status(500).json({
      error: 'Failed to upload file',
      message: error.message
    });
  }
});

// ============================================================================
// UPLOAD EXCEL FILE (Multipart form-data format)
// ============================================================================

router.post('/excel', optionalAuth, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    console.log(`[UPLOAD] Processing file: ${req.file.originalname}, size: ${req.file.size} bytes`);

    // Create file upload record
    const fileId = Date.now().toString();
    const fileUpload = await prisma.fileUpload.create({
      data: {
        fileId,
        filename: req.file.originalname,
        status: 'PROCESSING',
        totalRecords: 0,
        processedRecords: 0
      }
    });

    // Process file asynchronously
    processFileAsync(fileId, req.file.buffer, req.file.originalname).catch(error => {
      console.error(`[UPLOAD] Error processing file ${fileId}:`, error);
      prisma.fileUpload.update({
        where: { id: fileUpload.id },
        data: {
          status: 'FAILED',
          errorMessage: error.message
        }
      }).catch(console.error);
    });

    res.json({
      success: true,
      fileId,
      message: 'File upload started. Processing in background.'
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
// ASYNC FILE PROCESSING
// ============================================================================

async function processFileAsync(fileId, buffer, filename) {
  try {
    console.log(`[PROCESS] Starting processing for fileId: ${fileId}, filename: ${filename}`);

    // Parse Excel file
    const workbook = XLSX.read(buffer, {
      type: 'buffer',
      cellDates: false,
      cellStyles: false,
      sheetStubs: false,
    });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];

    // Extract headers from Row 3 (0-indexed row 2)
    const headerRow = [];
    const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1');
    for (let col = range.s.c; col <= range.e.c; col++) {
      const cellAddress = XLSX.utils.encode_cell({ r: 2, c: col }); // Row 3 is 0-indexed row 2
      const cell = worksheet[cellAddress];
      headerRow.push(cell ? cell.v.toString().trim() : `__EMPTY_${col}`);
    }

    // Convert to JSON starting from Row 4 (0-indexed row 3)
    const data = XLSX.utils.sheet_to_json(worksheet, {
      raw: false,
      header: headerRow,
      range: 3, // Start reading data from row 4
      defval: '',
      blankrows: false,
    });

    console.log(`[PROCESS] Found ${data.length} rows in Excel file`);

    if (data.length === 0) {
      throw new Error('Excel file is empty');
    }

    // Update file upload record (use fileId, not id)
    const fileUploadRecord = await prisma.fileUpload.findUnique({
      where: { fileId }
    });
    
    if (!fileUploadRecord) {
      throw new Error(`File upload record not found for fileId: ${fileId}`);
    }

    await prisma.fileUpload.update({
      where: { id: fileUploadRecord.id },
      data: { totalRecords: data.length }
    });

    // Extract properties
    const properties = extractProperties(data);
    console.log(`[PROCESS] Extracted ${properties.length} properties`);

    // Process properties in batches
    let inserted = 0;
    let updated = 0;
    let skipped = 0;
    const errors = [];
    const BATCH_SIZE = 100;

    for (let i = 0; i < properties.length; i += BATCH_SIZE) {
      const batch = properties.slice(i, i + BATCH_SIZE);
      
      for (const prop of batch) {
        try {
          if (!prop.accountNumber) {
            skipped++;
            continue;
          }

          // Upsert property - only include valid Property model fields
          const property = await prisma.property.upsert({
            where: { accountNumber: prop.accountNumber },
            update: {
              ownerName: prop.ownerName,
              propertyAddress: prop.propertyAddress,
              mailingAddress: prop.mailingAddress,
              totalDue: prop.totalDue,
              percentageDue: prop.percentageDue,
              status: prop.status,
              taxYear: prop.taxYear,
              legalDescription: prop.legalDescription,
              phoneNumbers: prop.phoneNumbers,
              isNew: prop.isNew,
              isRemoved: prop.isRemoved,
              statusChanged: prop.statusChanged,
              percentageChanged: prop.percentageChanged,
              updatedAt: new Date()
            },
            create: {
              accountNumber: prop.accountNumber,
              ownerName: prop.ownerName,
              propertyAddress: prop.propertyAddress,
              mailingAddress: prop.mailingAddress,
              totalDue: prop.totalDue,
              percentageDue: prop.percentageDue,
              status: prop.status,
              taxYear: prop.taxYear,
              legalDescription: prop.legalDescription,
              phoneNumbers: prop.phoneNumbers,
              isNew: prop.isNew,
              isRemoved: prop.isRemoved,
              statusChanged: prop.statusChanged,
              percentageChanged: prop.percentageChanged
            }
          });

          if (property.createdAt.getTime() === property.updatedAt.getTime()) {
            inserted++;
          } else {
            updated++;
          }
        } catch (error) {
          errors.push({
            accountNumber: prop.accountNumber || 'Unknown',
            error: error.message
          });
          skipped++;
        }
      }

      // Update progress
      await prisma.fileUpload.update({
        where: { id: fileUploadRecord.id },
        data: { processedRecords: Math.min(i + BATCH_SIZE, properties.length) }
      });
    }

    // Mark as completed
    await prisma.fileUpload.update({
      where: { id: fileUploadRecord.id },
      data: {
        status: 'COMPLETED',
        processedRecords: properties.length,
        errorCount: errors.length,
        completedAt: new Date()
      }
    });

    console.log(`[PROCESS] Complete - Inserted: ${inserted}, Updated: ${updated}, Skipped: ${skipped}`);

  } catch (error) {
    console.error(`[PROCESS] Error processing file ${fileId}:`, error);
    try {
      const fileUploadRecord = await prisma.fileUpload.findUnique({
        where: { fileId }
      });
      if (fileUploadRecord) {
        await prisma.fileUpload.update({
          where: { id: fileUploadRecord.id },
          data: {
            status: 'FAILED',
            errorMessage: error.message
          }
        });
      }
    } catch (updateError) {
      console.error(`[PROCESS] Failed to update error status:`, updateError);
    }
    throw error;
  }
}

// ============================================================================
// EXTRACT PROPERTIES FROM EXCEL DATA (with NEW- columns support)
// ============================================================================

function extractProperties(data) {
  if (!data || data.length === 0) {
    return [];
  }
  
  const headers = Object.keys(data[0] || {});
  console.log(`[EXTRACT] Extracting from ${data.length} rows with ${headers.length} columns`);
  
  // Find NEW- columns
  const newColumns = headers.filter(h => h && h.toUpperCase().startsWith('NEW-'));
  console.log(`[EXTRACT] Found ${newColumns.length} NEW- columns:`, newColumns.join(', '));

  const properties = data.map((row) => {
    // Helper to get column value
    const getValue = (columnName, fallbacks = []) => {
      // Try exact match first
      if (row[columnName] !== undefined && row[columnName] !== null && row[columnName] !== '') {
        return row[columnName];
      }
      // Try fallbacks
      for (const fallback of fallbacks) {
        if (row[fallback] !== undefined && row[fallback] !== null && row[fallback] !== '') {
          return row[fallback];
        }
      }
      // Try case-insensitive search
      for (const header of headers) {
        if (header && header.toUpperCase() === columnName.toUpperCase()) {
          const val = row[header];
          if (val !== undefined && val !== null && val !== '') {
            return val;
          }
        }
      }
      return null;
    };

    // Helper to get NEW- column value
    const getNewColumn = (fieldName) => {
      // Try exact match
      const exactMatch = row[`NEW-${fieldName}`];
      if (exactMatch !== undefined && exactMatch !== null && exactMatch !== '') {
        return exactMatch;
      }
      // Try case-insensitive search
      for (const header of headers) {
        if (header) {
          const headerUpper = header.toUpperCase().trim();
          const targetUpper = `NEW-${fieldName.toUpperCase()}`.trim();
          if (headerUpper === targetUpper) {
            const value = row[header];
            if (value !== undefined && value !== null && value !== '') {
              return value;
            }
          }
        }
      }
      return null;
    };

    // Parse numeric values
    const parseNumeric = (value) => {
      if (value === null || value === undefined || value === '') return 0;
      const num = parseFloat(String(value).replace(/[$,]/g, ''));
      return isNaN(num) ? 0 : num;
    };

    // Parse status
    const parseStatus = (value) => {
      if (!value) return 'ACTIVE';
      const firstChar = String(value).charAt(0).toUpperCase();
      if (firstChar === 'P') return 'PENDING';
      if (firstChar === 'J') return 'JUDGMENT';
      if (firstChar === 'A') return 'ACTIVE';
      return 'ACTIVE';
    };

    // Get account number (CAN column)
    const accountNumber = String(
      getValue('CAN', ['Account Number', 'ACCOUNT NUMBER', 'accountNumber', 'Account', 'ACCOUNT']) || ''
    ).trim();

    if (!accountNumber) {
      return null; // Skip rows without account number
    }

    // Extract property data - ONLY fields that exist in Property model
    const propertyData = {
      accountNumber,
      ownerName: String(
        getValue('Owner Name', ['OWNER NAME', 'ownerName', 'Owner', 'OWNER']) || 
        getNewColumn('Owner Name') || ''
      ).trim() || 'Unknown',
      propertyAddress: String(
        getValue('ADDRSTRING', ['Property Address', 'PROPERTY ADDRESS', 'propertyAddress', 'Address', 'ADDRESS']) ||
        getNewColumn('Property Address') || ''
      ).trim() || 'Unknown',
      mailingAddress: (() => {
        const val = String(
          getValue('Mailing Address', ['MAILING ADDRESS', 'mailingAddress']) ||
          getNewColumn('Mailing Address') || ''
        ).trim();
        return val || null;
      })(),
      totalDue: parseNumeric(
        getNewColumn('Total') ||
        getValue('Total Due', ['TOTAL DUE', 'totalDue', 'tot_percan', 'Total', 'TOTAL']) ||
        0
      ),
      percentageDue: parseNumeric(
        getValue('Percentage Due', ['PERCENTAGE DUE', 'percentageDue', 'Percentage', 'PERCENTAGE']) || 0
      ),
      status: parseStatus(
        getValue('LEGALSTATUS', ['Status', 'STATUS', 'status', 'Legal Status', 'LEGAL STATUS']) || 'A'
      ),
      taxYear: (() => {
        const val = parseInt(
          getNewColumn('Tax Year') ||
          getValue('Tax Year', ['TAX YEAR', 'taxYear']) ||
          new Date().getFullYear()
        );
        return isNaN(val) ? new Date().getFullYear() : val;
      })(),
      legalDescription: (() => {
        const val = String(
          getNewColumn('Legal Description') ||
          getValue('Legal Description', ['LEGAL DESCRIPTION', 'legalDescription']) || ''
        ).trim();
        return val || null;
      })(),
      phoneNumbers: [], // Empty array by default
      isNew: false,
      isRemoved: false,
      statusChanged: false,
      percentageChanged: false
    };

    return propertyData;
  }).filter(p => p !== null); // Remove null entries

  return properties;
}

// ============================================================================
// GET FILE UPLOAD STATUS
// ============================================================================

router.get('/:fileId/status', optionalAuth, async (req, res) => {
  try {
    const { fileId } = req.params;
    const fileUpload = await prisma.fileUpload.findUnique({
      where: { fileId }
    });

    if (!fileUpload) {
      return res.status(404).json({ error: 'File upload not found' });
    }

    res.json(fileUpload);
  } catch (error) {
    console.error('[UPLOAD] Status error:', error);
    res.status(500).json({ error: 'Failed to get file status' });
  }
});

// ============================================================================
// GET ALL FILE UPLOADS
// ============================================================================

router.get('/', optionalAuth, async (req, res) => {
  try {
    const files = await prisma.fileUpload.findMany({
      orderBy: { uploadedAt: 'desc' },
      take: 50
    });

    res.json(files);
  } catch (error) {
    console.error('[UPLOAD] List error:', error);
    res.status(500).json({ error: 'Failed to list files' });
  }
});

// ============================================================================
// CLEAR ALL PROPERTIES (Admin only)
// ============================================================================

router.delete('/properties/all', optionalAuth, async (req, res) => {
  try {
    // Check if user is admin (if authenticated)
    if (req.user && req.user.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const count = await prisma.property.deleteMany({});

    console.log(`[UPLOAD] Deleted ${count.count} properties`);

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
