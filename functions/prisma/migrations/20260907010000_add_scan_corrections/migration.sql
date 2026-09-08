CREATE TABLE "scan_corrections" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "rawOcrText" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "scan_corrections_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "scan_correction_fields" (
    "scanId" TEXT NOT NULL,
    "fieldName" TEXT NOT NULL,
    "predictedValue" TEXT NOT NULL,
    "finalValue" TEXT NOT NULL,
    CONSTRAINT "scan_correction_fields_pkey" PRIMARY KEY ("scanId", "fieldName")
);
CREATE INDEX "scan_corrections_userId_createdAt_idx" ON "scan_corrections"("userId", "createdAt");
CREATE INDEX "scan_correction_fields_fieldName_idx" ON "scan_correction_fields"("fieldName");
ALTER TABLE "scan_corrections" ADD CONSTRAINT "scan_corrections_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "scan_correction_fields" ADD CONSTRAINT "scan_correction_fields_scanId_fkey" FOREIGN KEY ("scanId") REFERENCES "scan_corrections"("id") ON DELETE CASCADE ON UPDATE CASCADE;
