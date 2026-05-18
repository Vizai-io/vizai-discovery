/**
 * @fileOverview IntelligenceRecommendationService — Sprint 17.
 *
 * Generates Recommendation rows sourced from the intelligence pipeline
 * (not from a perception scan). Called by /api/cron/intelligence-snapshot
 * after snapshot persistence and alerting.
 *
 * Source tag: source = "INTELLIGENCE"
 *
 * Deduplication:
 *   Skips creation if an OPEN intelligence-sourced recommendation already
 *   exists for the same (organizationId, category). Prevents duplicate
 *   recommendations across daily cron runs.
 *
 * Rules (evaluated in priority order):
 *   1. AT_RISK archetype  → "Improve AI Visibility Consistency"   (HIGH)
 *   2. HIGH/CRITICAL risk → "Address AI Visibility Risk"          (HIGH)
 *   3. IMMEDIATE timing   → "Take Immediate Action on AI Presence"(HIGH)
 */

import { db }      from '@/lib/db';
import type { OperationalArchetype }        from './operational-archetype-service';
import type { OperationalRiskForecast }     from './operational-risk-forecast-service';
import type { InterventionTimingInsight }   from './intervention-timing-service';

// ── Constants ─────────────────────────────────────────────────────────────────

const SOURCE = 'INTELLIGENCE';

const AT_RISK_ARCHETYPES = new Set([
  'FRAGMENTING_ORGANIZATION',
  'SILENT_DEGRADER',
  'VOLATILE_OPERATOR',
  'HIGH_INTERVENTION_ORG',
]);

// ── Types ─────────────────────────────────────────────────────────────────────

interface RecommendationCandidate {
  category:          string;
  title:             string;
  reason:            string;
  recommendedAction: string;
  serviceLink?:      string;
}

// ── IntelligenceRecommendationService ────────────────────────────────────────

export class IntelligenceRecommendationService {
  /**
   * Evaluate intelligence signals and persist any new recommendations.
   * Returns the count of recommendations created.
   */
  static async generateForOrg(
    organizationId: string,
    archetype:      OperationalArchetype,
    risk:           OperationalRiskForecast,
    timing:         InterventionTimingInsight,
  ): Promise<number> {
    const candidates: RecommendationCandidate[] = [];

    // ── Rule 1: At-risk archetype ─────────────────────────────────────────────
    if (AT_RISK_ARCHETYPES.has(archetype.archetype)) {
      candidates.push({
        category:          'AI Visibility Consistency',
        title:             'Improve AI Visibility Consistency',
        reason:            `Your organization is operating under the "${formatArchetype(archetype.archetype)}" ` +
                           `profile, which signals fragmentation or instability in how AI systems perceive ` +
                           `your brand. Consistent, accurate information across sources is essential for ` +
                           `maintaining a healthy AI presence.`,
        recommendedAction: 'Audit and align your business information across directories, your website, ' +
                           'and structured data sources. Prioritize high-authority platforms first. ' +
                           'Use the VizAI truth publishing workflow to push verified facts to AI indexes.',
        serviceLink:       '/recommendations',
      });
    }

    // ── Rule 2: HIGH or CRITICAL risk ─────────────────────────────────────────
    if (risk.riskLevel === 'HIGH' || risk.riskLevel === 'CRITICAL') {
      const topIndicator = risk.strongestIndicators[0]
        ?? 'Operational risk signals are elevated based on current continuity data.';

      candidates.push({
        category:          'AI Visibility Risk',
        title:             `Address ${risk.riskLevel === 'CRITICAL' ? 'Critical' : 'High'} AI Visibility Risk`,
        reason:            `Risk level has reached ${risk.riskLevel}. ${topIndicator}`,
        recommendedAction: 'Review the full intelligence report to identify the root continuity signals. ' +
                           'Focus on scan accuracy and coverage scores, then address any gaps in how ' +
                           'AI models understand your core offerings and entity attributes.',
        serviceLink:       '/dashboard',
      });
    }

    // ── Rule 3: IMMEDIATE intervention window ─────────────────────────────────
    if (timing.recommendedInterventionWindow === 'IMMEDIATE') {
      candidates.push({
        category:          'AI Presence Intervention',
        title:             'Take Immediate Action on AI Presence',
        reason:            `The recommended intervention window is IMMEDIATE. Historical effectiveness ` +
                           `for interventions at this stage is rated "${timing.historicalEffectiveness}". ` +
                           `Delaying action increases the risk of compounding continuity decline.`,
        recommendedAction: 'Engage the VizAI team for a structured intervention session. ' +
                           'In parallel, run a fresh perception scan to capture the current AI state ' +
                           'and use the results to prioritize the highest-impact corrections.',
        serviceLink:       '/dashboard',
      });
    }

    if (candidates.length === 0) return 0;

    // ── Dedup: fetch open intelligence recs for this org ─────────────────────
    const existingOpen = await db.recommendation.findMany({
      where: {
        organizationId,
        source: SOURCE,
        status: 'OPEN',
      },
      select: { category: true },
    });
    const openCategories = new Set(existingOpen.map((r) => r.category));

    // Filter out already-open categories
    const toCreate = candidates.filter((c) => !openCategories.has(c.category));

    if (toCreate.length === 0) return 0;

    await db.recommendation.createMany({
      data: toCreate.map((c) => ({
        organizationId,
        source:            SOURCE,
        perceptionScanId:  null,
        priority:          'HIGH',
        category:          c.category,
        title:             c.title,
        reason:            c.reason,
        recommendedAction: c.recommendedAction,
        serviceLink:       c.serviceLink ?? null,
        status:            'OPEN',
        openedAt:          new Date(),
      })),
    });

    return toCreate.length;
  }

  /**
   * Run for all orgs in batch. Non-throwing — errors per org are logged.
   * Returns total recommendations created across all orgs.
   */
  static async generateForOrgs(
    orgIds:       string[],
    archetypeMap: Map<string, OperationalArchetype>,
    riskMap:      Map<string, OperationalRiskForecast>,
    timingMap:    Map<string, InterventionTimingInsight>,
  ): Promise<number> {
    let total = 0;
    for (const orgId of orgIds) {
      const archetype = archetypeMap.get(orgId);
      const risk      = riskMap.get(orgId);
      const timing    = timingMap.get(orgId);
      if (!archetype || !risk || !timing) continue;
      try {
        total += await IntelligenceRecommendationService.generateForOrg(orgId, archetype, risk, timing);
      } catch (err) {
        console.error(`[IntelligenceRecommendationService] Failed for org ${orgId}:`, err);
      }
    }
    return total;
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatArchetype(archetype: string): string {
  const labels: Record<string, string> = {
    FRAGMENTING_ORGANIZATION: 'Fragmenting Organization',
    VOLATILE_OPERATOR:        'Volatile Operator',
    SILENT_DEGRADER:          'Silent Degrader',
    HIGH_INTERVENTION_ORG:    'High-Intervention Organization',
  };
  return labels[archetype] ?? archetype.replace(/_/g, ' ');
}
