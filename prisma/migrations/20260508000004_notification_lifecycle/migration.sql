-- Phase 1.8 Refinements: notification lifecycle + grouping
-- Additive only — no existing data altered

-- Add groupKey for lightweight notification grouping
ALTER TABLE "notifications"
  ADD COLUMN "groupKey"    TEXT,
  ADD COLUMN "archivedAt"  TIMESTAMP(3);

-- Index for lifecycle queries (archival + exclusion from default fetch)
CREATE INDEX "notifications_organizationId_archivedAt_idx"
  ON "notifications"("organizationId", "archivedAt");
