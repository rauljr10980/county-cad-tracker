-- Add visited fields to Property model
ALTER TABLE "properties" ADD COLUMN IF NOT EXISTS "visited" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "properties" ADD COLUMN IF NOT EXISTS "visitedAt" TIMESTAMP(3);
ALTER TABLE "properties" ADD COLUMN IF NOT EXISTS "visitedBy" TEXT;
