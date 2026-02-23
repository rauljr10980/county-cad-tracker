-- CreateTable
CREATE TABLE "follow_ups" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "completedAt" TIMESTAMP(3),
    "propertyId" TEXT,
    "preforeclosureId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "follow_ups_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "follow_ups_date_idx" ON "follow_ups"("date");
CREATE INDEX "follow_ups_propertyId_idx" ON "follow_ups"("propertyId");
CREATE INDEX "follow_ups_preforeclosureId_idx" ON "follow_ups"("preforeclosureId");
CREATE INDEX "follow_ups_completed_idx" ON "follow_ups"("completed");
CREATE INDEX "follow_ups_date_completed_idx" ON "follow_ups"("date", "completed");

-- AddForeignKey
ALTER TABLE "follow_ups" ADD CONSTRAINT "follow_ups_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "follow_ups" ADD CONSTRAINT "follow_ups_preforeclosureId_fkey" FOREIGN KEY ("preforeclosureId") REFERENCES "foreclosed"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "follow_ups" ADD CONSTRAINT "follow_ups_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
