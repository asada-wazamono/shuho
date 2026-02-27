-- AlterTable
ALTER TABLE "Project" ADD COLUMN "proposalEffortType" TEXT;

-- Backfill: existing proposal projects default to existing_continuation
UPDATE "Project"
SET "proposalEffortType" = 'existing_continuation'
WHERE "status" != 'good' AND "proposalEffortType" IS NULL;
