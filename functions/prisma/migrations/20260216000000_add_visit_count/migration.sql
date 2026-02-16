-- Add visitCount to track number of times a pre-foreclosure property has been visited
ALTER TABLE "foreclosed" ADD COLUMN "visitCount" INTEGER NOT NULL DEFAULT 0;

-- Backfill: any record already marked as visited should have visitCount = 1
UPDATE "foreclosed" SET "visitCount" = 1 WHERE "visited" = true;
