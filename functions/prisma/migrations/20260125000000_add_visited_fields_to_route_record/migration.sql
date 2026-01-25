-- AlterTable
ALTER TABLE "route_records" ADD COLUMN "visited" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "visitedAt" TIMESTAMP(3),
ADD COLUMN "visitedBy" TEXT;
