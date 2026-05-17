/**
 * @fileOverview ResilienceBenchmarkService — Sprint 9 Task 5.
 *
 * Groups organizations by operational archetype and benchmarks resilience
 * characteristics within each group. Pure function — no DB queries.
 *
 * For each archetype group computes:
 *   - averageResilienceScore from all orgs in the group
 *   - benchmarkState derived from averageResilienceScore
 *   - consistencyState from intra-group score variance (Refinement 5)
 *   - dominantProtectivePatterns / dominantRiskPatterns from union of org factors
 *   - benchmarkConfidence from group size (Refinement 2)
 *   - sampleSize for confidence weighting
 *
 * benchmarkState thresholds:
 *   ≥70 → HIGHLY_RESILIENT | ≥45 → MODERATELY_RESILIENT | ≥25 → FRAGILE | <25 → UNSTABLE
 *
 * consistencyState (intra-group score variance):
 *   variance < 100  → CONSISTENT
 *   variance < 400  → VARIABLE
 *   variance ≥ 400  → UNSTABLE
 *
 * Refinements:
 *   2:  benchmarkConfidence — LOW | MEDIUM | HIGH
 *   5:  consistencyState — CONSISTENT | VARIABLE | UNSTABLE
 *   9:  generatedFromWindow
 *   E:  traceReferences, relatedEventIds, sourceOrganizationIds
 */

import type { OperationalResilience }   from './operational-resilience-service';
import type { OperationalArchetype }    from './operational-archetype-service';

// ── Types ─────────────────────────────────────────────────────────────────────

export type BenchmarkState      = 'HIGHLY_RESILIENT' | 'MODERATELY_RESILIENT' | 'FRAGILE' | 'UNSTABLE';
export type BenchmarkConfidence = 'LOW' | 'MEDIUM' | 'HIGH';  // Refinement 2
export type ConsistencyState    = 'CONSISTENT' | 'VARIABLE' | 'UNSTABLE';  // Refinement 5

export interface ResilienceBenchmark {
  archetypeGroup:               string;
  benchmarkState:               BenchmarkState;
  averageResilienceScore:       number;
  consistencyState:             ConsistencyState;   // Refinement 5
  dominantProtectivePatterns:   string[];
  dominantRiskPatterns:         string[];
  sampleSize:                   number;
  benchmarkConfidence:          BenchmarkConfidence; // Refinement 2
  generatedFromWindow:          { start: string; end: string }; // Refinement 9
  forecastVersion:              'v1';
  generatedAt:                  string;
  traceReferences:              string[];  // Refinement E
  relatedEventIds:              string[];
  sourceOrganizationIds:        string[];
}

// ── ResilienceBenchmarkService ────────────────────────────────────────────────

export class ResilienceBenchmarkService {
  /**
   * Compute resilience benchmarks grouped by operational archetype.
   * Pure function — no DB queries.
   */
  static computeBenchmarks(
    resiliences:         OperationalResilience[],
    archetypes:          OperationalArchetype[],
    generatedFromWindow: { start: string; end: string },
  ): ResilienceBenchmark[] {
    const generatedAt = new Date().toISOString();

    // Build lookup: orgId → archetype type
    const archetypeMap = new Map(archetypes.map((a) => [a.organizationId, a.archetype]));

    // Build lookup: orgId → resilience
    const resilienceMap = new Map(resiliences.map((r) => [r.organizationId, r]));

    // Group resiliences by archetype
    const groups = new Map<string, OperationalResilience[]>();
    for (const resilience of resiliences) {
      const archetypeType = archetypeMap.get(resilience.organizationId);
      if (!archetypeType) continue;  // Skip orgs without a classified archetype
      const existing = groups.get(archetypeType) ?? [];
      existing.push(resilience);
      groups.set(archetypeType, existing);
    }

    const benchmarks: ResilienceBenchmark[] = [];

    for (const [archetypeGroup, items] of groups) {
      if (items.length === 0) continue;

      const sampleSize = items.length;
      const scores     = items.map((i) => i.resilienceScore);

      // Average resilience score
      const averageResilienceScore = Math.round(
        scores.reduce((a, b) => a + b, 0) / sampleSize,
      );

      // Benchmark state from average score
      const benchmarkState: BenchmarkState =
        averageResilienceScore >= 70 ? 'HIGHLY_RESILIENT'    :
        averageResilienceScore >= 45 ? 'MODERATELY_RESILIENT' :
        averageResilienceScore >= 25 ? 'FRAGILE'              :
        'UNSTABLE';

      // Consistency state from intra-group score variance (Refinement 5)
      const variance = computeVariance(scores);
      const consistencyState: ConsistencyState =
        variance < 100  ? 'CONSISTENT' :
        variance < 400  ? 'VARIABLE'   :
        'UNSTABLE';

      // Dominant protective patterns — union of all org factors, most frequent first
      const protectiveFreq = new Map<string, number>();
      for (const item of items) {
        for (const factor of item.strongestProtectiveFactors) {
          protectiveFreq.set(factor, (protectiveFreq.get(factor) ?? 0) + 1);
        }
      }
      const dominantProtectivePatterns = [...protectiveFreq.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([factor]) => factor)
        .slice(0, 4);

      // Dominant risk patterns — union of all org risk factors, most frequent first
      const riskFreq = new Map<string, number>();
      for (const item of items) {
        for (const factor of item.strongestRiskFactors) {
          riskFreq.set(factor, (riskFreq.get(factor) ?? 0) + 1);
        }
      }
      const dominantRiskPatterns = [...riskFreq.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([factor]) => factor)
        .slice(0, 4);

      // Benchmark confidence from group size (Refinement 2)
      const benchmarkConfidence: BenchmarkConfidence =
        sampleSize >= 5 ? 'HIGH'   :
        sampleSize >= 2 ? 'MEDIUM' :
        'LOW';

      // Lineage fields (Refinement E)
      const sourceOrganizationIds = items.map((i) => i.organizationId).slice(0, 20);
      const relatedEventIds = [
        ...new Set(items.flatMap((i) => i.relatedEventIds)),
      ].slice(0, 20);
      const traceReferences = [
        ...new Set(items.flatMap((i) => i.traceReferences)),
      ].slice(0, 10);

      benchmarks.push({
        archetypeGroup,
        benchmarkState,
        averageResilienceScore,
        consistencyState,
        dominantProtectivePatterns,
        dominantRiskPatterns,
        sampleSize,
        benchmarkConfidence,
        generatedFromWindow,
        forecastVersion: 'v1',
        generatedAt,
        traceReferences,
        relatedEventIds,
        sourceOrganizationIds,
      });
    }

    // Sort by averageResilienceScore descending
    return benchmarks.sort((a, b) => b.averageResilienceScore - a.averageResilienceScore);
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function computeVariance(scores: number[]): number {
  if (scores.length < 2) return 0;
  const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
  return scores.reduce((s, x) => s + Math.pow(x - mean, 2), 0) / scores.length;
}
