-- Sprint 16: Add alert resolution workflow fields to notifications table.

ALTER TABLE "notifications"
  ADD COLUMN "acknowledgedAt"  TIMESTAMP(3),
  ADD COLUMN "resolvedAt"      TIMESTAMP(3),
  ADD COLUMN "resolvedBy"      TEXT,
  ADD COLUMN "resolutionNote"  TEXT;

CREATE INDEX "notifications_organizationId_resolvedAt_idx"
  ON "notifications"("organizationId", "resolvedAt");
