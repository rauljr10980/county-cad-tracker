-- Additive changes; existing records and personal follow-ups are preserved.
ALTER TABLE "properties" ADD COLUMN IF NOT EXISTS "ownerIsLlc" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "foreclosed" ADD COLUMN IF NOT EXISTS "ownerIsLlc" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "driving_leads" ADD COLUMN IF NOT EXISTS "ownerIsLlc" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "follow_ups" ADD COLUMN IF NOT EXISTS "isTeamAppointment" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "follow_ups" ADD COLUMN IF NOT EXISTS "appointmentKind" TEXT;
ALTER TABLE "follow_ups" ADD COLUMN IF NOT EXISTS "endAt" TIMESTAMP(3);
