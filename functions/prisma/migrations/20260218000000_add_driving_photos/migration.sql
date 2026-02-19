-- CreateTable
CREATE TABLE "driving_photos" (
    "id" TEXT NOT NULL,
    "data" TEXT NOT NULL,
    "orderIndex" INTEGER NOT NULL DEFAULT 0,
    "leadId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "driving_photos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "driving_photos_leadId_idx" ON "driving_photos"("leadId");

-- AddForeignKey
ALTER TABLE "driving_photos" ADD CONSTRAINT "driving_photos_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "driving_leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;
