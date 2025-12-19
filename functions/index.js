// Version 2.7 - Added Tasks tab for follow-up management
const CODE_VERSION = '2.7.0';

// Load environment variables from .env file (for local development)
// Only load if .env file exists (optional for production)
if (require('fs').existsSync('.env')) {
  require('dotenv').config();
}

const { Storage } = require('@google-cloud/storage');
const XLSX = require('xlsx');
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const pdfParse = require('pdf-parse');

// Initialize Storage with credentials
// Supports multiple credential methods:
// 1. Service account JSON from environment variable (for Render, Railway, etc.)l
// 2. Service account key file path (for local dev)
// 3. Application Default Credentials (for Cloud Run, GCP)
const storageOptions = {};
if (process.env.GCP_PROJECT_ID) {
  storageOptions.projectId = process.env.GCP_PROJECT_ID;
}

// Method 1: Service account JSON from environment variable (for free hosting like Render)
if (process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON) {
  try {
    storageOptions.credentials = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON);
    console.log('[STORAGE] Using service account credentials from environment variable');
  } catch (error) {
    console.error('[STORAGE] Failed to parse GOOGLE_APPLICATION_CREDENTIALS_JSON:', error.message);
  }
}
// Method 2: Service account key file path (for local dev)
else if (process.env.GOOGLE_APPLICATION_CREDENTIALS && fs.existsSync(process.env.GOOGLE_APPLICATION_CREDENTIALS)) {
  storageOptions.keyFilename = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  console.log('[STORAGE] Using service account key file:', process.env.GOOGLE_APPLICATION_CREDENTIALS);
}
// Method 3: Application Default Credentials (for Cloud Run, GCP)
else {
  console.log('[STORAGE] Using Application Default Credentials (ADC)');
}

// Initialize storage with error handling
let storage;
try {
  storage = new Storage(storageOptions);
  console.log('[STORAGE] Storage initialized successfully');
} catch (error) {
  console.error('[STORAGE] Failed to initialize storage:', error.message);
  // Don't crash - storage will be checked when needed
}

const app = express();
// CORS configuration - allow all origins for now
app.use(cors({ 
  origin: true,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json({ limit: '50mb' })); // Increase limit for file uploads

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    version: CODE_VERSION,
    timestamp: new Date().toISOString(),
    storage: storage ? 'initialized' : 'not initialized'
  });
});

// Debug endpoint to check last processed file's raw data
app.get('/api/debug/sample', async (req, res) => {
  try {
    const bucket = storage.bucket(BUCKET_NAME);
    const fileList = await listFiles(bucket, 'metadata/files/');
    const fileIds = fileList
      .map(f => f.replace('metadata/files/', '').replace('.json', ''))
      .sort((a, b) => parseInt(b) - parseInt(a));
    
    if (fileIds.length === 0) {
      return res.json({ error: 'No files found' });
    }
    
    const latestFileId = fileIds[0];
    const properties = await loadJSON(bucket, `data/properties/${latestFileId}.json`) || [];
    
    // Get sample of different status values
    const samples = {
      first5: properties.slice(0, 5).map(p => ({ accountNumber: p.accountNumber, status: p.status, ownerName: p.ownerName })),
      statusCounts: { J: 0, A: 0, P: 0, other: 0, otherValues: [] },
    };
    
    properties.forEach(p => {
      if (p.status === 'J') samples.statusCounts.J++;
      else if (p.status === 'A') samples.statusCounts.A++;
      else if (p.status === 'P') samples.statusCounts.P++;
      else {
        samples.statusCounts.other++;
        if (samples.statusCounts.otherValues.length < 10 && !samples.statusCounts.otherValues.includes(p.status)) {
          samples.statusCounts.otherValues.push(p.status);
        }
      }
    });
    
    res.json({
      version: CODE_VERSION,
      fileId: latestFileId,
      totalProperties: properties.length,
      samples
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Start server - Railway runs this file directly
const PORT = process.env.PORT || 8080;

// Always start the server (Railway runs this file directly)
app.listen(PORT, '0.0.0.0', () => {
  console.log(`[SERVER] Server running on port ${PORT}`);
  console.log(`[SERVER] Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`[SERVER] Storage initialized: ${storage ? 'Yes' : 'No'}`);
});

const BUCKET_NAME = process.env.GCS_BUCKET || 'county-cad-tracker-files';

// Helper functions for Cloud Storage JSON operations
async function saveJSON(bucket, path, data) {
  const file = bucket.file(path);
  await file.save(JSON.stringify(data, null, 2), {
    metadata: { contentType: 'application/json' },
  });
}

async function loadJSON(bucket, path) {
  try {
    const file = bucket.file(path);
    const [exists] = await file.exists();
    if (!exists) return null;
    const [data] = await file.download();
    return JSON.parse(data.toString());
  } catch (error) {
    return null;
  }
}

async function listFiles(bucket, prefix) {
  const [files] = await bucket.getFiles({ prefix });
  return files.map(file => file.name);
}

/**
 * Upload file endpoint
 */
app.post('/api/upload', async (req, res) => {
  try {
    if (!storage) {
      console.error('[UPLOAD] ERROR: Storage not initialized');
      return res.status(500).json({ error: 'Storage not initialized. Check environment variables.' });
    }
    
    const { filename, fileData } = req.body;
    
    if (!filename || !fileData) {
      return res.status(400).json({ error: 'Filename and fileData are required' });
    }

    console.log(`[UPLOAD] Starting upload for: ${filename}`);
    console.log(`[UPLOAD] Using bucket: ${BUCKET_NAME}`);
    console.log(`[UPLOAD] Credentials: ${process.env.GOOGLE_APPLICATION_CREDENTIALS || 'Using Application Default Credentials'}`);
    
    const bucket = storage.bucket(BUCKET_NAME);
    
    // Verify bucket exists and is accessible
    try {
      const [exists] = await bucket.exists();
      if (!exists) {
        console.error(`[UPLOAD] ERROR: Bucket ${BUCKET_NAME} does not exist!`);
        return res.status(500).json({ 
          error: `Bucket ${BUCKET_NAME} does not exist. Please create it in Google Cloud Console.` 
        });
      }
      console.log(`[UPLOAD] Bucket exists and is accessible`);
    } catch (bucketError) {
      console.error(`[UPLOAD] ERROR: Cannot access bucket:`, bucketError);
      return res.status(500).json({ 
        error: `Cannot access bucket: ${bucketError.message}. Check your credentials and bucket permissions.` 
      });
    }
    
    const fileId = Date.now().toString();
    const storagePath = `uploads/${fileId}_${filename}`;
    
    // Decode base64 file data
    const buffer = Buffer.from(fileData, 'base64');
    console.log(`[UPLOAD] Decoded file, size: ${buffer.length} bytes`);
    
    // Upload to Cloud Storage
    const file = bucket.file(storagePath);
    const contentType = filename.toLowerCase().endsWith('.pdf') 
      ? 'application/pdf'
      : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    
    console.log(`[UPLOAD] Attempting to save file to: ${storagePath}`);
    try {
      await file.save(buffer, {
        metadata: {
          contentType,
        },
      });
      console.log(`[UPLOAD] File saved successfully to GCS`);
    } catch (saveError) {
      console.error(`[UPLOAD] ERROR saving file to GCS:`, saveError);
      return res.status(500).json({ 
        error: `Failed to save file to storage: ${saveError.message}` 
      });
    }

    // Create file metadata
    const fileDoc = {
      id: fileId,
      filename,
      uploadedAt: new Date().toISOString(),
      status: 'processing',
      propertyCount: 0,
      storagePath,
    };

    // Save file metadata to Cloud Storage
    try {
      await saveJSON(bucket, `metadata/files/${fileId}.json`, fileDoc);
      console.log(`[UPLOAD] Metadata saved successfully`);
    } catch (metadataError) {
      console.error(`[UPLOAD] ERROR saving metadata:`, metadataError);
      // Don't fail the upload if metadata save fails, but log it
    }

    console.log(`[UPLOAD] File uploaded successfully:`, {
      fileId,
      filename,
      storagePath,
      size: buffer.length,
      uploadedAt: fileDoc.uploadedAt,
    });

    // Trigger processing (async)
    processFile(fileId, storagePath, filename).catch(console.error);

    res.json({
      success: true,
      fileId,
      message: 'File uploaded successfully',
    });
  } catch (error) {
    console.error('[UPLOAD] FATAL ERROR:', error);
    console.error('[UPLOAD] Error stack:', error.stack);
    res.status(500).json({ 
      error: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    });
  }
});

/**
 * Helper function to update processing progress
 */
async function updateProgress(fileId, step, message, progress = 0) {
  try {
    if (!storage) return;
    const bucket = storage.bucket(BUCKET_NAME);
    const fileDoc = await loadJSON(bucket, `metadata/files/${fileId}.json`);
    if (fileDoc) {
      fileDoc.processingStep = step;
      fileDoc.processingMessage = message;
      fileDoc.processingProgress = progress;
      fileDoc.processingUpdatedAt = new Date().toISOString();
      await saveJSON(bucket, `metadata/files/${fileId}.json`, fileDoc);
      console.log(`[PROCESS] Progress: ${step} - ${message} (${progress}%)`);
    }
  } catch (error) {
    console.error(`[PROCESS] Failed to update progress:`, error.message);
  }
}

/**
 * Process uploaded file (Excel or PDF)
 */
async function processFile(fileId, storagePath, filename) {
  try {
    console.log(`[PROCESS] Starting processing for fileId: ${fileId}, filename: ${filename}`);
    await updateProgress(fileId, 'starting', 'Initializing file processing...', 0);
    
    if (!storage) {
      throw new Error('Storage not initialized. Check GOOGLE_APPLICATION_CREDENTIALS_JSON environment variable.');
    }
    
    const bucket = storage.bucket(BUCKET_NAME);
    const file = bucket.file(storagePath);
    
    // Download file
    await updateProgress(fileId, 'downloading', 'Downloading file from storage...', 10);
    let fileBuffer = await file.download();
    fileBuffer = fileBuffer[0]; // Get the buffer from the array
    console.log(`[PROCESS] Downloaded file, size: ${fileBuffer.length} bytes`);
    
    let data = [];
    
    // Check file type and parse accordingly
    if (filename.toLowerCase().endsWith('.pdf')) {
      await updateProgress(fileId, 'parsing', 'Parsing PDF file...', 20);
      console.log(`[PROCESS] Parsing PDF file`);
      // Parse PDF
      const pdfData = await pdfParse(fileBuffer);
      data = parsePDFToJSON(pdfData.text);
      // Clear buffer to free memory
      fileBuffer = null;
    } else {
      await updateProgress(fileId, 'parsing', 'Reading Excel file structure...', 20);
      console.log(`[PROCESS] Parsing Excel file`);
      // Parse Excel
      // Excel structure (per user requirements):
      // Row 1: Empty or title - will be skipped
      // Row 2: Descriptions (what each column is for) - will be skipped
      // Row 3: Column headers/titles (actual column names) - used as headers
      // Row 4+: Data rows - processed as property data

      const workbook = XLSX.read(fileBuffer, {
        type: 'buffer',
        cellDates: false, // Don't parse dates to save memory
        cellStyles: false, // Don't parse styles
        sheetStubs: false, // Skip empty cells
      });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];

      // Clear buffer to free memory after parsing
      fileBuffer = null;

      // Excel structure:
      // Row 1: (empty or title) - will be skipped
      // Row 2: Descriptions (what each column is for) - will be skipped
      // Row 3: Column headers/titles (actual column names) - used as headers
      // Row 4+: Data rows - processed as property data

      // Read row 2 for descriptions (for logging/debugging)
      const descriptions = {};
      Object.keys(worksheet).forEach(cell => {
        const cellRef = XLSX.utils.decode_cell(cell);
        if (cellRef.r === 1 && cell[0] !== '!') { // Row 2 (0-indexed row 1)
          const colLetter = XLSX.utils.encode_col(cellRef.c);
          const value = worksheet[cell]?.v || '';
          if (value) descriptions[colLetter] = value;
        }
      });
      if (Object.keys(descriptions).length > 0) {
        console.log(`[PROCESS] Row 2 descriptions found:`, Object.values(descriptions).filter(d => d).slice(0, 5).join(', '), '...');
      }

      // EXPLICIT ROW 3 HEADER EXTRACTION
      // Excel structure:
      // Row 1: Title (Request Seq.:959740, BEXAR COUNTY) - SKIP
      // Row 2: Descriptions (what each column is for) - SKIP  
      // Row 3: Column headers (CAN, ADDRSTRING, LEGALSTATUS, etc.) - USE AS HEADERS
      // Row 4+: Data rows - PROCESS
      
      // Step 1: Manually extract headers from Row 3 (0-indexed row 2)
      const headerRow = [];
      const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1');
      for (let col = range.s.c; col <= range.e.c; col++) {
        const cellAddress = XLSX.utils.encode_cell({ r: 2, c: col }); // Row 3 is 0-indexed row 2
        const cell = worksheet[cellAddress];
        headerRow.push(cell ? cell.v.toString().trim() : `__EMPTY_${col}`);
      }
      console.log(`[PROCESS] EXPLICIT Row 3 headers:`, headerRow.slice(0, 15).join(', '));
      console.log(`[PROCESS] Looking for: CAN at E3, ADDRSTRING at H3, LEGALSTATUS at AE3`);
      
      // Step 2: Convert to JSON starting from Row 4 (0-indexed row 3), using explicit headers
      data = XLSX.utils.sheet_to_json(worksheet, {
        raw: false,
        header: headerRow, // Use our explicit header row
        range: 3, // Start reading data from row 4 (0-indexed row 3)
        defval: '', // Default value for empty cells
        blankrows: false, // Skip blank rows to save memory
      });
      
      // Log what we got
      if (data.length > 0) {
        const actualHeaders = Object.keys(data[0]);
        console.log(`[PROCESS] Data row keys:`, actualHeaders.slice(0, 15).join(', '));
        
        // Verify critical columns exist
        const hasCAN = actualHeaders.some(h => h.toUpperCase() === 'CAN');
        const hasAddr = actualHeaders.some(h => h.toUpperCase() === 'ADDRSTRING');
        const hasStatus = actualHeaders.some(h => h.toUpperCase() === 'LEGALSTATUS');
        console.log(`[PROCESS] Column check: CAN=${hasCAN}, ADDRSTRING=${hasAddr}, LEGALSTATUS=${hasStatus}`);
        
        // Log sample values for debugging
        const sample = data[0];
        console.log(`[PROCESS] Sample row - CAN: ${sample['CAN']}, LEGALSTATUS: ${sample['LEGALSTATUS']}, ADDRSTRING: ${(sample['ADDRSTRING'] || '').substring(0, 50)}...`);
      }

      const headers = Object.keys(data[0] || {});
      console.log(`[PROCESS] Using row 3 as headers. Found ${headers.length} columns, ${data.length} data rows`);
      console.log(`[PROCESS] Column headers found:`, headers.slice(0, 10).join(', '), headers.length > 10 ? '...' : '');
      await updateProgress(fileId, 'parsing', `Found ${data.length} data rows, ${headers.length} columns`, 40);

      // Warn if file is very large (memory concerns)
      if (data.length > 50000) {
        console.log(`[PROCESS] WARNING: Large file with ${data.length} rows. Processing may be slow or fail due to memory constraints.`);
      }
    }

    console.log(`[PROCESS] Parsed ${data.length} rows from file`);

    // Extract properties
    await updateProgress(fileId, 'extracting', `Extracting properties from ${data.length} rows...`, 50);
    const properties = extractProperties(data);
    console.log(`[PROCESS] Extracted ${properties.length} properties`);
    await updateProgress(fileId, 'extracting', `Extracted ${properties.length} properties successfully`, 60);
    
    // Save properties to Cloud Storage
    await updateProgress(fileId, 'saving', `Saving ${properties.length} properties to storage...`, 70);
    await saveJSON(bucket, `data/properties/${fileId}.json`, properties);
    await updateProgress(fileId, 'saving', 'Properties saved successfully', 80);

    // Update file status
    const fileDoc = {
      id: fileId,
      filename,
      uploadedAt: (await loadJSON(bucket, `metadata/files/${fileId}.json`))?.uploadedAt || new Date().toISOString(),
      status: 'completed',
      processedAt: new Date().toISOString(),
      propertyCount: properties.length,
      storagePath,
      processingStep: 'completed',
      processingMessage: `Successfully processed ${properties.length} properties`,
      processingProgress: 100,
    };
    await saveJSON(bucket, `metadata/files/${fileId}.json`, fileDoc);
    console.log(`[PROCESS] Updated file metadata with status: completed, properties: ${properties.length}`);

    // Get previous file for comparison
    await updateProgress(fileId, 'comparing', 'Checking for previous files to compare...', 85);
    const fileList = await listFiles(bucket, 'metadata/files/');
    const fileIds = fileList
      .map(f => f.replace('metadata/files/', '').replace('.json', ''))
      .filter(id => id !== fileId)
      .sort((a, b) => parseInt(b) - parseInt(a)); // Sort by timestamp (newest first)

    console.log(`[PROCESS] Found ${fileIds.length} previous files for comparison`);
    
    let previousProperties = [];
    let previousFileId = null;
    
    // Find the most recent completed file
    for (const testFileId of fileIds) {
      const testFileDoc = await loadJSON(bucket, `metadata/files/${testFileId}.json`);
      if (testFileDoc && testFileDoc.status === 'completed') {
        previousFileId = testFileId;
        const prevData = await loadJSON(bucket, `data/properties/${previousFileId}.json`);
        if (prevData && Array.isArray(prevData) && prevData.length > 0) {
          previousProperties = prevData;
          console.log(`[PROCESS] Found previous completed file: ${previousFileId} with ${previousProperties.length} properties`);
          break;
        }
      }
    }

    // Generate comparison if previous file exists
    if (previousProperties.length > 0 && previousFileId) {
      await updateProgress(fileId, 'comparing', `Comparing with previous file (${previousProperties.length} properties)...`, 90);
      const prevFileDoc = await loadJSON(bucket, `metadata/files/${previousFileId}.json`);
      const comparison = generateComparison(
        properties, 
        previousProperties, 
        filename, 
        prevFileDoc?.filename || previousFileId
      );
      
      console.log(`[PROCESS] Generated comparison:`, {
        newProperties: comparison.summary.newProperties,
        removedProperties: comparison.summary.removedProperties,
        statusChanges: comparison.summary.statusChanges,
      });
      
      await saveJSON(bucket, `data/comparisons/${fileId}.json`, {
        ...comparison,
        currentFileId: fileId,
        previousFileId,
        generatedAt: new Date().toISOString(),
      });
      console.log(`[PROCESS] Saved comparison to data/comparisons/${fileId}.json`);
      await updateProgress(fileId, 'comparing', 'Comparison generated successfully', 95);
    } else {
      console.log(`[PROCESS] No previous completed file found for comparison (checked ${fileIds.length} files)`);
      await updateProgress(fileId, 'comparing', 'No previous file found for comparison', 95);
    }

    console.log(`[PROCESS] Successfully processed ${properties.length} properties from ${filename}`);
  } catch (error) {
    console.error(`[PROCESS] Error processing file ${fileId} (${filename}):`, error);
    console.error(`[PROCESS] Error stack:`, error.stack);
    
    // Update file status to error
    try {
      if (storage) {
        const bucket = storage.bucket(BUCKET_NAME);
        const fileDoc = await loadJSON(bucket, `metadata/files/${fileId}.json`);
        if (fileDoc) {
          fileDoc.status = 'error';
          fileDoc.errorMessage = error.message;
          fileDoc.errorDetails = error.stack;
          await saveJSON(bucket, `metadata/files/${fileId}.json`, fileDoc);
          console.log(`[PROCESS] Updated file status to error for ${fileId}: ${error.message}`);
        } else {
          console.error(`[PROCESS] Could not find file metadata for ${fileId}`);
        }
      } else {
        console.error(`[PROCESS] Cannot update error status - storage not initialized`);
      }
    } catch (updateError) {
      console.error(`[PROCESS] Failed to update error status:`, updateError);
      console.error(`[PROCESS] Update error stack:`, updateError.stack);
    }
  }
}

/**
 * Extract properties from Excel data
 */
function extractProperties(data) {
  if (!data || data.length === 0) {
    console.log('[EXTRACT] No data to extract');
    return [];
  }
  
  const headers = Object.keys(data[0] || {});
  console.log(`[EXTRACT] Extracting from ${data.length} rows with headers:`, headers.join(', '));
  
  const mappings = {
    accountNumber: ['can', 'account', 'account number', 'account_number', 'acct', 'acct no'],
    ownerName: ['owner', 'owner name', 'owner_name', 'name'],
    propertyAddress: ['addrstring', 'property address', 'property_address', 'address', 'property'],
    mailingAddress: ['mailing address', 'mailing_address', 'mailing'],
    status: ['legalstatus', 'legal_status', 'legal status'],  // Removed 'st' and 'status' to avoid false matches
    totalAmountDue: ['tot_percan', 'total', 'amount due', 'amount_due', 'due', 'balance', 'levy_balance'],
    totalPercentage: ['percentage', 'percent', 'pct'],
  };

  const columnMap = {};
  headers.forEach(header => {
    const trimmedHeader = header.trim();
    const lowerHeader = trimmedHeader.toLowerCase();
    // Remove any special characters and normalize
    const normalizedHeader = lowerHeader.replace(/[^a-z0-9]/g, '');
    
    Object.entries(mappings).forEach(([key, aliases]) => {
      // Skip if already matched
      if (columnMap[key]) return;
      
      // Try exact case-insensitive match first (handles "CAN", "can", "Can")
      for (const alias of aliases) {
        if (lowerHeader === alias || normalizedHeader === alias.replace(/[^a-z0-9]/g, '')) {
          columnMap[key] = trimmedHeader; // Use original header name
          console.log(`[EXTRACT] Matched "${trimmedHeader}" → ${key} (exact match)`);
          return;
        }
      }
      
      // Try includes match (handles "CAN Number", "Account CAN", etc.)
      for (const alias of aliases) {
        const normalizedAlias = alias.replace(/[^a-z0-9]/g, '');
        if (lowerHeader.includes(alias) || normalizedHeader.includes(normalizedAlias)) {
          columnMap[key] = trimmedHeader;
          console.log(`[EXTRACT] Matched "${trimmedHeader}" → ${key} (partial match)`);
          return;
        }
      }
    });
  });
  
  console.log(`[EXTRACT] Column mapping result:`, columnMap);
  
  // Warn if critical columns are missing
  if (!columnMap.accountNumber) {
    console.warn(`[EXTRACT] WARNING: Could not find accountNumber column (looking for: CAN, account, etc.)`);
    console.warn(`[EXTRACT] Available headers:`, headers);
  }
  if (!columnMap.propertyAddress) {
    console.warn(`[EXTRACT] WARNING: Could not find propertyAddress column (looking for: ADDRSTRING, address, etc.)`);
  }
  if (!columnMap.status) {
    console.warn(`[EXTRACT] WARNING: Could not find status column (looking for: LEGALSTATUS, status, etc.)`);
  }

  // Log all available columns ONCE at the start
  if (data.length > 0) {
    console.log(`[EXTRACT] ===== COLUMN ANALYSIS =====`);
    console.log(`[EXTRACT] Total columns found: ${headers.length}`);
    console.log(`[EXTRACT] Column names (first 20):`, headers.slice(0, 20).join(', '));
    console.log(`[EXTRACT] Looking for: CAN, ADDRSTRING, LEGALSTATUS`);
    console.log(`[EXTRACT] Column map result:`, columnMap);
    console.log(`[EXTRACT] First row sample (first 5 columns):`, 
      Object.keys(data[0]).slice(0, 5).reduce((acc, key) => {
        acc[key] = data[0][key];
        return acc;
      }, {})
    );
    console.log(`[EXTRACT] ===========================`);
  }

  const properties = data.map((row, index) => {
    const getValue = (key) => {
      const col = columnMap[key];
      if (!col) {
        // If column not found, try to find it in the row keys directly
        const rowKeys = Object.keys(row);
        const lowerKey = key.toLowerCase();
        for (const rowKey of rowKeys) {
          if (rowKey.toLowerCase() === lowerKey || 
              rowKey.toLowerCase().includes(lowerKey) ||
              lowerKey.includes(rowKey.toLowerCase())) {
            console.log(`[EXTRACT] Fallback match: "${rowKey}" for ${key}`);
            return (row[rowKey] || '').toString().trim();
          }
        }
        return '';
      }
      const value = row[col];
      if (value === undefined || value === null) return '';
      return value.toString().trim();
    };

    const accountNumber = getValue('accountNumber');
    const propertyAddress = getValue('propertyAddress');
    const status = getValue('status');
    const totalAmountDue = getValue('totalAmountDue');
    
    // Use first non-empty column value as accountNumber if CAN not found
    let finalAccountNumber = accountNumber;
    if (!finalAccountNumber || finalAccountNumber === '') {
      // Try to find CAN column by searching all headers (case-insensitive, handles spaces/special chars)
      for (const header of headers) {
        const normalizedHeader = header.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
        if (normalizedHeader === 'CAN' || normalizedHeader.includes('CAN')) {
          finalAccountNumber = (row[header] || '').toString().trim();
          if (finalAccountNumber && index === 0) {
            console.log(`[EXTRACT] ✓ Found CAN column: "${header}" = ${finalAccountNumber}`);
          }
          break;
        }
      }
      // If still not found, try first column (but only log once)
      if (!finalAccountNumber) {
        const firstCol = headers[0];
        if (firstCol && row[firstCol]) {
          finalAccountNumber = row[firstCol].toString().trim();
          if (index === 0) {
            console.log(`[EXTRACT] ⚠ WARNING: CAN column not found! Using first column "${firstCol}" = ${finalAccountNumber}`);
            console.log(`[EXTRACT] Available columns:`, headers.slice(0, 15).join(', '));
          }
        }
      }
    }
    
    // Also try to find ADDRSTRING and LEGALSTATUS if not found
    let finalPropertyAddress = propertyAddress;
    if (!finalPropertyAddress || finalPropertyAddress === '') {
      for (const header of headers) {
        const normalizedHeader = header.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
        if (normalizedHeader === 'ADDRSTRING' || normalizedHeader.includes('ADDRSTRING') || 
            normalizedHeader.includes('ADDRESS')) {
          finalPropertyAddress = (row[header] || '').toString().trim();
          if (finalPropertyAddress && index === 0) {
            console.log(`[EXTRACT] ✓ Found ADDRSTRING column: "${header}"`);
          }
          break;
        }
      }
    }
    
    // EXPLICITLY find LEGALSTATUS column - must be exact match
    let finalStatus = '';
    for (const header of headers) {
      // Only match EXACTLY "LEGALSTATUS" - not SPECIAL_STATUS, PPSTATUS, BANKRUPT_STATUS
      if (header.trim().toUpperCase() === 'LEGALSTATUS') {
        finalStatus = (row[header] || '').toString().trim();
        if (index === 0) {
          console.log(`[EXTRACT] ✓ Found LEGALSTATUS column: "${header}" = "${finalStatus}" (blank means no legal status)`);
        }
        break;
      }
    }
    
    // If LEGALSTATUS not found, log warning once
    if (index === 0 && !headers.some(h => h.trim().toUpperCase() === 'LEGALSTATUS')) {
      console.log(`[EXTRACT] ⚠ WARNING: LEGALSTATUS column not found in headers!`);
      console.log(`[EXTRACT] Available headers:`, headers.join(', '));
    }
    
    // Log first row only for debugging (reduce logging)
    if (index === 0) {
      console.log(`[EXTRACT] Sample row 0 extracted:`, {
        accountNumber: finalAccountNumber,
        propertyAddress: finalPropertyAddress || propertyAddress,
        status: finalStatus || status,
        totalAmountDue,
      });
    }
    
    // Determine final status: P, A, J, or blank (unknown)
    // finalStatus comes ONLY from LEGALSTATUS column
    let statusValue = '';
    if (finalStatus) {
      const firstChar = finalStatus.charAt(0).toUpperCase();
      // Only accept P, A, or J - anything else is unknown
      if (firstChar === 'P' || firstChar === 'A' || firstChar === 'J') {
        statusValue = firstChar;
      }
    }
    
    return {
      id: `${Date.now()}_${index}`,
      accountNumber: finalAccountNumber || accountNumber || `ROW_${index}`,
      ownerName: getValue('ownerName') || '',
      propertyAddress: finalPropertyAddress || propertyAddress || '',
      mailingAddress: getValue('mailingAddress') || '',
      status: statusValue || 'U', // U = Unknown (blank LEGALSTATUS)
      totalAmountDue: parseFloat(totalAmountDue || '0') || 0,
      totalPercentage: parseFloat(getValue('totalPercentage') || '0') || 0,
    };
  }).filter(p => {
    // Only filter out completely empty rows (no account number and no address)
    const hasData = p.accountNumber && 
                    (p.accountNumber !== '' || p.propertyAddress !== '');
    if (!hasData) {
      console.log(`[EXTRACT] Filtering out empty row:`, p);
    }
    return hasData;
  });
  
  console.log(`[EXTRACT] Extracted ${properties.length} properties (filtered from ${data.length} rows)`);
  
  // Log status breakdown
  const statusCounts = { J: 0, A: 0, P: 0, other: 0 };
  properties.forEach(p => {
    if (p.status === 'J') statusCounts.J++;
    else if (p.status === 'A') statusCounts.A++;
    else if (p.status === 'P') statusCounts.P++;
    else statusCounts.other++;
  });
  console.log(`[EXTRACT] Status breakdown: J=${statusCounts.J}, A=${statusCounts.A}, P=${statusCounts.P}, other=${statusCounts.other}`);
  
  if (properties.length > 0) {
    console.log(`[EXTRACT] Sample property:`, {
      accountNumber: properties[0].accountNumber,
      propertyAddress: properties[0].propertyAddress,
      status: properties[0].status,
      totalAmountDue: properties[0].totalAmountDue,
    });
  }
  
  return properties;
}

/**
 * Generate comparison report
 */
function generateComparison(currentProps, previousProps, currentFilename, previousFilename) {
  const currentMap = new Map(currentProps.map(p => [p.accountNumber, p]));
  const previousMap = new Map(previousProps.map(p => [p.accountNumber, p]));

  const newProperties = [];
  const removedProperties = [];
  const changedProperties = [];
  const statusTransitions = {};

  currentMap.forEach((current, accountNumber) => {
    const previous = previousMap.get(accountNumber);
    if (!previous) {
      // Mark new properties with P status as "new leads"
      const isNewLead = current.status === 'P';
      newProperties.push({ ...current, isNew: true, isNewLead });
    } else if (current.status !== previous.status || current.totalPercentage !== previous.totalPercentage) {
      // Flag critical status transitions
      const isEscalation = previous.status === 'P' && current.status === 'A'; // P → A
      const isCritical = previous.status === 'A' && current.status === 'J';    // A → J

      changedProperties.push({
        ...current,
        previousStatus: previous.status,
        statusChanged: current.status !== previous.status,
        percentageChanged: current.totalPercentage !== previous.totalPercentage,
        isEscalation,
        isCritical,
      });

      const transitionKey = `${previous.status}->${current.status}`;
      if (!statusTransitions[transitionKey]) {
        statusTransitions[transitionKey] = {
          from: previous.status,
          to: current.status,
          count: 0,
          properties: [],
          isEscalation,
          isCritical,
        };
      }
      statusTransitions[transitionKey].count++;
      statusTransitions[transitionKey].properties.push(current);
    }
  });

  previousMap.forEach((previous, accountNumber) => {
    if (!currentMap.has(accountNumber)) {
      removedProperties.push({ ...previous, isRemoved: true });
    }
  });

  const transitions = Object.values(statusTransitions);

  return {
    currentFile: currentFilename,
    previousFile: previousFilename,
    summary: {
      totalCurrent: currentProps.length,
      totalPrevious: previousProps.length,
      newProperties: newProperties.length,
      newLeads: newProperties.filter(p => p.isNewLead).length, // New P status properties
      removedProperties: removedProperties.length,
      statusChanges: changedProperties.filter(p => p.statusChanged).length,
      escalations: changedProperties.filter(p => p.isEscalation).length, // P → A
      criticalChanges: changedProperties.filter(p => p.isCritical).length, // A → J
      percentageChanges: changedProperties.filter(p => p.percentageChanged).length,
    },
    statusTransitions: transitions,
    newProperties: newProperties.slice(0, 100),
    removedProperties: removedProperties.slice(0, 100),
    changedProperties: changedProperties.slice(0, 100),
  };
}

/**
 * Get file history
 */
app.get('/api/files', async (req, res) => {
  try {
    console.log('[FILES] Starting file list request');
    const bucket = storage.bucket(BUCKET_NAME);

    // Add timeout wrapper
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Request timeout after 10s')), 10000)
    );

    const filesPromise = (async () => {
      console.log('[FILES] Listing files from GCS');
      const fileList = await listFiles(bucket, 'metadata/files/');
      console.log(`[FILES] Found ${fileList.length} metadata files`);

      // Limit to most recent 50 files to prevent timeout
      const recentFiles = fileList
        .sort((a, b) => {
          const aId = a.replace('metadata/files/', '').replace('.json', '');
          const bId = b.replace('metadata/files/', '').replace('.json', '');
          return parseInt(bId) - parseInt(aId);
        })
        .slice(0, 50);

      console.log(`[FILES] Loading metadata for ${recentFiles.length} recent files`);
      const files = await Promise.all(
        recentFiles.map(async (filePath) => {
          try {
            const fileData = await loadJSON(bucket, filePath);
            return fileData;
          } catch (err) {
            console.error(`[FILES] Error loading ${filePath}:`, err.message);
            return null;
          }
        })
      );

      // Sort by uploadedAt descending
      const validFiles = files.filter(f => f !== null);
      validFiles.sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));
      console.log(`[FILES] Returning ${validFiles.length} files`);
      return validFiles;
    })();

    const files = await Promise.race([filesPromise, timeoutPromise]);
    res.json(files);
  } catch (error) {
    console.error('[FILES] Error:', error.message);
    if (error.message.includes('timeout')) {
      res.status(504).json({ error: 'Request timeout - try again' });
    } else {
      res.status(500).json({ error: error.message });
    }
  }
});

/**
 * Delete a file
 */
app.delete('/api/files/:fileId', async (req, res) => {
  try {
    const { fileId } = req.params;
    console.log(`[DELETE] Deleting file: ${fileId}`);

    const bucket = storage.bucket(BUCKET_NAME);

    // Load file metadata to get storage path
    const fileDoc = await loadJSON(bucket, `metadata/files/${fileId}.json`);
    if (!fileDoc) {
      return res.status(404).json({ error: 'File not found' });
    }

    // Delete uploaded file
    try {
      const uploadedFile = bucket.file(fileDoc.storagePath);
      await uploadedFile.delete();
      console.log(`[DELETE] Deleted uploaded file: ${fileDoc.storagePath}`);
    } catch (err) {
      console.log(`[DELETE] Upload file not found or already deleted: ${fileDoc.storagePath}`);
    }

    // Delete properties data
    try {
      const propertiesFile = bucket.file(`data/properties/${fileId}.json`);
      await propertiesFile.delete();
      console.log(`[DELETE] Deleted properties data`);
    } catch (err) {
      console.log(`[DELETE] Properties file not found or already deleted`);
    }

    // Delete comparison data
    try {
      const comparisonFile = bucket.file(`data/comparisons/${fileId}.json`);
      await comparisonFile.delete();
      console.log(`[DELETE] Deleted comparison data`);
    } catch (err) {
      console.log(`[DELETE] Comparison file not found or already deleted`);
    }

    // Delete metadata file
    const metadataFile = bucket.file(`metadata/files/${fileId}.json`);
    await metadataFile.delete();
    console.log(`[DELETE] Deleted metadata file`);

    res.json({ success: true, message: 'File deleted successfully' });
  } catch (error) {
    console.error('[DELETE] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get comparison report
 */
app.get('/api/comparisons/:fileId', async (req, res) => {
  try {
    const { fileId } = req.params;
    const bucket = storage.bucket(BUCKET_NAME);
    const comparison = await loadJSON(bucket, `data/comparisons/${fileId}.json`);

    if (!comparison) {
      return res.status(404).json({ error: 'Comparison not found' });
    }

    res.json(comparison);
  } catch (error) {
    console.error('Get comparison error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get latest comparison
 */
app.get('/api/comparisons/latest', async (req, res) => {
  try {
    const bucket = storage.bucket(BUCKET_NAME);
    const fileList = await listFiles(bucket, 'data/comparisons/');
    
    if (fileList.length === 0) {
      console.log('[COMPARISONS] No comparison files found');
      return res.status(404).json({ error: 'No comparisons found' });
    }

    console.log(`[COMPARISONS] Found ${fileList.length} comparison files`);
    
    // Get the most recent comparison (by filename timestamp)
    const fileIds = fileList
      .map(f => f.replace('data/comparisons/', '').replace('.json', ''))
      .sort((a, b) => parseInt(b) - parseInt(a));

    console.log(`[COMPARISONS] Loading latest comparison: ${fileIds[0]}`);
    const comparison = await loadJSON(bucket, `data/comparisons/${fileIds[0]}.json`);
    
    if (!comparison) {
      console.log('[COMPARISONS] Comparison file exists but could not be loaded');
      return res.status(404).json({ error: 'Comparison file not found' });
    }
    
    console.log(`[COMPARISONS] Returning comparison: ${comparison.currentFile} vs ${comparison.previousFile}`);
    res.json(comparison);
  } catch (error) {
    console.error('[COMPARISONS] Get latest comparison error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get properties from latest completed file
 */
app.get('/api/properties', async (req, res) => {
  try {
    console.log('[PROPERTIES] Starting properties request');
    const bucket = storage.bucket(BUCKET_NAME);
    
    // Get list of files and find the latest completed one
    const fileList = await listFiles(bucket, 'metadata/files/');
    
    if (fileList.length === 0) {
      return res.json([]);
    }
    
    // Sort by ID (timestamp) descending
    const fileIds = fileList
      .map(f => f.replace('metadata/files/', '').replace('.json', ''))
      .sort((a, b) => parseInt(b) - parseInt(a));
    
    // Find the first completed file
    for (const fileId of fileIds.slice(0, 10)) {
      const fileDoc = await loadJSON(bucket, `metadata/files/${fileId}.json`);
      if (fileDoc && fileDoc.status === 'completed') {
        console.log(`[PROPERTIES] Loading properties from file: ${fileId}`);
        const properties = await loadJSON(bucket, `data/properties/${fileId}.json`) || [];
        console.log(`[PROPERTIES] Returning ${properties.length} properties`);
        
        // Log status breakdown (U = Unknown/blank LEGALSTATUS)
        const statusCounts = { J: 0, A: 0, P: 0, U: 0 };
        properties.forEach(p => {
          if (p.status === 'J') statusCounts.J++;
          else if (p.status === 'A') statusCounts.A++;
          else if (p.status === 'P') statusCounts.P++;
          else statusCounts.U++; // Unknown status (blank LEGALSTATUS)
        });
        console.log(`[PROPERTIES] Status breakdown:`, statusCounts);
        
        // Apply status filter if provided (J, A, P, or U for unknown)
        const statusFilter = req.query.status;
        let filteredProperties = properties;
        if (statusFilter && ['J', 'A', 'P', 'U'].includes(statusFilter.toUpperCase())) {
          filteredProperties = properties.filter(p => p.status === statusFilter.toUpperCase());
          console.log(`[PROPERTIES] Filtered by status ${statusFilter}: ${filteredProperties.length} properties`);
        }
        
        // Apply search filter if provided
        const search = req.query.search;
        if (search && search.trim()) {
          const lowerSearch = search.toLowerCase().trim();
          filteredProperties = filteredProperties.filter(p => {
            const accountNumber = (p.accountNumber || '').toLowerCase();
            const ownerName = (p.ownerName || '').toLowerCase();
            const propertyAddress = (p.propertyAddress || '').toLowerCase();
            const notes = (p.notes || '').toLowerCase();
            const phoneNumbers = (p.phoneNumbers || []).join(' ').toLowerCase();
            
            return accountNumber.includes(lowerSearch) ||
                   ownerName.includes(lowerSearch) ||
                   propertyAddress.includes(lowerSearch) ||
                   notes.includes(lowerSearch) ||
                   phoneNumbers.includes(lowerSearch);
          });
          console.log(`[PROPERTIES] Filtered by search "${search}": ${filteredProperties.length} properties`);
        }
        
        // Return paginated results (100 per page for performance)
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 100;
        const start = (page - 1) * limit;
        
        return res.json({
          properties: filteredProperties.slice(start, start + limit),
          total: filteredProperties.length,
          totalUnfiltered: properties.length,
          statusCounts,
          page,
          totalPages: Math.ceil(filteredProperties.length / limit),
          filter: statusFilter ? statusFilter.toUpperCase() : null,
        });
      }
    }
    
    res.json({ properties: [], total: 0, page: 1, totalPages: 0 });
  } catch (error) {
    console.error('[PROPERTIES] Error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Update property follow-up date
 */
app.put('/api/properties/:propertyId/followup', async (req, res) => {
  try {
    const { propertyId } = req.params;
    const { followUpDate } = req.body;
    
    console.log(`[FOLLOWUP] Updating follow-up for property ${propertyId} to ${followUpDate}`);
    
    const bucket = storage.bucket(BUCKET_NAME);
    
    // Find the file containing this property
    const fileList = await listFiles(bucket, 'metadata/files/');
    const fileIds = fileList
      .map(f => f.replace('metadata/files/', '').replace('.json', ''))
      .sort((a, b) => parseInt(b) - parseInt(a));
    
    for (const fileId of fileIds.slice(0, 5)) {
      const fileDoc = await loadJSON(bucket, `metadata/files/${fileId}.json`);
      if (fileDoc && fileDoc.status === 'completed') {
        const properties = await loadJSON(bucket, `data/properties/${fileId}.json`) || [];
        
        // Find and update the property
        const propertyIndex = properties.findIndex(p => p.id === propertyId);
        if (propertyIndex !== -1) {
          properties[propertyIndex].lastFollowUp = followUpDate;
          
          // Save updated properties
          await saveJSON(bucket, `data/properties/${fileId}.json`, properties);
          
          console.log(`[FOLLOWUP] Updated property ${propertyId} in file ${fileId}`);
          return res.json({ success: true, propertyId, followUpDate });
        }
      }
    }
    
    res.status(404).json({ error: 'Property not found' });
  } catch (error) {
    console.error('[FOLLOWUP] Error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Update property notes
 */
app.put('/api/properties/:propertyId/notes', async (req, res) => {
  try {
    const { propertyId } = req.params;
    const { notes } = req.body;
    
    console.log(`[NOTES] Updating notes for property ${propertyId}`);
    
    const bucket = storage.bucket(BUCKET_NAME);
    
    // Find the file containing this property
    const fileList = await listFiles(bucket, 'metadata/files/');
    const fileIds = fileList
      .map(f => f.replace('metadata/files/', '').replace('.json', ''))
      .sort((a, b) => parseInt(b) - parseInt(a));
    
    for (const fileId of fileIds.slice(0, 5)) {
      const fileDoc = await loadJSON(bucket, `metadata/files/${fileId}.json`);
      if (fileDoc && fileDoc.status === 'completed') {
        const properties = await loadJSON(bucket, `data/properties/${fileId}.json`) || [];
        
        // Find and update the property
        const propertyIndex = properties.findIndex(p => p.id === propertyId);
        if (propertyIndex !== -1) {
          properties[propertyIndex].notes = notes || '';
          
          // Save updated properties
          await saveJSON(bucket, `data/properties/${fileId}.json`, properties);
          
          console.log(`[NOTES] Updated property ${propertyId} in file ${fileId}`);
          return res.json({ success: true, propertyId, notes });
        }
      }
    }
    
    res.status(404).json({ error: 'Property not found' });
  } catch (error) {
    console.error('[NOTES] Error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Update property phone numbers
 */
app.put('/api/properties/:propertyId/phones', async (req, res) => {
  try {
    const { propertyId } = req.params;
    const { phoneNumbers, ownerPhoneIndex } = req.body;
    
    console.log(`[PHONES] Updating phone numbers for property ${propertyId}`);
    
    const bucket = storage.bucket(BUCKET_NAME);
    
    // Find the file containing this property
    const fileList = await listFiles(bucket, 'metadata/files/');
    const fileIds = fileList
      .map(f => f.replace('metadata/files/', '').replace('.json', ''))
      .sort((a, b) => parseInt(b) - parseInt(a));
    
    for (const fileId of fileIds.slice(0, 5)) {
      const fileDoc = await loadJSON(bucket, `metadata/files/${fileId}.json`);
      if (fileDoc && fileDoc.status === 'completed') {
        const properties = await loadJSON(bucket, `data/properties/${fileId}.json`) || [];
        
        // Find and update the property
        const propertyIndex = properties.findIndex(p => p.id === propertyId);
        if (propertyIndex !== -1) {
          properties[propertyIndex].phoneNumbers = phoneNumbers || [];
          properties[propertyIndex].ownerPhoneIndex = ownerPhoneIndex;
          
          // Save updated properties
          await saveJSON(bucket, `data/properties/${fileId}.json`, properties);
          
          console.log(`[PHONES] Updated property ${propertyId} in file ${fileId}`);
          return res.json({ success: true, propertyId, phoneNumbers, ownerPhoneIndex });
        }
      }
    }
    
    res.status(404).json({ error: 'Property not found' });
  } catch (error) {
    console.error('[PHONES] Error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Update property action (actionType, priority, dueTime)
 */
app.put('/api/properties/:propertyId/action', async (req, res) => {
  try {
    const { propertyId } = req.params;
    const { actionType, priority, dueTime } = req.body;
    
    console.log(`[ACTION] Updating action for property ${propertyId}: ${actionType}, ${priority}, ${dueTime}`);
    
    const bucket = storage.bucket(BUCKET_NAME);
    
    // Find the file containing this property
    const fileList = await listFiles(bucket, 'metadata/files/');
    const fileIds = fileList
      .map(f => f.replace('metadata/files/', '').replace('.json', ''))
      .sort((a, b) => parseInt(b) - parseInt(a));
    
    for (const fileId of fileIds.slice(0, 5)) {
      const fileDoc = await loadJSON(bucket, `metadata/files/${fileId}.json`);
      if (fileDoc && fileDoc.status === 'completed') {
        const properties = await loadJSON(bucket, `data/properties/${fileId}.json`) || [];
        
        // Find and update the property
        const propertyIndex = properties.findIndex(p => p.id === propertyId);
        if (propertyIndex !== -1) {
          properties[propertyIndex].actionType = actionType;
          properties[propertyIndex].priority = priority;
          properties[propertyIndex].dueTime = dueTime;
          
          // Save updated properties
          await saveJSON(bucket, `data/properties/${fileId}.json`, properties);
          
          console.log(`[ACTION] Updated property ${propertyId} in file ${fileId}`);
          return res.json({ success: true, propertyId, actionType, priority, dueTime });
        }
      }
    }
    
    res.status(404).json({ error: 'Property not found' });
  } catch (error) {
    console.error('[ACTION] Error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Update property priority only (quick update)
 */
app.put('/api/properties/:propertyId/priority', async (req, res) => {
  try {
    const { propertyId } = req.params;
    const { priority } = req.body;
    
    console.log(`[PRIORITY] Updating priority for property ${propertyId}: ${priority}`);
    
    const bucket = storage.bucket(BUCKET_NAME);
    
    // Find the file containing this property
    const fileList = await listFiles(bucket, 'metadata/files/');
    const fileIds = fileList
      .map(f => f.replace('metadata/files/', '').replace('.json', ''))
      .sort((a, b) => parseInt(b) - parseInt(a));
    
    for (const fileId of fileIds.slice(0, 5)) {
      const fileDoc = await loadJSON(bucket, `metadata/files/${fileId}.json`);
      if (fileDoc && fileDoc.status === 'completed') {
        const properties = await loadJSON(bucket, `data/properties/${fileId}.json`) || [];
        
        // Find and update the property
        const propertyIndex = properties.findIndex(p => p.id === propertyId);
        if (propertyIndex !== -1) {
          properties[propertyIndex].priority = priority;
          
          // Save updated properties
          await saveJSON(bucket, `data/properties/${fileId}.json`, properties);
          
          console.log(`[PRIORITY] Updated property ${propertyId} in file ${fileId}`);
          return res.json({ success: true, propertyId, priority });
        }
      }
    }
    
    res.status(404).json({ error: 'Property not found' });
  } catch (error) {
    console.error('[PRIORITY] Error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Mark task as done with outcome
 */
app.put('/api/properties/:propertyId/task-done', async (req, res) => {
  try {
    const { propertyId } = req.params;
    const { outcome, nextAction } = req.body;
    
    console.log(`[TASK-DONE] Marking task done for property ${propertyId}: ${outcome}, nextAction: ${nextAction}`);
    
    const bucket = storage.bucket(BUCKET_NAME);
    
    // Find the file containing this property
    const fileList = await listFiles(bucket, 'metadata/files/');
    const fileIds = fileList
      .map(f => f.replace('metadata/files/', '').replace('.json', ''))
      .sort((a, b) => parseInt(b) - parseInt(a));
    
    for (const fileId of fileIds.slice(0, 5)) {
      const fileDoc = await loadJSON(bucket, `metadata/files/${fileId}.json`);
      if (fileDoc && fileDoc.status === 'completed') {
        const properties = await loadJSON(bucket, `data/properties/${fileId}.json`) || [];
        
        // Find and update the property
        const propertyIndex = properties.findIndex(p => p.id === propertyId);
        if (propertyIndex !== -1) {
          const property = properties[propertyIndex];
          
          // Update outcome
          property.lastOutcome = outcome;
          property.lastOutcomeDate = new Date().toISOString();
          property.attempts = (property.attempts || 0) + 1;
          
          // Create next action if specified
          if (nextAction) {
            property.actionType = nextAction;
            // Set due time to tomorrow by default, or adjust based on outcome
            const tomorrow = new Date();
            tomorrow.setDate(tomorrow.getDate() + 1);
            tomorrow.setHours(9, 0, 0, 0); // 9 AM tomorrow
            property.dueTime = tomorrow.toISOString();
          } else {
            // Clear action if no next action (e.g., not interested)
            property.actionType = undefined;
            property.dueTime = undefined;
          }
          
          // Save updated properties
          await saveJSON(bucket, `data/properties/${fileId}.json`, properties);
          
          console.log(`[TASK-DONE] Updated property ${propertyId} in file ${fileId}`);
          return res.json({ success: true, propertyId, outcome, nextAction });
        }
      }
    }
    
    res.status(404).json({ error: 'Property not found' });
  } catch (error) {
    console.error('[TASK-DONE] Error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get all properties with follow-up dates (tasks)
 */
app.get('/api/tasks', async (req, res) => {
  try {
    console.log('[TASKS] Starting tasks request');
    const bucket = storage.bucket(BUCKET_NAME);
    
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Request timeout after 10s')), 10000)
    );

    const tasksPromise = (async () => {
      const fileList = await listFiles(bucket, 'metadata/files/');
      const completedFiles = (await Promise.all(
        fileList.map(f => loadJSON(bucket, f))
      )).filter(f => f && f.status === 'completed')
        .sort((a, b) => new Date(b.processedAt).getTime() - new Date(a.processedAt).getTime());

      if (completedFiles.length === 0) {
        return [];
      }

      const latestFile = completedFiles[0];
      const allProperties = await loadJSON(bucket, `data/properties/${latestFile.id}.json`) || [];
      
      // Filter properties that have an action (dueTime or actionType)
      // Also include properties with lastFollowUp for backward compatibility
      const tasks = allProperties.filter(p => 
        (p.dueTime && p.dueTime.trim() !== '') || 
        (p.actionType) ||
        (p.lastFollowUp && p.lastFollowUp.trim() !== '')
      );
      
      console.log(`[TASKS] Returning ${tasks.length} tasks from ${allProperties.length} total properties`);
      return tasks;
    })();

    const result = await Promise.race([tasksPromise, timeoutPromise]);
    res.json(result);
  } catch (error) {
    console.error('[TASKS] Error:', error.message);
    if (error.message.includes('timeout')) {
      res.status(504).json({ error: 'Request timeout - try again' });
    } else {
      res.status(500).json({ error: error.message });
    }
  }
});

/**
 * Get dashboard stats
 */
app.get('/api/dashboard', async (req, res) => {
  try {
    console.log('[DASHBOARD] Starting dashboard request');
    const bucket = storage.bucket(BUCKET_NAME);

    // Add timeout
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Request timeout after 10s')), 10000)
    );

    const dashboardPromise = (async () => {
      const fileList = await listFiles(bucket, 'metadata/files/');
      console.log(`[DASHBOARD] Found ${fileList.length} files`);

      // Only check recent 20 files for completed status
      const recentFiles = fileList
        .sort((a, b) => {
          const aId = a.replace('metadata/files/', '').replace('.json', '');
          const bId = b.replace('metadata/files/', '').replace('.json', '');
          return parseInt(bId) - parseInt(aId);
        })
        .slice(0, 20);

      const files = await Promise.all(
        recentFiles.map(async (filePath) => {
          try {
            return await loadJSON(bucket, filePath);
          } catch (err) {
            console.error(`[DASHBOARD] Error loading ${filePath}:`, err.message);
            return null;
          }
        })
      );

      const completedFiles = files
        .filter(f => f && f.status === 'completed')
        .sort((a, b) => new Date(b.processedAt) - new Date(a.processedAt));

      if (completedFiles.length === 0) {
        console.log('[DASHBOARD] No completed files found');
        return {
          totalProperties: 0,
          byStatus: { judgment: 0, active: 0, pending: 0 },
          totalAmountDue: 0,
          avgAmountDue: 0,
          newThisMonth: 0,
          removedThisMonth: 0,
          deadLeads: 0,
        };
      }

      const latestFile = completedFiles[0];
      console.log(`[DASHBOARD] Loading properties for file: ${latestFile.id}`);
      const properties = await loadJSON(bucket, `data/properties/${latestFile.id}.json`) || [];
      console.log(`[DASHBOARD] Loaded ${properties.length} properties`);

      const byStatus = {
        judgment: properties.filter(p => p.status === 'J').length,
        active: properties.filter(p => p.status === 'A').length,
        pending: properties.filter(p => p.status === 'P').length,
      };

      const totalAmountDue = properties.reduce((sum, p) => sum + (p.totalAmountDue || 0), 0);
      const avgAmountDue = properties.length > 0 ? totalAmountDue / properties.length : 0;

      // Get latest comparison
      const comparisonList = await listFiles(bucket, 'data/comparisons/');
      let newThisMonth = 0;
      let removedThisMonth = 0;

      if (comparisonList.length > 0) {
        const latestComparisonId = comparisonList
          .map(f => f.replace('data/comparisons/', '').replace('.json', ''))
          .sort((a, b) => parseInt(b) - parseInt(a))[0];
        const latestComparison = await loadJSON(bucket, `data/comparisons/${latestComparisonId}.json`);
        if (latestComparison) {
          newThisMonth = latestComparison.summary?.newProperties || 0;
          removedThisMonth = latestComparison.summary?.removedProperties || 0;
        }
      }

      console.log('[DASHBOARD] Returning dashboard stats');
      return {
        totalProperties: properties.length,
        byStatus,
        totalAmountDue,
        avgAmountDue,
        newThisMonth,
        removedThisMonth,
        deadLeads: removedThisMonth,
      };
    })();

    const stats = await Promise.race([dashboardPromise, timeoutPromise]);
    res.json(stats);
  } catch (error) {
    console.error('[DASHBOARD] Error:', error.message);
    if (error.message.includes('timeout')) {
      res.status(504).json({ error: 'Request timeout - try again' });
    } else {
      res.status(500).json({ error: error.message });
    }
  }
});

/**
 * Test GCS connection and credentials
 */
app.get('/api/debug/test-connection', async (req, res) => {
  try {
    const results = {
      timestamp: new Date().toISOString(),
      bucket: BUCKET_NAME,
      credentials: {
        hasKeyFile: !!process.env.GOOGLE_APPLICATION_CREDENTIALS,
        keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS || 'Using ADC',
        keyFileExists: process.env.GOOGLE_APPLICATION_CREDENTIALS 
          ? fs.existsSync(process.env.GOOGLE_APPLICATION_CREDENTIALS)
          : false,
        projectId: process.env.GCP_PROJECT_ID || 'Not set',
      },
      bucketAccess: null,
      error: null,
    };

    try {
      const bucket = storage.bucket(BUCKET_NAME);
      const [exists] = await bucket.exists();
      
      if (exists) {
        // Try to list files to verify write permissions
        const [files] = await bucket.getFiles({ maxResults: 1 });
        results.bucketAccess = {
          exists: true,
          accessible: true,
          canList: true,
          fileCount: files.length,
        };
      } else {
        results.bucketAccess = {
          exists: false,
          accessible: false,
          canList: false,
          error: 'Bucket does not exist',
        };
      }
    } catch (error) {
      results.bucketAccess = {
        exists: false,
        accessible: false,
        canList: false,
        error: error.message,
      };
      results.error = error.message;
    }

    res.json(results);
  } catch (error) {
    console.error('Connection test error:', error);
    res.status(500).json({ 
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    });
  }
});

/**
 * Debug endpoint to check column extraction from last processed file
 */
app.get('/api/debug/columns', async (req, res) => {
  try {
    if (!storage) {
      return res.status(500).json({ error: 'Storage not initialized' });
    }
    
    const bucket = storage.bucket(BUCKET_NAME);
    
    // Get the most recent file
    const fileList = await listFiles(bucket, 'metadata/files/');
    if (fileList.length === 0) {
      return res.json({ message: 'No files found' });
    }
    
    const fileIds = fileList
      .map(f => f.replace('metadata/files/', '').replace('.json', ''))
      .sort((a, b) => parseInt(b) - parseInt(a));
    
    const latestFileId = fileIds[0];
    const fileDoc = await loadJSON(bucket, `metadata/files/${latestFileId}.json`);
    
    if (!fileDoc) {
      return res.json({ message: 'File metadata not found' });
    }
    
    // Try to get properties to see what was extracted
    const properties = await loadJSON(bucket, `data/properties/${latestFileId}.json`);
    
    return res.json({
      file: {
        id: fileDoc.id,
        filename: fileDoc.filename,
        status: fileDoc.status,
        propertyCount: fileDoc.propertyCount,
      },
      sampleProperty: properties && properties.length > 0 ? properties[0] : null,
      message: 'Check Railway logs for [EXTRACT] messages to see column mapping details',
    });
  } catch (error) {
    console.error('[DEBUG] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Debug endpoint to verify uploads and storage
 */
app.get('/api/debug/verify', async (req, res) => {
  try {
    const bucket = storage.bucket(BUCKET_NAME);
    
    // List all metadata files
    const metadataFiles = await listFiles(bucket, 'metadata/files/');
    
    // List all uploaded files
    const uploadedFiles = await listFiles(bucket, 'uploads/');
    
    // Get details for each metadata file
    const fileDetails = await Promise.all(
      metadataFiles.map(async (filePath) => {
        const fileData = await loadJSON(bucket, filePath);
        if (fileData) {
          // Check if the actual file exists
          const actualFile = bucket.file(fileData.storagePath);
          const [exists] = await actualFile.exists();
          const [metadata] = exists ? await actualFile.getMetadata() : [null];
          
          return {
            ...fileData,
            fileExists: exists,
            fileSize: metadata?.size || 0,
            fileCreated: metadata?.timeCreated || null,
          };
        }
        return null;
      })
    );

    res.json({
      bucket: BUCKET_NAME,
      metadataFilesCount: metadataFiles.length,
      uploadedFilesCount: uploadedFiles.length,
      files: fileDetails.filter(f => f !== null),
      summary: {
        total: fileDetails.filter(f => f !== null).length,
        completed: fileDetails.filter(f => f?.status === 'completed').length,
        processing: fileDetails.filter(f => f?.status === 'processing').length,
        error: fileDetails.filter(f => f?.status === 'error').length,
        missingFiles: fileDetails.filter(f => f && !f.fileExists).length,
      },
    });
  } catch (error) {
    console.error('Debug verify error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Export Express app for Google Cloud Functions/Cloud Run
module.exports = app;
