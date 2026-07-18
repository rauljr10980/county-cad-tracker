CREATE TABLE "eviction_imports" (
  "id" TEXT NOT NULL,
  "filename" TEXT NOT NULL,
  "totalRows" INTEGER NOT NULL DEFAULT 0,
  "createdRows" INTEGER NOT NULL DEFAULT 0,
  "updatedRows" INTEGER NOT NULL DEFAULT 0,
  "unchangedRows" INTEGER NOT NULL DEFAULT 0,
  "rejectedRows" INTEGER NOT NULL DEFAULT 0,
  "errorDetails" JSONB NOT NULL DEFAULT '[]',
  "uploadedBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "eviction_imports_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "eviction_landlords" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "normalizedName" TEXT NOT NULL,
  "isCorporate" BOOLEAN NOT NULL DEFAULT false,
  "contactStage" TEXT NOT NULL DEFAULT 'New',
  "serviceInterests" TEXT[] NOT NULL DEFAULT ARRAY['Undecided']::TEXT[],
  "contacts" JSONB NOT NULL DEFAULT '{"phoneRows":[],"emailRows":[]}',
  "notes" TEXT NOT NULL DEFAULT '',
  "lastContactedAt" TIMESTAMP(3),
  "nextFollowUpAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "eviction_landlords_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "eviction_addresses" (
  "id" TEXT NOT NULL,
  "landlordId" TEXT NOT NULL,
  "address" TEXT NOT NULL,
  "city" TEXT NOT NULL DEFAULT '',
  "state" TEXT NOT NULL DEFAULT '',
  "zip" TEXT NOT NULL DEFAULT '',
  "normalizedAddress" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "eviction_addresses_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "eviction_filings" (
  "id" TEXT NOT NULL,
  "landlordId" TEXT NOT NULL,
  "importId" TEXT NOT NULL,
  "caseNumber" TEXT NOT NULL,
  "filedDate" TIMESTAMP(3),
  "caseStatus" TEXT NOT NULL DEFAULT '',
  "precinct" TEXT NOT NULL DEFAULT '',
  "caseType" TEXT NOT NULL DEFAULT '',
  "corporateFlag" BOOLEAN NOT NULL DEFAULT false,
  "satisfiedFlag" BOOLEAN NOT NULL DEFAULT false,
  "disposition" TEXT NOT NULL DEFAULT '',
  "dispositionDate" TIMESTAMP(3),
  "plaintiffAddress" TEXT NOT NULL DEFAULT '',
  "addressCity" TEXT NOT NULL DEFAULT '',
  "addressState" TEXT NOT NULL DEFAULT '',
  "addressZip" TEXT NOT NULL DEFAULT '',
  "homePhone" TEXT NOT NULL DEFAULT '',
  "cellPhone" TEXT NOT NULL DEFAULT '',
  "workPhone" TEXT NOT NULL DEFAULT '',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "eviction_filings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "eviction_activities" (
  "id" TEXT NOT NULL,
  "landlordId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "eviction_activities_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "eviction_tasks" (
  "id" TEXT NOT NULL,
  "landlordId" TEXT NOT NULL,
  "type" TEXT NOT NULL DEFAULT 'Call',
  "dueAt" TIMESTAMP(3) NOT NULL,
  "completed" BOOLEAN NOT NULL DEFAULT false,
  "completedAt" TIMESTAMP(3),
  "notes" TEXT NOT NULL DEFAULT '',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "eviction_tasks_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "eviction_landlords_normalizedName_key" ON "eviction_landlords"("normalizedName");
CREATE INDEX "eviction_landlords_name_idx" ON "eviction_landlords"("name");
CREATE INDEX "eviction_landlords_isCorporate_idx" ON "eviction_landlords"("isCorporate");
CREATE INDEX "eviction_landlords_contactStage_idx" ON "eviction_landlords"("contactStage");
CREATE INDEX "eviction_landlords_serviceInterests_idx" ON "eviction_landlords" USING GIN ("serviceInterests");
CREATE UNIQUE INDEX "eviction_addresses_landlordId_normalizedAddress_key" ON "eviction_addresses"("landlordId", "normalizedAddress");
CREATE INDEX "eviction_addresses_landlordId_idx" ON "eviction_addresses"("landlordId");
CREATE UNIQUE INDEX "eviction_filings_landlordId_caseNumber_key" ON "eviction_filings"("landlordId", "caseNumber");
CREATE INDEX "eviction_filings_caseNumber_idx" ON "eviction_filings"("caseNumber");
CREATE INDEX "eviction_filings_filedDate_idx" ON "eviction_filings"("filedDate");
CREATE INDEX "eviction_filings_caseStatus_idx" ON "eviction_filings"("caseStatus");
CREATE INDEX "eviction_filings_precinct_idx" ON "eviction_filings"("precinct");
CREATE INDEX "eviction_filings_corporateFlag_idx" ON "eviction_filings"("corporateFlag");
CREATE INDEX "eviction_imports_createdAt_idx" ON "eviction_imports"("createdAt");
CREATE INDEX "eviction_activities_landlordId_createdAt_idx" ON "eviction_activities"("landlordId", "createdAt");
CREATE INDEX "eviction_tasks_landlordId_idx" ON "eviction_tasks"("landlordId");
CREATE INDEX "eviction_tasks_dueAt_idx" ON "eviction_tasks"("dueAt");
CREATE INDEX "eviction_tasks_completed_idx" ON "eviction_tasks"("completed");

ALTER TABLE "eviction_addresses" ADD CONSTRAINT "eviction_addresses_landlordId_fkey" FOREIGN KEY ("landlordId") REFERENCES "eviction_landlords"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "eviction_filings" ADD CONSTRAINT "eviction_filings_landlordId_fkey" FOREIGN KEY ("landlordId") REFERENCES "eviction_landlords"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "eviction_filings" ADD CONSTRAINT "eviction_filings_importId_fkey" FOREIGN KEY ("importId") REFERENCES "eviction_imports"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "eviction_activities" ADD CONSTRAINT "eviction_activities_landlordId_fkey" FOREIGN KEY ("landlordId") REFERENCES "eviction_landlords"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "eviction_tasks" ADD CONSTRAINT "eviction_tasks_landlordId_fkey" FOREIGN KEY ("landlordId") REFERENCES "eviction_landlords"("id") ON DELETE CASCADE ON UPDATE CASCADE;
