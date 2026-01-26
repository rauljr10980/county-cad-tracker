-- CreateEnum
CREATE TYPE "ZoneType" AS ENUM ('RECTANGLE', 'CIRCLE', 'POLYGON');

-- CreateTable
CREATE TABLE "zones" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "type" "ZoneType" NOT NULL,
    "color" TEXT NOT NULL,
    "boundsNorth" DOUBLE PRECISION NOT NULL,
    "boundsSouth" DOUBLE PRECISION NOT NULL,
    "boundsEast" DOUBLE PRECISION NOT NULL,
    "boundsWest" DOUBLE PRECISION NOT NULL,
    "centerLat" DOUBLE PRECISION,
    "centerLng" DOUBLE PRECISION,
    "radius" DOUBLE PRECISION,
    "polygon" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "zones_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "zones_type_idx" ON "zones"("type");

-- CreateIndex
CREATE INDEX "zones_createdAt_idx" ON "zones"("createdAt");
