-- Add workflow decision tree fields to properties table
ALTER TABLE "properties" ADD COLUMN "workflowStage" TEXT NOT NULL DEFAULT 'not_started';
ALTER TABLE "properties" ADD COLUMN "workflowLog" JSONB NOT NULL DEFAULT '[]';

-- Index for filtering by workflow stage
CREATE INDEX "properties_workflowStage_idx" ON "properties"("workflowStage");
