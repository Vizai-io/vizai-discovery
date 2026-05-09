/**
 * @fileOverview OperationalSummary — deterministic, template-driven summary strings.
 *
 * Rules (in priority order):
 *  1. Significant improvement (delta > 5)  → positive lead
 *  2. Significant decline (delta < -5)     → concern lead
 *  3. Consistency dropped                  → entity signal note
 *  4. Completed recommendations > 0        → momentum note
 *  5. Open recommendations > backlog limit → backlog note
 *  6. Fallback: stable state
 *
 * NO LLM calls. All strings are static templates filled with numbers.
 */

import type { ScanDelta } from "./scan-delta.service";

export type OperationalSummaryInput = {
  delta: ScanDelta | null;           // null if only one scan exists
  openRecommendations: number;
  previousOpenRecommendations: number; // 0 if no prior data
  completedRecommendations: number;
  inProgressRecommendations: number;
};

export type OperationalSummary = {
  headline: string;
  subline: string | null;
};

const BACKLOG_THRESHOLD = 5;

export function buildOperationalSummary(input: OperationalSummaryInput): OperationalSummary {
  const {
    delta,
    openRecommendations,
    previousOpenRecommendations,
    completedRecommendations,
    inProgressRecommendations,
  } = input;

  const openIncreased =
    previousOpenRecommendations > 0 &&
    openRecommendations > previousOpenRecommendations;

  // 1. Significant improvement
  if (delta?.significantImprovement) {
    const sub = buildSubline(completedRecommendations, openRecommendations, openIncreased);
    return {
      headline: `AI visibility improved significantly since the last scan (+${delta.overallDelta.toFixed(1)} pts).`,
      subline: sub,
    };
  }

  // 2. Significant decline
  if (delta?.significantDecline) {
    const sub = buildSubline(completedRecommendations, openRecommendations, openIncreased);
    return {
      headline: `AI perception score declined since the last scan (${delta.overallDelta.toFixed(1)} pts). Review open actions.`,
      subline: sub,
    };
  }

  // 3. Consistency dropped (not already significant)
  if (delta?.consistencyDropped) {
    const sub = buildSubline(completedRecommendations, openRecommendations, openIncreased);
    return {
      headline: "Entity consistency declined slightly across AI models.",
      subline: sub ?? "Address high-priority recommendations to stabilize signals.",
    };
  }

  // 4. Completed recommendations momentum
  if (completedRecommendations > 0) {
    const rec = completedRecommendations === 1 ? "1 issue resolved" : `${completedRecommendations} issues resolved`;
    const sub = openRecommendations > 0
      ? `${openRecommendations} action${openRecommendations > 1 ? "s" : ""} still open.`
      : null;
    return {
      headline: `Good progress — ${rec} since last scan.`,
      subline: sub,
    };
  }

  // 5. Backlog growing
  if (openIncreased) {
    return {
      headline: "Recommendation backlog increased since last scan.",
      subline: `${openRecommendations} open action${openRecommendations > 1 ? "s" : ""} require attention.`,
    };
  }

  // 5b. Large backlog but stable
  if (openRecommendations >= BACKLOG_THRESHOLD) {
    return {
      headline: `${openRecommendations} open recommendations require attention.`,
      subline: inProgressRecommendations > 0
        ? `${inProgressRecommendations} already in progress.`
        : null,
    };
  }

  // 6. Stable / no data
  if (!delta) {
    return {
      headline: "Run a second scan to start tracking progress over time.",
      subline: openRecommendations > 0
        ? `${openRecommendations} recommendation${openRecommendations > 1 ? "s" : ""} ready to action.`
        : null,
    };
  }

  return {
    headline: "AI perception is stable. Keep monitoring for changes.",
    subline: openRecommendations > 0
      ? `${openRecommendations} open action${openRecommendations > 1 ? "s" : ""} available.`
      : null,
  };
}

function buildSubline(
  completed: number,
  open: number,
  openIncreased: boolean,
): string | null {
  if (completed > 0) {
    return `${completed} issue${completed > 1 ? "s" : ""} resolved. ${open > 0 ? `${open} open.` : ""}`.trim();
  }
  if (openIncreased) {
    return `Recommendation backlog increased. ${open} action${open > 1 ? "s" : ""} open.`;
  }
  if (open > 0) {
    return `${open} open action${open > 1 ? "s" : ""} remain.`;
  }
  return null;
}
