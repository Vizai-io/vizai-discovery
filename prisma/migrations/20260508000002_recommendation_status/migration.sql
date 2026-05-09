-- Phase 1.7: Add recommendation workflow status fields
-- Adds RecommendationStatus enum and status + timestamp columns

-- CreateEnum
CREATE TYPE "RecommendationStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'COMPLETED', 'DISMISSED');

-- AlterTable: add status and timestamp columns (all nullable/defaulted — additive only)
ALTER TABLE "recommendations"
  ADD COLUMN "status"       "RecommendationStatus" NOT NULL DEFAULT 'OPEN',
  ADD COLUMN "openedAt"     TIMESTAMP(3),
  ADD COLUMN "inProgressAt" TIMESTAMP(3),
  ADD COLUMN "completedAt"  TIMESTAMP(3),
  ADD COLUMN "dismissedAt"  TIMESTAMP(3);

-- Index on status for filtered queries
CREATE INDEX "recommendations_status_idx" ON "recommendations"("status");
