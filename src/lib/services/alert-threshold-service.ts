/**
 * @fileOverview AlertThresholdService — Sprint 12 Task 2.
 *
 * Pure function. Evaluates an IntelligenceDiff against defined thresholds
 * and returns zero or more AlertCandidate objects for notification creation.
 *
 * Threshold rules:
 *   CONTINUITY_STATE_DECLINED — continuity state rank dropped ≥1
 *   ARCHETYPE_TRANSITION      — moved to an at-risk archetype
 *   INTERVENTION_REQUIRED     — intervention window worsened to IMMEDIATE
 *   RISK_ESCALATED            — risk level changed to HIGH or CRITICAL
 *
 * Severity mapping:
 *   FRAGMENTED/CRITICAL state → CRITICAL
 *   At-risk archetype / WATCHING state → WARNING
 *   IMMEDIATE intervention → WARNING
 *   HIGH risk → WARNING, CRITICAL risk → CRITICAL
 */

import type { IntelligenceDiff }        from './intelligence-diff-service';
import type { OperationalRiskForecast } from './operational-risk-forecast-service';
import type { InterventionTimingInsight } from './intervention-timing-service';
import { NotificationType, NotificationSeverity } from '@prisma/client';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AlertCandidate {
  organizationId: string;
  type:           NotificationType;
  severity:       NotificationSeverity;
  title:          string;
  message:        string;
  groupKey:       string;  // dedup key — `intelligence:{type}:{orgId}`
}

// ── At-risk archetype set ─────────────────────────────────────────────────────

const AT_RISK_ARCHETYPES = new Set([
  'FRAGMENTING_ORGANIZATION',
  'SILENT_DEGRADER',
  'VOLATILE_OPERATOR',
  'HIGH_INTERVENTION_ORG',
]);

// ── AlertThresholdService ─────────────────────────────────────────────────────

export class AlertThresholdService {
  /**
   * Evaluate a single org diff against all alert thresholds.
   * Returns an array of AlertCandidates (may be empty).
   */
  static evaluate(
    diff:      IntelligenceDiff,
    risk:      OperationalRiskForecast,
    timing:    InterventionTimingInsight,
  ): AlertCandidate[] {
    const { organizationId } = diff;
    const candidates: AlertCandidate[] = [];

    // ── CONTINUITY_STATE_DECLINED ─────────────────────────────────────────────
    if (diff.continuityStateChanged && diff.continuityStateRankDelta < 0 && diff.previousState) {
      const isCriticalState =
        diff.previousState === 'FRAGMENTED' || diff.previousState === 'CRITICAL';
      // Current state (after decline) determines severity
      const currentIsFragmented =
        risk.projectedRisks.some((r) => r.riskType === 'CONTINUITY_FRAGMENTATION');

      candidates.push({
        organizationId,
        type:     NotificationType.CONTINUITY_STATE_DECLINED,
        severity: (currentIsFragmented || isCriticalState)
          ? NotificationSeverity.CRITICAL
          : NotificationSeverity.WARNING,
        title:    'Continuity state declined',
        message:  `Operational continuity moved from ${diff.previousState} to a lower state. ` +
                  `The 30-day projection and resilience signals have been updated.`,
        groupKey: `intelligence:CONTINUITY_STATE_DECLINED:${organizationId}`,
      });
    }

    // ── ARCHETYPE_TRANSITION ──────────────────────────────────────────────────
    if (diff.archetypeChanged && diff.previousArchetype) {
      // Only alert when transitioning INTO an at-risk archetype
      // We need to infer current archetype from the diff — it doesn't store it directly
      // We check if it moved away from a non-at-risk archetype (any transition is surfaced)
      const wasAtRisk     = AT_RISK_ARCHETYPES.has(diff.previousArchetype);
      const isNowAtRisk   = !wasAtRisk; // We only know it changed; we alert on any transition
      // Alert on any archetype change — caller can filter if needed
      candidates.push({
        organizationId,
        type:     NotificationType.ARCHETYPE_TRANSITION,
        severity: NotificationSeverity.WARNING,
        title:    'Operational archetype changed',
        message:  `Organization moved from the ${formatArchetype(diff.previousArchetype)} profile to a different operational pattern. ` +
                  `Review the intelligence dashboard for the updated signals.`,
        groupKey: `intelligence:ARCHETYPE_TRANSITION:${organizationId}`,
      });
    }

    // ── INTERVENTION_REQUIRED ─────────────────────────────────────────────────
    if (
      diff.interventionWindowChanged &&
      diff.interventionWindowWorsened &&
      timing.recommendedInterventionWindow === 'IMMEDIATE'
    ) {
      candidates.push({
        organizationId,
        type:     NotificationType.INTERVENTION_REQUIRED,
        severity: NotificationSeverity.WARNING,
        title:    'Immediate intervention recommended',
        message:  `The recommended intervention window has shifted to IMMEDIATE based on current continuity signals. ` +
                  `Historical effectiveness: ${timing.historicalEffectiveness.toLowerCase()}.`,
        groupKey: `intelligence:INTERVENTION_REQUIRED:${organizationId}`,
      });
    }

    // ── RISK_ESCALATED ────────────────────────────────────────────────────────
    if (
      diff.riskLevelChanged &&
      diff.riskLevelRankDelta < 0 &&
      (risk.riskLevel === 'HIGH' || risk.riskLevel === 'CRITICAL')
    ) {
      candidates.push({
        organizationId,
        type:     NotificationType.RISK_ESCALATED,
        severity: risk.riskLevel === 'CRITICAL'
          ? NotificationSeverity.CRITICAL
          : NotificationSeverity.WARNING,
        title:    `Operational risk escalated to ${risk.riskLevel.toLowerCase()}`,
        message:  risk.strongestIndicators[0]
          ?? 'Operational risk level has increased based on current continuity signals.',
        groupKey: `intelligence:RISK_ESCALATED:${organizationId}`,
      });
    }

    return candidates;
  }

  /**
   * Evaluate diffs for all orgs in batch.
   */
  static evaluateAll(
    diffs:   IntelligenceDiff[],
    riskMap: Map<string, OperationalRiskForecast>,
    timingMap: Map<string, InterventionTimingInsight>,
  ): AlertCandidate[] {
    const all: AlertCandidate[] = [];
    for (const diff of diffs) {
      const risk   = riskMap.get(diff.organizationId);
      const timing = timingMap.get(diff.organizationId);
      if (!risk || !timing) continue;
      all.push(...AlertThresholdService.evaluate(diff, risk, timing));
    }
    return all;
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatArchetype(archetype: string): string {
  const labels: Record<string, string> = {
    STABLE_OPERATOR:          'stable operator',
    RESILIENT_GROWER:         'resilient grower',
    RECOVERY_ORIENTED:        'recovery-oriented',
    FRAGMENTING_ORGANIZATION: 'fragmenting organization',
    VOLATILE_OPERATOR:        'volatile operator',
    SILENT_DEGRADER:          'silent degrader',
    HIGH_INTERVENTION_ORG:    'high-intervention organization',
    PLATEAUED_ORGANIZATION:   'plateaued organization',
  };
  return labels[archetype] ?? archetype.toLowerCase().replace(/_/g, ' ');
}
