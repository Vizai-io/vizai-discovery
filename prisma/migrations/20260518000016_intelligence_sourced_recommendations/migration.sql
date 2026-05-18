-- Sprint 17: Intelligence-sourced recommendations
-- Makes perceptionScanId nullable and adds source/organizationId fields
-- so intelligence pipeline can create recommendations without a scan.

-- Make perceptionScanId nullable
ALTER TABLE "recommendations"
  ALTER COLUMN "perceptionScanId" DROP NOT NULL;

-- Add source and organizationId columns
ALTER TABLE "recommendations"
  ADD COLUMN "source"         TEXT,
  ADD COLUMN "organizationId" TEXT;

-- Index for dedup lookups by org + source + status
CREATE INDEX "recommendations_organizationId_source_status_idx"
  ON "recommendations"("organizationId", "source", "status");
