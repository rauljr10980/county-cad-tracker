-- Add workflow decision tree fields to PreForeclosure table
ALTER TABLE "foreclosed" ADD COLUMN "workflowStage" TEXT NOT NULL DEFAULT 'not_started';
ALTER TABLE "foreclosed" ADD COLUMN "workflowLog" JSONB NOT NULL DEFAULT '[]';

-- Index for filtering by workflow stage
CREATE INDEX "foreclosed_workflowStage_idx" ON "foreclosed"("workflowStage");
