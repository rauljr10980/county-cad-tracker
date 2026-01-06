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
    console.log(`[UPLOAD] Received upload request`);
    console.log(`[UPLOAD] Request headers:`, JSON.stringify(req.headers, null, 2));
    console.log(`[UPLOAD] Request body keys:`, req.body ? Object.keys(req.body) : 'no body');
    
    // Validate request body exists
    if (!req.body) {
      console.error('[UPLOAD] No request body received');
      return res.status(400).json({ error: 'Request body is required' });
    }

    const { filename, fileData } = req.body;
    
    if (!filename || !fileData) {
      console.error(`[UPLOAD] Missing required fields - filename: ${!!filename}, fileData: ${!!fileData}`);
      return res.status(400).json({ error: 'Filename and fileData are required' });
    }

    console.log(`[UPLOAD] Starting upload for: ${filename}, fileData length: ${fileData ? fileData.length : 0}`);

    // Validate file size (100MB limit)
    const base64Size = fileData.length;
    const estimatedSize = (base64Size * 3) / 4; // Base64 is ~33% larger
    if (estimatedSize > 100 * 1024 * 1024) {
      return res.status(400).json({ 
        error: 'File too large', 
        message: `File size (${Math.round(estimatedSize / 1024 / 1024)}MB) exceeds 100MB limit` 
      });
    }

    // Decode base64 file data
    let buffer;
    try {
      buffer = Buffer.from(fileData, 'base64');
      console.log(`[UPLOAD] Decoded file, size: ${buffer.length} bytes (${Math.round(buffer.length / 1024 / 1024)}MB)`);
    } catch (decodeError) {
      console.error('[UPLOAD] Base64 decode error:', decodeError);
      return res.status(400).json({ 
        error: 'Invalid file data', 
        message: 'Failed to decode base64 file data' 
      });
    }

    // Validate it's an Excel file
    if (buffer.length < 4) {
      return res.status(400).json({ error: 'Invalid file', message: 'File is too small to be a valid Excel file' });
    }

    // Create file upload record
    const fileId = Date.now().toString();
    let fileUpload;
    try {
      fileUpload = await prisma.fileUpload.create({
        data: {
          fileId,
          filename,
          status: 'PROCESSING',
          totalRecords: 0,
          processedRecords: 0
        }
      });
    } catch (dbError) {
      console.error('[UPLOAD] Database error:', dbError);
      return res.status(500).json({ 
        error: 'Database error', 
        message: 'Failed to create file upload record' 
      });
    }

    // Process file asynchronously (don't block response)
    processFileAsync(fileId, buffer, filename).catch(error => {
      console.error(`[UPLOAD] Error processing file ${fileId}:`, error);
      // Use fileUpload.id instead of fileUpload.id (ensure it exists)
      if (fileUpload && fileUpload.id) {
        prisma.fileUpload.update({
          where: { id: fileUpload.id },
          data: {
            status: 'FAILED',
            errorMessage: (error && error.message) ? error.message : 'Unknown error during processing'
          }
        }).catch(updateError => {
          console.error(`[UPLOAD] Failed to update error status:`, updateError);
        });
      } else {
        console.error(`[UPLOAD] Cannot update error status - fileUpload record missing`);
      }
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
      message: error.message || 'Unknown error occurred'
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
          errorMessage: error?.message || 'Unknown error during processing'
        }
      }).catch(updateError => {
        console.error(`[UPLOAD] Failed to update error status:`, updateError);
      });
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
    let workbook;
    try {
      workbook = XLSX.read(buffer, {
        type: 'buffer',
        cellDates: false,
        cellStyles: false,
        sheetStubs: false,
      });
    } catch (parseError) {
      throw new Error(`Failed to parse Excel file: ${parseError.message}`);
    }

    if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
      throw new Error('Excel file has no sheets');
    }

    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];

    if (!worksheet) {
      throw new Error(`Sheet "${sheetName}" not found or is empty`);
    }

    // Try to find headers - check row 3 first, then row 1, then row 2
    let headerRow = [];
    let dataStartRow = 3; // Default: data starts at row 4
    const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1');
    
    // Try row 3 first (0-indexed row 2)
    for (let col = range.s.c; col <= range.e.c; col++) {
      const cellAddress = XLSX.utils.encode_cell({ r: 2, c: col });
      const cell = worksheet[cellAddress];
      if (cell && cell.v) {
        headerRow.push(cell.v.toString().trim());
      } else {
        headerRow.push(`__EMPTY_${col}`);
      }
    }

    // If row 3 is empty, try row 1 (0-indexed row 0)
    if (headerRow.every(h => h.startsWith('__EMPTY') || !h)) {
      console.log(`[PROCESS] Row 3 empty, trying row 1 for headers`);
      headerRow = [];
      dataStartRow = 1; // Data starts at row 2
      for (let col = range.s.c; col <= range.e.c; col++) {
        const cellAddress = XLSX.utils.encode_cell({ r: 0, c: col });
        const cell = worksheet[cellAddress];
        if (cell && cell.v) {
          headerRow.push(cell.v.toString().trim());
        } else {
          headerRow.push(`__EMPTY_${col}`);
        }
      }
    }

    // Convert to JSON
    const data = XLSX.utils.sheet_to_json(worksheet, {
      raw: false,
      header: headerRow,
      range: dataStartRow, // Start reading data from the row after headers
      defval: '',
      blankrows: false,
    });

    console.log(`[PROCESS] Found ${data.length} rows in Excel file with ${headerRow.length} columns`);

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

          // Ensure status is valid Prisma enum value
          const validStatus = ['JUDGMENT', 'ACTIVE', 'PENDING', 'PAID', 'REMOVED', 'UNKNOWN'].includes(prop.status)
            ? prop.status
            : 'UNKNOWN';

          // Build data object with all fields
          const propertyData = {
            accountNumber: prop.accountNumber,
            ownerName: prop.ownerName || 'Unknown',
            propertyAddress: prop.propertyAddress || '',
            mailingAddress: prop.mailingAddress,
            totalDue: prop.totalDue || 0,
            percentageDue: prop.percentageDue || 0,
            status: validStatus,
            taxYear: prop.taxYear,
            legalDescription: prop.legalDescription,
            phoneNumbers: prop.phoneNumbers || [],
            isNew: prop.isNew || false,
            isRemoved: prop.isRemoved || false,
            statusChanged: prop.statusChanged || false,
            percentageChanged: prop.percentageChanged || false,
          };

          // Add NEW- columns only if they exist
          if (prop.marketValue !== undefined && prop.marketValue !== null) propertyData.marketValue = prop.marketValue;
          if (prop.landValue !== undefined && prop.landValue !== null) propertyData.landValue = prop.landValue;
          if (prop.improvementValue !== undefined && prop.improvementValue !== null) propertyData.improvementValue = prop.improvementValue;
          if (prop.cappedValue !== undefined && prop.cappedValue !== null) propertyData.cappedValue = prop.cappedValue;
          if (prop.agriculturalValue !== undefined && prop.agriculturalValue !== null) propertyData.agriculturalValue = prop.agriculturalValue;
          if (prop.exemptions && Array.isArray(prop.exemptions)) propertyData.exemptions = prop.exemptions;
          if (prop.jurisdictions && Array.isArray(prop.jurisdictions)) propertyData.jurisdictions = prop.jurisdictions;
          if (prop.lastPaymentDate) propertyData.lastPaymentDate = prop.lastPaymentDate;
          if (prop.lastPaymentAmount !== undefined && prop.lastPaymentAmount !== null) propertyData.lastPaymentAmount = prop.lastPaymentAmount;
          if (prop.lastPayer) propertyData.lastPayer = prop.lastPayer;
          if (prop.delinquentAfter) propertyData.delinquentAfter = prop.delinquentAfter;
          if (prop.halfPaymentOptionAmount !== undefined && prop.halfPaymentOptionAmount !== null) propertyData.halfPaymentOptionAmount = prop.halfPaymentOptionAmount;
          if (prop.priorYearsAmountDue !== undefined && prop.priorYearsAmountDue !== null) propertyData.priorYearsAmountDue = prop.priorYearsAmountDue;
          if (prop.yearAmountDue !== undefined && prop.yearAmountDue !== null) propertyData.yearAmountDue = prop.yearAmountDue;
          if (prop.yearTaxLevy !== undefined && prop.yearTaxLevy !== null) propertyData.yearTaxLevy = prop.yearTaxLevy;
          if (prop.link) propertyData.link = prop.link;
          if (prop.ownerAddress) propertyData.ownerAddress = prop.ownerAddress;

          // Create the property - allow duplicates since accountNumber is no longer unique
          await prisma.property.create({
            data: propertyData
          });
          inserted++;
        } catch (error) {
          console.error(`[PROCESS] Error inserting property ${prop.accountNumber}:`, error.message);
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
// EXTRACT PROPERTIES FROM EXCEL DATA (with comprehensive NEW- columns support)
// ============================================================================

function extractProperties(data) {
  if (!data || data.length === 0) {
    console.log('[EXTRACT] No data to extract');
    return [];
  }
  
  const headers = Object.keys(data[0] || {});
  console.log(`[EXTRACT] Extracting from ${data.length} rows with headers:`, headers.slice(0, 10).join(', '), '...');
  
  const mappings = {
    accountNumber: ['can', 'account', 'account number', 'account_number', 'acct', 'acct no'],
    ownerName: ['owner', 'owner name', 'owner_name', 'name'],
    propertyAddress: ['addrstring', 'property address', 'property_address', 'address', 'property'],
    mailingAddress: ['mailing address', 'mailing_address', 'mailing'],
    status: ['legalstatus', 'legal_status', 'legal status'],
    totalAmountDue: ['tot_percan', 'total', 'amount due', 'amount_due', 'due', 'balance', 'levy_balance'],
    totalPercentage: ['percentage', 'percent', 'pct'],
  };

  const columnMap = {};
  headers.forEach(header => {
    const trimmedHeader = header.trim();
    const lowerHeader = trimmedHeader.toLowerCase();
    const normalizedHeader = lowerHeader.replace(/[^a-z0-9]/g, '');
    
    Object.entries(mappings).forEach(([key, aliases]) => {
      if (columnMap[key]) return;
      
      for (const alias of aliases) {
        if (lowerHeader === alias || normalizedHeader === alias.replace(/[^a-z0-9]/g, '')) {
          columnMap[key] = trimmedHeader;
          console.log(`[EXTRACT] Matched "${trimmedHeader}" → ${key}`);
          return;
        }
      }
      
      for (const alias of aliases) {
        const normalizedAlias = alias.replace(/[^a-z0-9]/g, '');
        if (lowerHeader.includes(alias) || normalizedHeader.includes(normalizedAlias)) {
          columnMap[key] = trimmedHeader;
          console.log(`[EXTRACT] Matched "${trimmedHeader}" → ${key} (partial)`);
          return;
        }
      }
    });
  });
  
  console.log(`[EXTRACT] Column mapping:`, columnMap);
  
  // Log NEW- columns found
  const newColumns = headers.filter(h => h && h.toUpperCase().startsWith('NEW-'));
  console.log(`[EXTRACT] NEW- columns found (${newColumns.length}):`, newColumns.join(', '));

  const properties = data.map((row, index) => {
    const getValue = (key) => {
      const col = columnMap[key];
      if (!col) {
        const rowKeys = Object.keys(row);
        const lowerKey = key.toLowerCase();
        for (const rowKey of rowKeys) {
          if (rowKey.toLowerCase() === lowerKey || 
              rowKey.toLowerCase().includes(lowerKey) ||
              lowerKey.includes(rowKey.toLowerCase())) {
            return (row[rowKey] || '').toString().trim();
          }
        }
        return '';
      }
      const value = row[col];
      if (value === undefined || value === null) return '';
      return value.toString().trim();
    };

    // Find account number (CAN)
    let finalAccountNumber = getValue('accountNumber');
    if (!finalAccountNumber) {
      for (const header of headers) {
        const normalizedHeader = header.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
        if (normalizedHeader === 'CAN' || normalizedHeader.includes('CAN')) {
          finalAccountNumber = (row[header] || '').toString().trim();
          break;
        }
      }
    }
    
    if (!finalAccountNumber) {
      return null; // Skip rows without account number
    }

    // Find property address (ADDRSTRING)
    let finalPropertyAddress = getValue('propertyAddress');
    if (!finalPropertyAddress) {
      for (const header of headers) {
        const normalizedHeader = header.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
        if (normalizedHeader === 'ADDRSTRING' || normalizedHeader.includes('ADDRSTRING') || 
            normalizedHeader.includes('ADDRESS')) {
          finalPropertyAddress = (row[header] || '').toString().trim();
          break;
        }
      }
    }

    // Find status (LEGALSTATUS) - check multiple variations
    let finalStatus = '';
    for (const header of headers) {
      const normalizedHeader = header.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (normalizedHeader === 'LEGALSTATUS' || normalizedHeader === 'LEGAL_STATUS' || normalizedHeader === 'STATUS') {
        finalStatus = (row[header] || '').toString().trim();
        if (finalStatus) break; // Only break if we found a non-empty value
      }
    }

    // If still not found, try looking in the mapped columns
    if (!finalStatus) {
      finalStatus = getValue('status');
    }

    // Determine status value - must match Prisma enum: JUDGMENT, ACTIVE, PENDING, PAID, REMOVED, UNKNOWN
    let statusValue = 'UNKNOWN'; // Default to UNKNOWN for blank values
    if (finalStatus) {
      const upperStatus = finalStatus.toUpperCase();
      const firstChar = upperStatus.charAt(0);

      // Map single character codes to full status names
      if (firstChar === 'P') statusValue = 'PENDING';
      else if (firstChar === 'J') statusValue = 'JUDGMENT';
      else if (firstChar === 'A') statusValue = 'ACTIVE';
      else if (upperStatus.includes('JUDGMENT')) statusValue = 'JUDGMENT';
      else if (upperStatus.includes('PENDING')) statusValue = 'PENDING';
      else if (upperStatus.includes('ACTIVE')) statusValue = 'ACTIVE';
      else if (upperStatus.includes('PAID')) statusValue = 'PAID';
      else if (upperStatus.includes('REMOVED')) statusValue = 'REMOVED';
      else statusValue = 'UNKNOWN'; // Unknown status for unrecognized values
    }

    // Debug log for first row
    if (index === 0) {
      console.log(`[EXTRACT] First row status - Raw: "${finalStatus}", Mapped: "${statusValue}"`);
    }

    // Helper to get NEW- column values
    const getNewColumn = (fieldName) => {
      const exactMatch = row[`NEW-${fieldName}`];
      if (exactMatch !== undefined && exactMatch !== null && exactMatch !== '') {
        return exactMatch;
      }
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
          const headerNormalized = headerUpper.replace(/[^A-Z0-9]/g, '');
          const targetNormalized = targetUpper.replace(/[^A-Z0-9]/g, '');
          if (headerNormalized === targetNormalized) {
            const value = row[header];
            if (value !== undefined && value !== null && value !== '') {
              return value;
            }
          }
        }
      }
      return null;
    };

    // Helper to safely get NEW- column value with multiple fallback strategies
    const getNewColumnValue = (fieldName) => {
      let value = getNewColumn(fieldName);
      if (value !== null && value !== undefined && value !== '') {
        return value;
      }
      value = row[`NEW-${fieldName}`];
      if (value !== undefined && value !== null && value !== '') {
        return value;
      }
      for (const header of headers) {
        if (header && header.toUpperCase() === `NEW-${fieldName.toUpperCase()}`) {
          value = row[header];
          if (value !== undefined && value !== null && value !== '') {
            return value;
          }
        }
      }
      return null;
    };

    // Parse numeric values from NEW- columns
    const parseNumeric = (value) => {
      if (value === null || value === undefined || value === '') return null;
      const num = parseFloat(String(value).replace(/[$,]/g, ''));
      return isNaN(num) ? null : num;
    };

    // Log first row for debugging
    if (index === 0) {
      const availableNewColumns = headers.filter(h => h && h.toUpperCase().startsWith('NEW-'));
      console.log(`[EXTRACT] Available NEW- columns:`, availableNewColumns);
    }

    // Build property object with all NEW- columns
    const property = {
      accountNumber: finalAccountNumber,
      ownerName: getValue('ownerName') || getNewColumnValue('Owner Name') || 'Unknown',
      propertyAddress: finalPropertyAddress || getValue('propertyAddress') || getNewColumnValue('Property Site Address') || 'Unknown',
      mailingAddress: getValue('mailingAddress') || getNewColumnValue('Owner Address') || null,
      status: statusValue,
      totalDue: parseNumeric(getNewColumnValue('Total Amount Due')) || parseNumeric(getNewColumnValue('Total')) || parseFloat(getValue('totalAmountDue') || '0') || 0,
      percentageDue: parseFloat(getValue('totalPercentage') || '0') || 0,
      // NEW- columns - all scraped data fields
      legalDescription: getNewColumnValue('Legal Description') || null,
      marketValue: parseNumeric(getNewColumnValue('Total Market Value')),
      landValue: parseNumeric(getNewColumnValue('Land Value')),
      improvementValue: parseNumeric(getNewColumnValue('Improvement Value')),
      cappedValue: parseNumeric(getNewColumnValue('Capped Value')),
      agriculturalValue: parseNumeric(getNewColumnValue('Agricultural Value')),
      exemptions: (() => {
        const val = getNewColumnValue('Exemptions');
        return val ? String(val).split(',').map(e => e.trim()).filter(e => e) : [];
      })(),
      jurisdictions: (() => {
        const val = getNewColumnValue('Jurisdictions');
        return val ? String(val).split(',').map(j => j.trim()).filter(j => j) : [];
      })(),
      lastPaymentDate: getNewColumnValue('Last Payment Date') || null,
      lastPaymentAmount: parseNumeric(getNewColumnValue('Last Payment Amount Received')),
      lastPayer: getNewColumnValue('Last Payer') || null,
      delinquentAfter: getNewColumnValue('Delinquent After') || null,
      halfPaymentOptionAmount: parseNumeric(getNewColumnValue('Half Payment Option Amount')),
      priorYearsAmountDue: parseNumeric(getNewColumnValue('Prior Years Amount Due')),
      taxYear: (() => {
        const val = getNewColumnValue('Tax Year');
        if (val) {
          const year = parseInt(String(val));
          return isNaN(year) ? null : year;
        }
        return null;
      })(),
      yearAmountDue: parseNumeric(getNewColumnValue('Year Amount Due')),
      yearTaxLevy: parseNumeric(getNewColumnValue('Year Tax Levy')),
      link: getNewColumnValue('Link') || null,
      ownerAddress: getNewColumnValue('Owner Address') || null,
      phoneNumbers: [],
      isNew: false,
      isRemoved: false,
      statusChanged: false,
      percentageChanged: false
    };

    return property;
  }).filter(p => p !== null && p.accountNumber);

  console.log(`[EXTRACT] Extracted ${properties.length} properties (filtered from ${data.length} rows)`);
  
  if (properties.length > 0) {
    const sample = properties[0];
    const newFieldsWithData = Object.keys(sample).filter(key => {
      const value = sample[key];
      return ['marketValue', 'landValue', 'improvementValue', 'cappedValue', 'agriculturalValue',
              'legalDescription', 'lastPaymentDate', 'lastPayer', 'delinquentAfter', 'taxYear',
              'link', 'ownerAddress', 'exemptions', 'jurisdictions', 'lastPaymentAmount',
              'halfPaymentOptionAmount', 'priorYearsAmountDue', 'yearAmountDue', 'yearTaxLevy'].includes(key)
             && value !== undefined && value !== null && value !== '' && value !== 0;
    });
    console.log(`[EXTRACT] Sample property has ${newFieldsWithData.length} NEW- fields with data:`, newFieldsWithData);
  }
  
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
