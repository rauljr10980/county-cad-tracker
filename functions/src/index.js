/**
 * County CAD Tracker API - Production Server
 * PostgreSQL + Prisma + Express
 * Designed for Railway deployment with 50k+ properties
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

const cron = require('node-cron');

// Use shared Prisma instance to prevent connection pool exhaustion
const prisma = require('./lib/prisma');

// Import routes
const propertyRoutes = require('./routes/properties');
const taskRoutes = require('./routes/tasks');
const noteRoutes = require('./routes/notes');
const userRoutes = require('./routes/users');
const authRoutes = require('./routes/auth');
const uploadRoutes = require('./routes/upload');
const fileRoutes = require('./routes/files');
const preforeclosureRoutes = require('./routes/preforeclosure');
const foreclosureRoutes = require('./routes/foreclosure');
const routingRoutes = require('./routes/routing');
const routesRoutes = require('./routes/routes');
const zonesRoutes = require('./routes/zones');

const app = express();
const PORT = process.env.PORT || 8080;

// ============================================================================
// MIDDLEWARE
// ============================================================================

// Security headers
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));

// Compression
app.use(compression());

// Logging
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// CORS configuration - Allow GitHub Pages and localhost
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',')
  : [
      'http://localhost:5173',
      'http://localhost:5174',
      'http://localhost:8080',
      'http://localhost:8081',
      'https://rauljr10980.github.io',
      'https://rauljr10980.github.io/county-cad-tracker'
    ];

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (mobile apps, curl, Postman, etc.)
    if (!origin) {
      console.log('[CORS] Request with no origin - allowing');
      return callback(null, true);
    }

    console.log(`[CORS] Checking origin: ${origin}`);

    // Check for exact match first
    if (allowedOrigins.includes(origin)) {
      console.log(`[CORS] ✅ Exact match - ALLOWING: ${origin}`);
      return callback(null, true);
    }

    // Check for GitHub Pages (any subpath of rauljr10980.github.io)
    if (origin.startsWith('https://rauljr10980.github.io')) {
      console.log(`[CORS] ✅ GitHub Pages origin - ALLOWING: ${origin}`);
      return callback(null, true);
    }

    // Check for localhost (any port)
    if (origin.startsWith('http://localhost:') || origin === 'http://localhost') {
      console.log(`[CORS] ✅ Localhost origin - ALLOWING: ${origin}`);
      return callback(null, true);
    }

    // Check if origin matches any allowed origin pattern
    const isAllowed = allowedOrigins.some(allowed => {
      if (origin === allowed) return true;
      // Check if origin starts with allowed origin (for subpaths)
      if (allowed && origin.startsWith(allowed)) return true;
      return false;
    });

    if (isAllowed) {
      console.log(`[CORS] ✅ Pattern match - ALLOWING: ${origin}`);
      callback(null, true);
    } else {
      console.error(`[CORS] ❌ BLOCKED origin: ${origin}`);
      console.error(`[CORS] Allowed origins:`, allowedOrigins);
      callback(new Error(`Not allowed by CORS: ${origin}`));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposedHeaders: ['Content-Type'],
  optionsSuccessStatus: 200
}));

// Body parsing - increased limit for large Excel files
app.use(express.json({ limit: '150mb' }));
app.use(express.urlencoded({ extended: true, limit: '150mb' }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // Limit each IP to 1000 requests per windowMs
  message: 'Too many requests from this IP, please try again later.'
});
app.use('/api/', limiter);

// ============================================================================
// ROUTES
// ============================================================================

app.get('/', (req, res) => {
  res.json({
    name: 'County CAD Tracker API',
    version: '3.0.0',
    status: 'running',
    database: 'PostgreSQL',
    features: [
      'Property Management',
      'Task Delegation & Tracking',
      'Property Notes',
      'Full Audit Trail',
      'Multi-user Support'
    ]
  });
});

app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/properties', propertyRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/notes', noteRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/files', fileRoutes);
app.use('/api/preforeclosure', preforeclosureRoutes);
app.use('/api/foreclosure', foreclosureRoutes);
app.use('/api/routing', routingRoutes);
app.use('/api/routes', routesRoutes);
app.use('/api/zones', zonesRoutes);

// ============================================================================
// ERROR HANDLING
// ============================================================================

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('[ERROR]', err);

  // Don't leak error details in production
  const message = process.env.NODE_ENV === 'production'
    ? 'Internal server error'
    : err.message;

  res.status(err.status || 500).json({
    error: message,
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack })
  });
});

// ============================================================================
// START SERVER
// ============================================================================

async function startServer() {
  try {
    // Check if DATABASE_URL is set
    if (!process.env.DATABASE_URL) {
      console.error('❌ ERROR: DATABASE_URL is not set!');
      console.error('Please add DATABASE_URL to your Railway service variables.');
      console.error('Get it from: PostgreSQL service → Variables → DATABASE_URL');
      process.exit(1);
    }

    // Test database connection
    console.log('🔌 Testing database connection...');
    await prisma.$connect();
    console.log('✅ Database connected successfully');

    // Startup migrations
    try {
      const typeFixed = await prisma.preForeclosure.updateMany({
        where: { type: 'NOTICE_OF_FORECLOSURE' },
        data: { type: 'Mortgage' },
      });
      if (typeFixed.count > 0) console.log(`🔄 Fixed ${typeFixed.count} record types`);

      // Delete records with no address (bad scrape data)
      const deleted = await prisma.preForeclosure.deleteMany({
        where: { address: '' },
      });
      if (deleted.count > 0) console.log(`🧹 Cleaned up ${deleted.count} records with no address`);
    } catch (e) {
      console.log('⚠️ Migration skipped:', e.message);
    }

    // Start Express server
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`
╔═══════════════════════════════════════════════════════════╗
║   County CAD Tracker API v3.0                             ║
║   PostgreSQL + Prisma + Express                           ║
╠═══════════════════════════════════════════════════════════╣
║   Server: http://0.0.0.0:${PORT}                          ║
║   Environment: ${process.env.NODE_ENV || 'development'}                              ║
║   Database: PostgreSQL (Prisma) - Connected               ║
║   Auto-Scrape: Mon-Fri 8am,11am,2pm,5pm CT               ║
╚═══════════════════════════════════════════════════════════╝
      `);
    });

    // Auto-scrape: Mon-Fri at 8am, 11am, 2pm, 5pm Central Time
    // Cron runs in UTC, CT = UTC-6, so 8am CT = 14:00 UTC, etc.
    const { scrapeBexarForeclosures } = require('./lib/bexarScraper');

    async function runAutoScrape() {
      const now = new Date();
      console.log(`[AUTO-SCRAPE] Starting scheduled scrape at ${now.toISOString()}`);
      try {
        // Use today's date as start, +90 days as end
        const formatDate = (d) => {
          const year = d.getFullYear();
          const month = String(d.getMonth() + 1).padStart(2, '0');
          const day = String(d.getDate()).padStart(2, '0');
          return `${year}${month}${day}`;
        };

        const today = new Date();
        const endDate = new Date(today);
        endDate.setDate(endDate.getDate() + 90);

        const result = await scrapeBexarForeclosures({
          startDate: formatDate(today),
          endDate: formatDate(endDate),
        });

        if (!result.success) {
          console.error('[AUTO-SCRAPE] Scrape failed:', result.error);
          return;
        }

        // Import records (same logic as the API route)
        const recordsWithAddress = result.records.filter(r => r.address && r.address.trim().length > 0);
        const skippedNoAddress = result.records.length - recordsWithAddress.length;

        const existingDocs = await prisma.preForeclosure.findMany({
          select: { documentNumber: true, address: true, saleDate: true },
        });
        const existingMap = new Map(existingDocs.map(r => [r.documentNumber, r]));

        const newRecords = [];
        const updateRecords = [];
        for (const r of recordsWithAddress) {
          const existing = existingMap.get(r.documentNumber);
          if (!existing) {
            newRecords.push(r);
          } else if (!existing.address || existing.address.trim() === '') {
            updateRecords.push(r);
          } else if (!existing.saleDate && r.saleDate) {
            updateRecords.push(r);
          }
        }

        let importedCount = 0;
        if (newRecords.length > 0) {
          const monthStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
          const created = await prisma.preForeclosure.createMany({
            data: newRecords.map(r => ({
              documentNumber: r.documentNumber,
              address: r.address,
              city: r.city || 'SAN ANTONIO',
              zip: r.zip || '',
              recordedDate: r.recordedDate ? new Date(r.recordedDate) : null,
              saleDate: r.saleDate ? new Date(r.saleDate) : null,
              type: 'Mortgage',
              filingMonth: monthStr,
              firstSeenMonth: monthStr,
              lastSeenMonth: monthStr,
              workflowStage: 'not_started',
            })),
            skipDuplicates: true,
          });
          importedCount = created.count;
        }

        let updatedCount = 0;
        if (updateRecords.length > 0) {
          for (const r of updateRecords) {
            await prisma.preForeclosure.update({
              where: { documentNumber: r.documentNumber },
              data: {
                address: r.address,
                city: r.city || 'SAN ANTONIO',
                zip: r.zip || '',
                saleDate: r.saleDate ? new Date(r.saleDate) : undefined,
                recordedDate: r.recordedDate ? new Date(r.recordedDate) : undefined,
              },
            });
          }
          updatedCount = updateRecords.length;
        }

        console.log(`[AUTO-SCRAPE] Done: scraped=${result.records.length}, imported=${importedCount}, updated=${updatedCount}, noAddress=${skippedNoAddress}`);
      } catch (error) {
        console.error('[AUTO-SCRAPE] Error:', error.message);
      }
    }

    // Schedule: Mon-Fri at 8am, 11am, 2pm, 5pm Central Time
    cron.schedule('0 8,11,14,17 * * 1-5', () => {
      runAutoScrape();
    }, { timezone: 'America/Chicago' });
    console.log('⏰ Auto-scrape scheduled: Mon-Fri at 8am, 11am, 2pm, 5pm CT');
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    console.error('Database URL exists:', !!process.env.DATABASE_URL);
    process.exit(1);
  }
}

startServer();

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully...');
  await prisma.$disconnect();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, shutting down gracefully...');
  await prisma.$disconnect();
  process.exit(0);
});

module.exports = app;
