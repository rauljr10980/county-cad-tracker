-- CreateTable: activity_logs for tracking contacts, appointments, contracts
CREATE TABLE IF NOT EXISTS "activity_logs" (
    "id"            TEXT NOT NULL,
    "type"          TEXT NOT NULL,
    "userId"        TEXT,
    "propertyId"    TEXT,
    "drivingLeadId" TEXT,
    "notes"         TEXT,
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "activity_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "activity_logs_type_idx"      ON "activity_logs"("type");
CREATE INDEX IF NOT EXISTS "activity_logs_userId_idx"    ON "activity_logs"("userId");
CREATE INDEX IF NOT EXISTS "activity_logs_createdAt_idx" ON "activity_logs"("createdAt");
