/**
 * Start the backend server with proper error handling
 */

require('dotenv').config();

// Check required environment variables
if (!process.env.DATABASE_URL) {
  console.error('❌ ERROR: DATABASE_URL is not set!');
  console.error('');
  console.error('Please add DATABASE_URL to your .env file:');
  console.error('   DATABASE_URL=postgresql://user:password@host:port/database');
  console.error('');
  console.error('Get it from: Railway → PostgreSQL service → Variables → DATABASE_URL');
  process.exit(1);
}

console.log('✅ DATABASE_URL is set');
console.log('');

// Start the server
console.log('🚀 Starting server...');
console.log('');

// Import and start the server
require('./src/index.js');


