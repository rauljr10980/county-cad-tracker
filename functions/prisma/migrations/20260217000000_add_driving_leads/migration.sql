-- CreateEnum
CREATE TYPE "DrivingLeadStatus" AS ENUM ('NEW', 'RESEARCHING', 'CONTACTED', 'UNDER_CONTRACT', 'DEAD');

-- CreateTable
CREATE TABLE "driving_leads" (
    "id" TEXT NOT NULL,
    "rawAddress" TEXT NOT NULL,
    "street" TEXT NOT NULL,
    "city" TEXT NOT NULL DEFAULT 'San Antonio',
    "state" TEXT NOT NULL DEFAULT 'TX',
    "zip" TEXT NOT NULL DEFAULT '',
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "notes" TEXT,
    "status" "DrivingLeadStatus" NOT NULL DEFAULT 'NEW',
    "loggedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "driving_leads_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "driving_leads_status_idx" ON "driving_leads"("status");

-- CreateIndex
CREATE INDEX "driving_leads_createdAt_idx" ON "driving_leads"("createdAt");
