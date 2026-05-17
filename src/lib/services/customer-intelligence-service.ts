/**
 * @fileOverview CustomerIntelligenceService — Sprint 11 Task 1.
 *
 * Produces a customer-safe, org-scoped intelligence summary from the Sprint 8/9
 * pipeline outputs. Called by GET /api/intelligence for authenticated users.
 *
 * Design constraints:
 *   - Plain language only — no internal taxonomy terms surfaced to customers
 *   - Maximum 1 risk and 1 recommended action (no overwhelming lists)
 *   - Calm, factual framing — same philosophy as PredictiveNarrativeService
 *   - No cross-org data, no benchmarks, no admin-level detail
 *   - Advisory only — no state mutations
 *
 * Pure function — no DB queries. All inputs are pre-computed by the caller.
 */

import type { ContinuityForecast }       from './continuity-forecast-service';
import type { ContinuityTrajectory }     from './continuity-trajectory-service';
import type { OperationalResilience }    from './operational-resilience-service';
import type { InterventionTimingInsight } from './intervention-timing-service';
import type { OperationalRiskForecast }  from './operational-risk-forecast-service';
import type { OperationalArchetype }     from './operational-archetype-service';
import type { IntelligenceDiff }         from './intelligence-diff-service';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CustomerIntelligenceSummary {
  organizationId:   string;
  // Continuity
  continuityLabel:  string;  // "Stable" | "Watching" | "Needs Attention" | "Optimizing"
  continuityState:  string;  // raw state for UI coloring
  projectedLabel:   string;  // "Expected to remain stable over the next 30 days"
  continuityTrend:  string;  // IMPROVING | STABLE | DECLINING
  // Operational profile (plain language)
  operationalProfile:       string;  // "Operating Stably"
  operationalProfileDetail: string;  // 1-sentence plain description
  // Resilience
  resilienceScore:   number;
  resilienceSummary: string;  // "Strong" | "Developing" | "Needs Attention"
  // Top risk (max 1, calm language, undefined if LOW risk)
  topRisk?: { label: string; rationale: string };
  // Top recommended action (max 1)
  topAction?: { action: string; rationale: string };
  // Delta (populated if Sprint 10 snapshot exists)
  stateChangedSince?:   string;
  previousState?:       string;
  resilienceScoreDelta?: number;
  // Metadata
  generatedAt:  string;
  windowDays:   number;
}

// ── Archetype → plain language ────────────────────────────────────────────────

const ARCHETYPE_LABELS: Record<string, { profile: string; detail: string }> = {
  STABLE_OPERATOR: {
    profile: 'Operating Stably',
    detail:  'Your organization is maintaining a consistent operational cadence with strong continuity signals.',
  },
  RESILIENT_GROWER: {
    profile: 'Growing Resiliently',
    detail:  'Your organization is on a recovery trajectory with improving continuity indicators.',
  },
  RECOVERY_ORIENTED: {
    profile: 'In Active Recovery',
    detail:  'Continuity indicators are trending in a positive direction — your organization is on a recovery path.',
  },
  FRAGMENTING_ORGANIZATION: {
    profile: 'Operational Focus Recommended',
    detail:  'Continuity signals suggest reduced operational consistency. Focused engagement with recommendations may help.',
  },
  VOLATILE_OPERATOR: {
    profile: 'Inconsistent Patterns Detected',
    detail:  'Operational patterns show variability. Establishing a more consistent cadence is the recommended focus.',
  },
  SILENT_DEGRADER: {
    profile: 'Reduced Activity Detected',
    detail:  'Recent activity levels are lower than expected. Reconnecting with your operational cadence can help.',
  },
  HIGH_INTERVENTION_ORG: {
    profile: 'Active Support Recommended',
    detail:  'Your organization has needed frequent operational attention. Structured re-engagement may improve outcomes.',
  },
  PLATEAUED_ORGANIZATION: {
    profile: 'Stable at Current Level',
    detail:  'Operational patterns are consistent, with room to improve engagement and continuity scores.',
  },
};

// ── Continuity state → plain label ───────────────────────────────────────────

const STATE_LABELS: Record<string, string> = {
  OPTIMIZING: 'Optimizing',
  STABLE:     'Stable',
  WATCHING:   'Watching',
  FRAGMENTED: 'Needs Attention',
  CRITICAL:   'Needs Immediate Attention',
};

// ── Risk type → customer label ────────────────────────────────────────────────

const RISK_LABELS: Record<string, string> = {
  CONTINUITY_FRAGMENTATION:      'Continuity consistency',
  OPERATIONAL_SILENCE:           'Reduced activity',
  RANKING_DECLINE:               'Visibility position',
  ONBOARDING_ABANDONMENT:        'Onboarding completion',
  SCHEDULE_INSTABILITY:          'Scheduling consistency',
  ASSERTION_ESCALATION:          'Operational friction',
  RECOMMENDATION_DISENGAGEMENT:  'Recommendation engagement',
};

// ── CustomerIntelligenceService ───────────────────────────────────────────────

export class CustomerIntelligenceService {
  /**
   * Generate a customer-safe intelligence summary for a single org.
   * Pure function — no DB queries.
   */
  static generateForOrg(
    forecast:   ContinuityForecast,
    trajectory: ContinuityTrajectory,
    resilience: OperationalResilience,
    timing:     InterventionTimingInsight,
    risk:       OperationalRiskForecast,
    archetype:  OperationalArchetype,
    diff:       IntelligenceDiff | null,
    windowDays: number,
  ): CustomerIntelligenceSummary {
    const generatedAt     = new Date().toISOString();
    const { organizationId } = forecast;

    // Continuity label
    const continuityLabel = STATE_LABELS[forecast.currentState] ?? forecast.currentState;

    // Projected label
    const projectedLabel = buildProjectedLabel(forecast);

    // Operational profile
    const profileData = ARCHETYPE_LABELS[archetype.archetype] ?? {
      profile: 'Operational Monitoring Active',
      detail:  'Your operational continuity is being monitored across all key indicators.',
    };

    // Resilience summary
    const resilienceSummary =
      resilience.resilienceScore >= 70 ? 'Strong'        :
      resilience.resilienceScore >= 45 ? 'Developing'    :
      resilience.resilienceScore >= 25 ? 'Needs Attention':
      'Needs Immediate Attention';

    // Top risk (HIGH or MEDIUM only, max 1)
    const topRiskRaw = risk.projectedRisks.find(
      (r) => r.likelihood === 'HIGH' || r.likelihood === 'MEDIUM',
    );
    const topRisk = topRiskRaw
      ? {
          label:    RISK_LABELS[topRiskRaw.riskType] ?? topRiskRaw.riskType.replace(/_/g, ' ').toLowerCase(),
          rationale: buildCalmRationale(topRiskRaw.rationale),
        }
      : undefined;

    // Top action from timing insight
    const topAction = timing.basedOnPatterns.length > 0
      ? {
          action:    buildActionFromWindow(timing.recommendedInterventionWindow),
          rationale: timing.basedOnPatterns[0] ?? '',
        }
      : undefined;

    // Delta from last snapshot
    const stateChangedSince  = diff?.lastSnapshotAt;
    const previousState      = diff?.continuityStateChanged ? STATE_LABELS[diff.previousState ?? ''] ?? diff.previousState : undefined;
    const resilienceScoreDelta = (diff && Math.abs(diff.resilienceScoreDelta) >= 5)
      ? diff.resilienceScoreDelta
      : undefined;

    return {
      organizationId,
      continuityLabel,
      continuityState: forecast.currentState,
      projectedLabel,
      continuityTrend: forecast.continuityTrend,
      operationalProfile:       profileData.profile,
      operationalProfileDetail: profileData.detail,
      resilienceScore:   resilience.resilienceScore,
      resilienceSummary,
      topRisk,
      topAction,
      stateChangedSince,
      previousState,
      resilienceScoreDelta,
      generatedAt,
      windowDays,
    };
  }
}

// ── Template helpers ──────────────────────────────────────────────────────────

function buildProjectedLabel(forecast: ContinuityForecast): string {
  const label30 = STATE_LABELS[forecast.projectedState30d] ?? forecast.projectedState30d;
  if (forecast.currentState === forecast.projectedState30d) {
    return `Expected to remain ${label30.toLowerCase()} over the next 30 days.`;
  }
  if (forecast.continuityTrend === 'IMPROVING') {
    return `Trending toward ${label30.toLowerCase()} continuity over the next 30 days.`;
  }
  if (forecast.continuityTrend === 'DECLINING') {
    return `Continuity may shift to ${label30.toLowerCase()} over the next 30 days — engagement with recommendations is advisable.`;
  }
  return `Projected to be ${label30.toLowerCase()} over the next 30 days.`;
}

function buildActionFromWindow(window: string): string {
  const actions: Record<string, string> = {
    IMMEDIATE:    'Review your recent operational recommendations — prompt engagement is advisable.',
    SHORT_TERM:   'Consider reviewing recommendations within the next few weeks.',
    MONITOR:      'Continue your current operational cadence and check in on recommendations.',
    LOW_PRIORITY: 'Maintain your current operational rhythm — no urgent action needed.',
  };
  return actions[window] ?? 'Continue monitoring your operational continuity.';
}

function buildCalmRationale(rationale: string): string {
  // Strip aggressive language, truncate to 120 chars
  return rationale
    .replace(/\bcollapse\b/gi, 'decline')
    .replace(/\bcatastrophic\b/gi, 'significant')
    .replace(/\bimminent\b/gi, 'upcoming')
    .substring(0, 120);
}
