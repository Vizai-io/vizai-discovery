"use client";

/**
 * /admin/intelligence — Cross-Organizational Intelligence Dashboard (Sprint 9 Task 7).
 *
 * 6 panels, text-first, calm operational intelligence.
 * No animations, no AI-prophecy styling, no dramatic risk aesthetics.
 *
 * Panels:
 *   1. Network      — Collective Narrative (platform-level)
 *   2. CheckCircle  — Forecast Validations
 *   3. Layers       — Cross-Organizational Patterns
 *   4. Layout       — Operational Archetypes
 *   5. BarChart2    — Intervention Benchmarks
 *   6. Shield       — Resilience Benchmarks
 */

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  Network,
  CheckCircle,
  Layers,
  Layout,
  BarChart2,
  Shield,
  ChevronLeft,
  Loader2,
  RefreshCcw,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

// ── Types ─────────────────────────────────────────────────────────────────────

type WindowDays = 30 | 90 | 365;

interface OrgMeta { name: string; slug: string; tier: string }

interface CollectiveNarrative {
  platformNarrative: string;
  overallPlatformState: string;
  forecastDriftTrend: string;
  platformIntelligenceDensity: string;
  organizationsAnalyzed: number;
  validationsComplete: number;
  patternsDetected: number;
  dominantArchetype: string;
  dominantPatternType?: string;
  topInterventionType?: string;
  archetypeDistribution: Record<string, number>;
  validationAccuracyRate: number;
}

interface ForecastValidation {
  organizationId: string;
  org: OrgMeta | null;
  validationResult: string;
  confidenceAccuracy: string;
  predictedState: string;
  actualState: string;
  divergenceScore: number;
  forecastCalibration: string;
  validationIntegrity: {
    replayCoverage: string;
    historicalWindowComplete: boolean;
    confidencePenaltyApplied: boolean;
  };
}

interface CrossOrgPattern {
  patternId: string;
  patternType: string;
  occurrenceCount: number;
  strongestSignals: string[];
  averageResolutionDays?: number;
  associatedOutcomes: string[];
  patternStrength: string;
  recurrenceVelocity: string;
}

interface OperationalArchetype {
  organizationId: string;
  org: OrgMeta | null;
  archetype: string;
  confidence: string;
  archetypeStability: string;
  derivedFromSignals: string[];
  previousArchetypes: string[];
  transitionCount: number;
}

interface InterventionBenchmark {
  interventionType: string;
  effectiveness: string;
  averageRecoveryDays?: number;
  strongestAssociatedRecoveries: string[];
  weakestAssociatedRecoveries: string[];
  sampleSize: number;
  benchmarkConfidence: string;
}

interface ResilienceBenchmark {
  archetypeGroup: string;
  benchmarkState: string;
  averageResilienceScore: number;
  consistencyState: string;
  dominantProtectivePatterns: string[];
  dominantRiskPatterns: string[];
  sampleSize: number;
  benchmarkConfidence: string;
}

interface Summary {
  totalOrgs: number;
  validationsComplete: number;
  patternsDetected: number;
  archetypesClassified: number;
  interventionTypes: number;
  resilienceGroups: number;
  forecastAccuracyPct: number;
  overallPlatformState: string;
  forecastDriftTrend: string;
  platformIntelligenceDensity: string;
  byArchetype: Record<string, number>;
  byPatternType: Record<string, number>;
  byValidation: Record<string, number>;
  byBenchmarkState: Record<string, number>;
}

interface IntelligenceData {
  summary: Summary;
  collectiveNarrative: CollectiveNarrative | null;
  validations: ForecastValidation[];
  patterns: CrossOrgPattern[];
  archetypes: OperationalArchetype[];
  interventionBenchmarks: InterventionBenchmark[];
  resilienceBenchmarks: ResilienceBenchmark[];
}

// ── Badge helpers ─────────────────────────────────────────────────────────────

function platformStateBadge(s: string) {
  const map: Record<string, string> = {
    STABLE:    'bg-emerald-50 text-emerald-700 border-emerald-200',
    MIXED:     'bg-blue-50 text-blue-700 border-blue-200',
    AT_RISK:   'bg-amber-50 text-amber-700 border-amber-200',
    DEGRADING: 'bg-orange-50 text-orange-700 border-orange-200',
  };
  return <Badge variant="outline" className={`text-xs font-medium ${map[s] ?? ''}`}>{s.replace(/_/g, ' ')}</Badge>;
}

function driftTrendBadge(t: string) {
  const map: Record<string, string> = {
    IMPROVING: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    STABLE:    'bg-slate-50 text-slate-600 border-slate-200',
    DEGRADING: 'bg-orange-50 text-orange-700 border-orange-200',
  };
  return <Badge variant="outline" className={`text-xs ${map[t] ?? ''}`}>{t}</Badge>;
}

function validationBadge(r: string) {
  const map: Record<string, string> = {
    ACCURATE:           'bg-emerald-50 text-emerald-700 border-emerald-200',
    PARTIALLY_ACCURATE: 'bg-amber-50 text-amber-700 border-amber-200',
    INACCURATE:         'bg-orange-50 text-orange-700 border-orange-200',
  };
  const labels: Record<string, string> = {
    ACCURATE:           'Accurate',
    PARTIALLY_ACCURATE: 'Partial',
    INACCURATE:         'Inaccurate',
  };
  return <Badge variant="outline" className={`text-xs font-medium ${map[r] ?? ''}`}>{labels[r] ?? r}</Badge>;
}

function patternStrengthBadge(s: string) {
  const map: Record<string, string> = {
    STRONG:   'bg-emerald-50 text-emerald-700 border-emerald-200',
    MODERATE: 'bg-blue-50 text-blue-700 border-blue-200',
    WEAK:     'bg-slate-50 text-slate-500 border-slate-200',
  };
  return <Badge variant="outline" className={`text-xs ${map[s] ?? ''}`}>{s}</Badge>;
}

function archetypeBadge(a: string) {
  const atRisk = new Set(['FRAGMENTING_ORGANIZATION', 'SILENT_DEGRADER', 'VOLATILE_OPERATOR', 'HIGH_INTERVENTION_ORG']);
  const healthy = new Set(['STABLE_OPERATOR', 'RESILIENT_GROWER', 'RECOVERY_ORIENTED']);
  const cls = atRisk.has(a)
    ? 'bg-orange-50 text-orange-700 border-orange-200'
    : healthy.has(a)
    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
    : 'bg-slate-50 text-slate-600 border-slate-200';
  return (
    <Badge variant="outline" className={`text-xs font-medium ${cls}`}>
      {a.replace(/_/g, ' ')}
    </Badge>
  );
}

function effectivenessBadge(e: string) {
  const map: Record<string, string> = {
    HIGH:   'bg-emerald-50 text-emerald-700 border-emerald-200',
    MEDIUM: 'bg-amber-50 text-amber-700 border-amber-200',
    LOW:    'bg-slate-50 text-slate-500 border-slate-200',
  };
  return <Badge variant="outline" className={`text-xs ${map[e] ?? ''}`}>{e}</Badge>;
}

function benchmarkStateBadge(s: string) {
  const map: Record<string, string> = {
    HIGHLY_RESILIENT:    'bg-emerald-50 text-emerald-700 border-emerald-200',
    MODERATELY_RESILIENT:'bg-blue-50 text-blue-700 border-blue-200',
    FRAGILE:             'bg-amber-50 text-amber-700 border-amber-200',
    UNSTABLE:            'bg-orange-50 text-orange-700 border-orange-200',
  };
  return <Badge variant="outline" className={`text-xs font-medium ${map[s] ?? ''}`}>{s.replace(/_/g, ' ')}</Badge>;
}

function confidenceBadge(c: string) {
  const map: Record<string, string> = {
    HIGH:   'bg-emerald-50 text-emerald-700 border-emerald-200',
    MEDIUM: 'bg-slate-50 text-slate-600 border-slate-200',
    LOW:    'bg-slate-50 text-slate-400 border-slate-200',
  };
  return <Badge variant="outline" className={`text-xs ${map[c] ?? ''}`}>{c} confidence</Badge>;
}

// ── Shared layout ─────────────────────────────────────────────────────────────

function OrgName({ org, id }: { org: OrgMeta | null; id: string }) {
  return (
    <span className="font-medium text-sm text-foreground">
      {org?.name ?? id}
      {org?.tier && (
        <span className="ml-1 text-xs text-muted-foreground font-normal">({org.tier})</span>
      )}
    </span>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function IntelligencePage() {
  const [data, setData]       = useState<IntelligenceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [window, setWindow]   = useState<WindowDays>(90);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res  = await fetch(`/api/admin/intelligence?window=${window}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Load failed');
      setData(json);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [window]);

  useEffect(() => { load(); }, [load]);

  const sum = data?.summary;

  return (
    <div className="min-h-screen bg-background p-6 max-w-6xl mx-auto space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/admin">
            <Button variant="ghost" size="sm" className="gap-1 text-muted-foreground">
              <ChevronLeft className="w-4 h-4" /> Admin
            </Button>
          </Link>
          <div>
            <h1 className="text-lg font-semibold text-foreground">Collective Intelligence</h1>
            <p className="text-xs text-muted-foreground">
              Cross-organizational pattern analysis and forecast validation — deterministic, advisory only.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {([30, 90, 365] as WindowDays[]).map((w) => (
            <Button
              key={w}
              size="sm"
              variant={window === w ? 'default' : 'outline'}
              className="text-xs h-7"
              onClick={() => setWindow(w)}
            >
              {w}d
            </Button>
          ))}
          <Button size="sm" variant="ghost" onClick={load} className="gap-1 text-muted-foreground">
            <RefreshCcw className="w-3.5 h-3.5" /> Refresh
          </Button>
        </div>
      </div>

      {/* Tab nav */}
      <div className="flex items-center gap-1 border-b border-border/50 -mx-6 px-6 pb-0 mb-2">
        {[
          { label: "Overview",    href: "/admin/intelligence", active: true },
          { label: "Continuity",  href: "/admin/continuity",  active: false },
          { label: "Forecasting", href: "/admin/forecasting", active: false },
          { label: "Memory",      href: "/admin/memory",      active: false },
        ].map((tab) => (
          <Link key={tab.label} href={tab.href}>
            <button className={`px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors ${
              tab.active
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-primary"
            }`}>
              {tab.label}
            </button>
          </Link>
        ))}
      </div>

      {/* Loading / Error */}
      {loading && (
        <div className="flex items-center justify-center py-16 gap-2 text-muted-foreground text-sm">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading intelligence data…
        </div>
      )}
      {error && (
        <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Summary strip */}
      {sum && !loading && (
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: 'Organizations',       value: sum.totalOrgs },
            { label: 'Patterns Detected',   value: sum.patternsDetected },
            { label: 'Forecast Accuracy',   value: `${sum.forecastAccuracyPct}%` },
            { label: 'Intelligence Density', value: sum.platformIntelligenceDensity },
          ].map((s) => (
            <Card key={s.label} className="border-border/50">
              <CardContent className="pt-4 pb-3">
                <p className="text-2xl font-bold text-foreground">{s.value}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{s.label}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {!loading && !error && data && (
        <>
          {/* ── Panel 1: Collective Narrative ─────────────────────────────── */}
          <Card className="border-border/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Network className="w-4 h-4 text-primary" />
                Platform Intelligence Summary
              </CardTitle>
              <CardDescription className="text-xs">
                Platform-level synthesis across all organizations — derived from cross-organizational signals, not AI inference.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {!data.collectiveNarrative ? (
                <p className="text-sm text-muted-foreground">Insufficient data for platform narrative.</p>
              ) : (
                <div>
                  {/* Platform state badges */}
                  <div className="flex items-center gap-2 flex-wrap mb-3">
                    {platformStateBadge(data.collectiveNarrative.overallPlatformState)}
                    {driftTrendBadge(data.collectiveNarrative.forecastDriftTrend)}
                    <Badge variant="outline" className="text-xs border-slate-200 text-slate-500">
                      {data.collectiveNarrative.platformIntelligenceDensity.toLowerCase()} intelligence
                    </Badge>
                    <Badge variant="outline" className="text-xs border-slate-200 text-slate-500">
                      {data.collectiveNarrative.organizationsAnalyzed} org{data.collectiveNarrative.organizationsAnalyzed !== 1 ? 's' : ''}
                    </Badge>
                  </div>

                  {/* Narrative prose */}
                  <p className="text-sm text-foreground leading-relaxed mb-4">
                    {data.collectiveNarrative.platformNarrative}
                  </p>

                  {/* Dominant signals */}
                  <div className="grid grid-cols-3 gap-4 text-xs">
                    <div>
                      <p className="text-muted-foreground font-medium mb-1">Dominant archetype</p>
                      {archetypeBadge(data.collectiveNarrative.dominantArchetype)}
                    </div>
                    {data.collectiveNarrative.dominantPatternType && (
                      <div>
                        <p className="text-muted-foreground font-medium mb-1">Dominant pattern</p>
                        <Badge variant="outline" className="text-xs border-blue-200 text-blue-700">
                          {data.collectiveNarrative.dominantPatternType}
                        </Badge>
                      </div>
                    )}
                    {data.collectiveNarrative.topInterventionType && (
                      <div>
                        <p className="text-muted-foreground font-medium mb-1">Top intervention</p>
                        <Badge variant="outline" className="text-xs border-slate-200 text-slate-600">
                          {data.collectiveNarrative.topInterventionType}
                        </Badge>
                      </div>
                    )}
                  </div>

                  {/* Archetype distribution */}
                  {Object.keys(data.collectiveNarrative.archetypeDistribution).length > 0 && (
                    <div className="mt-4 pt-3 border-t border-border/30">
                      <p className="text-xs text-muted-foreground font-medium mb-2">Archetype distribution</p>
                      <div className="flex flex-wrap gap-1.5">
                        {Object.entries(data.collectiveNarrative.archetypeDistribution)
                          .sort((a, b) => b[1] - a[1])
                          .map(([archetype, count]) => (
                            <Badge key={archetype} variant="outline" className="text-xs border-slate-200 text-slate-600">
                              {archetype.replace(/_/g, ' ')} × {count}
                            </Badge>
                          ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* ── Panel 2: Forecast Validations ─────────────────────────────── */}
          <Card className="border-border/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-primary" />
                Forecast Validations
              </CardTitle>
              <CardDescription className="text-xs">
                Replay-split validation: predicted continuity state vs. observed state. Measures forecast accuracy without stored predictions.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {data.validations.length === 0 ? (
                <p className="text-sm text-muted-foreground">No validation data available.</p>
              ) : (
                <div className="space-y-4">
                  {data.validations.map((v) => (
                    <div key={v.organizationId} className="border-b border-border/30 pb-4 last:border-0 last:pb-0">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <OrgName org={v.org} id={v.organizationId} />
                        <div className="flex items-center gap-1.5 flex-wrap justify-end">
                          {validationBadge(v.validationResult)}
                          <Badge variant="outline" className="text-xs border-slate-200 text-slate-500">
                            {v.forecastCalibration.replace(/_/g, ' ').toLowerCase()}
                          </Badge>
                        </div>
                      </div>
                      {/* State comparison */}
                      <div className="flex items-center gap-2 mb-2 text-xs text-muted-foreground">
                        <span>Predicted:</span>
                        <span className="font-medium text-foreground">{v.predictedState}</span>
                        <span>→ Actual:</span>
                        <span className={`font-medium ${v.predictedState === v.actualState ? 'text-emerald-700' : 'text-orange-700'}`}>
                          {v.actualState}
                        </span>
                        {v.divergenceScore > 0 && (
                          <span className="ml-1 text-muted-foreground">(divergence: {v.divergenceScore})</span>
                        )}
                      </div>
                      {/* Integrity */}
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="outline" className="text-xs border-slate-200 text-slate-500">
                          {v.validationIntegrity.replayCoverage.toLowerCase()} replay coverage
                        </Badge>
                        {!v.validationIntegrity.historicalWindowComplete && (
                          <span className="text-xs text-amber-600">incomplete history window</span>
                        )}
                        {v.validationIntegrity.confidencePenaltyApplied && (
                          <span className="text-xs text-amber-600">volatility penalty applied</span>
                        )}
                        <Badge variant="outline" className="text-xs border-slate-200 text-slate-400">
                          {v.confidenceAccuracy.toLowerCase()}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* ── Panel 3: Cross-Organizational Patterns ────────────────────── */}
          <Card className="border-border/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Layers className="w-4 h-4 text-primary" />
                Cross-Organizational Patterns
              </CardTitle>
              <CardDescription className="text-xs">
                Recurring operational patterns across ≥2 organizations. Only patterns with consistent occurrence are surfaced.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {data.patterns.length === 0 ? (
                <p className="text-sm text-muted-foreground">No cross-organizational patterns detected in this window.</p>
              ) : (
                <div className="space-y-5">
                  {data.patterns.map((p) => (
                    <div key={p.patternId} className="border-b border-border/30 pb-5 last:border-0 last:pb-0">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-xs font-medium border-blue-200 text-blue-700">
                            {p.patternType}
                          </Badge>
                          <span className="text-xs text-muted-foreground">{p.occurrenceCount} org{p.occurrenceCount !== 1 ? 's' : ''}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          {patternStrengthBadge(p.patternStrength)}
                          <Badge variant="outline" className="text-xs border-slate-200 text-slate-500">
                            {p.recurrenceVelocity.toLowerCase()} recurrence
                          </Badge>
                        </div>
                      </div>
                      {p.strongestSignals.length > 0 && (
                        <ul className="space-y-0.5 mb-2">
                          {p.strongestSignals.map((s, i) => (
                            <li key={i} className="text-xs text-muted-foreground">· {s}</li>
                          ))}
                        </ul>
                      )}
                      {p.averageResolutionDays !== undefined && (
                        <p className="text-xs text-muted-foreground mb-1.5">
                          Average resolution: {p.averageResolutionDays} day(s).
                        </p>
                      )}
                      {p.associatedOutcomes.length > 0 && (
                        <ul className="space-y-0.5">
                          {p.associatedOutcomes.map((o, i) => (
                            <li key={i} className="text-xs text-blue-700">→ {o}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* ── Panel 4: Operational Archetypes ───────────────────────────── */}
          <Card className="border-border/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Layout className="w-4 h-4 text-primary" />
                Operational Archetypes
              </CardTitle>
              <CardDescription className="text-xs">
                Deterministic archetype classification from operational signals. First-match-wins priority ordering.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {data.archetypes.length === 0 ? (
                <p className="text-sm text-muted-foreground">No archetype data available.</p>
              ) : (
                <div className="space-y-4">
                  {data.archetypes.map((a) => (
                    <div key={a.organizationId} className="border-b border-border/30 pb-4 last:border-0 last:pb-0">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <OrgName org={a.org} id={a.organizationId} />
                        <div className="flex items-center gap-1.5 flex-wrap justify-end">
                          {archetypeBadge(a.archetype)}
                          <Badge variant="outline" className="text-xs border-slate-200 text-slate-500">
                            {a.confidence.toLowerCase()} confidence
                          </Badge>
                          <Badge variant="outline" className="text-xs border-slate-200 text-slate-500">
                            {a.archetypeStability.toLowerCase()} stability
                          </Badge>
                        </div>
                      </div>
                      {a.derivedFromSignals.length > 0 && (
                        <ul className="space-y-0.5 mb-1.5">
                          {a.derivedFromSignals.map((s, i) => (
                            <li key={i} className="text-xs text-muted-foreground">· {s}</li>
                          ))}
                        </ul>
                      )}
                      {a.previousArchetypes.length > 0 && (
                        <p className="text-xs text-muted-foreground mt-1">
                          Previously: {a.previousArchetypes.map((p) => p.replace(/_/g, ' ')).join(', ')}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* ── Panel 5: Intervention Benchmarks ──────────────────────────── */}
          <Card className="border-border/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <BarChart2 className="w-4 h-4 text-primary" />
                Intervention Benchmarks
              </CardTitle>
              <CardDescription className="text-xs">
                Effectiveness of each intervention trigger type across all organizations — grouped by trigger category.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {data.interventionBenchmarks.length === 0 ? (
                <p className="text-sm text-muted-foreground">No intervention benchmark data available.</p>
              ) : (
                <div className="space-y-4">
                  {data.interventionBenchmarks.map((b) => (
                    <div key={b.interventionType} className="border-b border-border/30 pb-4 last:border-0 last:pb-0">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <span className="font-medium text-sm text-foreground">{b.interventionType}</span>
                        <div className="flex items-center gap-1.5">
                          {effectivenessBadge(b.effectiveness)}
                          {confidenceBadge(b.benchmarkConfidence)}
                          <span className="text-xs text-muted-foreground">{b.sampleSize} sample{b.sampleSize !== 1 ? 's' : ''}</span>
                        </div>
                      </div>
                      {b.averageRecoveryDays !== undefined && (
                        <p className="text-xs text-muted-foreground mb-1.5">
                          Average recovery: {b.averageRecoveryDays} day{b.averageRecoveryDays !== 1 ? 's' : ''}.
                        </p>
                      )}
                      <div className="grid grid-cols-2 gap-3">
                        {b.strongestAssociatedRecoveries.length > 0 && (
                          <div>
                            <p className="text-xs text-muted-foreground font-medium mb-0.5">Strongest recoveries</p>
                            <ul className="space-y-0.5">
                              {b.strongestAssociatedRecoveries.map((r, i) => (
                                <li key={i} className="text-xs text-emerald-700">· {r}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {b.weakestAssociatedRecoveries.length > 0 && (
                          <div>
                            <p className="text-xs text-muted-foreground font-medium mb-0.5">Weakest outcomes</p>
                            <ul className="space-y-0.5">
                              {b.weakestAssociatedRecoveries.map((r, i) => (
                                <li key={i} className="text-xs text-orange-700">· {r}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* ── Panel 6: Resilience Benchmarks ────────────────────────────── */}
          <Card className="border-border/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Shield className="w-4 h-4 text-primary" />
                Resilience Benchmarks by Archetype
              </CardTitle>
              <CardDescription className="text-xs">
                Resilience characteristics grouped by operational archetype. Identifies protective and risk patterns within each profile.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {data.resilienceBenchmarks.length === 0 ? (
                <p className="text-sm text-muted-foreground">No resilience benchmark data available.</p>
              ) : (
                <div className="space-y-5">
                  {data.resilienceBenchmarks.map((b) => (
                    <div key={b.archetypeGroup} className="border-b border-border/30 pb-5 last:border-0 last:pb-0">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        {archetypeBadge(b.archetypeGroup)}
                        <div className="flex items-center gap-1.5">
                          {benchmarkStateBadge(b.benchmarkState)}
                          <span className="text-xs text-muted-foreground">{b.averageResilienceScore}/100</span>
                          {confidenceBadge(b.benchmarkConfidence)}
                          <span className="text-xs text-muted-foreground">{b.sampleSize} org{b.sampleSize !== 1 ? 's' : ''}</span>
                        </div>
                      </div>
                      {/* Score bar */}
                      <div className="h-1.5 bg-slate-100 rounded-full mb-3 overflow-hidden">
                        <div
                          className={`h-full rounded-full ${b.averageResilienceScore >= 70 ? 'bg-emerald-400' : b.averageResilienceScore >= 45 ? 'bg-amber-400' : 'bg-orange-400'}`}
                          style={{ width: `${b.averageResilienceScore}%` }}
                        />
                      </div>
                      <div className="flex items-center gap-2 mb-2">
                        <Badge variant="outline" className="text-xs border-slate-200 text-slate-500">
                          {b.consistencyState.toLowerCase()} consistency
                        </Badge>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        {b.dominantProtectivePatterns.length > 0 && (
                          <div>
                            <p className="text-xs text-muted-foreground font-medium mb-0.5">Protective patterns</p>
                            <ul className="space-y-0.5">
                              {b.dominantProtectivePatterns.map((p, i) => (
                                <li key={i} className="text-xs text-emerald-700">· {p}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {b.dominantRiskPatterns.length > 0 && (
                          <div>
                            <p className="text-xs text-muted-foreground font-medium mb-0.5">Risk patterns</p>
                            <ul className="space-y-0.5">
                              {b.dominantRiskPatterns.map((p, i) => (
                                <li key={i} className="text-xs text-orange-700">· {p}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
