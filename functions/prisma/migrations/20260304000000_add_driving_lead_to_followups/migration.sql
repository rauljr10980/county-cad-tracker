-- Add drivingLeadId to follow_ups table so d4$ leads can have follow-ups on the calendar
ALTER TABLE "follow_ups" ADD COLUMN IF NOT EXISTS "drivingLeadId" TEXT;

-- Allow follow_ups to exist without propertyId or preforeclosureId (already nullable, just adding new option)
CREATE INDEX IF NOT EXISTS "follow_ups_drivingLeadId_idx" ON "follow_ups"("drivingLeadId");

-- Foreign key constraint
ALTER TABLE "follow_ups" ADD CONSTRAINT "follow_ups_drivingLeadId_fkey"
  FOREIGN KEY ("drivingLeadId") REFERENCES "driving_leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;
