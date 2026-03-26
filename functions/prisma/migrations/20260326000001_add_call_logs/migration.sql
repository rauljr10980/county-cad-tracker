CREATE TABLE IF NOT EXISTS "call_logs" (
  "id"            TEXT NOT NULL,
  "calledAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "propertyId"    TEXT,
  "drivingLeadId" TEXT,
  "phoneNumber"   TEXT,

  CONSTRAINT "call_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "call_logs_calledAt_idx"      ON "call_logs"("calledAt");
CREATE INDEX IF NOT EXISTS "call_logs_propertyId_idx"    ON "call_logs"("propertyId");
CREATE INDEX IF NOT EXISTS "call_logs_drivingLeadId_idx" ON "call_logs"("drivingLeadId");
