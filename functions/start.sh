#!/bin/sh

echo "🚀 Starting County CAD Tracker API..."
echo "📊 Environment: ${NODE_ENV:-development}"
echo "🔌 Port: ${PORT:-8080}"

# Check if DATABASE_URL is set
if [ -z "$DATABASE_URL" ]; then
  echo "❌ ERROR: DATABASE_URL is not set!"
  echo "Please add DATABASE_URL to your Railway service variables."
  exit 1
fi

echo "✅ DATABASE_URL is set"

# Generate Prisma Client
echo "📦 Generating Prisma Client..."
npx prisma generate || echo "⚠️ Prisma generate failed, trying to continue..."

echo "✅ Prisma Client generated"

# Create database tables (don't exit on failure - app will retry connection)
echo "⏳ Syncing database schema..."
npx prisma db push --accept-data-loss || echo "⚠️ Database push failed - app will retry on startup"

# One-time data migrations (non-critical)
echo "🔄 Running data migrations..."
echo "UPDATE \"PreForeclosure\" SET type = 'Mortgage' WHERE type = 'NOTICE_OF_FORECLOSURE';" | npx prisma db execute --stdin 2>/dev/null && echo "✅ Type migration complete" || echo "⚠️ Type migration skipped"
echo "UPDATE \"PreForeclosure\" SET \"ownerLookupStatus\" = NULL WHERE \"ownerLookupStatus\" = 'failed' AND \"ownerName\" IS NULL;" | npx prisma db execute --stdin 2>/dev/null && echo "✅ Reset failed owner lookups" || echo "⚠️ Owner lookup reset skipped"

# Start the application
echo "✅ Starting application..."
exec node src/index.js
