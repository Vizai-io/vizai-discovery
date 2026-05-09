/**
 * @fileOverview Notification dispatch layer.
 *
 * Thin wrapper around NotificationService that preserves the existing
 * call-site interface (`sendNotification(payload)`).
 *
 * All persistence, dedup, and template logic lives in notification.service.ts.
 * Do NOT add notification logic here.
 *
 * To add email delivery: add a Resend call in notification.service.ts
 * after the `NotificationRepository.create()` call. Call sites do not change.
 */

import { NotificationService } from "@/lib/services/notification.service";

export type NotificationPayload =
  | {
      type: "scan_complete";
      organizationId: string;
      scanId: string;
      businessName: string;
    }
  | {
      type: "scan_failed";
      organizationId: string;
      scheduleId: string;
      businessName: string;
      error: string;
    }
  | {
      type: "schedule_created";
      organizationId: string;
      scheduleId: string;
      businessName: string;
      interval: string;
    };

/**
 * Send a notification event. Persists to DB via NotificationService.
 * Idempotent — duplicate events within cooldown windows are silently ignored.
 */
export async function sendNotification(payload: NotificationPayload): Promise<void> {
  try {
    switch (payload.type) {
      case "scan_complete":
        await NotificationService.scanCompleted(
          payload.organizationId,
          payload.scanId,
          payload.businessName,
        );
        break;

      case "scan_failed":
        await NotificationService.scanFailed(
          payload.organizationId,
          payload.businessName,
          payload.error,
        );
        break;

      case "schedule_created":
        // Schedule creation is low-signal — no notification persisted.
        // Reserved for future INFO-level events if needed.
        break;
    }
  } catch (err) {
    // Notification failures must never crash the scan pipeline
    console.error("[notifications] Failed to persist notification:", err);
  }
}
