/**
 * @fileOverview PerceptionDriftService (Phase 2.2)
 *
 * Stateless, deterministic drift classification.
 *
 * Refinement 2: drift is always derived fresh from canonical truth + latest scan.
 * No drift is persisted. No drift is cached as source of truth.
 * Same inputs → same classification, every time.
 *
 * Refinement 3: calm, operational UX tone.
 * Every signal explains: what / why / impact / action.
 * No SEO panic language. No "catastrophic" framings.
 *
 * Refinement 12: every classification is fully explainable.
 * No black-box scoring. Every drift level has a documented derivation path.
 *
 * Signal taxonomy:
 *  MISSING_SERVICES        HIGH (3+ missing) | MODERATE (1–2 missing)
 *  INCORRECT_BUSINESS_TYPE HIGH
 *  MISSING_LOCATIONS       MODERATE
 *  MISSING_INDUSTRIES      MODERATE
 *  LOW_ACCURACY            CRITICAL (<40) | HIGH (<60)
 *  LOW_COVERAGE            CRITICAL (<40) | HIGH (<60)
 *  HIGH_INCONSISTENCY      HIGH (consistencyScore < 50)
 *  MISSING_DIFFERENTIATORS LOW
 *  MISSING_CUSTOMER_TYPES  LOW
 *
 * Drift level aggregation (deterministic):
 *  NONE     — zero signals
 *  LOW      — only LOW signals
 *  MODERATE — at least one MODERATE, no HIGH/CRITICAL
 *  HIGH     — at least one HIGH, no CRITICAL
 *  CRITICAL — at least one CRITICAL signal
 */

import type { CanonicalBusiness } from "./truth-export.service";

// ── Types ─────────────────────────────────────────────────────────────────────

export type DriftLevel = "NONE" | "LOW" | "MODERATE" | "HIGH" | "CRITICAL";

export type DriftSignalType =
  | "MISSING_SERVICES"
  | "INCORRECT_BUSINESS_TYPE"
  | "MISSING_LOCATIONS"
  | "MISSING_INDUSTRIES"
  | "LOW_ACCURACY"
  | "LOW_COVERAGE"
  | "HIGH_INCONSISTENCY"
  | "MISSING_DIFFERENTIATORS"
  | "MISSING_CUSTOMER_TYPES";

export type DriftSignalSeverity = "LOW" | "MODERATE" | "HIGH" | "CRITICAL";

export type DriftSignal = {
  type: DriftSignalType;
  severity: DriftSignalSeverity;
  /** What drift was detected — plain, factual */
  what: string;
  /** Why this matters operationally */
  why: string;
  /** Specific downstream impact */
  impact: string;
  /** The single recommended action */
  action: string;
  /** The specific canonical items that are affected */
  affectedItems: string[];
};

export type DriftClassification = {
  level: DriftLevel;
  signals: DriftSignal[];
  /** One-sentence operational summary */
  summary: string;
  /** The single most important next step */
  recommended_action: string;
  scan_id: string;
  classified_at: string;
};

// Input type — the scan data needed for drift comparison
export type ScanForDrift = {
  id: string;
  accuracyScore: number | null;
  coverageScore: number | null;
  consistencyScore: number | null;
  // Aggregated mentions across all model results (union of successful models)
  mentionedServices: string[];
  mentionedLocations: string[];
  mentionedIndustries: string[];
  mentionedCustomerTypes: string[];
  mentionedDifferentiators: string[];
  // Business type from most prevalent model result (null if none)
  perceivedBusinessType: string | null;
};

// ── Drift level aggregation ────────────────────────────────────────────────────

function aggregateLevel(signals: DriftSignal[]): DriftLevel {
  if (signals.length === 0) return "NONE";
  if (signals.some((s) => s.severity === "CRITICAL")) return "CRITICAL";
  if (signals.some((s) => s.severity === "HIGH")) return "HIGH";
  if (signals.some((s) => s.severity === "MODERATE")) return "MODERATE";
  return "LOW";
}

// ── String matching helpers ───────────────────────────────────────────────────

/**
 * Check whether any mention string loosely contains the canonical item.
 * Case-insensitive substring match — handles plurals and phrasing variants.
 */
function isMentioned(canonical: string, mentions: string[]): boolean {
  const c = canonical.toLowerCase();
  return mentions.some((m) => m.toLowerCase().includes(c) || c.includes(m.toLowerCase()));
}

function missingItems(canonicalItems: string[], mentions: string[]): string[] {
  return canonicalItems.filter((item) => !isMentioned(item, mentions));
}

// ── Signal constructors ───────────────────────────────────────────────────────

function missingServicesSignal(missing: string[]): DriftSignal {
  const count = missing.length;
  const severity: DriftSignalSeverity = count >= 3 ? "HIGH" : "MODERATE";
  return {
    type: "MISSING_SERVICES",
    severity,
    what: `${count} of your canonical service${count > 1 ? "s" : ""} ${count > 1 ? "were" : "was"} not mentioned by AI models in the latest scan.`,
    why: "AI systems are not associating your business with these offerings when answering queries.",
    impact: "Potential clients searching for these specific services may not find your business through AI-assisted discovery.",
    action: "Publish your updated canonical truth and run a new scan to verify whether content changes improve service recognition.",
    affectedItems: missing,
  };
}

function incorrectBusinessTypeSignal(
  canonical: string,
  perceived: string,
): DriftSignal {
  return {
    type: "INCORRECT_BUSINESS_TYPE",
    severity: "HIGH",
    what: `AI models categorized your business as "${perceived}" — your canonical type is "${canonical}".`,
    why: "Business type affects how AI systems route and categorize discovery queries.",
    impact: "Queries searching for your type of business may not surface your organization accurately.",
    action: "Review your website and public descriptions to ensure your business type is clearly communicated, then publish and rescan.",
    affectedItems: [canonical, perceived],
  };
}

function missingLocationsSignal(missing: string[]): DriftSignal {
  const count = missing.length;
  return {
    type: "MISSING_LOCATIONS",
    severity: "MODERATE",
    what: `${count} of your canonical location${count > 1 ? "s" : ""} ${count > 1 ? "were" : "was"} not captured in AI perception.`,
    why: "Geographic coverage affects AI-assisted local and regional discovery.",
    impact: "Users in these areas searching for your services may not find your business via AI recommendations.",
    action: "Ensure location information is clearly present in your public content, then publish and rescan.",
    affectedItems: missing,
  };
}

function missingIndustriesSignal(missing: string[]): DriftSignal {
  const count = missing.length;
  return {
    type: "MISSING_INDUSTRIES",
    severity: "MODERATE",
    what: `${count} of your canonical industr${count > 1 ? "ies" : "y"} ${count > 1 ? "were" : "was"} not reflected in AI perception.`,
    why: "Industry associations affect how AI systems route sector-specific queries to your business.",
    impact: "Industry-specific searches may not surface your business as a relevant result.",
    action: "Strengthen industry context in your public content and publish your canonical truth.",
    affectedItems: missing,
  };
}

function lowAccuracySignal(score: number): DriftSignal {
  const severity: DriftSignalSeverity = score < 40 ? "CRITICAL" : "HIGH";
  return {
    type: "LOW_ACCURACY",
    severity,
    what: `Your accuracy score is ${score}% — AI models are not accurately representing your business facts.`,
    why: "Low accuracy means AI systems may be describing your business incorrectly when answering queries.",
    impact: "Inaccurate AI perception can mislead potential customers and reduce trust in AI-referred traffic.",
    action: "Publish your canonical truth and run a new scan. If accuracy remains low, review how your core facts are communicated publicly.",
    affectedItems: [],
  };
}

function lowCoverageSignal(score: number): DriftSignal {
  const severity: DriftSignalSeverity = score < 40 ? "CRITICAL" : "HIGH";
  return {
    type: "LOW_COVERAGE",
    severity,
    what: `Your coverage score is ${score}% — AI models are only capturing part of your services and offerings.`,
    why: "Low coverage means significant parts of your business are invisible to AI discovery systems.",
    impact: "Customers searching for your full range of services may not find complete information via AI.",
    action: "Publish your canonical truth to improve AI awareness of your complete service offering.",
    affectedItems: [],
  };
}

function highInconsistencySignal(score: number): DriftSignal {
  return {
    type: "HIGH_INCONSISTENCY",
    severity: "HIGH",
    what: `AI models show significant disagreement about your business (consistency score: ${score}%).`,
    why: "When models give inconsistent answers, users receive unreliable information about your business.",
    impact: "Inconsistent AI perception creates uncertainty for potential customers researching your business.",
    action: "Publish clear, consistent canonical truth and ensure your public content is unambiguous.",
    affectedItems: [],
  };
}

function missingDifferentiatorsSignal(missing: string[]): DriftSignal {
  return {
    type: "MISSING_DIFFERENTIATORS",
    severity: "LOW",
    what: `${missing.length} of your key differentiator${missing.length > 1 ? "s" : ""} ${missing.length > 1 ? "are" : "is"} not captured in AI perception.`,
    why: "Your competitive differentiators are not being surfaced when AI systems describe your business.",
    impact: "Potential customers may not learn about your key advantages through AI-assisted research.",
    action: "Ensure differentiators are clearly stated in your public content. Publishing canonical truth reinforces these signals.",
    affectedItems: missing,
  };
}

function missingCustomerTypesSignal(missing: string[]): DriftSignal {
  return {
    type: "MISSING_CUSTOMER_TYPES",
    severity: "LOW",
    what: `${missing.length} of your customer type${missing.length > 1 ? "s" : ""} ${missing.length > 1 ? "are" : "is"} not mentioned in AI perception.`,
    why: "AI systems are not identifying who your business serves, which affects targeted discovery.",
    impact: "Queries from your target customers may not surface your business as a relevant match.",
    action: "Clarify customer focus in public content and publish your canonical truth.",
    affectedItems: missing,
  };
}

// ── Summary generators ────────────────────────────────────────────────────────

function buildSummary(level: DriftLevel, signalCount: number): string {
  switch (level) {
    case "NONE":
      return "AI perception aligns well with your canonical business truth. No drift detected.";
    case "LOW":
      return `Minor drift detected (${signalCount} low-priority signal${signalCount > 1 ? "s" : ""}). Your AI visibility is healthy — these are small refinement opportunities.`;
    case "MODERATE":
      return `Moderate drift detected across ${signalCount} area${signalCount > 1 ? "s" : ""}. Some aspects of your business are not fully reflected in AI perception.`;
    case "HIGH":
      return `Significant drift detected across ${signalCount} area${signalCount > 1 ? "s" : ""}. AI systems are missing or misrepresenting important aspects of your business.`;
    case "CRITICAL":
      return `Critical drift detected. AI systems have significant inaccuracies when describing your business. Publishing canonical truth and rescanning is recommended.`;
  }
}

function buildRecommendedAction(level: DriftLevel): string {
  switch (level) {
    case "NONE":
      return "Maintain your current publishing cadence. Continue running regular scans.";
    case "LOW":
      return "Review the flagged items when convenient. Publish your canonical truth to reinforce these signals.";
    case "MODERATE":
      return "Publish your canonical truth and run a new scan. Review the affected areas in your public content.";
    case "HIGH":
      return "Publish your canonical truth now and run a new scan to measure improvement.";
    case "CRITICAL":
      return "Publish your canonical truth and run a new scan. Review how your business facts are presented publicly.";
  }
}

// ── Main classifier ───────────────────────────────────────────────────────────

export const PerceptionDriftService = {
  /**
   * Classify drift between canonical truth and latest scan.
   *
   * Deterministic — same inputs produce identical output.
   * Stateless — no side effects, no DB writes.
   * Explainable — every signal has a documented derivation.
   */
  classify(
    canonical: CanonicalBusiness,
    scan: ScanForDrift,
  ): DriftClassification {
    const signals: DriftSignal[] = [];

    // ── Score-based signals (most objective — check first) ─────────
    const accuracy = scan.accuracyScore ?? 100;
    const coverage = scan.coverageScore ?? 100;
    const consistency = scan.consistencyScore ?? 100;

    if (accuracy < 60) signals.push(lowAccuracySignal(accuracy));
    if (coverage < 60) signals.push(lowCoverageSignal(coverage));
    if (consistency < 50) signals.push(highInconsistencySignal(consistency));

    // ── Business type mismatch ─────────────────────────────────────
    if (
      canonical.business_type &&
      scan.perceivedBusinessType &&
      !isMentioned(canonical.business_type, [scan.perceivedBusinessType])
    ) {
      signals.push(
        incorrectBusinessTypeSignal(canonical.business_type, scan.perceivedBusinessType),
      );
    }

    // ── Service coverage ───────────────────────────────────────────
    if (canonical.services.length > 0) {
      const missing = missingItems(canonical.services, scan.mentionedServices);
      if (missing.length > 0) signals.push(missingServicesSignal(missing));
    }

    // ── Location coverage ──────────────────────────────────────────
    if (canonical.locations.length > 0) {
      const missing = missingItems(canonical.locations, scan.mentionedLocations);
      if (missing.length > 0) signals.push(missingLocationsSignal(missing));
    }

    // ── Industry coverage ──────────────────────────────────────────
    if (canonical.industries.length > 0) {
      const missing = missingItems(canonical.industries, scan.mentionedIndustries);
      if (missing.length > 0) signals.push(missingIndustriesSignal(missing));
    }

    // ── Differentiator coverage ────────────────────────────────────
    if (canonical.differentiators.length > 0) {
      const missing = missingItems(canonical.differentiators, scan.mentionedDifferentiators);
      if (missing.length > 0) signals.push(missingDifferentiatorsSignal(missing));
    }

    // ── Customer type coverage ─────────────────────────────────────
    if (canonical.customer_types.length > 0) {
      const missing = missingItems(canonical.customer_types, scan.mentionedCustomerTypes);
      if (missing.length > 0) signals.push(missingCustomerTypesSignal(missing));
    }

    const level = aggregateLevel(signals);

    return {
      level,
      signals,
      summary: buildSummary(level, signals.length),
      recommended_action: buildRecommendedAction(level),
      scan_id: scan.id,
      classified_at: new Date().toISOString(),
    };
  },

  /**
   * Build a ScanForDrift from a Prisma scan record with model results.
   * Aggregates mentions across all successful model results.
   */
  buildScanInput(scan: {
    id: string;
    scanReport: {
      accuracyScore: number;
      coverageScore: number;
      consistencyScore: number;
    } | null;
    modelResults: Array<{
      success: boolean;
      businessType: string | null;
      servicesMentioned: string[];
      locationsMentioned: string[];
      industriesMentioned: string[];
      customerTypesMentioned: string[];
      differentiatorsMentioned: string[];
    }>;
  }): ScanForDrift {
    const successful = scan.modelResults.filter((r) => r.success);

    // Aggregate mentions (union across all successful models)
    const aggregate = (field: keyof typeof successful[0]): string[] =>
      [...new Set(
        successful.flatMap((r) => r[field] as string[]),
      )];

    // Business type: most common non-null value across successful models
    const typeCounts = new Map<string, number>();
    for (const r of successful) {
      if (r.businessType) {
        typeCounts.set(r.businessType, (typeCounts.get(r.businessType) ?? 0) + 1);
      }
    }
    const perceivedBusinessType =
      typeCounts.size > 0
        ? [...typeCounts.entries()].sort((a, b) => b[1] - a[1])[0][0]
        : null;

    return {
      id: scan.id,
      accuracyScore: scan.scanReport?.accuracyScore ?? null,
      coverageScore: scan.scanReport?.coverageScore ?? null,
      consistencyScore: scan.scanReport?.consistencyScore ?? null,
      mentionedServices: aggregate("servicesMentioned"),
      mentionedLocations: aggregate("locationsMentioned"),
      mentionedIndustries: aggregate("industriesMentioned"),
      mentionedCustomerTypes: aggregate("customerTypesMentioned"),
      mentionedDifferentiators: aggregate("differentiatorsMentioned"),
      perceivedBusinessType,
    };
  },
} as const;
