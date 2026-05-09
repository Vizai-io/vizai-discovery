/**
 * @fileOverview InterventionBenchmarkService — Sprint 9 Task 4.
 *
 * Evaluates which intervention trigger types consistently improve continuity
 * across organizations. Pure function — no DB queries.
 *
 * Groups all intervention lineages by `triggeredBy` field:
 *   DRIFT | CONTINUITY | PLAYBOOK | ASSERTION | ONBOARDING
 *
 * For each group computes:
 *   - effectiveness from outcome ratios + causality strength
 *   - averageRecoveryDays from SUCCESSFUL lineages
 *   - strongestAssociatedRecoveries from downstream effects
 *   - sampleSize for confidence weighting
 *
 * Refinements:
 *   2:  benchmarkConfidence — LOW | MEDIUM | HIGH
 *   9:  generatedFromWindow
 *   E:  traceReferences, relatedEventIds, sourceOrganizationIds
 */

import type { InterventionLineageReport } from './intervention-lineage-service';

// ── Types ─────────────────────────────────────────────────────────────────────

export type BenchmarkEffectiveness = 'HIGH' | 'MEDIUM' | 'LOW';
export type BenchmarkConfidence    = 'LOW' | 'MEDIUM' | 'HIGH';  // Refinement 2

export interface InterventionBenchmark {
  interventionType:               string;
  effectiveness:                  BenchmarkEffectiveness;
  averageRecoveryDays?:           number;
  strongestAssociatedRecoveries:  string[];
  weakestAssociatedRecoveries:    string[];
  sampleSize:                     number;
  benchmarkConfidence:            BenchmarkConfidence;  // Refinement 2
  generatedFromWindow:            { start: string; end: string }; // Refinement 9
  forecastVersion:                'v1';
  generatedAt:                    string;
  traceReferences:                string[];  // Refinement E
  relatedEventIds:                string[];
  sourceOrganizationIds:          string[];
}

// ── InterventionBenchmarkService ──────────────────────────────────────────────

export class InterventionBenchmarkService {
  /**
   * Compute intervention benchmarks from all org lineage reports.
   * Pure function — no DB queries.
   */
  static computeBenchmarks(
    lineages:            InterventionLineageReport[],
    generatedFromWindow: { start: string; end: string },
  ): InterventionBenchmark[] {
    const generatedAt = new Date().toISOString();

    // Flatten all individual lineage items across all orgs
    const allLineages = lineages.flatMap((report) =>
      report.lineages.map((l) => ({
        ...l,
        organizationId: report.organizationId,
      })),
    );

    // Group by triggeredBy
    const groups = new Map<string, typeof allLineages>();
    for (const item of allLineages) {
      const key      = item.triggeredBy;
      const existing = groups.get(key) ?? [];
      existing.push(item);
      groups.set(key, existing);
    }

    // Build benchmark per group
    const benchmarks: InterventionBenchmark[] = [];

    for (const [interventionType, items] of groups) {
      if (items.length === 0) continue;

      const sampleSize       = items.length;
      const successfulItems  = items.filter((i) => i.outcome === 'SUCCESSFUL');
      const failedItems      = items.filter((i) => i.outcome === 'FAILED');
      const partialItems     = items.filter((i) => i.outcome === 'PARTIAL');

      // Effectiveness
      const strongCount = items.filter((i) => i.causalityStrength === 'STRONG').length;
      const avgCausality = strongCount / sampleSize;

      const effectiveness: BenchmarkEffectiveness =
        (successfulItems.length > (failedItems.length + partialItems.length) && avgCausality > 0.3)
          ? 'HIGH'   :
        successfulItems.length >= failedItems.length
          ? 'MEDIUM' :
        'LOW';

      // Average recovery days (SUCCESSFUL only, where both dates present)
      const recDays = successfulItems
        .filter((i) => i.completedAt)
        .map((i) => {
          const ms = new Date(i.completedAt!).getTime() - new Date(i.startedAt).getTime();
          return Math.max(0, ms / (1000 * 60 * 60 * 24));
        });
      const averageRecoveryDays = recDays.length > 0
        ? Math.round(recDays.reduce((a, b) => a + b, 0) / recDays.length)
        : undefined;

      // Strongest recoveries: downstream effects from SUCCESSFUL items
      const strongestAssociatedRecoveries = [
        ...new Set(successfulItems.flatMap((i) => i.downstreamEffects)),
      ].slice(0, 4);

      // Weakest: downstream effects from FAILED/UNKNOWN items
      const weakestAssociatedRecoveries = [
        ...new Set(
          items
            .filter((i) => i.outcome === 'FAILED' || i.outcome === 'UNKNOWN')
            .flatMap((i) => i.downstreamEffects),
        ),
      ].slice(0, 4);

      // Benchmark confidence (Refinement 2)
      const benchmarkConfidence: BenchmarkConfidence =
        sampleSize >= 5 ? 'HIGH'   :
        sampleSize >= 2 ? 'MEDIUM' :
        'LOW';

      // Lineage fields (Refinement E)
      const sourceOrganizationIds = [...new Set(items.map((i) => i.organizationId))].slice(0, 20);
      const relatedEventIds       = [...new Set(items.flatMap((i) => i.relatedEventIds))].slice(0, 20);
      const traceReferences       = [...new Set(items.flatMap((i) => i.traceReferences))].slice(0, 10);

      benchmarks.push({
        interventionType,
        effectiveness,
        averageRecoveryDays,
        strongestAssociatedRecoveries,
        weakestAssociatedRecoveries,
        sampleSize,
        benchmarkConfidence,
        generatedFromWindow,
        forecastVersion:       'v1',
        generatedAt,
        traceReferences,
        relatedEventIds,
        sourceOrganizationIds,
      });
    }

    return benchmarks.sort((a, b) => b.sampleSize - a.sampleSize);
  }
}
