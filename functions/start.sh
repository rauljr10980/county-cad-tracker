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

# Generate Prisma Client (in case it wasn't generated during build)
echo "📦 Generating Prisma Client..."
npx prisma generate || echo "⚠️  Prisma generate failed, continuing..."

# Create database tables
echo "⏳ Creating database tables..."
npx prisma db push --accept-data-loss || {
  echo "❌ Database push failed!"
  echo "Check your DATABASE_URL connection string."
  exit 1
}

echo "✅ Database tables created successfully"

# Start the application
echo "✅ Starting application..."
exec node src/index.js
