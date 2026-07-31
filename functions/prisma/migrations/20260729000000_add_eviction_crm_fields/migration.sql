-- Lead assignment. SET NULL so removing a user unassigns their leads
-- rather than cascading the landlord rows away.
ALTER TABLE "eviction_landlords" ADD COLUMN "assignedToId" TEXT;

ALTER TABLE "eviction_landlords"
  ADD CONSTRAINT "eviction_landlords_assignedToId_fkey"
  FOREIGN KEY ("assignedToId") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "eviction_landlords_assignedToId_idx"
  ON "eviction_landlords"("assignedToId");

-- Widen the stage vocabulary from 7 values to 12.
ALTER TABLE "eviction_landlords" ALTER COLUMN "contactStage" SET DEFAULT 'New Lead';

UPDATE "eviction_landlords" SET "contactStage" = 'New Lead'       WHERE "contactStage" = 'New';
UPDATE "eviction_landlords" SET "contactStage" = 'Follow-Up'      WHERE "contactStage" = 'Follow Up';
UPDATE "eviction_landlords" SET "contactStage" = 'Interested'     WHERE "contactStage" = 'Qualified';
UPDATE "eviction_landlords" SET "contactStage" = 'Do Not Contact' WHERE "contactStage" = 'Do Not Call';

-- Surface anything the mapping did not cover instead of coercing it.
DO $$
DECLARE
  stray RECORD;
BEGIN
  FOR stray IN
    SELECT "contactStage", COUNT(*) AS n
    FROM "eviction_landlords"
    WHERE "contactStage" NOT IN (
      'New Lead','Researching','Ready to Contact','Attempted Contact',
      'Contacted','Follow-Up','Appointment Scheduled','Interested',
      'Not Interested','Under Contract','Closed','Do Not Contact'
    )
    GROUP BY "contactStage"
  LOOP
    RAISE WARNING 'Unmapped contactStage % on % row(s) — left untouched', stray."contactStage", stray.n;
  END LOOP;
END $$;
