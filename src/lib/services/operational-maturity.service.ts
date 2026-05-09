/**
 * @fileOverview OperationalMaturityService
 *
 * Classifies an org's current operational maturity from observable DB signals.
 *
 * Design principles:
 *  - LIVE state, not permanent achievement — orgs may advance or downgrade
 *  - Stateless — derived fresh from current DB state every call
 *  - Bidirectional — downgrade is automatic when conditions are no longer met
 *  - Deterministic — no ML, no AI, no hidden logic
 *  - Transparent — every state includes a human-readable reason and next milestone
 *
 * States:
 *   SETUP      — no completed scans OR no active schedule
 *   ACTIVE     — has scans + schedule, low recommendation completion
 *   OPTIMIZING — actively completing recommendations, some backlog or limited history
 *   MATURE     — clean high-priority backlog, consistent scan history, active monitoring
 *
 * Downgrade triggers (automatic — stateless re-derivation every call):
 *   MATURE → OPTIMIZING: openHighPriorityCount > 0 (new scan surfaced gaps)
 *   ANY → SETUP:         !hasActiveSchedule (schedule paused or deleted)
 *   ANY → SETUP:         !hasAnyScan (no completed scans exist)
 *
 * Called exclusively by OperationalCohesionService.getState() — not standalone.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export type OrgMaturity = "SETUP" | "ACTIVE" | "OPTIMIZING" | "MATURE";

export type DashboardEmphasis = "setup" | "workflow" | "optimization" | "monitoring";

export type MaturityContext = {
  /** Current operational maturity state */
  state: OrgMaturity;
  /** Why this state applies right now — plain English, user-facing */
  reason: string;
  /** The specific next operational step to advance (or restore) maturity */
  next_milestone: string;
  /** Dashboard composition hint — consumed by the dashboard to gate sections */
  dashboard_emphasis: DashboardEmphasis;
};

export type MaturityParams = {
  hasAnyScan: boolean;
  hasActiveSchedule: boolean;
  completedScanCount: number;
  completedRecCount: number;
  openHighPriorityCount: number;
  /** Phase 2.2 — CRITICAL drift prevents MATURE classification */
  hasCriticalDrift?: boolean;
};

// ── Classification ────────────────────────────────────────────────────────────

/**
 * Classifies current org maturity from observable operational state.
 *
 * Evaluation order matters:
 *   1. SETUP checks first (blocking conditions — no point checking higher states)
 *   2. MATURE before OPTIMIZING (fully clean org should get the highest applicable state)
 *   3. OPTIMIZING before ACTIVE (partially optimizing > just monitoring)
 *   4. ACTIVE as final fallback (has data + schedule, but low completion velocity)
 */
export function classifyMaturity(params: MaturityParams): MaturityContext {
  const {
    hasAnyScan,
    hasActiveSchedule,
    completedScanCount,
    completedRecCount,
    openHighPriorityCount,
    hasCriticalDrift = false,
  } = params;

  // ── SETUP: no scan data ────────────────────────────────────────────────────
  if (!hasAnyScan) {
    return {
      state: "SETUP",
      reason: "Your account has no completed visibility scans yet.",
      next_milestone:
        "Run your first scan to establish your AI perception baseline and unlock operational monitoring.",
      dashboard_emphasis: "setup",
    };
  }

  // ── SETUP: schedule lost (downgrade from ACTIVE or higher) ─────────────────
  if (!hasActiveSchedule) {
    return {
      state: "SETUP",
      reason: "Your recurring scan schedule is no longer active.",
      next_milestone:
        "Restore your scan schedule to resume Active monitoring and keep your visibility data current.",
      dashboard_emphasis: "setup",
    };
  }

  // ── MATURE: clean backlog, consistent history, sustained operations ─────────
  // Evaluated before OPTIMIZING — a fully clean org earns the highest state.
  // CRITICAL drift prevents MATURE (Phase 2.2 — drift is a maturity signal).
  if (
    completedScanCount >= 5 &&
    completedRecCount >= 3 &&
    openHighPriorityCount === 0 &&
    !hasCriticalDrift
  ) {
    return {
      state: "MATURE",
      reason:
        "You have a consistent scan history, a clean high-priority backlog, and active recurring monitoring.",
      next_milestone:
        "Maintain recurring scans and act on new recommendations promptly to sustain Mature operations.",
      dashboard_emphasis: "monitoring",
    };
  }

  // ── OPTIMIZING: actively completing recommendations ─────────────────────────
  // May include MATURE→OPTIMIZING downgrade (openHighPriorityCount > 0).
  if (completedRecCount >= 3) {
    const isDriftDowngrade = hasCriticalDrift && openHighPriorityCount === 0;
    const isRecDowngrade = openHighPriorityCount > 0;
    const reason = isDriftDowngrade
      ? "A recent scan shows significant drift between AI perception and your canonical business truth."
      : isRecDowngrade
        ? `A recent scan surfaced ${openHighPriorityCount} new high-priority gap${openHighPriorityCount > 1 ? "s" : ""}.`
        : `You're building scan history (${completedScanCount} of 5 scans completed).`;
    const next_milestone = isDriftDowngrade
      ? "Publish your canonical truth and run a new scan to reduce drift and restore Mature operations."
      : isRecDowngrade
        ? "Resolve all high-priority recommendations to return to Mature operations."
        : `Complete ${Math.max(0, 5 - completedScanCount)} more scheduled scan${5 - completedScanCount !== 1 ? "s" : ""} to reach Mature operations.`;

    return {
      state: "OPTIMIZING",
      reason,
      next_milestone,
      dashboard_emphasis: "optimization",
    };
  }

  // ── ACTIVE: scans running, schedule active, low completion velocity ─────────
  const recsCompleted = completedRecCount;
  const recsNeeded = Math.max(0, 3 - recsCompleted);
  const reason =
    recsCompleted === 0
      ? "You have recurring monitoring active but no recommendations completed yet."
      : `You've completed ${recsCompleted} recommendation${recsCompleted > 1 ? "s" : ""} — keep going.`;

  return {
    state: "ACTIVE",
    reason,
    next_milestone: `Complete ${recsNeeded} more recommendation${recsNeeded !== 1 ? "s" : ""} to enter the Optimizing stage.`,
    dashboard_emphasis: "workflow",
  };
}
