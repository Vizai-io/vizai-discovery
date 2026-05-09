-- ── Migration: 20260508000007_seed_unassigned_org ─────────────────────────────
--
-- Seed the "unassigned" organization sentinel row.
--
-- Purpose:
--   UserRepository.upsertOnLogin() hardcodes organizationId = "unassigned"
--   for all new users. The User.organizationId FK targets organizations.id.
--   Without this row, every first-login attempt throws P2003 (FK violation),
--   silently fails, and leaves users with no Postgres identity.
--
-- This row is a holding area only. Admins assign users to real organizations
-- via the admin control center. Users in "unassigned" are blocked from running
-- scans (enforced in /api/scan/route.ts — returns 403).
--
-- ON CONFLICT DO NOTHING makes this migration fully idempotent.
-- Safe to run multiple times across all environments.
-- ──────────────────────────────────────────────────────────────────────────────

INSERT INTO organizations (
  id,
  name,
  slug,
  tier,
  "isActive",
  "createdAt",
  "updatedAt"
)
VALUES (
  'unassigned',
  'Unassigned',
  'unassigned',
  'STARTER',
  true,
  NOW(),
  NOW()
)
ON CONFLICT (id) DO NOTHING;
