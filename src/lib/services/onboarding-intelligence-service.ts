/**
 * @fileOverview OnboardingIntelligenceService — Sprint 6 Task 4.
 *
 * Analyzes onboarding quality per organization: completion time, abandonment
 * patterns, replay provisioning frequency, and post-onboarding activation.
 *
 * Refinements:
 *   2:  calculatedAt, windowDays, calculationVersion
 *   5:  confidence
 *   9:  traceReferences, relatedEventIds, sourceScanIds, sourceRecommendationIds
 *   E:  stateless reads, replay-friendly
 */

import { db } from '@/lib/db';

// ── Types ─────────────────────────────────────────────────────────────────────

export type OnboardingState = 'SMOOTH' | 'FRICTION' | 'STALLED';
export type ConfidenceLevel = 'LOW' | 'MEDIUM' | 'HIGH';

export interface OnboardingQuality {
  organizationId:           string;
  onboardingState:          OnboardingState;
  completionDurationHours:  number;    // org.createdAt → first scan (or -1 if no scan)
  firstScanLatencyHours?:   number;    // same as above (hours), undefined if no scan
  activationScore:          number;    // 0–100
  replayProvisioningCount:  number;    // count of PROVISIONING_REPLAY events
  blockers:                 string[];
  confidence:               ConfidenceLevel; // Refinement 5

  // Refinement 9 — lineage
  traceReferences:          string[];
  relatedEventIds:          string[];
  sourceScanIds:            string[];
  sourceRecommendationIds:  string[];

  // Refinement 2
  calculatedAt:       string;
  windowDays:         7 | 30 | 90;
  calculationVersion: 'v1';
}

// ── OnboardingIntelligenceService ─────────────────────────────────────────────

export class OnboardingIntelligenceService {
  /**
   * Analyze onboarding quality for multiple organizations.
   *
   * @param orgIds    Real org IDs (sentinels excluded by caller)
   * @param orgs      Org metadata (id, createdAt) pre-loaded by caller
   * @param windowDays Rolling window (default: 30)
   */
  static async analyzeForOrgs(
    orgIds:     string[],
    orgs:       { id: string; createdAt: Date }[],
    windowDays: 7 | 30 | 90 = 30,
  ): Promise<OnboardingQuality[]> {
    if (orgIds.length === 0) return [];

    const calculatedAt = new Date().toISOString();

    // ── Batch queries (parallel) ──────────────────────────────────────────────
    const [
      firstScans,
      activeSchedules,
      actionedRecs,
      replayEvents,
    ] = await Promise.all([
      // First completed scan per org (get all, group in-memory)
      db.perceptionScan.findMany({
        where: {
          organizationId: { in: orgIds },
          status:         { in: ['COMPLETE', 'PARTIAL'] },
        },
        select: {
          id:             true,
          organizationId: true,
          completedAt:    true,
          createdAt:      true,
        },
        orderBy: { completedAt: 'asc' },
      }),

      // Active schedules per org
      db.scanSchedule.findMany({
        where: {
          organizationId: { in: orgIds },
          isActive:       true,
        },
        select: {
          id:             true,
          organizationId: true,
        },
      }),

      // Actioned recommendations per org (COMPLETED or IN_PROGRESS)
      db.recommendation.findMany({
        where: {
          status: { in: ['COMPLETED', 'IN_PROGRESS'] },
          perceptionScan: { organizationId: { in: orgIds } },
        },
        select: {
          id:             true,
          perceptionScan: { select: { organizationId: true } },
        },
      }),

      // PROVISIONING_REPLAY operational events per org
      db.operationalEvent.findMany({
        where: {
          organizationId: { in: orgIds },
          eventType:      'PROVISIONING_REPLAY',
        },
        select: {
          id:             true,
          organizationId: true,
          traceId:        true,
          createdAt:      true,
        },
      }),
    ]);

    // ── Build lookup maps ─────────────────────────────────────────────────────

    // First scan per org
    const firstScanByOrg = new Map<string, typeof firstScans[0]>();
    for (const scan of firstScans) {
      if (!firstScanByOrg.has(scan.organizationId)) {
        firstScanByOrg.set(scan.organizationId, scan);
      }
    }

    // Active schedule count per org
    const schedCountByOrg = new Map<string, number>();
    for (const s of activeSchedules) {
      schedCountByOrg.set(s.organizationId, (schedCountByOrg.get(s.organizationId) ?? 0) + 1);
    }

    // Actioned rec count per org
    const actionedRecsByOrg = new Map<string, string[]>();
    for (const rec of actionedRecs) {
      const oid = rec.perceptionScan.organizationId;
      const existing = actionedRecsByOrg.get(oid) ?? [];
      existing.push(rec.id);
      actionedRecsByOrg.set(oid, existing);
    }

    // Replay events per org
    const replayByOrg = new Map<string, typeof replayEvents>();
    for (const ev of replayEvents) {
      if (!ev.organizationId) continue;
      const existing = replayByOrg.get(ev.organizationId) ?? [];
      existing.push(ev);
      replayByOrg.set(ev.organizationId, existing);
    }

    const orgMeta = new Map(orgs.map((o) => [o.id, o]));

    // ── Compute per org ───────────────────────────────────────────────────────
    const results: OnboardingQuality[] = [];

    for (const orgId of orgIds) {
      const org          = orgMeta.get(orgId);
      const firstScan    = firstScanByOrg.get(orgId);
      const schedCount   = schedCountByOrg.get(orgId) ?? 0;
      const actionedRecs = actionedRecsByOrg.get(orgId) ?? [];
      const replays      = replayByOrg.get(orgId)       ?? [];

      // ── activationScore (0–100) ────────────────────────────────────────────
      const hasFirstScan      = firstScan !== undefined;
      const hasSchedule       = schedCount > 0;
      const hasActionedRecs   = actionedRecs.length >= 2;

      const activationScore =
        (hasFirstScan    ? 34 : 0) +
        (hasSchedule     ? 33 : 0) +
        (hasActionedRecs ? 33 : 0);

      // ── Completion duration ────────────────────────────────────────────────
      let completionDurationHours = -1;
      let firstScanLatencyHours: number | undefined;
      if (firstScan && org) {
        const scanTime = firstScan.completedAt ?? firstScan.createdAt;
        const diffMs   = scanTime.getTime() - org.createdAt.getTime();
        completionDurationHours = +(diffMs / (1000 * 60 * 60)).toFixed(1);
        firstScanLatencyHours   = completionDurationHours;
      }

      // ── Blockers ──────────────────────────────────────────────────────────
      const blockers: string[] = [];
      if (!hasFirstScan)  blockers.push('No perception scan completed yet.');
      if (!hasSchedule)   blockers.push('No active scan schedule configured.');
      if (!hasActionedRecs) blockers.push('Recommendations not yet actioned (need ≥2).');
      if (replays.length > 0) blockers.push(`Provisioning required replay ${replays.length} time(s).`);

      // ── OnboardingState ────────────────────────────────────────────────────
      const orgAgeHours = org
        ? (Date.now() - org.createdAt.getTime()) / (1000 * 60 * 60)
        : 0;

      const onboardingState: OnboardingState =
        (activationScore >= 66 && replays.length === 0 && completionDurationHours < 48 && completionDurationHours >= 0)
          ? 'SMOOTH' :
        (activationScore >= 34 || replays.length > 0)
          ? 'FRICTION' :
        'STALLED';

      // ── Confidence (Refinement 5) ──────────────────────────────────────────
      const dataPoints = (hasFirstScan ? 1 : 0) + (schedCount > 0 ? 1 : 0) + actionedRecs.length + replays.length;
      const confidence: ConfidenceLevel =
        (orgAgeHours > 72 && dataPoints >= 3)  ? 'HIGH'   :
        (orgAgeHours > 24 && dataPoints >= 1)  ? 'MEDIUM' :
        'LOW';

      // ── Lineage (Refinement 9) ─────────────────────────────────────────────
      const traceReferences = [...new Set(replays.map((e) => e.traceId))];
      const relatedEventIds = replays.map((e) => e.id);
      const sourceScanIds   = firstScan ? [firstScan.id] : [];

      results.push({
        organizationId:           orgId,
        onboardingState,
        completionDurationHours,
        firstScanLatencyHours,
        activationScore,
        replayProvisioningCount:  replays.length,
        blockers,
        confidence,
        traceReferences,
        relatedEventIds,
        sourceScanIds,
        sourceRecommendationIds:  actionedRecs.slice(0, 10),
        calculatedAt,
        windowDays,
        calculationVersion:       'v1',
      });
    }

    return results;
  }
}
