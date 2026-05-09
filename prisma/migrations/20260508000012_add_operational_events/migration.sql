-- Sprint 5: Add operational_events table for platform observability.
-- Canonical immutable event log emitted by OperationalEventService at every
-- lifecycle boundary (scans, onboarding, rankings, share, admin actions).

CREATE TABLE "operational_events" (
    "id"             TEXT NOT NULL,
    "organizationId" TEXT,
    "userId"         TEXT,
    "eventType"      TEXT NOT NULL,
    "severity"       TEXT NOT NULL,
    "source"         TEXT NOT NULL,
    "traceId"        TEXT NOT NULL,
    "entityType"     TEXT,
    "entityId"       TEXT,
    "message"        TEXT NOT NULL,
    "metadataJson"   JSONB,
    "resolvedAt"     TIMESTAMP(3),
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "operational_events_pkey" PRIMARY KEY ("id")
);

-- Primary time-series index
CREATE INDEX "operational_events_createdAt_idx"
    ON "operational_events"("createdAt");

-- Per-org event timeline
CREATE INDEX "operational_events_organizationId_createdAt_idx"
    ON "operational_events"("organizationId", "createdAt");

-- Event type aggregation (counts by type, drift detection, assertion escalation)
CREATE INDEX "operational_events_eventType_createdAt_idx"
    ON "operational_events"("eventType", "createdAt");

-- Severity-based alerting queries
CREATE INDEX "operational_events_severity_createdAt_idx"
    ON "operational_events"("severity", "createdAt");
