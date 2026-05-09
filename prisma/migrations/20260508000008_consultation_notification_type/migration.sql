-- ── Migration: 20260508000008_consultation_notification_type ──────────────────
--
-- Add CONSULTATION_REQUEST_SUBMITTED to the NotificationType enum.
--
-- Purpose:
--   Consultation requests must enter the notification lifecycle (Refinement 4).
--   This value enables NotificationService.consultationRequestSubmitted()
--   to emit a typed, trackable operational event when a consultation is submitted.
--
-- IF NOT EXISTS is supported in PostgreSQL 9.1+ — fully idempotent.
-- ──────────────────────────────────────────────────────────────────────────────

ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'CONSULTATION_REQUEST_SUBMITTED';
