-- Sprint 4 — Task 1: Add ranking_snapshots table
-- Stores industry leaderboard snapshots as JSON blobs.
-- JSON strategy avoids over-engineering a relational RankingEntry table
-- for what is currently deterministic/simulated data.
-- See: Refinement 1 (retention awareness), Refinement 2 (generationSeed).

CREATE TABLE IF NOT EXISTS "ranking_snapshots" (
    "id"           TEXT NOT NULL,
    "industry"     TEXT NOT NULL,
    "region"       TEXT NOT NULL,
    "snapshotDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "entriesJson"  JSONB NOT NULL,
    "metadataJson" JSONB NOT NULL DEFAULT '{}',
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ranking_snapshots_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ranking_snapshots_industry_region_snapshotDate_idx"
    ON "ranking_snapshots"("industry", "region", "snapshotDate" DESC);
