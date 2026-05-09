/**
 * @fileOverview OperationalCohesionService (Phase 2.0)
 *
 * The single source for "what matters most right now" across all VizAI surfaces.
 *
 * Responsibilities:
 *  - Compute the org's current operational state from DB
 *  - Classify maturity (via OperationalMaturityService)
 *  - Derive a single primary action (deterministic priority order, role-aware)
 *  - Build continuity items (in-progress work, unresolved priorities)
 *  - Enforce freshness: stale in-progress items (>30 days) excluded
 *
 * Rules:
 *  - NO LLM — all strings are static templates
 *  - NO writes — read-only service
 *  - Stateless — derived fresh from DB each call
 *  - Deterministic — same inputs always produce same output
 *  - Role-aware — ADMIN and CLIENT see only actions they can act on
 *
 * Primary action priority order (ADMIN):
 *  1. resolve_billing      — unread CRITICAL billing notification exists
 *  2. action_high_priority — open HIGH recommendations exist
 *  3. run_first_scan       — no completed scans yet
 *  4. resume_in_progress   — fresh IN_PROGRESS recommendations exist (≤30 days)
 *  5. set_up_schedule      — no active scan schedule
 *  6. review_fresh_scan    — latest scan completed within last 24h
 *  7. all_clear            — nothing urgent
 *
 * Primary action priority order (CLIENT):
 *  1. action_high_priority — open HIGH recommendations exist  (billing inaccessible)
 *  2. await_first_scan     — no completed scans (CLIENT cannot create scans)
 *  3. resume_in_progress   — fresh IN_PROGRESS recommendations exist (≤30 days)
 *  4. review_fresh_scan    — latest scan completed within last 24h
 *  5. all_clear            — CLIENT-specific message (references account team)
 *  (set_up_schedule skipped — CLIENT cannot manage schedules)
 */

import { db } from "@/lib/db";
import type { UserRole } from "@prisma/client";
import { CanonicalTruthService } from "./canonical-truth.service";
import { PerceptionDriftService, type DriftLevel } from "./perception-drift.service";
import {
  classifyMaturity,
  type OrgMaturity,
  type DashboardEmphasis,
  type MaturityContext,
} from "./operational-maturity.service";

// ── Types ─────────────────────────────────────────────────────────────────────

export type PrimaryActionType =
  | "resolve_billing"
  | "address_drift"              // Phase 2.2 — MODERATE+ drift detected
  | "action_high_priority_recs"
  | "run_first_scan"
  | "await_first_scan"           // CLIENT only — informational, no CTA link
  | "resume_in_progress"
  | "set_up_schedule"
  | "review_fresh_scan"
  | "all_clear";

export type PrimaryAction = {
  type: PrimaryActionType;
  urgency: "critical" | "high" | "medium" | "low";
  title: string;
  /** What changed or exists operationally */
  what_happened: string;
  /** Why the user should care */
  why_it_matters: string;
  /** The explicit next step */
  what_to_do: string;
  /**
   * Destination href. Empty string ("") for informational-only actions
   * (e.g. await_first_scan) — PrimaryActionCard suppresses the CTA button
   * when href is empty.
   */
  href: string;
  cta_label: string;
};

export type ContinuityItem = {
  type: "in_progress_recs" | "open_high_priority" | "unread_critical";
  label: string;
  count: number;
  href: string;
};

export type LatestScanSummary = {
  id: string;
  created_at: Date;
  business_name: string;
  overall_score: number;
  hours_ago: number;
} | null;

export type OperationalState = {
  // ── Core operational state ──────────────────────────────────────────────────
  primary_action: PrimaryAction;
  continuity_items: ContinuityItem[];
  has_any_scans: boolean;
  has_active_schedule: boolean;
  next_scheduled_run: Date | null;
  open_high_priority_count: number;
  in_progress_count: number;         // fresh only (≤30 days)
  critical_unread_count: number;
  latest_scan: LatestScanSummary;
  // ── Maturity (Phase 2.0) ────────────────────────────────────────────────────
  maturity: OrgMaturity;
  maturity_reason: string;           // why this state applies right now
  maturity_next_milestone: string;   // specific next step to advance or restore
  dashboard_emphasis: DashboardEmphasis;
  // ── Role + counts (Phase 2.0) ───────────────────────────────────────────────
  role: UserRole;
  completed_scan_count: number;
  completed_rec_count: number;
  // ── Drift (Phase 2.2) ───────────────────────────────────────────────────────
  drift_level: DriftLevel | null;  // null when no scan or no canonical profile
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function avgScore(scores: (number | null)[]): number {
  const vals = scores.filter((v): v is number => v !== null);
  if (vals.length === 0) return 0;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

// ── Primary action templates ──────────────────────────────────────────────────

function buildPrimaryAction(params: {
  role: UserRole;
  criticalUnreadCount: number;
  openHighPriorityCount: number;
  hasAnyScan: boolean;
  freshInProgressCount: number;
  hasActiveSchedule: boolean;
  latestScan: LatestScanSummary;
  driftLevel: DriftLevel | null;
}): PrimaryAction {
  const {
    role,
    criticalUnreadCount,
    openHighPriorityCount,
    hasAnyScan,
    freshInProgressCount,
    hasActiveSchedule,
    latestScan,
    driftLevel,
  } = params;

  const isAdmin = role === "ADMIN";
  const actionableDrift =
    driftLevel === "CRITICAL" ||
    driftLevel === "HIGH" ||
    driftLevel === "MODERATE";

  // ── 1. Billing — ADMIN only ───────────────────────────────────────────────
  // CLIENT users have no billing access — surfacing this creates an orphaned CTA.
  if (isAdmin && criticalUnreadCount > 0) {
    return {
      type: "resolve_billing",
      urgency: "critical",
      title: "Payment issue requires immediate attention",
      what_happened: "Your payment method failed and service continuity is at risk.",
      why_it_matters:
        "Unresolved billing issues can interrupt your visibility monitoring and scan scheduling.",
      what_to_do: "Update your payment method in Billing to restore full service.",
      href: "/billing",
      cta_label: "Go to Billing",
    };
  }

  // ── 2. Drift — CRITICAL level only at this position (above recs) ────────────
  // CRITICAL drift means AI systems have significant inaccuracies — this is an
  // infrastructure-level issue that outranks individual recommendation gaps.
  if (actionableDrift && driftLevel === "CRITICAL") {
    return {
      type: "address_drift",
      urgency: "critical",
      title: "AI perception has critical drift from your canonical truth",
      what_happened:
        "A recent scan shows significant inaccuracies in how AI systems describe your business.",
      why_it_matters:
        "Critical drift means AI tools may be giving incorrect information about your business to potential customers.",
      what_to_do:
        "Publish your canonical truth and run a new scan to measure improvement.",
      href: "/monitoring",
      cta_label: "Review Publishing",
    };
  }

  // ── 3. High-priority recommendations — both roles ─────────────────────────
  if (openHighPriorityCount > 0) {
    const n = openHighPriorityCount;
    return {
      type: "action_high_priority_recs",
      urgency: "high",
      title: `${n} high-priority recommendation${n > 1 ? "s" : ""} need${n === 1 ? "s" : ""} attention`,
      what_happened: `Your latest scan identified ${n} high-priority gap${n > 1 ? "s" : ""} in AI perception.`,
      why_it_matters:
        "Unresolved high-priority items directly reduce your AI visibility score and how AI models describe your business.",
      what_to_do:
        "Review and action these recommendations to improve your AI perception score.",
      href: "/recommendations?priority=HIGH",
      cta_label: "View Recommendations",
    };
  }

  // ── 3. No scans yet — role-specific ──────────────────────────────────────
  if (!hasAnyScan) {
    if (isAdmin) {
      return {
        type: "run_first_scan",
        urgency: "medium",
        title: "Run your first visibility scan",
        what_happened: "Your account is set up but has no AI visibility data yet.",
        why_it_matters:
          "Without a scan, you cannot see how AI models currently perceive your business — or what to fix.",
        what_to_do: "Launch your first visibility scan to establish your AI perception baseline.",
        href: "/scans/new",
        cta_label: "Start First Scan",
      };
    } else {
      // CLIENT: cannot create scans — informational only, no link
      return {
        type: "await_first_scan",
        urgency: "low",
        title: "Your first scan is being prepared",
        what_happened: "Your account is set up but no visibility scan has been completed yet.",
        why_it_matters:
          "Scans reveal how AI models perceive your business and generate actionable recommendations.",
        what_to_do:
          "Your account team will run your first scan. No action is required from you right now.",
        href: "",        // no link — informational card, CTA suppressed
        cta_label: "",
      };
    }
  }

  // ── 4. Drift — MODERATE/HIGH (below recs, above continuity) ─────────────────
  // At MODERATE/HIGH level, drift is meaningful but not overriding rec work.
  if (actionableDrift && (driftLevel === "HIGH" || driftLevel === "MODERATE")) {
    const urgency = driftLevel === "HIGH" ? "high" : "medium";
    return {
      type: "address_drift",
      urgency,
      title:
        driftLevel === "HIGH"
          ? "AI perception has significant drift from your canonical truth"
          : "AI perception is drifting from your canonical truth",
      what_happened:
        "A recent scan shows that AI systems are not fully reflecting your canonical business information.",
      why_it_matters:
        "Drift means AI tools may be incomplete or inaccurate when describing your business to potential customers.",
      what_to_do:
        "Publish your canonical truth to reinforce your business information across AI systems.",
      href: "/monitoring",
      cta_label: "Review Publishing",
    };
  }

  // ── 5. In-progress recommendations (fresh ≤30 days) — both roles ─────────
  if (freshInProgressCount > 0) {
    const n = freshInProgressCount;
    return {
      type: "resume_in_progress",
      urgency: "medium",
      title: `Resume ${n} recommendation${n > 1 ? "s" : ""} in progress`,
      what_happened: `You have ${n} recommendation${n > 1 ? "s" : ""} you've started but not completed.`,
      why_it_matters:
        "Completing in-progress items improves your AI visibility score and closes open operational gaps.",
      what_to_do: "Return to your active recommendations and mark them complete.",
      href: "/recommendations?status=IN_PROGRESS",
      cta_label: "Continue Recommendations",
    };
  }

  // ── 6. No active schedule — ADMIN only ────────────────────────────────────
  // CLIENT users cannot create scan schedules — skip entirely.
  if (isAdmin && !hasActiveSchedule) {
    return {
      type: "set_up_schedule",
      urgency: "low",
      title: "Set up automated monitoring",
      what_happened: "Your account has no recurring scan schedule active.",
      why_it_matters:
        "AI perception changes over time. Without automated monitoring, you may miss significant shifts in how AI models describe your business.",
      what_to_do: "Set up a recurring scan schedule to automatically track your AI visibility.",
      href: "/monitoring",
      cta_label: "Set Up Monitoring",
    };
  }

  // ── 7. Fresh scan — both roles ────────────────────────────────────────────
  if (latestScan && latestScan.hours_ago <= 24) {
    return {
      type: "review_fresh_scan",
      urgency: "low",
      title: "New scan results are ready to review",
      what_happened: `A visibility scan for ${latestScan.business_name} completed ${latestScan.hours_ago < 1 ? "just now" : `${latestScan.hours_ago}h ago`}.`,
      why_it_matters:
        "Fresh scan data reveals how AI models currently perceive your business and which actions will have the most impact.",
      what_to_do: "Review the results and action any new recommendations.",
      href: `/scans/results/${latestScan.id}`,
      cta_label: "View Scan Results",
    };
  }

  // ── 8. All clear — role-specific message ──────────────────────────────────
  if (!isAdmin) {
    return {
      type: "all_clear",
      urgency: "low",
      title: "Your workflow is current",
      what_happened: "No open recommendations or unresolved issues in your workflow.",
      why_it_matters:
        "Maintaining an active workflow keeps your AI visibility improving over time.",
      what_to_do:
        "Continue reviewing scan results when they arrive. Your account team manages scan scheduling.",
      href: "/recommendations",
      cta_label: "View Recommendations",
    };
  }

  return {
    type: "all_clear",
    urgency: "low",
    title: "Operations are in good shape",
    what_happened: "No critical issues, high-priority gaps, or unresolved billing events detected.",
    why_it_matters:
      "Maintaining operational momentum keeps your AI visibility score stable and growing.",
    what_to_do: "Continue monitoring and run scans on schedule to stay ahead of perception shifts.",
    href: "/monitoring",
    cta_label: "View Monitoring",
  };
}

// ── Main service ──────────────────────────────────────────────────────────────

export const OperationalCohesionService = {
  /**
   * Returns the org's full operational state for the given role.
   *
   * @param organizationId  Org to query — all results are scoped to this org.
   * @param role            Calling user's role — drives role-aware prioritization.
   *                        Defaults to "ADMIN" for backward compatibility.
   */
  async getState(
    organizationId: string,
    role: UserRole = "ADMIN",
  ): Promise<OperationalState> {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // ── Parallel data fetch ─────────────────────────────────────────────────
    const [
      latestScanRow,
      openHighPriorityCount,
      freshInProgressCount,
      nextSchedule,
      criticalUnreadCount,
      completedScanCount,
      completedRecCount,
    ] = await Promise.all([
      // Latest completed scan (for score + age — PARTIAL counts as completed)
      db.perceptionScan.findFirst({
        where: { organizationId, status: { in: ["COMPLETE", "PARTIAL"] } },
        orderBy: { createdAt: "desc" },
        include: {
          scanReport: {
            select: {
              accuracyScore: true,
              coverageScore: true,
              entityUnderstandingScore: true,
              consistencyScore: true,
            },
          },
          companyProfile: { select: { businessName: true } },
        },
      }),

      // Open HIGH priority recommendations (all ages — always actionable)
      db.recommendation.count({
        where: {
          status: "OPEN",
          priority: "HIGH",
          perceptionScan: { organizationId },
        },
      }),

      // Fresh IN_PROGRESS recommendations (≤30 days — freshness enforcement)
      db.recommendation.count({
        where: {
          status: "IN_PROGRESS",
          perceptionScan: { organizationId },
          OR: [
            { inProgressAt: { gte: thirtyDaysAgo } },
            { inProgressAt: null, createdAt: { gte: thirtyDaysAgo } },
          ],
        },
      }),

      // Next active schedule
      db.scanSchedule.findFirst({
        where: { organizationId, isActive: true },
        orderBy: { nextRunAt: "asc" },
        select: { nextRunAt: true, isActive: true },
      }),

      // Unread CRITICAL billing notifications
      db.notification.count({
        where: {
          organizationId,
          isRead: false,
          archivedAt: null,
          severity: "CRITICAL",
          type: "BILLING_PAYMENT_FAILED",
        },
      }),

      // Total completed scans — PARTIAL counts as completed for maturity
      db.perceptionScan.count({
        where: { organizationId, status: { in: ["COMPLETE", "PARTIAL"] } },
      }),

      // Total completed recommendations — used for maturity classification
      db.recommendation.count({
        where: {
          status: "COMPLETED",
          perceptionScan: { organizationId },
        },
      }),
    ]);

    // ── Derive latest scan summary ──────────────────────────────────────────
    let latestScan: LatestScanSummary = null;
    if (latestScanRow) {
      const report = latestScanRow.scanReport;
      const overall = report
        ? avgScore([
            report.accuracyScore,
            report.coverageScore,
            report.entityUnderstandingScore,
            report.consistencyScore,
          ])
        : 0;
      const msAgo = now.getTime() - latestScanRow.createdAt.getTime();
      const hoursAgo = Math.floor(msAgo / (60 * 60 * 1000));

      latestScan = {
        id: latestScanRow.id,
        created_at: latestScanRow.createdAt,
        business_name: latestScanRow.companyProfile.businessName,
        overall_score: parseFloat(overall.toFixed(1)),
        hours_ago: hoursAgo,
      };
    }

    const hasAnyScan = latestScanRow !== null;
    const hasActiveSchedule = nextSchedule !== null;

    // ── Drift classification (Phase 2.2 — stateless, fire-and-forget safe) ──
    // Computed only when there is a completed scan to compare against.
    let driftLevel: DriftLevel | null = null;
    if (latestScanRow) {
      try {
        const canonical = await CanonicalTruthService.getCanonicalProfile(organizationId);
        if (canonical) {
          // Fetch model results for drift (not included in main query to keep it lean)
          const scanWithModels = await db.perceptionScan.findUnique({
            where: { id: latestScanRow.id },
            include: {
              scanReport: {
                select: { accuracyScore: true, coverageScore: true, consistencyScore: true },
              },
              modelResults: {
                where: { success: true },
                select: {
                  success: true,
                  businessType: true,
                  servicesMentioned: true,
                  locationsMentioned: true,
                  industriesMentioned: true,
                  customerTypesMentioned: true,
                  differentiatorsMentioned: true,
                },
              },
            },
          });
          if (scanWithModels) {
            const scanInput = PerceptionDriftService.buildScanInput(scanWithModels);
            driftLevel = PerceptionDriftService.classify(canonical.business, scanInput).level;
          }
        }
      } catch {
        // Drift is non-critical — never block the operational state on drift errors
        driftLevel = null;
      }
    }

    const hasCriticalDrift = driftLevel === "CRITICAL";

    // ── Classify maturity ───────────────────────────────────────────────────
    const maturityCtx: MaturityContext = classifyMaturity({
      hasAnyScan,
      hasActiveSchedule,
      completedScanCount,
      completedRecCount,
      openHighPriorityCount,
      hasCriticalDrift,
    });

    // ── Derive primary action ───────────────────────────────────────────────
    const primary_action = buildPrimaryAction({
      role,
      criticalUnreadCount,
      openHighPriorityCount,
      hasAnyScan,
      freshInProgressCount,
      hasActiveSchedule,
      latestScan,
      driftLevel,
    });

    // ── Build continuity items ──────────────────────────────────────────────
    // Continuity items are role-neutral — all are actionable by both ADMIN and CLIENT.
    const continuity_items: ContinuityItem[] = [];

    if (freshInProgressCount > 0) {
      continuity_items.push({
        type: "in_progress_recs",
        label: `${freshInProgressCount} recommendation${freshInProgressCount > 1 ? "s" : ""} in progress`,
        count: freshInProgressCount,
        href: "/recommendations?status=IN_PROGRESS",
      });
    }

    if (openHighPriorityCount > 0) {
      continuity_items.push({
        type: "open_high_priority",
        label: `${openHighPriorityCount} high-priority item${openHighPriorityCount > 1 ? "s" : ""} open`,
        count: openHighPriorityCount,
        href: "/recommendations?priority=HIGH",
      });
    }

    // Unread critical notifications in continuity — ADMIN only (billing page)
    if (criticalUnreadCount > 0 && role === "ADMIN") {
      continuity_items.push({
        type: "unread_critical",
        label: `${criticalUnreadCount} critical notification${criticalUnreadCount > 1 ? "s" : ""} unread`,
        count: criticalUnreadCount,
        href: "/notifications",
      });
    }

    return {
      primary_action,
      continuity_items,
      has_any_scans: hasAnyScan,
      has_active_schedule: hasActiveSchedule,
      next_scheduled_run: nextSchedule?.nextRunAt ?? null,
      open_high_priority_count: openHighPriorityCount,
      in_progress_count: freshInProgressCount,
      critical_unread_count: criticalUnreadCount,
      latest_scan: latestScan,
      // Maturity
      maturity: maturityCtx.state,
      maturity_reason: maturityCtx.reason,
      maturity_next_milestone: maturityCtx.next_milestone,
      dashboard_emphasis: maturityCtx.dashboard_emphasis,
      // Role + counts
      role,
      completed_scan_count: completedScanCount,
      completed_rec_count: completedRecCount,
      // Drift (Phase 2.2)
      drift_level: driftLevel,
    };
  },
};
