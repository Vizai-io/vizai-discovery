/**
 * @fileOverview ScanDelta — compare two scan reports and compute a score delta.
 *
 * Used by the operational summary to generate deterministic insight strings.
 * No LLM calls. Pure arithmetic on DB-backed score fields.
 */

export type ScanScores = {
  accuracyScore: number | null;
  coverageScore: number | null;
  entityUnderstandingScore: number | null;
  consistencyScore: number | null;
};

export type ScanDelta = {
  /** Average of all four scores for `latest` */
  latestAvg: number;
  /** Average of all four scores for `previous` */
  previousAvg: number;
  /** latestAvg - previousAvg (positive = improved) */
  overallDelta: number;
  accuracyDelta: number;
  coverageDelta: number;
  entityDelta: number;
  consistencyDelta: number;
  /** True when overall score improved by more than threshold */
  significantImprovement: boolean;
  /** True when overall score declined by more than threshold */
  significantDecline: boolean;
  /** True when consistency specifically dropped */
  consistencyDropped: boolean;
};

const SIGNIFICANT_THRESHOLD = 5;

function avg(scores: ScanScores): number {
  const vals = [
    scores.accuracyScore,
    scores.coverageScore,
    scores.entityUnderstandingScore,
    scores.consistencyScore,
  ].filter((v): v is number => v != null);
  if (vals.length === 0) return 0;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

export function computeScanDelta(latest: ScanScores, previous: ScanScores): ScanDelta {
  const latestAvg = avg(latest);
  const previousAvg = avg(previous);
  const overallDelta = latestAvg - previousAvg;

  const accuracyDelta = (latest.accuracyScore ?? 0) - (previous.accuracyScore ?? 0);
  const coverageDelta = (latest.coverageScore ?? 0) - (previous.coverageScore ?? 0);
  const entityDelta = (latest.entityUnderstandingScore ?? 0) - (previous.entityUnderstandingScore ?? 0);
  const consistencyDelta = (latest.consistencyScore ?? 0) - (previous.consistencyScore ?? 0);

  return {
    latestAvg,
    previousAvg,
    overallDelta,
    accuracyDelta,
    coverageDelta,
    entityDelta,
    consistencyDelta,
    significantImprovement: overallDelta > SIGNIFICANT_THRESHOLD,
    significantDecline: overallDelta < -SIGNIFICANT_THRESHOLD,
    consistencyDropped: consistencyDelta < -3,
  };
}
