-- Parking is "not now", which is different from a stage. Keeping it in its own
-- column means a parked lead retains whatever stage it had reached, so
-- un-parking restores the real position instead of guessing one.
ALTER TABLE "eviction_landlords" ADD COLUMN "parkedAt" TIMESTAMP(3);

-- The parked queue filters on this, and the four active queues exclude on it.
CREATE INDEX "eviction_landlords_parkedAt_idx" ON "eviction_landlords"("parkedAt");

-- Every active queue also filters on the follow-up date.
CREATE INDEX "eviction_landlords_nextFollowUpAt_idx" ON "eviction_landlords"("nextFollowUpAt");
