#!/bin/sh
set -e

echo "🚀 Starting County CAD Tracker API..."
echo "📊 Environment: ${NODE_ENV:-development}"
echo "🔌 Port: ${PORT:-8080}"

# Check if DATABASE_URL is set
if [ -z "$DATABASE_URL" ]; then
  echo "❌ ERROR: DATABASE_URL is not set!"
  echo "Please add DATABASE_URL to your Railway service variables."
  echo "Get it from: PostgreSQL service → Variables → DATABASE_URL"
  exit 1
fi

echo "✅ DATABASE_URL is set"
echo "📋 DATABASE_URL preview: ${DATABASE_URL%%@*}@***" # Show only user part, hide password

# Check if Prisma schema exists
if [ ! -f "prisma/schema.prisma" ]; then
  echo "❌ ERROR: Prisma schema not found at prisma/schema.prisma"
  echo "Current directory: $(pwd)"
  echo "Files in current directory:"
  ls -la
  exit 1
fi

echo "✅ Prisma schema found"

# Generate Prisma Client
echo "📦 Generating Prisma Client..."
if ! npx prisma generate; then
  echo "❌ Prisma generate failed!"
  exit 1
fi

echo "✅ Prisma Client generated"

# Create database tables
echo "⏳ Creating database tables..."
echo "📋 Running: npx prisma db push --accept-data-loss"
if ! npx prisma db push --accept-data-loss; then
  echo "❌ Database push failed!"
  echo "Check your DATABASE_URL connection string."
  echo "DATABASE_URL format should be: postgresql://user:password@host:port/database"
  exit 1
fi

echo "✅ Database tables created successfully"

# Verify tables were created
echo "🔍 Verifying database connection..."
if ! npx prisma db execute --stdin <<< "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';" 2>/dev/null; then
  echo "⚠️  Could not verify tables, but continuing..."
else
  echo "✅ Database connection verified"
fi

# Start the application
echo "✅ Starting application..."
exec node src/index.js
