-- DropIndex
DROP INDEX IF EXISTS "properties_accountNumber_key";

-- CreateIndex (keep the regular index for performance)
CREATE INDEX IF NOT EXISTS "properties_accountNumber_idx" ON "properties"("accountNumber");
