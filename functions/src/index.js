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
const { PrismaClient } = require('@prisma/client');

// Initialize Prisma Client
const prisma = new PrismaClient();

// Import routes
const propertyRoutes = require('./routes/properties');
const taskRoutes = require('./routes/tasks');
const noteRoutes = require('./routes/notes');
const userRoutes = require('./routes/users');
const authRoutes = require('./routes/auth');
const uploadRoutes = require('./routes/upload');

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
      'http://localhost:8081',
      'https://rauljr10980.github.io'
    ];

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (mobile apps, curl, Postman, etc.)
    if (!origin) return callback(null, true);

    // Check if origin matches any allowed origin
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

// Body parsing
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

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
    // Test database connection
    console.log('🔌 Testing database connection...');
    await prisma.$connect();
    console.log('✅ Database connected successfully');

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
╚═══════════════════════════════════════════════════════════╝
      `);
    });
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
