#!/bin/sh
set -e

echo "🚀 Starting County CAD Tracker API..."
echo "📊 Environment: ${NODE_ENV:-development}"
echo "🔌 Port: ${PORT:-8080}"

# Wait for database to be ready
echo "⏳ Waiting for database connection..."
npx prisma db push --accept-data-loss || echo "⚠️  Database push failed, continuing..."

# Run migrations
echo "🔄 Running database migrations..."
npx prisma migrate deploy || echo "⚠️  Migrations failed, but continuing..."

# Start the application
echo "✅ Starting application..."
exec node src/index.js
