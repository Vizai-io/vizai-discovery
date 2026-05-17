-- Sprint 10: Add OrgIntelligenceSnapshot table
-- Point-in-time intelligence snapshots for archetype tracking, delta views, and alerting.

CREATE TABLE "org_intelligence_snapshots" (
    "id"                  TEXT         NOT NULL,
    "organizationId"      TEXT         NOT NULL,
    "snapshotAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "windowDays"          INTEGER      NOT NULL,
    "archetype"           TEXT         NOT NULL,
    "archetypeStability"  TEXT         NOT NULL,
    "archetypeConfidence" TEXT         NOT NULL,
    "continuityState"     TEXT         NOT NULL,
    "projectedState30d"   TEXT         NOT NULL,
    "projectedState90d"   TEXT         NOT NULL,
    "continuityTrend"     TEXT         NOT NULL,
    "forecastStability"   TEXT         NOT NULL,
    "resilienceScore"     INTEGER      NOT NULL,
    "resilienceState"     TEXT         NOT NULL,
    "riskLevel"           TEXT         NOT NULL,
    "trajectoryType"      TEXT         NOT NULL,
    "momentum"            TEXT         NOT NULL,
    "interventionWindow"  TEXT         NOT NULL,
    "validationResult"    TEXT,
    "forecastCalibration" TEXT,
    "divergenceScore"     INTEGER,
    "forecastVersion"     TEXT         NOT NULL DEFAULT 'v1',

    CONSTRAINT "org_intelligence_snapshots_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "org_intelligence_snapshots_organizationId_snapshotAt_idx"
    ON "org_intelligence_snapshots"("organizationId", "snapshotAt" DESC);

CREATE INDEX "org_intelligence_snapshots_organizationId_windowDays_snapshotAt_idx"
    ON "org_intelligence_snapshots"("organizationId", "windowDays", "snapshotAt" DESC);

ALTER TABLE "org_intelligence_snapshots"
    ADD CONSTRAINT "org_intelligence_snapshots_organizationId_fkey"
    FOREIGN KEY ("organizationId")
    REFERENCES "organizations"("id")
    ON DELETE CASCADE
    ON UPDATE CASCADE;
