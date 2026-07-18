-- Server-only data boundary for the Supabase public schema.
--
-- Vizai Discovery accesses application tables through Prisma on the server.
-- Browser roles must not receive direct table or sequence privileges. RLS is
-- enabled as defense in depth.

ALTER TABLE "service_api_keys" ALTER COLUMN "role" SET DEFAULT 'CLIENT';
ALTER TABLE "company_profiles"
  ADD COLUMN "registryListingConsentAt" TIMESTAMP(3),
  ADD COLUMN "registryListingConsentedBy" TEXT;

CREATE TABLE "rate_limit_counters" (
  "key" TEXT NOT NULL,
  "count" INTEGER NOT NULL,
  "windowStart" TIMESTAMP(3) NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "rate_limit_counters_pkey" PRIMARY KEY ("key")
);

CREATE INDEX "rate_limit_counters_expires_idx"
  ON "rate_limit_counters"("expiresAt");

CREATE UNIQUE INDEX "registry_crawl_runs_one_active_per_target"
  ON "registry_crawl_runs"("targetId")
  WHERE "status" IN ('QUEUED', 'PLANNING', 'CRAWLING', 'EXTRACTING', 'ASSESSING', 'PAUSED');

DO $$
DECLARE
  relation RECORD;
BEGIN
  FOR relation IN
    SELECT schemaname, tablename
    FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename <> '_prisma_migrations'
  LOOP
    EXECUTE format(
      'ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY',
      relation.schemaname,
      relation.tablename
    );

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
      EXECUTE format(
        'REVOKE ALL PRIVILEGES ON TABLE %I.%I FROM anon',
        relation.schemaname,
        relation.tablename
      );
    END IF;

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      EXECUTE format(
        'REVOKE ALL PRIVILEGES ON TABLE %I.%I FROM authenticated',
        relation.schemaname,
        relation.tablename
      );
    END IF;
  END LOOP;

  FOR relation IN
    SELECT sequence_schema, sequence_name
    FROM information_schema.sequences
    WHERE sequence_schema = 'public'
  LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
      EXECUTE format(
        'REVOKE ALL PRIVILEGES ON SEQUENCE %I.%I FROM anon',
        relation.sequence_schema,
        relation.sequence_name
      );
    END IF;

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      EXECUTE format(
        'REVOKE ALL PRIVILEGES ON SEQUENCE %I.%I FROM authenticated',
        relation.sequence_schema,
        relation.sequence_name
      );
    END IF;
  END LOOP;
END
$$;
