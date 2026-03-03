-- Add contacts fields to driving_leads table
ALTER TABLE "driving_leads" ADD COLUMN IF NOT EXISTS "phoneNumbers" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "driving_leads" ADD COLUMN IF NOT EXISTS "ownerPhoneIndex" INTEGER;
ALTER TABLE "driving_leads" ADD COLUMN IF NOT EXISTS "emails" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "driving_leads" ADD COLUMN IF NOT EXISTS "contacts" JSONB;
ALTER TABLE "driving_leads" ADD COLUMN IF NOT EXISTS "ownerName" TEXT;
