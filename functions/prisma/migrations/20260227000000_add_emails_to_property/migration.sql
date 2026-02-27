-- AlterTable
ALTER TABLE "properties" ADD COLUMN "emails" TEXT[] DEFAULT ARRAY[]::TEXT[];
