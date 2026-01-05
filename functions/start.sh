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

# Create database tables with retries
echo "⏳ Creating database tables..."
MAX_RETRIES=5
RETRY_COUNT=0

while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
  if npx prisma db push --accept-data-loss --skip-generate; then
    echo "✅ Database tables created successfully"
    break
  else
    RETRY_COUNT=$((RETRY_COUNT + 1))
    if [ $RETRY_COUNT -lt $MAX_RETRIES ]; then
      echo "⚠️  Database push failed, retrying in 5 seconds... (Attempt $RETRY_COUNT/$MAX_RETRIES)"
      sleep 5
    else
      echo "❌ Failed to create database tables after $MAX_RETRIES attempts"
      echo "Check your DATABASE_URL connection string."
      exit 1
    fi
  fi
done

# Start the application
echo "✅ Starting application..."
exec node src/index.js
