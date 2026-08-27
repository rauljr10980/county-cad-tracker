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

# Eviction stage vocabulary: 7 legacy values -> 12.
#
# This lives here rather than in the migration that declares it
# (prisma/migrations/20260729000000_add_eviction_crm_fields) because this
# script runs `prisma db push`, which syncs the schema and never executes
# anything in migrations/. The column changes in that migration land via
# db push; these row updates would not run at all without these lines.
#
# Idempotent: after the first run each statement matches zero rows. Values
# outside the mapping are left untouched by design, so unexpected data stays
# visible instead of being folded into a real stage.
echo "🔄 Remapping eviction contactStage vocabulary..."
echo "UPDATE \"eviction_landlords\" SET \"contactStage\" = 'New Lead' WHERE \"contactStage\" = 'New';" | npx prisma db execute --stdin 2>/dev/null && echo "✅ New -> New Lead" || echo "⚠️ New -> New Lead skipped"
echo "UPDATE \"eviction_landlords\" SET \"contactStage\" = 'Follow-Up' WHERE \"contactStage\" = 'Follow Up';" | npx prisma db execute --stdin 2>/dev/null && echo "✅ Follow Up -> Follow-Up" || echo "⚠️ Follow Up -> Follow-Up skipped"
echo "UPDATE \"eviction_landlords\" SET \"contactStage\" = 'Interested' WHERE \"contactStage\" = 'Qualified';" | npx prisma db execute --stdin 2>/dev/null && echo "✅ Qualified -> Interested" || echo "⚠️ Qualified -> Interested skipped"
echo "UPDATE \"eviction_landlords\" SET \"contactStage\" = 'Do Not Contact' WHERE \"contactStage\" = 'Do Not Call';" | npx prisma db execute --stdin 2>/dev/null && echo "✅ Do Not Call -> Do Not Contact" || echo "⚠️ Do Not Call -> Do Not Contact skipped"

# Assign pre-isolation CRM leads to the oldest account.
#
# This lives here rather than in prisma/migrations/ because this script runs
# `prisma db push`, which syncs the schema and never executes anything in
# migrations/. The userId column lands via db push; this row update would not
# run at all without these lines.
#
# Idempotent: after the first run no rows have a null userId. The EXISTS guard
# makes it a no-op on an empty users table rather than writing NULL over NULL.
echo "🔄 Assigning unowned CRM leads to the oldest account..."
echo "UPDATE \"crm_leads\" SET \"userId\" = (SELECT id FROM users ORDER BY \"createdAt\" ASC LIMIT 1) WHERE \"userId\" IS NULL AND EXISTS (SELECT 1 FROM users);" | npx prisma db execute --stdin 2>/dev/null && echo "✅ CRM backfill complete" || echo "⚠️ CRM backfill skipped"

# Start the application
echo "✅ Starting application..."
exec node src/index.js
