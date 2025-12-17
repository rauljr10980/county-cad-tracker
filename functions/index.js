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
    timestamp: new Date().toISOString(),
    storage: storage ? 'initialized' : 'not initialized'
  });
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

      // Use row 3 as headers (header: 2 means 0-indexed row 2, which is row 3 in Excel)
      // This automatically skips rows 1-2 and uses row 3 as headers
      // Data rows start from row 4 (0-indexed row 3)
      data = XLSX.utils.sheet_to_json(worksheet, {
        raw: false,
        header: 2, // Use row 3 (0-indexed row 2) as headers
        defval: '', // Default value for empty cells
        blankrows: false, // Skip blank rows to save memory
      });

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

    let previousProperties = [];
    let previousFileId = null;
    
    if (fileIds.length > 0) {
      previousFileId = fileIds[0];
      const prevData = await loadJSON(bucket, `data/properties/${previousFileId}.json`);
      if (prevData) {
        previousProperties = prevData;
      }
    }

    // Generate comparison if previous file exists
    if (previousProperties.length > 0) {
      await updateProgress(fileId, 'comparing', `Comparing with previous file (${previousProperties.length} properties)...`, 90);
      const prevFileDoc = await loadJSON(bucket, `metadata/files/${previousFileId}.json`);
      const comparison = generateComparison(
        properties, 
        previousProperties, 
        filename, 
        prevFileDoc?.filename || previousFileId
      );
      
      await saveJSON(bucket, `data/comparisons/${fileId}.json`, {
        ...comparison,
        currentFileId: fileId,
        previousFileId,
        generatedAt: new Date().toISOString(),
      });
      await updateProgress(fileId, 'comparing', 'Comparison generated successfully', 95);
    } else {
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
    status: ['legalstatus', 'status', 'st'],
    totalAmountDue: ['total', 'amount due', 'amount_due', 'due', 'balance'],
    totalPercentage: ['percentage', 'percent', 'pct', '%'],
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

  // Log all available columns and their sample values from first row
  if (data.length > 0) {
    console.log(`[EXTRACT] First row sample data:`, JSON.stringify(data[0], null, 2));
    console.log(`[EXTRACT] All column names (exact):`, headers);
    console.log(`[EXTRACT] Column map after matching:`, columnMap);
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
    
    // Log first few rows for debugging
    if (index < 3) {
      console.log(`[EXTRACT] Row ${index} raw keys:`, Object.keys(row));
      console.log(`[EXTRACT] Row ${index} extracted:`, {
        accountNumber,
        propertyAddress,
        status,
        totalAmountDue,
        rawRow: Object.keys(row).slice(0, 10).map(k => `${k}: ${row[k]}`).join(', ')
      });
    }

    // Use first non-empty column value as accountNumber if CAN not found
    let finalAccountNumber = accountNumber;
    if (!finalAccountNumber || finalAccountNumber === '') {
      // Try to use first column that has data
      const firstCol = headers[0];
      if (firstCol && row[firstCol]) {
        finalAccountNumber = row[firstCol].toString().trim();
        console.log(`[EXTRACT] Using first column "${firstCol}" as accountNumber: ${finalAccountNumber}`);
      }
    }

    return {
      id: `${Date.now()}_${index}`,
      accountNumber: finalAccountNumber || `ROW_${index}`,
      ownerName: getValue('ownerName') || '',
      propertyAddress: propertyAddress || '',
      mailingAddress: getValue('mailingAddress') || '',
      status: status ? status.charAt(0).toUpperCase() : 'A',
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
      return res.status(404).json({ error: 'No comparisons found' });
    }

    // Get the most recent comparison (by filename timestamp)
    const fileIds = fileList
      .map(f => f.replace('data/comparisons/', '').replace('.json', ''))
      .sort((a, b) => parseInt(b) - parseInt(a));

    const comparison = await loadJSON(bucket, `data/comparisons/${fileIds[0]}.json`);
    res.json(comparison);
  } catch (error) {
    console.error('Get latest comparison error:', error);
    res.status(500).json({ error: error.message });
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
