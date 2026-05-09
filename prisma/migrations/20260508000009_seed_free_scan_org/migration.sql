-- Sprint 3 Task 1: Seed the "free-scan" sentinel organization.
--
-- This row is the Postgres anchor for all public free-scan submissions.
-- Every PerceptionScan created via POST /api/free-scan uses organizationId = 'free-scan'.
-- The corresponding CompanyProfile also uses this org.
--
-- Only free-scan org rows are publicly readable via GET /api/share/[id].
-- Org is permanently INACTIVE to prevent it from appearing in admin org lists.
-- sourceType = 'FREE_SCAN' is reserved for all scans under this org.

INSERT INTO organizations (id, name, slug, tier, "isActive", "createdAt", "updatedAt")
VALUES ('free-scan', 'Free Scan (Public)', 'free-scan', 'STARTER', false, NOW(), NOW())
ON CONFLICT (id) DO NOTHING;
