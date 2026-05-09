-- Phase 1.8: Add notification persistence system
-- Additive only — no existing tables altered

-- Create enums
CREATE TYPE "NotificationType" AS ENUM (
  'SCAN_COMPLETED',
  'SCAN_FAILED',
  'VISIBILITY_IMPROVED',
  'VISIBILITY_DECLINED',
  'RECOMMENDATION_BACKLOG_GROWING',
  'RECOMMENDATION_MILESTONE',
  'ONBOARDING_COMPLETE',
  'BILLING_PAYMENT_FAILED',
  'BILLING_WARNING'
);

CREATE TYPE "NotificationSeverity" AS ENUM (
  'INFO',
  'SUCCESS',
  'WARNING',
  'CRITICAL'
);

-- Create notifications table
CREATE TABLE "notifications" (
  "id"                       TEXT NOT NULL,
  "organizationId"           TEXT NOT NULL,
  "type"                     "NotificationType" NOT NULL,
  "severity"                 "NotificationSeverity" NOT NULL,
  "title"                    TEXT NOT NULL,
  "message"                  TEXT NOT NULL,
  "isRead"                   BOOLEAN NOT NULL DEFAULT false,
  "createdAt"                TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "relatedScanId"            TEXT,
  "relatedRecommendationId"  TEXT,

  CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- FK to organizations
ALTER TABLE "notifications"
  ADD CONSTRAINT "notifications_organizationId_fkey"
  FOREIGN KEY ("organizationId")
  REFERENCES "organizations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Indexes
CREATE INDEX "notifications_organizationId_isRead_idx"  ON "notifications"("organizationId", "isRead");
CREATE INDEX "notifications_organizationId_createdAt_idx" ON "notifications"("organizationId", "createdAt" DESC);
