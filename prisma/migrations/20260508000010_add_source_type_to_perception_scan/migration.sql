-- Sprint 3 Refinement 1: Add sourceType to perception_scans.
--
-- Provides operational lineage between free scans, demo seeds, managed org scans,
-- and trial scans. Stored as a nullable string to avoid enum rigidity during
-- stabilization. Will be converted to a proper enum in Sprint 4.
--
-- Intended values: 'FREE_SCAN' | 'DEMO_SEED' | 'MANAGED' | 'TRIAL'
-- Existing rows default to NULL (retroactively = MANAGED or DEMO_SEED).

ALTER TABLE perception_scans
  ADD COLUMN IF NOT EXISTS "sourceType" TEXT;
