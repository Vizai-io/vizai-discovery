/**
 * @fileOverview RecommendationImpactService — Sprint 6 Task 2.
 *
 * Determines whether completed recommendations actually improved operational state.
 * Uses rec.completedAt as the temporal boundary:
 *   - "before" = the scan that generated the recommendation
 *   - "after"  = the earliest completed scan for the same org after completedAt
 *
 * Pure deterministic analysis. No AI/LLM. No writes.
 *
 * Refinements:
 *   C:  confidence: LOW | MEDIUM | HIGH
 *   4:  timeToImpactDays (afterScan.createdAt - rec.completedAt)
 *   9:  traceReferences, relatedEventIds, sourceScanIds, sourceRecommendationIds
 *   2:  calculatedAt, windowDays, calculationVersion
 *   E:  stateless, replay-friendly
 */

import { db } from '@/lib/db';

// ── Types ─────────────────────────────────────────────────────────────────────

export type ImpactState     = 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE' | 'INSUFFICIENT_DATA';
export type ConfidenceLevel = 'LOW' | 'MEDIUM' | 'HIGH';

export interface RecommendationImpact {
  recommendationId:  string;
  organizationId:    string;
  category:          string;
  priority:          string;

  impactState:       ImpactState;
  confidence:        ConfidenceLevel; // Refinement C
  rankingDelta:      number;          // reserved — 0 until ranking correlation added
  visibilityDelta:   number;          // afterScore - beforeScore (or 0)
  frictionDelta:     number;          // assertion events: before - after (positive = less friction)
  timeToImpactDays?: number;          // Refinement 4

  measuredAt: string;

  // Refinement 9 — lineage
  traceReferences:        string[];
  relatedEventIds:        string[];
  sourceScanIds:          string[];
  sourceRecommendationIds: string[];

  // Refinement 2
  calculatedAt:       string;
  windowDays:         7 | 30 | 90;
  calculationVersion: 'v1';
}

// ── Assertion event types used for friction delta ─────────────────────────────

const ASSERTION_TYPES = [
  'FREE_SCAN_PIPELINE_INCOMPLETE',
  'PUBLIC_RUNTIME_FLOW_BROKEN',
  'RANKING_PIPELINE_INCOMPLETE',
  'SYSTEM_RUNTIME_DEGRADATION',
  'ORGANIZATIONAL_CONTINUITY_RISK',
  'OPERATIONAL_SILENCE_DETECTED',
];

// ── Score helper ──────────────────────────────────────────────────────────────

function meanScore(r: {
  accuracyScore: number;
  coverageScore: number;
  entityUnderstandingScore: number;
  consistencyScore: number;
}): number {
  return (r.accuracyScore + r.coverageScore + r.entityUnderstandingScore + r.consistencyScore) / 4;
}

// ── RecommendationImpactService ───────────────────────────────────────────────

export class RecommendationImpactService {
  /**
   * Compute recommendation impact for all orgs.
   * Returns one RecommendationImpact per completed recommendation found.
   * Recommendations with status !== COMPLETED are excluded.
   */
  static async computeForOrgs(
    orgIds:     string[],
    windowDays: 7 | 30 | 90 = 30,
  ): Promise<RecommendationImpact[]> {
    if (orgIds.length === 0) return [];

    const calculatedAt = new Date().toISOString();

    // ── 1. Fetch completed recommendations with their source scan + report ────
    const completedRecs = await db.recommendation.findMany({
      where: {
        status:      'COMPLETED',
        completedAt: { not: null },
        perceptionScan: {
          organizationId: { in: orgIds },
          status:         { in: ['COMPLETE', 'PARTIAL'] },
        },
      },
      select: {
        id:          true,
        completedAt: true,
        priority:    true,
        category:    true,
        perceptionScan: {
          select: {
            id:             true,
            organizationId: true,
            completedAt:    true,
            scanReport: {
              select: {
                accuracyScore:            true,
                coverageScore:            true,
                entityUnderstandingScore: true,
                consistencyScore:         true,
              },
            },
          },
        },
      },
      orderBy: { completedAt: 'asc' },
    });

    if (completedRecs.length === 0) return [];

    // ── 2. Fetch all completed scans with reports for relevant orgs ───────────
    const relevantOrgIds = [...new Set(completedRecs.map((r) => r.perceptionScan.organizationId))];

    const allScans = await db.perceptionScan.findMany({
      where: {
        organizationId: { in: relevantOrgIds },
        status:         { in: ['COMPLETE', 'PARTIAL'] },
        scanReport:     { isNot: null },
      },
      select: {
        id:             true,
        organizationId: true,
        createdAt:      true,
        completedAt:    true,
        scanReport: {
          select: {
            accuracyScore:            true,
            coverageScore:            true,
            entityUnderstandingScore: true,
            consistencyScore:         true,
          },
        },
      },
      orderBy: { completedAt: 'asc' },
    });

    // ── 3. Fetch assertion events for friction delta ───────────────────────────
    // 7-day window before/after each rec.completedAt — pull all, filter per rec
    const allAssertionEvents = await db.operationalEvent.findMany({
      where: {
        organizationId: { in: relevantOrgIds },
        eventType:      { in: ASSERTION_TYPES },
      },
      select: {
        id:             true,
        organizationId: true,
        traceId:        true,
        eventType:      true,
        createdAt:      true,
      },
    });

    // ── Build scan lookup: orgId → sorted scans (asc by completedAt) ──────────
    const scansByOrg = new Map<string, typeof allScans>();
    for (const scan of allScans) {
      const existing = scansByOrg.get(scan.organizationId) ?? [];
      existing.push(scan);
      scansByOrg.set(scan.organizationId, existing);
    }

    // ── Compute per recommendation ────────────────────────────────────────────
    const results: RecommendationImpact[] = [];

    for (const rec of completedRecs) {
      const orgId       = rec.perceptionScan.organizationId;
      const sourceScan  = rec.perceptionScan;
      const completedAt = rec.completedAt!;
      const orgScans    = scansByOrg.get(orgId) ?? [];

      const beforeReport = sourceScan.scanReport;
      const beforeScore  = beforeReport ? meanScore(beforeReport) : null;

      // "After" = first scan completed strictly after rec.completedAt (different from source scan)
      const afterScan = orgScans.find(
        (s) => s.id !== sourceScan.id &&
               (s.completedAt ?? s.createdAt) > completedAt,
      ) ?? null;
      const afterScore  = afterScan?.scanReport ? meanScore(afterScan.scanReport) : null;

      // ── visibilityDelta ───────────────────────────────────────────────────
      const visibilityDelta = (beforeScore !== null && afterScore !== null)
        ? +( afterScore - beforeScore).toFixed(2)
        : 0;

      // ── frictionDelta (positive = fewer assertions after = good) ──────────
      const sevenDayMs    = 7 * 24 * 60 * 60 * 1000;
      const beforeEvents  = allAssertionEvents.filter(
        (e) => e.organizationId === orgId &&
               e.createdAt.getTime() >= completedAt.getTime() - sevenDayMs &&
               e.createdAt < completedAt,
      );
      const afterEvents = afterScan
        ? allAssertionEvents.filter(
            (e) => e.organizationId === orgId &&
                   e.createdAt >= completedAt &&
                   e.createdAt.getTime() <= completedAt.getTime() + sevenDayMs,
          )
        : [];
      const frictionDelta = beforeEvents.length - afterEvents.length;

      // ── impactState ────────────────────────────────────────────────────────
      let impactState: ImpactState;
      if (beforeScore === null) {
        impactState = 'INSUFFICIENT_DATA';
      } else if (afterScore === null) {
        impactState = 'INSUFFICIENT_DATA';
      } else if (visibilityDelta > 3 || frictionDelta > 1) {
        impactState = 'POSITIVE';
      } else if (visibilityDelta < -3) {
        impactState = 'NEGATIVE';
      } else {
        impactState = 'NEUTRAL';
      }

      // ── confidence (Refinement C) ──────────────────────────────────────────
      const confidence: ConfidenceLevel =
        (beforeScore !== null && afterScore !== null) ? 'HIGH' :
        (beforeScore !== null || afterScore !== null) ? 'MEDIUM' :
        'LOW';

      // ── timeToImpactDays (Refinement 4) ───────────────────────────────────
      const timeToImpactDays = afterScan
        ? Math.round(
            ((afterScan.completedAt ?? afterScan.createdAt).getTime() - completedAt.getTime())
            / (1000 * 60 * 60 * 24),
          )
        : undefined;

      // ── Lineage (Refinement 9) ─────────────────────────────────────────────
      const relatedEvents  = [...beforeEvents, ...afterEvents];
      const traceReferences = [...new Set(relatedEvents.map((e) => e.traceId))];
      const relatedEventIds = relatedEvents.map((e) => e.id);
      const sourceScanIds   = [sourceScan.id, ...(afterScan ? [afterScan.id] : [])];

      results.push({
        recommendationId:        rec.id,
        organizationId:          orgId,
        category:                rec.category,
        priority:                rec.priority,
        impactState,
        confidence,
        rankingDelta:            0,  // reserved
        visibilityDelta,
        frictionDelta,
        timeToImpactDays,
        measuredAt:              calculatedAt,
        traceReferences,
        relatedEventIds,
        sourceScanIds,
        sourceRecommendationIds: [rec.id],
        calculatedAt,
        windowDays,
        calculationVersion:      'v1',
      });
    }

    return results;
  }
}
