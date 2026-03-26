-- Add lastCallTime column to properties table
ALTER TABLE "properties" ADD COLUMN IF NOT EXISTS "lastCallTime" TIMESTAMP(3);

-- Add lastCallTime column to driving_leads table
ALTER TABLE "driving_leads" ADD COLUMN IF NOT EXISTS "lastCallTime" TIMESTAMP(3);
