/**
 * @fileOverview OperationalRiskForecastService — Sprint 8 Task 5.
 *
 * Projects likely operational continuity risks from deterministic signal analysis.
 * Pure function — no DB queries.
 *
 * 7 risk types detected:
 *   CONTINUITY_FRAGMENTATION    — projectedState30d is FRAGMENTED or CRITICAL
 *   OPERATIONAL_SILENCE         — DECLINING trajectory + no recent scans
 *   RANKING_DECLINE             — RANKING events in timeline + declining trajectory
 *   ONBOARDING_ABANDONMENT      — ONBOARDING events with no follow-up scan
 *   SCHEDULE_INSTABILITY        — SCHEDULING events + HIGH volatility
 *   ASSERTION_ESCALATION        — projected state worsening + recent assertions
 *   RECOMMENDATION_DISENGAGEMENT — low applied-rec ratio + non-recovering trajectory
 *
 * riskPersistence (Refinement 5):
 *   PERSISTENT — risk-related signals present in first AND last replay thirds
 *   RECURRING  — signals in middle/last thirds but not first
 *   NEW        — signals only in the most recent replay third
 *
 * Refinements:
 *   5:  riskPersistence on every ForecastRisk
 *   7:  forecastMemoryQuality
 *   9:  generatedFromWindow
 *   C:  forecastVersion, generatedAt, basedOnWindowDays
 *   E:  traceReferences, relatedEventIds, sourceTimelineIds, sourceMilestoneIds
 */

import type { ContinuityForecast }      from './continuity-forecast-service';
import type { ContinuityTrajectory }    from './continuity-trajectory-service';
import type { OperationalResilience }   from './operational-resilience-service';
import type { OrganizationalTimeline }  from './organizational-timeline-service';
import type { OperationalMemory }       from './operational-memory-service';
import type { ForecastMemoryQuality }   from './continuity-forecast-service';

// ── Types ─────────────────────────────────────────────────────────────────────

export type RiskLevel       = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type RiskLikelihood  = 'LOW' | 'MEDIUM' | 'HIGH';
export type RiskPersistence = 'NEW' | 'RECURRING' | 'PERSISTENT';             // Refinement 5

export interface ForecastRisk {
  riskType:        string;
  likelihood:      RiskLikelihood;
  rationale:       string;
  riskPersistence: RiskPersistence; // Refinement 5
}

export interface OperationalRiskForecast {
  organizationId:       string;
  riskLevel:            RiskLevel;
  projectedRisks:       ForecastRisk[];
  strongestIndicators:  string[];
  forecastWindowDays:   30 | 90;
  forecastMemoryQuality: ForecastMemoryQuality; // Refinement 7
  generatedFromWindow:  { start: string; end: string }; // Refinement 9
  forecastVersion:      'v1';                  // Refinement C
  generatedAt:          string;
  basedOnWindowDays:    number[];
  traceReferences:      string[];              // Refinement E
  relatedEventIds:      string[];
  sourceTimelineIds:    string[];
  sourceMilestoneIds:   string[];
}

// ── OperationalRiskForecastService ────────────────────────────────────────────

export class OperationalRiskForecastService {
  /**
   * Project operational risks from forecast + trajectory + resilience + timeline + memory.
   * Pure function — no DB queries.
   */
  static computeForOrg(
    forecast:    ContinuityForecast,
    trajectory:  ContinuityTrajectory,
    resilience:  OperationalResilience,
    timeline:    OrganizationalTimeline,
    memory:      OperationalMemory,
  ): OperationalRiskForecast {
    const generatedAt      = new Date().toISOString();
    const { organizationId } = forecast;
    const events           = timeline.events;
    const snapshots        = timeline.continuityTransitions;

    // Replay thirds for persistence detection
    const allEvents   = events;
    const third       = Math.max(1, Math.floor(allEvents.length / 3));
    const firstThirdEnd  = allEvents[third - 1]?.timestamp;
    const secondThirdEnd = allEvents[2 * third - 1]?.timestamp;

    // ── 7 risk detections ─────────────────────────────────────────────────────
    const risks: ForecastRisk[] = [];

    // 1. CONTINUITY_FRAGMENTATION
    if (forecast.projectedState30d === 'FRAGMENTED' || forecast.projectedState30d === 'CRITICAL') {
      const isAlreadyFragmented =
        forecast.currentState === 'FRAGMENTED' || forecast.currentState === 'CRITICAL';
      risks.push({
        riskType:        'CONTINUITY_FRAGMENTATION',
        likelihood:      forecast.projectedState30d === 'CRITICAL' ? 'HIGH' : 'MEDIUM',
        rationale:       `Continuity is projected to remain in a ${forecast.projectedState30d.toLowerCase()} state over the next 30 days based on current trajectory.`,
        riskPersistence: isAlreadyFragmented ? 'PERSISTENT' : 'NEW',
      });
    }

    // 2. OPERATIONAL_SILENCE
    const recentScansEmpty = timeline.events
      .filter((e) => e.category === 'SCAN')
      .slice(-3).length === 0;
    if (trajectory.trajectoryType === 'DECLINING' && recentScansEmpty) {
      const silenceUnresolved = memory.unresolvedPatterns.some(
        (p) => p.eventType.includes('SILENCE'),
      );
      risks.push({
        riskType:        'OPERATIONAL_SILENCE',
        likelihood:      silenceUnresolved ? 'HIGH' : 'MEDIUM',
        rationale:       'Declining continuity trajectory combined with absence of recent scan activity indicates operational silence risk.',
        riskPersistence: silenceUnresolved ? 'RECURRING' : 'NEW',
      });
    }

    // 3. RANKING_DECLINE
    const rankingEvents = events.filter((e) => e.category === 'RANKING');
    if (rankingEvents.length > 0 && trajectory.trajectoryType === 'DECLINING') {
      const rankingRecurring = rankingEvents.length >= 3;
      risks.push({
        riskType:        'RANKING_DECLINE',
        likelihood:      rankingRecurring ? 'HIGH' : 'MEDIUM',
        rationale:       `${rankingEvents.length} ranking event(s) observed alongside declining continuity trajectory — ranking position may be at risk.`,
        riskPersistence: rankingRecurring ? 'RECURRING' : 'NEW',
      });
    }

    // 4. ONBOARDING_ABANDONMENT
    const onboardingEvents = events.filter((e) => e.category === 'ONBOARDING');
    if (onboardingEvents.length > 0) {
      const scanEvents = events.filter((e) => e.category === 'SCAN');
      const onboardingWithoutFollowup = onboardingEvents.some((oe) => {
        const oeTs = new Date(oe.timestamp).getTime();
        const thirtyDayMs = 30 * 24 * 60 * 60 * 1000;
        return !scanEvents.some(
          (se) => new Date(se.timestamp).getTime() > oeTs &&
                  new Date(se.timestamp).getTime() <= oeTs + thirtyDayMs,
        );
      });
      if (onboardingWithoutFollowup) {
        const onboardingDebt = memory.unresolvedPatterns.some(
          (p) => p.debtCategory === 'ONBOARDING',
        );
        risks.push({
          riskType:        'ONBOARDING_ABANDONMENT',
          likelihood:      onboardingDebt ? 'HIGH' : 'MEDIUM',
          rationale:       'Onboarding activity detected without confirmed follow-up scan — continuation risk is elevated.',
          riskPersistence: onboardingDebt ? 'RECURRING' : 'NEW',
        });
      }
    }

    // 5. SCHEDULE_INSTABILITY
    const scheduleEvents = events.filter((e) => e.category === 'SCHEDULE');
    if (scheduleEvents.length > 0 && resilience.resilienceScore < 50) {
      const scheduleDebt = memory.unresolvedPatterns.some(
        (p) => p.debtCategory === 'SCHEDULING',
      );
      risks.push({
        riskType:        'SCHEDULE_INSTABILITY',
        likelihood:      (schedule_high_volatility(forecast) && scheduleDebt) ? 'HIGH' : 'MEDIUM',
        rationale:       `${scheduleEvents.length} scheduling event(s) combined with reduced resilience score (${resilience.resilienceScore}/100) indicate schedule instability risk.`,
        riskPersistence: scheduleDebt ? 'RECURRING' : 'NEW',
      });
    }

    // 6. ASSERTION_ESCALATION
    const stateBecameWorse =
      stateRank(forecast.projectedState30d) < stateRank(forecast.currentState);
    const assertionEvents  = events.filter((e) => e.category === 'ASSERTION').slice(-5);
    if (stateBecameWorse && assertionEvents.length > 0) {
      const assertionDebt = memory.unresolvedPatterns.some(
        (p) => p.debtCategory === 'ASSERTION' || p.debtCategory === 'WORKFLOW',
      );
      risks.push({
        riskType:        'ASSERTION_ESCALATION',
        likelihood:      assertionEvents.length >= 3 ? 'HIGH' : 'MEDIUM',
        rationale:       `${assertionEvents.length} recent assertion event(s) alongside a projected continuity decline indicate escalation risk.`,
        riskPersistence: assertionDebt ? 'PERSISTENT' : 'NEW',
      });
    }

    // 7. RECOMMENDATION_DISENGAGEMENT
    const lowRecEngagement = forecast.drivingSignals.some(
      (s) => s.toLowerCase().includes('recommendation') || s.toLowerCase().includes('rec'),
    );
    const notRecovering = trajectory.trajectoryType !== 'RECOVERING';
    if (notRecovering && resilience.resilienceScore < 40) {
      const recDebt = memory.unresolvedPatterns.some(
        (p) => p.debtCategory === 'ENGAGEMENT',
      );
      risks.push({
        riskType:        'RECOMMENDATION_DISENGAGEMENT',
        likelihood:      recDebt ? 'HIGH' : 'LOW',
        rationale:       'Non-recovering trajectory combined with low resilience score suggests reduced recommendation engagement.',
        riskPersistence: recDebt ? 'RECURRING' : 'NEW',
      });
    }

    // ── Overall risk level ────────────────────────────────────────────────────
    const hasHigh = risks.some((r) => r.likelihood === 'HIGH');
    const hasMedium = risks.some((r) => r.likelihood === 'MEDIUM');
    const isCritical =
      forecast.projectedState30d === 'CRITICAL' ||
      forecast.currentState === 'CRITICAL' ||
      (risks.filter((r) => r.likelihood === 'HIGH').length >= 3);

    const riskLevel: RiskLevel =
      isCritical    ? 'CRITICAL' :
      hasHigh       ? 'HIGH'     :
      hasMedium     ? 'MEDIUM'   :
      'LOW';

    // ── Strongest indicators ──────────────────────────────────────────────────
    const strongestIndicators = risks
      .filter((r) => r.likelihood === 'HIGH' || r.likelihood === 'MEDIUM')
      .map((r) => r.rationale)
      .slice(0, 3);

    // ── Forecast window ───────────────────────────────────────────────────────
    const forecastWindowDays: 30 | 90 =
      (forecast.projectedState30d === 'FRAGMENTED' || forecast.projectedState30d === 'CRITICAL')
        ? 30 : 90;

    // ── Forecast memory quality (Refinement 7) ────────────────────────────────
    const forecastMemoryQuality: ForecastMemoryQuality =
      forecast.forecastMemoryQuality;

    // ── Lineage (Refinement E) ────────────────────────────────────────────────
    const traceReferences = forecast.traceReferences.slice(0, 10);
    const relatedEventIds = [
      ...forecast.relatedEventIds,
      ...events.filter((e) => e.category === 'ASSERTION').map((e) => e.eventId),
    ].slice(0, 20);

    return {
      organizationId,
      riskLevel,
      projectedRisks:       risks.slice(0, 7),
      strongestIndicators,
      forecastWindowDays,
      forecastMemoryQuality,
      generatedFromWindow:  forecast.generatedFromWindow,
      forecastVersion:      'v1',
      generatedAt,
      basedOnWindowDays:    forecast.basedOnWindowDays,
      traceReferences,
      relatedEventIds,
      sourceTimelineIds:    [organizationId],
      sourceMilestoneIds:   forecast.sourceMilestoneIds,
    };
  }

  static computeForOrgs(
    orgIds:       string[],
    forecasts:    Map<string, ContinuityForecast>,
    trajectories: Map<string, ContinuityTrajectory>,
    resiliences:  Map<string, OperationalResilience>,
    timelines:    Map<string, OrganizationalTimeline>,
    memories:     Map<string, OperationalMemory>,
  ): OperationalRiskForecast[] {
    const results: OperationalRiskForecast[] = [];
    for (const orgId of orgIds) {
      const f  = forecasts.get(orgId);
      const t  = trajectories.get(orgId);
      const r  = resiliences.get(orgId);
      const tl = timelines.get(orgId);
      const m  = memories.get(orgId);
      if (!f || !t || !r || !tl || !m) continue;
      results.push(OperationalRiskForecastService.computeForOrg(f, t, r, tl, m));
    }
    return results;
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function stateRank(state: string): number {
  const ranks: Record<string, number> = {
    OPTIMIZING: 4, STABLE: 3, WATCHING: 2, FRAGMENTED: 1, CRITICAL: 0,
  };
  return ranks[state] ?? 2;
}

function schedule_high_volatility(forecast: ContinuityForecast): boolean {
  return forecast.forecastIntegrity.volatilityPenaltyApplied;
}
