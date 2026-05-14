-- CreateTable
CREATE TABLE "crm_leads" (
    "id" TEXT NOT NULL,
    "businessName" TEXT NOT NULL DEFAULT '',
    "ownerName" TEXT NOT NULL,
    "jobTitleIndustry" TEXT NOT NULL DEFAULT '',
    "firm" TEXT NOT NULL DEFAULT '',
    "phone" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL DEFAULT '',
    "industry" TEXT NOT NULL DEFAULT 'Other',
    "city" TEXT NOT NULL DEFAULT '',
    "asset" TEXT NOT NULL DEFAULT '',
    "specialization" TEXT NOT NULL DEFAULT '',
    "metPersonally" TEXT NOT NULL DEFAULT '',
    "source" TEXT NOT NULL DEFAULT 'Referral',
    "websiteStatus" TEXT NOT NULL DEFAULT 'This Month',
    "connectionRating" TEXT NOT NULL DEFAULT 'none',
    "lastConversationNotes" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "kind" TEXT NOT NULL DEFAULT 'industry',
    "ageRange" TEXT,
    "letterCadenceDays" INTEGER,
    "lastContactedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "crm_leads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_deals" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "stage" TEXT NOT NULL DEFAULT 'New Prospect',
    "value" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "expectedCloseDate" TEXT NOT NULL,
    "probability" INTEGER NOT NULL DEFAULT 20,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "crm_deals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_tasks" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "completedAt" TIMESTAMP(3),
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "crm_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_activities" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "crm_activities_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "crm_deals_leadId_key" ON "crm_deals"("leadId");

-- CreateIndex
CREATE INDEX "crm_leads_kind_idx" ON "crm_leads"("kind");
CREATE INDEX "crm_leads_industry_idx" ON "crm_leads"("industry");
CREATE INDEX "crm_leads_createdAt_idx" ON "crm_leads"("createdAt");
CREATE INDEX "crm_deals_stage_idx" ON "crm_deals"("stage");
CREATE INDEX "crm_tasks_leadId_idx" ON "crm_tasks"("leadId");
CREATE INDEX "crm_tasks_completed_idx" ON "crm_tasks"("completed");
CREATE INDEX "crm_tasks_dueAt_idx" ON "crm_tasks"("dueAt");
CREATE INDEX "crm_activities_leadId_idx" ON "crm_activities"("leadId");
CREATE INDEX "crm_activities_timestamp_idx" ON "crm_activities"("timestamp");

-- AddForeignKey
ALTER TABLE "crm_deals" ADD CONSTRAINT "crm_deals_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "crm_leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_tasks" ADD CONSTRAINT "crm_tasks_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "crm_leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_activities" ADD CONSTRAINT "crm_activities_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "crm_leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;
