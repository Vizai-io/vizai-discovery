/**
 * @fileOverview NotificationService — the ONLY place where notification logic lives.
 *
 * Responsibilities:
 *  - deterministic template-driven message generation (NO LLM)
 *  - severity classification
 *  - cooldown / deduplication enforcement
 *  - groupKey assignment for notification grouping
 *  - centralized operational event creation
 *  - future-ready channel routing (currently in_app only)
 *
 * ── Cooldown registry ──────────────────────────────────────────────────────────
 *  SCAN_COMPLETED             — none (scan-distinct via relatedScanId)
 *  SCAN_FAILED                — none (each failure is operationally critical)
 *  VISIBILITY_IMPROVED        — none (scan-distinct via relatedScanId)
 *  VISIBILITY_DECLINED        — none (scan-distinct via relatedScanId)
 *  RECOMMENDATION_BACKLOG_GROWING — 24h
 *  RECOMMENDATION_MILESTONE   — 24h
 *  ONBOARDING_COMPLETE        — Infinity (one-time ever)
 *  BILLING_PAYMENT_FAILED     — none (always critical)
 *  BILLING_WARNING            — 24h
 *
 * ── Group key scheme ───────────────────────────────────────────────────────────
 *  scan:{scanId}       — SCAN_COMPLETED, VISIBILITY_IMPROVED, VISIBILITY_DECLINED
 *  scan_failed         — SCAN_FAILED
 *  recommendations     — RECOMMENDATION_BACKLOG_GROWING, RECOMMENDATION_MILESTONE
 *  billing             — BILLING_PAYMENT_FAILED, BILLING_WARNING
 *  onboarding          — ONBOARDING_COMPLETE
 *
 * ── Channel abstraction ────────────────────────────────────────────────────────
 *  Current channels: in_app only
 *  Future channels:  email, webhook (add to ACTIVE_CHANNELS when ready)
 *
 *  To add email delivery:
 *    1. Uncomment "email" in ACTIVE_CHANNELS
 *    2. Implement the "email" branch in deliverToChannels()
 *    3. Import Resend and call resend.emails.send() there
 *
 *  To add Slack/webhook:
 *    1. Uncomment "webhook" in ACTIVE_CHANNELS
 *    2. Implement the "webhook" branch in deliverToChannels()
 *    3. POST to org's configured webhook URL (fetch from org settings)
 *
 *  Call sites (scan runner, scan API, onboarding, billing webhook) do NOT change.
 */

import { NotificationRepository } from "@/lib/repositories";
import type { ScanDelta } from "./scan-delta.service";

const H24 = 24 * 60 * 60 * 1000;

// ── Future-ready channel abstraction ─────────────────────────────────────────
// Extend DeliveryChannel union when adding email/webhook support.
// Only "in_app" is active. The others are structural placeholders.

type DeliveryChannel = "in_app"; // | "email" | "webhook"

const ACTIVE_CHANNELS: DeliveryChannel[] = ["in_app"];

/**
 * Route a created notification to its delivery channels.
 * Currently in_app only — notification is already persisted before this runs.
 *
 * Future extension points:
 *   case "email":   await sendEmailNotification(notificationId, orgId); break;
 *   case "webhook": await postToWebhook(notificationId, orgId); break;
 */
async function deliverToChannels(
  _notificationId: string,
  _organizationId: string,
  _channels: DeliveryChannel[],
): Promise<void> {
  for (const channel of _channels) {
    switch (channel) {
      case "in_app":
        // Already persisted — no additional delivery needed
        break;
      // Future channels are no-ops until implemented:
      // case "email":   break;
      // case "webhook": break;
    }
  }
}

// ── Cooldown config ───────────────────────────────────────────────────────────

const COOLDOWN: Partial<Record<string, number>> = {
  RECOMMENDATION_BACKLOG_GROWING: H24,
  RECOMMENDATION_MILESTONE:       H24,
  ONBOARDING_COMPLETE:            Infinity,
  BILLING_WARNING:                H24,
};

// ── Internal emit helper ──────────────────────────────────────────────────────

type EmitParams = Parameters<typeof NotificationRepository.create>[0];

async function emit(params: EmitParams): Promise<void> {
  const cooldownMs = COOLDOWN[params.type] ?? null;

  // Cooldown check (time-windowed dedup)
  if (cooldownMs !== null) {
    const exists = await NotificationRepository.existsWithinCooldown(
      params.organizationId,
      params.type,
      cooldownMs,
      params.relatedScanId,
    );
    if (exists) return;
  }

  // Scan-distinct dedup (prevents double-fire on scan retries)
  if (cooldownMs === null && params.relatedScanId) {
    const exists = await NotificationRepository.existsWithinCooldown(
      params.organizationId,
      params.type,
      0,
      params.relatedScanId,
    );
    if (exists) return;
  }

  const notification = await NotificationRepository.create(params);
  await deliverToChannels(notification.id, params.organizationId, ACTIVE_CHANNELS);
}

// ── Public API — one method per named operational event ───────────────────────

export const NotificationService = {
  /**
   * Fired after any scan (scheduled or manual) completes successfully.
   * Group: scan:{scanId}
   */
  async scanCompleted(
    organizationId: string,
    scanId: string,
    businessName: string,
  ): Promise<void> {
    await emit({
      organizationId,
      type: "SCAN_COMPLETED",
      severity: "SUCCESS",
      title: "Visibility scan completed",
      message: `The visibility scan for ${businessName} completed successfully. Review the latest results to see how AI models are perceiving your business.`,
      relatedScanId: scanId,
      groupKey: `scan:${scanId}`,
    });
  },

  /**
   * Fired when a scheduled scan fails.
   * Group: scan_failed
   */
  async scanFailed(
    organizationId: string,
    businessName: string,
    error: string,
  ): Promise<void> {
    await emit({
      organizationId,
      type: "SCAN_FAILED",
      severity: "CRITICAL",
      title: "Scheduled scan failed",
      message: `The visibility scan for ${businessName} could not complete. Reason: ${error}. The next scheduled run will retry automatically.`,
      groupKey: "scan_failed",
    });
  },

  /**
   * Fired when a scan shows significant positive score movement (delta > +5 pts).
   * Group: scan:{scanId} — clusters with SCAN_COMPLETED for the same scan.
   */
  async visibilityImproved(
    organizationId: string,
    scanId: string,
    businessName: string,
    delta: ScanDelta,
  ): Promise<void> {
    const pts = delta.overallDelta.toFixed(1);
    await emit({
      organizationId,
      type: "VISIBILITY_IMPROVED",
      severity: "SUCCESS",
      title: "AI visibility improved",
      message: `${businessName}'s AI perception score improved by ${pts} points since the previous scan. Check your recommendations to maintain this momentum.`,
      relatedScanId: scanId,
      groupKey: `scan:${scanId}`,
    });
  },

  /**
   * Fired when a scan shows significant negative score movement (delta < −5 pts).
   * Group: scan:{scanId} — clusters with SCAN_COMPLETED for the same scan.
   */
  async visibilityDeclined(
    organizationId: string,
    scanId: string,
    businessName: string,
    delta: ScanDelta,
  ): Promise<void> {
    const pts = Math.abs(delta.overallDelta).toFixed(1);
    const detail = delta.consistencyDropped
      ? " Entity consistency declined — review your structured data signals."
      : " Review open recommendations to address the decline.";
    await emit({
      organizationId,
      type: "VISIBILITY_DECLINED",
      severity: "WARNING",
      title: "AI visibility declined",
      message: `${businessName}'s AI perception score declined by ${pts} points since the previous scan.${detail}`,
      relatedScanId: scanId,
      groupKey: `scan:${scanId}`,
    });
  },

  /**
   * Fired when the org has 5+ open recommendations.
   * Subject to 24h cooldown to prevent fatigue.
   * Group: recommendations
   */
  async recommendationBacklogGrowing(
    organizationId: string,
    openCount: number,
  ): Promise<void> {
    await emit({
      organizationId,
      type: "RECOMMENDATION_BACKLOG_GROWING",
      severity: "WARNING",
      title: "Recommendations need attention",
      message: `You have ${openCount} unresolved recommendation${openCount > 1 ? "s" : ""}. Addressing high-priority items will improve your AI visibility score.`,
      groupKey: "recommendations",
    });
  },

  /**
   * Fired once when the org completes onboarding.
   * Infinity cooldown — fires exactly once per org.
   * Group: onboarding
   */
  async onboardingComplete(
    organizationId: string,
    orgName: string,
  ): Promise<void> {
    await emit({
      organizationId,
      type: "ONBOARDING_COMPLETE",
      severity: "SUCCESS",
      title: "Welcome to VizAI",
      message: `${orgName} is set up and ready. Run your first visibility scan to see how AI models currently perceive your business.`,
      groupKey: "onboarding",
    });
  },

  /**
   * Fired when Stripe reports a failed payment.
   * No cooldown — every payment failure is operationally critical.
   * Group: billing
   */
  async billingPaymentFailed(organizationId: string): Promise<void> {
    await emit({
      organizationId,
      type: "BILLING_PAYMENT_FAILED",
      severity: "CRITICAL",
      title: "Payment failed",
      message:
        "Your last payment could not be processed. Update your payment method in Billing to avoid service interruption.",
      groupKey: "billing",
    });
  },

  /**
   * Fired when a subscription enters a grace-period or warning state.
   * Subject to 24h cooldown.
   * Group: billing
   */
  async billingWarning(organizationId: string, detail: string): Promise<void> {
    await emit({
      organizationId,
      type: "BILLING_WARNING",
      severity: "WARNING",
      title: "Subscription requires attention",
      message: detail,
      groupKey: "billing",
    });
  },

  /**
   * Fired when a consultation request is successfully submitted.
   * No cooldown — each request is a distinct operational event.
   * Group: consultation
   *
   * Refinement 4: consultation requests are operational events and must
   * enter the notification lifecycle so admins can track inbound leads.
   */
  async consultationRequestSubmitted(
    organizationId: string,
    contactName: string,
    serviceInterest: string,
  ): Promise<void> {
    await emit({
      organizationId,
      type: "CONSULTATION_REQUEST_SUBMITTED",
      severity: "INFO",
      title: "Consultation request received",
      message: `${contactName} submitted a consultation request for: ${serviceInterest}. Review and follow up within 24 hours.`,
      groupKey: "consultation",
    });
  },
};
