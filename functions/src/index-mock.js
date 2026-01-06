/**
 * County CAD Tracker API - Mock Server (No Prisma)
 * For Windows ARM64 development until Prisma adds ARM64 support
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

const app = express();
const PORT = process.env.PORT || 8080;

// In-memory storage (temporary)
const mockData = {
  properties: [],
  fileUploads: [],
  users: []
};

// ============================================================================
// MIDDLEWARE
// ============================================================================

app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));

app.use(compression());
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// CORS configuration
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',')
  : [
      'http://localhost:5173',
      'http://localhost:5174',
      'http://localhost:8080',
      'http://localhost:8081',
      'https://rauljr10980.github.io'
    ];

app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    const isAllowed = allowedOrigins.some(allowed => {
      if (origin === allowed) return true;
      if (origin.startsWith(allowed)) return true;
      return false;
    });
    if (isAllowed) {
      callback(null, true);
    } else {
      console.log('CORS blocked origin:', origin);
      callback(new Error(`Not allowed by CORS: ${origin}`));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  message: 'Too many requests from this IP, please try again later.'
});
app.use('/api/', limiter);

// ============================================================================
// MOCK AUTH MIDDLEWARE
// ============================================================================

function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    // For development, allow unauthenticated requests
    req.user = { id: 'mock-user', username: 'developer', role: 'ADMIN' };
    return next();
  }

  req.user = { id: 'mock-user', username: 'developer', role: 'ADMIN' };
  next();
}

// ============================================================================
// ROUTES
// ============================================================================

app.get('/', (req, res) => {
  res.json({
    name: 'County CAD Tracker API (Mock Mode)',
    version: '3.0.0-mock',
    status: 'running',
    database: 'In-Memory (No Prisma)',
    note: 'This is a temporary mock server for Windows ARM64 development',
    features: [
      'Property Management',
      'File Upload',
      'Mock Data Storage'
    ]
  });
});

app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// ============================================================================
// FILE UPLOAD ROUTES
// ============================================================================

app.post('/api/upload', authenticateToken, async (req, res) => {
  try {
    const { filename, fileData } = req.body;

    if (!filename || !fileData) {
      return res.status(400).json({ error: 'Missing filename or fileData' });
    }

    console.log(`[UPLOAD] Processing base64 file: ${filename}`);

    const XLSX = require('xlsx');
    const fileId = `file_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Decode base64 to buffer
    const buffer = Buffer.from(fileData, 'base64');

    // Parse Excel file
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(worksheet);

    console.log(`[UPLOAD] Found ${data.length} rows in Excel file`);

    if (data.length === 0) {
      return res.status(400).json({ error: 'Excel file is empty' });
    }

    // Store in mock database
    let inserted = 0;
    let updated = 0;
    let skipped = 0;

    for (const row of data) {
      const accountNumber = String(row['Account Number'] || row['ACCOUNT NUMBER'] || row['accountNumber'] || '').trim();

      if (!accountNumber) {
        skipped++;
        continue;
      }

      const propertyData = {
        id: `prop_${Math.random().toString(36).substr(2, 9)}`,
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
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const existing = mockData.properties.findIndex(p => p.accountNumber === accountNumber);
      if (existing >= 0) {
        mockData.properties[existing] = { ...mockData.properties[existing], ...propertyData };
        updated++;
      } else {
        mockData.properties.push(propertyData);
        inserted++;
      }
    }

    // Store file upload record
    mockData.fileUploads.push({
      id: fileId,
      filename,
      fileId,
      status: 'COMPLETED',
      totalRecords: data.length,
      processedRecords: inserted + updated,
      errorCount: 0,
      uploadedAt: new Date(),
      completedAt: new Date()
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
        errors: 0
      }
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
// FILE MANAGEMENT ROUTES
// ============================================================================

app.get('/api/files', (req, res) => {
  res.json(mockData.fileUploads);
});

app.delete('/api/files/:fileId', authenticateToken, (req, res) => {
  const { fileId } = req.params;
  const index = mockData.fileUploads.findIndex(f => f.fileId === fileId);

  if (index >= 0) {
    mockData.fileUploads.splice(index, 1);
    res.json({ success: true, message: 'File deleted' });
  } else {
    res.status(404).json({ error: 'File not found' });
  }
});

// ============================================================================
// PROPERTY ROUTES
// ============================================================================

app.get('/api/properties', (req, res) => {
  const { page = 1, limit = 100, status, search } = req.query;

  let filtered = mockData.properties;

  if (status) {
    filtered = filtered.filter(p => p.status === status.toUpperCase());
  }

  if (search) {
    const searchLower = search.toLowerCase();
    filtered = filtered.filter(p =>
      p.ownerName?.toLowerCase().includes(searchLower) ||
      p.accountNumber?.toLowerCase().includes(searchLower) ||
      p.propertyAddress?.toLowerCase().includes(searchLower)
    );
  }

  const start = (page - 1) * limit;
  const end = start + parseInt(limit);

  res.json({
    properties: filtered.slice(start, end),
    total: filtered.length,
    totalPages: Math.ceil(filtered.length / limit),
    statusCounts: {
      JUDGMENT: mockData.properties.filter(p => p.status === 'JUDGMENT').length,
      ACTIVE: mockData.properties.filter(p => p.status === 'ACTIVE').length,
      PENDING: mockData.properties.filter(p => p.status === 'PENDING').length,
      UNKNOWN: mockData.properties.filter(p => p.status === 'UNKNOWN').length,
      PAID: mockData.properties.filter(p => p.status === 'PAID').length,
      REMOVED: mockData.properties.filter(p => p.status === 'REMOVED').length
    }
  });
});

// ============================================================================
// DASHBOARD ROUTES
// ============================================================================

app.get('/api/dashboard', (req, res) => {
  res.json({
    totalProperties: mockData.properties.length,
    byStatus: {
      judgment: mockData.properties.filter(p => p.status === 'JUDGMENT').length,
      active: mockData.properties.filter(p => p.status === 'ACTIVE').length,
      pending: mockData.properties.filter(p => p.status === 'PENDING').length,
    },
    totalAmountDue: mockData.properties.reduce((sum, p) => sum + (p.totalDue || 0), 0),
    avgAmountDue: mockData.properties.length > 0
      ? mockData.properties.reduce((sum, p) => sum + (p.totalDue || 0), 0) / mockData.properties.length
      : 0,
    filesProcessed: mockData.fileUploads.length
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('[ERROR]', err);
  const message = process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message;
  res.status(err.status || 500).json({
    error: message,
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack })
  });
});

// ============================================================================
// START SERVER
// ============================================================================

app.listen(PORT, '0.0.0.0', () => {
  console.log(`
╔═══════════════════════════════════════════════════════════╗
║   County CAD Tracker API v3.0 (MOCK MODE)                ║
║   In-Memory Storage (No Database Required)                ║
╠═══════════════════════════════════════════════════════════╣
║   Server: http://0.0.0.0:${PORT}                          ║
║   Environment: ${process.env.NODE_ENV || 'development'}                              ║
║   Storage: In-Memory (ARM64 Compatible)                   ║
║                                                           ║
║   ⚠️  NOTE: This is a temporary mock server for           ║
║      Windows ARM64 development. Data is not persisted.    ║
║      For production, use WSL2 or deploy to Railway.       ║
╚═══════════════════════════════════════════════════════════╝
  `);
});

module.exports = app;
