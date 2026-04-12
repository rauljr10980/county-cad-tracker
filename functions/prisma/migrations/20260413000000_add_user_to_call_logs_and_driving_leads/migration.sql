-- Add userId to call_logs so we can track who made each call
ALTER TABLE "call_logs" ADD COLUMN IF NOT EXISTS "userId" TEXT;

-- Add createdById to driving_leads so we can track who added each lead
ALTER TABLE "driving_leads" ADD COLUMN IF NOT EXISTS "createdById" TEXT;

-- Add indexes for stats queries
CREATE INDEX IF NOT EXISTS "call_logs_userId_idx" ON "call_logs"("userId");
CREATE INDEX IF NOT EXISTS "driving_leads_createdById_idx" ON "driving_leads"("createdById");
