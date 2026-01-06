// Version 2.9.3 - Fix comparison display: cache-first loading, improved error handling
const CODE_VERSION = '2.9.3';

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

// Simple JWT implementation (for production, use a proper library like jsonwebtoken)
// For now, we'll use a simple token-based system
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const BUCKET_NAME = process.env.GCS_BUCKET || 'county-cad-tracker-files';

// User storage (in production, use a database)
// Format: { username: { id, username, password, email, verified, createdAt } }
let USERS = {
  // Default user - in production, store in database with hashed passwords
  admin: {
    id: '1',
    username: 'admin',
    password: 'admin', // In production, use bcrypt to hash passwords
    email: 'admin@example.com',
    verified: true,
    createdAt: new Date().toISOString()
  }
};

// Verification tokens storage: { token: { email, username, expiresAt } }
const VERIFICATION_TOKENS = {};

// Load users from storage if available (for persistence)
async function loadUsers() {
  try {
    if (storage) {
      const bucket = storage.bucket(BUCKET_NAME);
      const usersData = await loadJSON(bucket, 'data/users.json');
      if (usersData) {
        USERS = { ...USERS, ...usersData };
        console.log('[AUTH] Loaded users from storage');
      }
    }
  } catch (error) {
    console.log('[AUTH] No existing users file, starting fresh');
  }
}

// Save users to storage
async function saveUsers() {
  try {
    if (storage) {
      const bucket = storage.bucket(BUCKET_NAME);
      await saveJSON(bucket, 'data/users.json', USERS);
      console.log('[AUTH] Saved users to storage');
    }
  } catch (error) {
    console.error('[AUTH] Failed to save users:', error);
  }
}

// Initialize users on startup (after storage is ready)
setTimeout(() => {
  loadUsers().catch(error => {
    console.error('[AUTH] Failed to load users on startup:', error);
  });
}, 1000);

// Simple token generation (in production, use proper JWT library)
function generateToken(user) {
  const payload = {
    id: user.id,
    username: user.username,
    email: user.email,
    exp: Date.now() + (7 * 24 * 60 * 60 * 1000) // 7 days
  };
  // Simple base64 encoding (in production, use proper JWT signing)
  return Buffer.from(JSON.stringify(payload)).toString('base64');
}

function verifyToken(token) {
  try {
    const payload = JSON.parse(Buffer.from(token, 'base64').toString());
    if (payload.exp && payload.exp < Date.now()) {
      return null; // Token expired
    }
    return payload;
  } catch (error) {
    return null;
  }
}

// Authentication middleware
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }

  const payload = verifyToken(token);
  if (!payload) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  req.user = payload;
  next();
}

// Email configuration (using nodemailer)
const nodemailer = require('nodemailer');

// Create email transporter
// For production, configure with real SMTP credentials
// For development, you can use Gmail, SendGrid, or other services
const emailTransporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: false, // true for 465, false for other ports
  auth: {
    user: process.env.SMTP_USER || process.env.EMAIL_USER,
    pass: process.env.SMTP_PASS || process.env.EMAIL_PASSWORD,
  },
});

// Generate verification token
function generateVerificationToken() {
  return Buffer.from(Date.now().toString() + Math.random().toString()).toString('base64').replace(/[^a-zA-Z0-9]/g, '');
}

// Send verification email
async function sendVerificationEmail(email, username, token) {
  const verificationUrl = `${process.env.FRONTEND_URL || 'http://localhost:8080'}/verify-email?token=${token}`;
  
  const mailOptions = {
    from: process.env.EMAIL_FROM || 'noreply@county-cad-tracker.com',
    to: email,
    subject: 'Verify your email address',
    html: `
      <h2>Welcome to County CAD Tracker!</h2>
      <p>Hi ${username},</p>
      <p>Thank you for signing up. Please verify your email address by clicking the link below:</p>
      <p><a href="${verificationUrl}" style="background-color: #4CAF50; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">Verify Email</a></p>
      <p>Or copy and paste this link into your browser:</p>
      <p>${verificationUrl}</p>
      <p>This link will expire in 24 hours.</p>
      <p>If you didn't create an account, please ignore this email.</p>
    `,
  };

  try {
    // If no email credentials are configured, log the verification link instead
    if (!process.env.SMTP_USER && !process.env.EMAIL_USER) {
      console.log('[AUTH] Email not configured. Verification link:', verificationUrl);
      return { success: true, verificationUrl };
    }
    
    await emailTransporter.sendMail(mailOptions);
    console.log('[AUTH] Verification email sent to:', email);
    return { success: true };
  } catch (error) {
    console.error('[AUTH] Failed to send email:', error);
    // Still return success and log the URL for development
    console.log('[AUTH] Verification link (email failed):', verificationUrl);
    return { success: true, verificationUrl };
  }
}

// Registration endpoint
app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, password, email } = req.body;

    if (!username || !password || !email) {
      return res.status(400).json({ error: 'Username, password, and email are required' });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

    // Check if username already exists
    if (USERS[username]) {
      return res.status(400).json({ error: 'Username already exists' });
    }

    // Check if email already exists
    const existingUser = Object.values(USERS).find(u => u.email === email);
    if (existingUser) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    // Create new user (not verified yet)
    const userId = Date.now().toString();
    const newUser = {
      id: userId,
      username,
      password, // In production, hash with bcrypt
      email,
      verified: false,
      createdAt: new Date().toISOString()
    };

    USERS[username] = newUser;
    await saveUsers();

    // Generate verification token
    const verificationToken = generateVerificationToken();
    VERIFICATION_TOKENS[verificationToken] = {
      email,
      username,
      expiresAt: Date.now() + (24 * 60 * 60 * 1000) // 24 hours
    };

    // Send verification email
    const emailResult = await sendVerificationEmail(email, username, verificationToken);

    res.json({
      message: 'Registration successful. Please check your email to verify your account.',
      verificationUrl: emailResult.verificationUrl // Include in response for development
    });
  } catch (error) {
    console.error('[AUTH] Registration error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// Email verification endpoint
app.get('/api/auth/verify-email', async (req, res) => {
  try {
    const { token } = req.query;

    if (!token) {
      return res.status(400).json({ error: 'Verification token is required' });
    }

    const verification = VERIFICATION_TOKENS[token];
    if (!verification) {
      return res.status(400).json({ error: 'Invalid verification token' });
    }

    // Check if token expired
    if (verification.expiresAt < Date.now()) {
      delete VERIFICATION_TOKENS[token];
      return res.status(400).json({ error: 'Verification token has expired' });
    }

    // Find user by email
    const user = Object.values(USERS).find(u => u.email === verification.email);
    if (!user) {
      return res.status(400).json({ error: 'User not found' });
    }

    // Mark user as verified
    user.verified = true;
    USERS[user.username] = user;
    await saveUsers();

    // Clean up verification token
    delete VERIFICATION_TOKENS[token];

    res.json({
      message: 'Email verified successfully. You can now log in.',
      user: {
        id: user.id,
        username: user.username,
        email: user.email
      }
    });
  } catch (error) {
    console.error('[AUTH] Verification error:', error);
    res.status(500).json({ error: 'Verification failed' });
  }
});

// Login endpoint
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    const user = USERS[username];
    if (!user || user.password !== password) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    // Check if email is verified
    if (!user.verified) {
      return res.status(403).json({ 
        error: 'Email not verified. Please check your email and verify your account.' 
      });
    }

    const token = generateToken(user);
    
    res.json({
      user: {
        id: user.id,
        username: user.username,
        email: user.email
      },
      token
    });
  } catch (error) {
    console.error('[AUTH] Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Logout endpoint
app.post('/api/auth/logout', authenticateToken, (req, res) => {
  // In a stateless JWT system, logout is handled client-side
  // But we can log it for audit purposes
  res.json({ message: 'Logged out successfully' });
});

// Session check endpoint
app.get('/api/auth/session', authenticateToken, (req, res) => {
  res.json({
    user: {
      id: req.user.id,
      username: req.user.username,
      email: req.user.email
    }
  });
});

// Debug endpoint to check last processed file's raw data
app.get('/api/debug/sample', async (req, res) => {
  try {
    if (!storage) {
      return res.status(500).json({ error: 'Storage not initialized' });
    }
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
    if (!exists) {
      // Not an error - file just doesn't exist
      return null;
    }
    const [data] = await file.download();
    return JSON.parse(data.toString());
  } catch (error) {
    console.error(`[STORAGE] Error loading JSON from ${path}:`, error.message);
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
    let canHeaderNameForExtract = null; // Will be set for Excel files (column E header name)
    
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
      // Column E is index 4 (A=0, B=1, C=2, D=3, E=4)
      const headerRow = [];
      const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1');
      
      for (let col = range.s.c; col <= range.e.c; col++) {
        const cellAddress = XLSX.utils.encode_cell({ r: 2, c: col }); // Row 3 is 0-indexed row 2
        const cell = worksheet[cellAddress];
        const headerValue = cell ? cell.v.toString().trim() : `__EMPTY_${col}`;
        headerRow.push(headerValue);
        
        // Check if this is column E (index 4) and verify it contains CAN
        if (col === 4) { // Column E is index 4
          const normalizedHeader = headerValue.toUpperCase().replace(/[^A-Z0-9]/g, '');
          if (normalizedHeader === 'CAN') {
            console.log(`[PROCESS] ✓ Found CAN in column E (index ${col}): "${headerValue}"`);
          } else {
            console.log(`[PROCESS] ⚠ WARNING: Column E (index ${col}) contains "${headerValue}", expected "CAN"`);
          }
        }
      }
      console.log(`[PROCESS] EXPLICIT Row 3 headers:`, headerRow.slice(0, 15).join(', '));
      console.log(`[PROCESS] Looking for: CAN at E3 (index 4), ADDRSTRING at H3, LEGALSTATUS at AE3`);
      
      // Step 2: Convert to JSON starting from Row 4 (0-indexed row 3), using explicit headers
      data = XLSX.utils.sheet_to_json(worksheet, {
        raw: false,
        header: headerRow, // Use our explicit header row
        range: 3, // Start reading data from row 4 (0-indexed row 3)
        defval: '', // Default value for empty cells
        blankrows: false, // Skip blank rows to save memory
      });
      
      // Get the header name from column E (index 4) - this is what we'll use to extract CAN
      // This ensures we ONLY use CAN from column E, not from any other column
      const CAN_COLUMN_INDEX = 4; // Column E
      const canHeaderName = headerRow[CAN_COLUMN_INDEX] || '';
      console.log(`[PROCESS] CAN column (E, index ${CAN_COLUMN_INDEX}) header: "${canHeaderName}"`);
      
      // Log what we got
      if (data.length > 0) {
        const actualHeaders = Object.keys(data[0]);
        console.log(`[PROCESS] Data row keys:`, actualHeaders.slice(0, 15).join(', '));
        
        // Verify critical columns exist
        const hasCAN = actualHeaders.some(h => h.toUpperCase() === 'CAN');
        const hasAddr = actualHeaders.some(h => h.toUpperCase() === 'ADDRSTRING');
        const hasStatus = actualHeaders.some(h => h.toUpperCase() === 'LEGALSTATUS');
        console.log(`[PROCESS] Column check: CAN=${hasCAN}, ADDRSTRING=${hasAddr}, LEGALSTATUS=${hasStatus}`);
        
        // Log sample values for debugging - use the canHeaderName we extracted
        const sample = data[0];
        const canValue = canHeaderName ? (sample[canHeaderName] || '') : '';
        console.log(`[PROCESS] Sample row - CAN (from column E): ${canValue}, LEGALSTATUS: ${sample['LEGALSTATUS']}, ADDRSTRING: ${(sample['ADDRSTRING'] || '').substring(0, 50)}...`);
      }

      const headers = Object.keys(data[0] || {});
      console.log(`[PROCESS] Using row 3 as headers. Found ${headers.length} columns, ${data.length} data rows`);
      console.log(`[PROCESS] Column headers found:`, headers.slice(0, 10).join(', '), headers.length > 10 ? '...' : '');
      await updateProgress(fileId, 'parsing', `Found ${data.length} data rows, ${headers.length} columns`, 40);

      // Warn if file is very large (memory concerns)
      if (data.length > 50000) {
        console.log(`[PROCESS] WARNING: Large file with ${data.length} rows. Processing may be slow or fail due to memory constraints.`);
      }
      
      // Store canHeaderName for use in extractProperties
      canHeaderNameForExtract = canHeaderName;
    }

    console.log(`[PROCESS] Parsed ${data.length} rows from file`);

    // Extract properties
    await updateProgress(fileId, 'extracting', `Extracting properties from ${data.length} rows...`, 50);
    // Use the canHeaderName we extracted from headerRow (column E, index 4)
    if (!canHeaderNameForExtract && data.length > 0) {
      // Fallback if canHeaderName wasn't set (shouldn't happen for Excel files)
      // Try to get it from the data object keys (but this is not reliable due to object key order)
      const headers = Object.keys(data[0]);
      if (headers.length > 4) {
        canHeaderNameForExtract = headers[4];
        console.log(`[PROCESS] WARNING: Using fallback method to get CAN header name: "${canHeaderNameForExtract}"`);
      }
    }
    if (canHeaderNameForExtract) {
      console.log(`[PROCESS] Using CAN header name from column E: "${canHeaderNameForExtract}"`);
    } else {
      console.log(`[PROCESS] WARNING: No CAN header name found for column E`);
    }
    const properties = extractProperties(data, canHeaderNameForExtract);
    console.log(`[PROCESS] Extracted ${properties.length} properties from ${data.length} data rows`);
    
    // Warn if no properties were extracted
    if (properties.length === 0) {
      console.error(`[PROCESS] WARNING: No properties extracted from file!`);
      console.error(`[PROCESS] Data rows parsed: ${data.length}`);
      if (data.length > 0) {
        console.error(`[PROCESS] Sample data row keys:`, Object.keys(data[0] || {}).slice(0, 10).join(', '));
        console.error(`[PROCESS] Sample data row (first 5 columns):`, 
          Object.keys(data[0] || {}).slice(0, 5).reduce((acc, key) => {
            acc[key] = data[0][key];
            return acc;
          }, {})
        );
      }
      // Still mark as completed but with a warning message
      const fileDoc = {
        id: fileId,
        filename,
        uploadedAt: (await loadJSON(bucket, `metadata/files/${fileId}.json`))?.uploadedAt || new Date().toISOString(),
        status: 'completed',
        processedAt: new Date().toISOString(),
        propertyCount: 0,
        storagePath,
        processingStep: 'completed',
        processingMessage: `WARNING: No properties extracted. File parsed ${data.length} rows but no valid properties found. Check column headers (CAN, ADDRSTRING, LEGALSTATUS).`,
        processingProgress: 100,
      };
      await saveJSON(bucket, `metadata/files/${fileId}.json`, fileDoc);
      console.log(`[PROCESS] File marked as completed with 0 properties and warning message`);
      return; // Exit early since there's nothing to save or compare
    }
    
    // Verify data transfer - check if NEW- columns were extracted
    if (properties.length > 0) {
      const sampleProp = properties[0];
      const newFieldsExtracted = Object.keys(sampleProp).filter(key => 
        ['marketValue', 'landValue', 'improvementValue', 'cappedValue', 'agriculturalValue',
         'legalDescription', 'lastPaymentDate', 'lastPayer', 'delinquentAfter', 'taxYear',
         'link', 'ownerAddress', 'exemptions', 'jurisdictions', 'lastPaymentAmount',
         'halfPaymentOptionAmount', 'priorYearsAmountDue', 'yearAmountDue', 'yearTaxLevy'].includes(key)
      );
      console.log(`[PROCESS] Data transfer verification: Sample property has ${newFieldsExtracted.length} NEW- fields extracted`);
      const fieldsWithData = newFieldsExtracted.filter(key => {
        const val = sampleProp[key];
        return val !== undefined && val !== null && val !== '';
      });
      console.log(`[PROCESS] Data transfer verification: ${fieldsWithData.length} NEW- fields have actual data`);
    }
    
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
      
      // Verify the comparison was saved
      const savedComparison = await loadJSON(bucket, `data/comparisons/${fileId}.json`);
      if (savedComparison) {
        console.log(`[PROCESS] Comparison verified - saved successfully with ${savedComparison.summary?.statusChanges || 0} status changes`);
      } else {
        console.error(`[PROCESS] WARNING: Comparison was not saved properly!`);
      }
      
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
 * @param {Array} data - Array of row objects from Excel
 * @param {string} canHeaderName - The header name from column E (for CAN extraction)
 */
function extractProperties(data, canHeaderName = null) {
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
    
    // Log NEW- columns found
    const newColumns = headers.filter(h => h && h.toUpperCase().startsWith('NEW-'));
    console.log(`[EXTRACT] NEW- columns found (${newColumns.length}):`, newColumns.join(', '));
    
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
    
    // Extract CAN ONLY from column E - this is the unique identifier for matching
    // Use the header name passed from column E (index 4)
    let finalAccountNumber = '';
    
    if (canHeaderName && row[canHeaderName] !== undefined) {
      // Extract CAN value directly from column E using the header name
      finalAccountNumber = (row[canHeaderName] || '').toString().trim();
      
      if (index === 0) {
        console.log(`[EXTRACT] CAN from column E (header: "${canHeaderName}"): "${finalAccountNumber}"`);
      }
    } else {
      // Fallback: try to get value from column E by index if header name not available
      // Get headers in order and access index 4 (column E)
      const headerArray = Object.keys(row);
      if (headerArray.length > 4) {
        const columnEHeader = headerArray[4]; // Column E is index 4
        finalAccountNumber = (row[columnEHeader] || '').toString().trim();
        if (index === 0) {
          console.log(`[EXTRACT] CAN from column E (index 4, header: "${columnEHeader}"): "${finalAccountNumber}"`);
        }
      }
    }
    
    // If still no CAN found, log warning
    if (!finalAccountNumber && index === 0) {
      console.log(`[EXTRACT] ⚠ WARNING: No CAN value found in column E`);
      console.log(`[EXTRACT] Column E header name: "${canHeaderName || 'NOT PROVIDED'}"`);
      console.log(`[EXTRACT] Available headers:`, headers.slice(0, 10).join(', '));
    }
    
    // Use accountNumber from mapping as fallback only if column E is empty
    // But don't use ROW_${index} fallback - if CAN from column E is empty, leave it empty
    // This ensures we only match by CAN from column E
    if (!finalAccountNumber) {
      finalAccountNumber = accountNumber || '';
      // Don't use ROW_${index} fallback - we want to match by CAN only
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
    
    // Determine final status: P, A, J, or U (unknown)
    // finalStatus comes ONLY from LEGALSTATUS column
    let statusValue = 'U'; // Default to Unknown
    if (finalStatus) {
      const firstChar = finalStatus.charAt(0).toUpperCase();
      // Only accept P, A, or J - anything else is unknown (U)
      if (firstChar === 'P' || firstChar === 'A' || firstChar === 'J') {
        statusValue = firstChar;
      } else {
        // Log if we get unexpected status values (for debugging)
        if (index === 0 || Math.random() < 0.001) {
          console.log(`[EXTRACT] LEGALSTATUS value "${finalStatus}" converted to Unknown (U), first char: "${firstChar}"`);
        }
      }
    }
    
    // Helper to get NEW- column values
    const getNewColumn = (fieldName) => {
      // Try exact match first (e.g., "NEW-Account Number")
      const exactMatch = row[`NEW-${fieldName}`];
      if (exactMatch !== undefined && exactMatch !== null && exactMatch !== '') {
        return exactMatch;
      }
      // Try case-insensitive search with exact match
      for (const header of headers) {
        if (header) {
          const headerUpper = header.toUpperCase().trim();
          const targetUpper = `NEW-${fieldName.toUpperCase()}`.trim();
          // Exact match (case-insensitive)
          if (headerUpper === targetUpper) {
            const value = row[header];
            if (value !== undefined && value !== null && value !== '') {
              return value;
            }
          }
          // Also try partial match (handles spaces, special chars)
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

    // Parse numeric values from NEW- columns
    const parseNumeric = (value) => {
      if (value === null || value === undefined || value === '') return null;
      const num = parseFloat(String(value).replace(/[$,]/g, ''));
      return isNaN(num) ? null : num;
    };

    // Get all NEW- column values (for debugging and to ensure we capture everything)
    const newColumnValues = {};
    if (index === 0) {
      // Log available NEW- columns for first row only
      const availableNewColumns = headers.filter(h => h && h.toUpperCase().startsWith('NEW-'));
      console.log(`[EXTRACT] Available NEW- columns:`, availableNewColumns);
      availableNewColumns.forEach(col => {
        const val = row[col];
        if (val !== undefined && val !== null && val !== '') {
          console.log(`[EXTRACT]   ${col} = ${String(val).substring(0, 50)}`);
        }
      });
    }

    // Helper to safely get NEW- column value with multiple fallback strategies
    const getNewColumnValue = (fieldName) => {
      // Strategy 1: Use getNewColumn function (handles case variations)
      let value = getNewColumn(fieldName);
      if (value !== null && value !== undefined && value !== '') {
        return value;
      }
      
      // Strategy 2: Direct row access with exact column name
      value = row[`NEW-${fieldName}`];
      if (value !== undefined && value !== null && value !== '') {
        return value;
      }
      
      // Strategy 3: Search all headers for case-insensitive match
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

    // Build property object with all NEW- columns - ensure data transfer
    // Use accountNumber as the ID since that's the unique identifier in the database
    // Only use CAN from column E - don't create fallback IDs
    // If CAN is empty, use empty string (will be filtered out if no address either)
    const accountNum = finalAccountNumber || accountNumber || '';
    const property = {
      id: accountNum || `TEMP_${index}`, // Use accountNumber as ID, or temp ID if missing (for matching)
      accountNumber: accountNum, // CAN from column E only - empty if not found
      ownerName: getValue('ownerName') || getNewColumnValue('Owner Name') || '',
      propertyAddress: finalPropertyAddress || propertyAddress || getNewColumnValue('Property Site Address') || '',
      mailingAddress: getValue('mailingAddress') || getNewColumnValue('Owner Address') || '',
      status: statusValue || 'U', // U = Unknown (blank LEGALSTATUS)
      totalAmountDue: parseNumeric(getNewColumnValue('Total')) || parseNumeric(getNewColumnValue('Total Amount Due')) || parseFloat(totalAmountDue || '0') || 0,
      totalPercentage: parseFloat(getValue('totalPercentage') || '0') || 0,
      // NEW- columns - ensure all are included for data transfer
      legalDescription: getNewColumnValue('Legal Description') || '',
      marketValue: parseNumeric(getNewColumnValue('Total Market Value')),
      landValue: parseNumeric(getNewColumnValue('Land Value')),
      improvementValue: parseNumeric(getNewColumnValue('Improvement Value')),
      cappedValue: parseNumeric(getNewColumnValue('Capped Value')),
      agriculturalValue: parseNumeric(getNewColumnValue('Agricultural Value')),
      exemptions: (() => {
        const val = getNewColumnValue('Exemptions');
        return val ? String(val).split(',').map(e => e.trim()).filter(e => e) : undefined;
      })(),
      jurisdictions: (() => {
        const val = getNewColumnValue('Jurisdictions');
        return val ? String(val).split(',').map(j => j.trim()).filter(j => j) : undefined;
      })(),
      lastPaymentDate: getNewColumnValue('Last Payment Date') || undefined,
      lastPaymentAmount: parseNumeric(getNewColumnValue('Last Payment Amount Received')),
      lastPayer: getNewColumnValue('Last Payer') || undefined,
      delinquentAfter: getNewColumnValue('Delinquent After') || undefined,
      halfPaymentOptionAmount: parseNumeric(getNewColumnValue('Half Payment Option Amount')),
      priorYearsAmountDue: parseNumeric(getNewColumnValue('Prior Years Amount Due')),
      taxYear: getNewColumnValue('Tax Year') || undefined,
      yearAmountDue: parseNumeric(getNewColumnValue('Year Amount Due')),
      yearTaxLevy: parseNumeric(getNewColumnValue('Year Tax Levy')),
      link: getNewColumnValue('Link') || undefined,
      ownerAddress: getNewColumnValue('Owner Address') || undefined,
    };

    // Log first property to verify data transfer
    if (index === 0) {
      const newFieldsWithData = Object.keys(property).filter(key => {
        const value = property[key];
        return ['marketValue', 'landValue', 'improvementValue', 'cappedValue', 'agriculturalValue',
                'legalDescription', 'lastPaymentDate', 'lastPayer', 'delinquentAfter', 'taxYear',
                'link', 'ownerAddress', 'exemptions', 'jurisdictions', 'lastPaymentAmount',
                'halfPaymentOptionAmount', 'priorYearsAmountDue', 'yearAmountDue', 'yearTaxLevy'].includes(key)
               && value !== undefined && value !== null && value !== '';
      });
      console.log(`[EXTRACT] First property has ${newFieldsWithData.length} NEW- fields with data:`, newFieldsWithData);
    }

    return property;
  }).filter(p => {
    // Process ALL rows - only filter out rows that are completely empty
    // Check if row has ANY data at all (any field with a value)
    const hasAccountNumber = p.accountNumber && p.accountNumber.trim() !== '';
    const hasPropertyAddress = p.propertyAddress && p.propertyAddress.trim() !== '';
    const hasOwnerName = p.ownerName && p.ownerName.trim() !== '';
    const hasMailingAddress = p.mailingAddress && p.mailingAddress.trim() !== '';
    const hasStatus = p.status && p.status.trim() !== ''; // Any status value (P, A, J, U, or empty)
    const hasTotalAmountDue = p.totalAmountDue !== undefined && p.totalAmountDue !== null && p.totalAmountDue !== 0;
    const hasMarketValue = p.marketValue !== undefined && p.marketValue !== null;
    const hasLandValue = p.landValue !== undefined && p.landValue !== null;
    const hasLegalDescription = p.legalDescription && p.legalDescription.trim() !== '';
    
    // Include row if it has ANY data field populated
    const hasData = hasAccountNumber || hasPropertyAddress || hasOwnerName || hasMailingAddress || 
                    hasStatus || hasTotalAmountDue || hasMarketValue || hasLandValue || hasLegalDescription;
    
    if (!hasData) {
      // Only log occasionally to avoid spam
      if (Math.random() < 0.01) {
        console.log(`[EXTRACT] Filtering out completely empty row ${p.id || 'unknown'}:`, {
          accountNumber: p.accountNumber,
          propertyAddress: p.propertyAddress,
          ownerName: p.ownerName,
          status: p.status,
          totalAmountDue: p.totalAmountDue
        });
      }
    }
    return hasData;
  });
  
  console.log(`[EXTRACT] Extracted ${properties.length} properties (filtered from ${data.length} rows)`);
  
  // Check for duplicate CAN values (accountNumbers)
  const canCounts = {};
  const duplicateCANs = [];
  properties.forEach(p => {
    if (p.accountNumber && p.accountNumber.trim() !== '') {
      const can = p.accountNumber.trim();
      if (!canCounts[can]) {
        canCounts[can] = 0;
      }
      canCounts[can]++;
      if (canCounts[can] === 2) {
        duplicateCANs.push(can);
      }
    }
  });
  const uniqueCANs = Object.keys(canCounts).length;
  const propertiesWithCAN = properties.filter(p => p.accountNumber && p.accountNumber.trim() !== '').length;
  const propertiesWithoutCAN = properties.length - propertiesWithCAN;
  
  console.log(`[EXTRACT] CAN analysis: ${uniqueCANs} unique CANs, ${propertiesWithCAN} properties with CAN, ${propertiesWithoutCAN} without CAN`);
  if (duplicateCANs.length > 0) {
    console.log(`[EXTRACT] WARNING: Found ${duplicateCANs.length} duplicate CAN values (first 10):`, duplicateCANs.slice(0, 10));
  }
  
  // Log status breakdown - track P, A, J, and U (Unknown)
  const statusCounts = { J: 0, A: 0, P: 0, U: 0, other: 0 };
  properties.forEach(p => {
    if (p.status === 'J') statusCounts.J++;
    else if (p.status === 'A') statusCounts.A++;
    else if (p.status === 'P') statusCounts.P++;
    else if (p.status === 'U' || !p.status) statusCounts.U++;
    else statusCounts.other++;
  });
  console.log(`[EXTRACT] Status breakdown: P=${statusCounts.P}, A=${statusCounts.A}, J=${statusCounts.J}, U=${statusCounts.U}, other=${statusCounts.other}`);
  console.log(`[EXTRACT] Total properties with P/A/J status: ${statusCounts.P + statusCounts.A + statusCounts.J}`);
  
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
  // Filter out properties without accountNumber to prevent Map key issues
  const validCurrentProps = (currentProps || []).filter(p => p && p.accountNumber != null);
  const validPreviousProps = (previousProps || []).filter(p => p && p.accountNumber != null);
  
  const currentMap = new Map(validCurrentProps.map(p => [p.accountNumber, p]));
  const previousMap = new Map(validPreviousProps.map(p => [p.accountNumber, p]));

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
      totalCurrent: validCurrentProps.length,
      totalPrevious: validPreviousProps.length,
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
 * Reprocess an existing file with current parsing logic
 */
app.post('/api/files/:fileId/reprocess', async (req, res) => {
  try {
    const { fileId } = req.params;
    console.log(`[REPROCESS] Starting reprocess for file: ${fileId}`);

    if (!storage) {
      console.error('[REPROCESS] ERROR: Storage not initialized');
      return res.status(500).json({ error: 'Storage not initialized. Check environment variables.' });
    }

    const bucket = storage.bucket(BUCKET_NAME);

    // Load file metadata to get storage path and filename
    const fileDoc = await loadJSON(bucket, `metadata/files/${fileId}.json`);
    if (!fileDoc) {
      console.error(`[REPROCESS] File metadata not found for fileId: ${fileId}`);
      return res.status(404).json({ error: 'File not found' });
    }

    // Validate storagePath exists
    if (!fileDoc.storagePath) {
      console.error(`[REPROCESS] File metadata missing storagePath for fileId: ${fileId}`, fileDoc);
      return res.status(400).json({ 
        error: 'File metadata is missing storage path. Cannot reprocess file.' 
      });
    }

    // Check if original file exists
    const originalFile = bucket.file(fileDoc.storagePath);
    let exists = false;
    try {
      [exists] = await originalFile.exists();
    } catch (error) {
      console.error(`[REPROCESS] Error checking file existence:`, error);
      return res.status(500).json({ 
        error: `Error checking file existence: ${error.message}` 
      });
    }
    
    if (!exists) {
      console.error(`[REPROCESS] Original file not found at path: ${fileDoc.storagePath}`);
      return res.status(404).json({
        error: 'Original file not found in storage. File may have been deleted.'
      });
    }

    console.log(`[REPROCESS] Found file: ${fileDoc.filename} at ${fileDoc.storagePath}`);

    // Update status to processing
    fileDoc.status = 'processing';
    fileDoc.reprocessedAt = new Date().toISOString();
    fileDoc.processingStep = 'starting';
    fileDoc.processingMessage = 'Reprocessing started...';
    fileDoc.processingProgress = 0;
    await saveJSON(bucket, `metadata/files/${fileId}.json`, fileDoc);

    // Trigger reprocessing (async) with proper error handling
    processFile(fileId, fileDoc.storagePath, fileDoc.filename).catch(async (error) => {
      console.error(`[REPROCESS] Error during async processing for file ${fileId}:`, error);
      console.error(`[REPROCESS] Error stack:`, error.stack);
      
      // Update file status to error
      try {
        const errorFileDoc = await loadJSON(bucket, `metadata/files/${fileId}.json`);
        if (errorFileDoc) {
          errorFileDoc.status = 'error';
          errorFileDoc.errorMessage = error.message;
          errorFileDoc.errorDetails = error.stack;
          errorFileDoc.processingStep = 'error';
          errorFileDoc.processingMessage = `Reprocessing failed: ${error.message}`;
          await saveJSON(bucket, `metadata/files/${fileId}.json`, errorFileDoc);
          console.log(`[REPROCESS] Updated file status to error for ${fileId}`);
        }
      } catch (updateError) {
        console.error(`[REPROCESS] Failed to update error status:`, updateError);
      }
    });

    res.json({
      success: true,
      fileId,
      message: 'File reprocessing started',
    });
  } catch (error) {
    console.error('[REPROCESS] Error:', error);
    console.error('[REPROCESS] Error stack:', error.stack);
    console.error('[REPROCESS] Error details:', {
      message: error.message,
      name: error.name,
      fileId: req.params?.fileId
    });
    res.status(500).json({ 
      error: error.message || 'Failed to reprocess file',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
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
/**
 * Force generate comparison from latest two files
 */
app.post('/api/comparisons/generate', async (req, res) => {
  try {
    const bucket = storage.bucket(BUCKET_NAME);
    console.log('[COMPARISONS] Force generating comparison...');
    
    // Find the two most recent completed files
    const metadataList = await listFiles(bucket, 'metadata/files/');
    console.log(`[COMPARISONS] Found ${metadataList.length} metadata files`);
    
    const fileIds = metadataList
      .map(f => f.replace('metadata/files/', '').replace('.json', ''))
      .sort((a, b) => parseInt(b) - parseInt(a));
    
    console.log(`[COMPARISONS] File IDs (sorted):`, fileIds.slice(0, 5));
    
    let currentFileId = null;
    let previousFileId = null;
    
    for (const fileId of fileIds) {
      const fileDoc = await loadJSON(bucket, `metadata/files/${fileId}.json`);
      console.log(`[COMPARISONS] Checking file ${fileId}: status=${fileDoc?.status}`);
      if (fileDoc && fileDoc.status === 'completed') {
        if (!currentFileId) {
          currentFileId = fileId;
          console.log(`[COMPARISONS] Set current file: ${currentFileId}`);
        } else if (!previousFileId) {
          previousFileId = fileId;
          console.log(`[COMPARISONS] Set previous file: ${previousFileId}`);
          break;
        }
      }
    }
    
    if (!currentFileId || !previousFileId) {
      console.log(`[COMPARISONS] Missing files - current: ${currentFileId}, previous: ${previousFileId}`);
      return res.status(400).json({ 
        error: 'Need at least two completed files to generate comparison',
        found: { current: !!currentFileId, previous: !!previousFileId },
        totalFiles: fileIds.length
      });
    }
    
    console.log(`[COMPARISONS] Generating comparison: ${currentFileId} vs ${previousFileId}`);
    
    const currentProperties = await loadJSON(bucket, `data/properties/${currentFileId}.json`) || [];
    const previousProperties = await loadJSON(bucket, `data/properties/${previousFileId}.json`) || [];
    
    console.log(`[COMPARISONS] Loaded properties - current: ${currentProperties.length}, previous: ${previousProperties.length}`);
    
    if (currentProperties.length === 0 || previousProperties.length === 0) {
      return res.status(400).json({ 
        error: 'One or both files have no properties',
        currentCount: currentProperties.length,
        previousCount: previousProperties.length,
        currentFileId,
        previousFileId
      });
    }
    
    const currentFileDoc = await loadJSON(bucket, `metadata/files/${currentFileId}.json`);
    const previousFileDoc = await loadJSON(bucket, `metadata/files/${previousFileId}.json`);
    
    console.log(`[COMPARISONS] Calling generateComparison function...`);
    const comparison = generateComparison(
      currentProperties,
      previousProperties,
      currentFileDoc?.filename || currentFileId,
      previousFileDoc?.filename || previousFileId
    );
    
    console.log(`[COMPARISONS] Comparison generated:`, {
      newProperties: comparison.summary.newProperties,
      removedProperties: comparison.summary.removedProperties,
      statusChanges: comparison.summary.statusChanges,
    });
    
    const comparisonPath = `data/comparisons/${currentFileId}.json`;
    console.log(`[COMPARISONS] Saving comparison to: ${comparisonPath}`);
    await saveJSON(bucket, comparisonPath, {
      ...comparison,
      currentFileId,
      previousFileId,
      generatedAt: new Date().toISOString(),
    });
    
    console.log(`[COMPARISONS] Comparison saved successfully`);
    
    // Verify it was saved
    const savedComparison = await loadJSON(bucket, comparisonPath);
    if (!savedComparison) {
      console.error(`[COMPARISONS] ERROR: Comparison was not saved properly!`);
      return res.status(500).json({ error: 'Failed to save comparison file' });
    }
    
    console.log(`[COMPARISONS] Comparison verified and returning to client`);
    
    // Return the full comparison object (same structure as GET /api/comparisons/latest)
    const responseData = {
      ...comparison,
      currentFileId,
      previousFileId,
      generatedAt: new Date().toISOString(),
    };
    
    console.log(`[COMPARISONS] Returning comparison with ${responseData.summary.statusChanges} status changes`);
    res.json(responseData);
  } catch (error) {
    console.error('[COMPARISONS] Error generating comparison:', error);
    console.error('[COMPARISONS] Error stack:', error.stack);
    res.status(500).json({ 
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

/**
 * Get latest comparison
 */
app.get('/api/comparisons/latest', async (req, res) => {
  try {
    console.log('[COMPARISON-LATEST] Fetching latest comparison');
    const bucket = storage.bucket(BUCKET_NAME);

    // Strategy: List comparison files directly - more reliable than checking metadata
    const comparisonList = await listFiles(bucket, 'data/comparisons/');
    console.log(`[COMPARISON-LATEST] Found ${comparisonList.length} comparison files`);

    if (comparisonList.length === 0) {
      console.log('[COMPARISON-LATEST] No comparison files found');
      return res.status(404).json({ error: 'No comparisons found' });
    }

    // Extract file IDs from comparison paths and sort by timestamp (newest first)
    // Format: data/comparisons/1766180559090.json
    const fileIds = comparisonList
      .map(f => f.replace('data/comparisons/', '').replace('.json', ''))
      .filter(id => id && !isNaN(parseInt(id)))
      .sort((a, b) => parseInt(b) - parseInt(a));

    console.log(`[COMPARISON-LATEST] Found ${fileIds.length} comparison files, checking newest first`);

    // Try each file until we find a valid comparison (starting with newest)
    for (const fileId of fileIds) {
      const comparisonPath = `data/comparisons/${fileId}.json`;
      console.log(`[COMPARISON-LATEST] Loading comparison from: ${comparisonPath}`);

      try {
        const comparison = await loadJSON(bucket, comparisonPath);
        if (comparison && comparison.summary) {
          console.log(`[COMPARISON-LATEST] ✓ Found valid comparison for fileId: ${fileId}`);
          console.log(`[COMPARISON-LATEST] Comparison summary:`, {
            currentFileId: comparison.currentFileId || fileId,
            previousFileId: comparison.previousFileId,
            newProperties: comparison.summary?.newProperties,
            removedProperties: comparison.summary?.removedProperties,
            statusChanges: comparison.summary?.statusChanges,
          });
          
          // Ensure currentFileId and previousFileId are set (for backwards compatibility)
          const responseData = {
            ...comparison,
            currentFileId: comparison.currentFileId || fileId,
            currentFile: comparison.currentFile || comparison.currentFileId || fileId,
            previousFile: comparison.previousFile || comparison.previousFileId,
          };
          
          return res.json(responseData);
        } else {
          console.log(`[COMPARISON-LATEST] Comparison file exists but is invalid or missing summary`);
        }
      } catch (loadError) {
        console.log(`[COMPARISON-LATEST] Error loading comparison ${fileId}:`, loadError.message);
        // Continue to next file
      }
    }

    console.log('[COMPARISON-LATEST] No valid comparisons found');
    return res.status(404).json({ error: 'Comparison not found' });
  } catch (error) {
    console.error('[COMPARISON-LATEST] ERROR:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get properties from latest completed file
 */
app.get('/api/properties', async (req, res) => {
  try {
    console.log('[PROPERTIES] Starting properties request');
    
    if (!storage) {
      console.error('[PROPERTIES] ERROR: Storage not initialized');
      return res.status(500).json({ 
        error: 'Storage not initialized. Check environment variables.',
        properties: [],
        total: 0
      });
    }
    
    const bucket = storage.bucket(BUCKET_NAME);
    
    // Get list of files and find the latest completed one
    const fileList = await listFiles(bucket, 'metadata/files/');
    
    if (fileList.length === 0) {
      console.log('[PROPERTIES] No files found, returning empty properties list');
      return res.json({
        properties: [],
        total: 0,
        totalUnfiltered: 0,
        statusCounts: { J: 0, A: 0, P: 0, U: 0 },
        page: 1,
        totalPages: 0,
        filter: null
      });
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
        console.log(`[PROPERTIES] Loaded ${properties.length} properties from file ${fileId}`);
        
        // Count properties with valid CAN (accountNumber from column E)
        const propertiesWithCAN = properties.filter(p => p.accountNumber && p.accountNumber.trim() !== '' && !p.accountNumber.startsWith('TEMP_') && !p.accountNumber.startsWith('ROW_')).length;
        const propertiesWithoutCAN = properties.length - propertiesWithCAN;
        console.log(`[PROPERTIES] Properties breakdown: ${propertiesWithCAN} with valid CAN, ${propertiesWithoutCAN} without valid CAN`);
        
        console.log(`[PROPERTIES] Returning ${properties.length} total properties`);
        
        // Log sample property to verify NEW- columns are included
        if (properties.length > 0) {
          const sample = properties[0];
          const newFields = Object.keys(sample).filter(k => 
            ['marketValue', 'landValue', 'improvementValue', 'cappedValue', 'agriculturalValue',
             'legalDescription', 'lastPaymentDate', 'lastPayer', 'delinquentAfter', 'taxYear',
             'link', 'ownerAddress', 'exemptions', 'jurisdictions'].includes(k)
          );
          console.log(`[PROPERTIES] Sample property has ${newFields.length} NEW- fields:`, newFields);
          if (newFields.length > 0) {
            console.log(`[PROPERTIES] Sample NEW- field values:`, 
              newFields.slice(0, 5).reduce((acc, key) => {
                acc[key] = sample[key];
                return acc;
              }, {})
            );
          }
        }
        
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
        
        // Ensure all properties include all fields (no filtering of fields)
        // This ensures data transfer from backend to frontend
        const propertiesToReturn = filteredProperties.slice(start, start + limit).map((p, idx) => {
          // Return property with all fields intact - ensure data transfer
          const propertyWithAllFields = {
            ...p,
            // Explicitly include all NEW- fields to ensure they're sent to frontend
            legalDescription: p.legalDescription || undefined,
            marketValue: p.marketValue !== undefined && p.marketValue !== null ? p.marketValue : undefined,
            landValue: p.landValue !== undefined && p.landValue !== null ? p.landValue : undefined,
            improvementValue: p.improvementValue !== undefined && p.improvementValue !== null ? p.improvementValue : undefined,
            cappedValue: p.cappedValue !== undefined && p.cappedValue !== null ? p.cappedValue : undefined,
            agriculturalValue: p.agriculturalValue !== undefined && p.agriculturalValue !== null ? p.agriculturalValue : undefined,
            exemptions: p.exemptions || undefined,
            jurisdictions: p.jurisdictions || undefined,
            lastPaymentDate: p.lastPaymentDate || undefined,
            lastPaymentAmount: p.lastPaymentAmount !== undefined && p.lastPaymentAmount !== null ? p.lastPaymentAmount : undefined,
            lastPayer: p.lastPayer || undefined,
            delinquentAfter: p.delinquentAfter || undefined,
            halfPaymentOptionAmount: p.halfPaymentOptionAmount !== undefined && p.halfPaymentOptionAmount !== null ? p.halfPaymentOptionAmount : undefined,
            priorYearsAmountDue: p.priorYearsAmountDue !== undefined && p.priorYearsAmountDue !== null ? p.priorYearsAmountDue : undefined,
            taxYear: p.taxYear || undefined,
            yearAmountDue: p.yearAmountDue !== undefined && p.yearAmountDue !== null ? p.yearAmountDue : undefined,
            yearTaxLevy: p.yearTaxLevy !== undefined && p.yearTaxLevy !== null ? p.yearTaxLevy : undefined,
            link: p.link || undefined,
            ownerAddress: p.ownerAddress || undefined,
          };
          
          // Verify data transfer for first property in response
          if (idx === 0) {
            const newFieldsCount = Object.keys(propertyWithAllFields).filter(key => 
              ['marketValue', 'landValue', 'improvementValue', 'cappedValue', 'agriculturalValue',
               'legalDescription', 'lastPaymentDate', 'lastPayer', 'delinquentAfter', 'taxYear',
               'link', 'ownerAddress', 'exemptions', 'jurisdictions', 'lastPaymentAmount',
               'halfPaymentOptionAmount', 'priorYearsAmountDue', 'yearAmountDue', 'yearTaxLevy'].includes(key)
            ).length;
            const fieldsWithData = Object.keys(propertyWithAllFields).filter(key => {
              const val = propertyWithAllFields[key];
              return ['marketValue', 'landValue', 'improvementValue', 'cappedValue', 'agriculturalValue',
                      'legalDescription', 'lastPaymentDate', 'lastPayer', 'delinquentAfter', 'taxYear',
                      'link', 'ownerAddress', 'exemptions', 'jurisdictions', 'lastPaymentAmount',
                      'halfPaymentOptionAmount', 'priorYearsAmountDue', 'yearAmountDue', 'yearTaxLevy'].includes(key)
                     && val !== undefined && val !== null && val !== '';
            });
            console.log(`[PROPERTIES] Data transfer: Sample property has ${newFieldsCount} NEW- fields, ${fieldsWithData.length} with data`);
          }
          
          return propertyWithAllFields;
        });
        
        console.log(`[PROPERTIES] Returning ${propertiesToReturn.length} properties with all NEW- fields included for data transfer`);
        
        return res.json({
          properties: propertiesToReturn,
          total: filteredProperties.length,
          totalUnfiltered: properties.length,
          statusCounts,
          page,
          totalPages: Math.ceil(filteredProperties.length / limit),
          filter: statusFilter ? statusFilter.toUpperCase() : null,
        });
      }
    }
    
    // No completed file found
    console.log('[PROPERTIES] No completed file found');
    res.json({ 
      properties: [], 
      total: 0,
      totalUnfiltered: 0,
      statusCounts: { J: 0, A: 0, P: 0, U: 0 },
      page: 1, 
      totalPages: 0,
      filter: null
    });
  } catch (error) {
    console.error('[PROPERTIES] Error:', error);
    console.error('[PROPERTIES] Error stack:', error.stack);
    console.error('[PROPERTIES] Error details:', {
      message: error.message,
      name: error.name
    });
    res.status(500).json({ 
      error: error.message || 'Failed to fetch properties',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
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
        // Try matching by ID first (which is now accountNumber), then fallback to accountNumber field
        const propertyIndex = properties.findIndex(p => 
          p.id === propertyId || p.accountNumber === propertyId
        );
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
        // Try matching by ID first (which is now accountNumber), then fallback to accountNumber field
        const propertyIndex = properties.findIndex(p => 
          p.id === propertyId || p.accountNumber === propertyId
        );
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
        // Try matching by ID first (which is now accountNumber), then fallback to accountNumber field
        const propertyIndex = properties.findIndex(p => 
          p.id === propertyId || p.accountNumber === propertyId
        );
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
        // Try matching by ID first (which is now accountNumber), then fallback to accountNumber field
        const propertyIndex = properties.findIndex(p => 
          p.id === propertyId || p.accountNumber === propertyId
        );
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
        // Try matching by ID first (which is now accountNumber), then fallback to accountNumber field
        const propertyIndex = properties.findIndex(p => 
          p.id === propertyId || p.accountNumber === propertyId
        );
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
        // Try matching by ID first (which is now accountNumber), then fallback to accountNumber field
        const propertyIndex = properties.findIndex(p => 
          p.id === propertyId || p.accountNumber === propertyId
        );
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

// ============================================================================
// PRE-FORECLOSURE ENDPOINTS (Strict Data Model - No Enrichment)
// ============================================================================

/**
 * Get all pre-foreclosure records
 */
app.get('/api/preforeclosure', async (req, res) => {
  try {
    const bucket = storage.bucket(BUCKET_NAME);
    const file = bucket.file('data/preforeclosure/records.json');
    
    // Check if file exists
    const [exists] = await file.exists();
    if (!exists) {
      return res.json([]);
    }
    
    // Download and parse
    const [data] = await file.download();
    const records = JSON.parse(data.toString());
    
    res.json(records);
  } catch (error) {
    console.error('[PRE-FORECLOSURE] Error fetching records:', error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Update a pre-foreclosure record (operator-entered fields only)
 */
app.put('/api/preforeclosure/:document_number', async (req, res) => {
  try {
    const { document_number } = req.params;
    const { internal_status, notes, last_action_date, next_follow_up_date } = req.body;
    
    const bucket = storage.bucket(BUCKET_NAME);
    const file = bucket.file('data/preforeclosure/records.json');
    
    // Load existing records
    let records = [];
    const [exists] = await file.exists();
    if (exists) {
      const [data] = await file.download();
      records = JSON.parse(data.toString());
    }
    
    // Find and update record
    const recordIndex = records.findIndex(r => r.document_number === document_number);
    if (recordIndex === -1) {
      return res.status(404).json({ error: 'Record not found' });
    }
    
    // Update only operator-entered fields
    const record = records[recordIndex];
    if (internal_status !== undefined) record.internal_status = internal_status;
    if (notes !== undefined) record.notes = notes;
    if (last_action_date !== undefined) record.last_action_date = last_action_date;
    if (next_follow_up_date !== undefined) record.next_follow_up_date = next_follow_up_date;
    record.updated_at = new Date().toISOString();
    
    // Save back to storage
    await file.save(JSON.stringify(records, null, 2), {
      contentType: 'application/json',
    });
    
    res.json(record);
  } catch (error) {
    console.error('[PRE-FORECLOSURE] Error updating record:', error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Upload pre-foreclosure file
 * Matches on document_number, sets inactive=true for missing records
 */
app.post('/api/preforeclosure/upload', async (req, res) => {
  try {
    const { filename, fileData } = req.body;
    
    if (!fileData) {
      return res.status(400).json({ error: 'No file data provided' });
    }
    
    // Decode base64
    const buffer = Buffer.from(fileData, 'base64');
    
    // Determine file type and parse accordingly
    const isCSV = filename.toLowerCase().endsWith('.csv');
    let rawData;
    
    if (isCSV) {
      // Parse CSV file
      const csvString = buffer.toString('utf-8');
      rawData = XLSX.utils.sheet_to_json(XLSX.read(csvString, { type: 'string' }).Sheets[XLSX.read(csvString, { type: 'string' }).SheetNames[0]], { raw: false });
    } else {
      // Parse Excel file (.xlsx, .xls)
      const workbook = XLSX.read(buffer, { type: 'buffer' });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      rawData = XLSX.utils.sheet_to_json(worksheet, { raw: false });
    }
    
    console.log(`[PRE-FORECLOSURE] Parsed ${rawData.length} rows from ${filename} (${isCSV ? 'CSV' : 'Excel'})`);
    
    // Determine current month (for filing_month if not in file)
    const currentDate = new Date();
    const currentMonth = currentDate.toLocaleString('default', { month: 'long', year: 'numeric' });
    
    // Map columns to our data model
    // Expected columns: document_number (Doc Number), type, address, city, zip, filing_month (optional)
    const newRecords = rawData.map((row, index) => {
      // Try to find columns (case-insensitive, flexible matching)
      // Get all possible column name variations
      const docNum = row['Document Number'] || row['document_number'] || row['Document #'] || row['Doc Number'] || row['DocNumber'] || row['doc number'] || row['DOC NUMBER'] || '';
      const type = row['Type'] || row['type'] || row['TYPE'] || '';
      const address = row['Address'] || row['address'] || row['ADDRESS'] || '';
      const city = row['City'] || row['city'] || row['CITY'] || '';
      const zip = row['ZIP'] || row['zip'] || row['Zip'] || row['Zip Code'] || row['ZipCode'] || row['ZIP CODE'] || '';
      const filingMonth = row['Filing Month'] || row['filing_month'] || row['FilingMonth'] || currentMonth;
      
      if (!docNum) {
        console.warn(`[PRE-FORECLOSURE] Row ${index + 1} missing document_number, skipping`);
        return null;
      }
      
      // Normalize type: MORTGAGE -> Mortgage, TAX -> Tax
      let normalizedType = 'Mortgage'; // Default
      const typeUpper = String(type).toUpperCase().trim();
      if (typeUpper === 'MORTGAGE') {
        normalizedType = 'Mortgage';
      } else if (typeUpper === 'TAX') {
        normalizedType = 'Tax';
      }
      
      // Log type normalization for debugging (first 5 rows and all TAX rows)
      if (index < 5 || typeUpper === 'TAX') {
        console.log(`[PRE-FORECLOSURE] Row ${index + 1}: type="${type}" (${typeUpper}) -> normalized="${normalizedType}"`);
      }
      
      return {
        document_number: String(docNum).trim(),
        type: normalizedType,
        address: String(address).trim(),
        city: String(city).trim(),
        zip: String(zip).trim(),
        filing_month: String(filingMonth).trim(),
        county: 'Bexar',
        // Operator-entered fields (preserved from existing record)
        internal_status: 'New',
        notes: undefined,
        last_action_date: undefined,
        next_follow_up_date: undefined,
        // System-tracked
        inactive: false,
        first_seen_month: currentMonth,
        last_seen_month: currentMonth,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
    }).filter(r => r !== null);
    
    // Count by type for logging
    const typeCounts = newRecords.reduce((acc, r) => {
      acc[r.type] = (acc[r.type] || 0) + 1;
      return acc;
    }, {});
    console.log(`[PRE-FORECLOSURE] Mapped ${newRecords.length} valid records. Type breakdown:`, typeCounts);
    
    // Load existing records
    const bucket = storage.bucket(BUCKET_NAME);
    const file = bucket.file('data/preforeclosure/records.json');
    
    let existingRecords = [];
    const [exists] = await file.exists();
    if (exists) {
      const [data] = await file.download();
      existingRecords = JSON.parse(data.toString());
    }
    
    // Create a map of existing records by document_number
    const existingMap = new Map();
    existingRecords.forEach(r => {
      existingMap.set(r.document_number, r);
    });
    
    // Create a set of new document_numbers
    const newDocNumbers = new Set(newRecords.map(r => r.document_number));
    
    // Process new records: match on document_number, preserve operator-entered fields
    const updatedRecords = newRecords.map(newRecord => {
      const existing = existingMap.get(newRecord.document_number);
      
      if (existing) {
        // Preserve operator-entered fields
        return {
          ...newRecord,
          internal_status: existing.internal_status || 'New',
          notes: existing.notes,
          last_action_date: existing.last_action_date,
          next_follow_up_date: existing.next_follow_up_date,
          first_seen_month: existing.first_seen_month || currentMonth,
          last_seen_month: currentMonth,
          inactive: false,
          updated_at: new Date().toISOString(),
        };
      } else {
        // New record
        return newRecord;
      }
    });
    
    // Mark missing records as inactive (preserve history)
    existingRecords.forEach(existing => {
      if (!newDocNumbers.has(existing.document_number)) {
        // Record is missing from new upload - mark inactive but keep it
        if (!existing.inactive) {
          existing.inactive = true;
          existing.updated_at = new Date().toISOString();
        }
        updatedRecords.push(existing);
      }
    });
    
    // Save all records
    await file.save(JSON.stringify(updatedRecords, null, 2), {
      contentType: 'application/json',
    });
    
    console.log(`[PRE-FORECLOSURE] Saved ${updatedRecords.length} total records (${newRecords.length} new/updated, ${updatedRecords.length - newRecords.length} inactive)`);
    
    res.json({
      success: true,
      fileId: `preforeclosure-${Date.now()}`,
      recordsProcessed: newRecords.length,
      totalRecords: updatedRecords.length,
      activeRecords: updatedRecords.filter(r => !r.inactive).length,
      inactiveRecords: updatedRecords.filter(r => r.inactive).length,
    });
  } catch (error) {
    console.error('[PRE-FORECLOSURE] Error processing upload:', error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Delete all preforeclosure records
 */
app.delete('/api/preforeclosure', authenticateToken, async (req, res) => {
  try {
    const bucket = storage.bucket(BUCKET_NAME);
    const file = bucket.file('data/preforeclosure/records.json');
    
    // Check if file exists
    const [exists] = await file.exists();
    if (!exists) {
      return res.json({ success: true, message: 'No records to delete' });
    }
    
    // Delete the file
    await file.delete();
    
    console.log('[PRE-FORECLOSURE] Deleted all records');
    res.json({ success: true, message: 'All preforeclosure records deleted' });
  } catch (error) {
    console.error('[PRE-FORECLOSURE] Error deleting records:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Export Express app for Google Cloud Functions/Cloud Run
module.exports = app;
