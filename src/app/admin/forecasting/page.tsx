"use client";

/**
 * /admin/forecasting — Predictive Continuity Dashboard (Sprint 8 Task 7).
 *
 * 5 panels, text-first, calm operational forecasting (Refinement D).
 * No animations, no dramatic risk aesthetics, no AI-prophecy styling.
 *
 * Panels:
 *   1. TrendingUp    — Continuity Forecasts
 *   2. Shield        — Organizational Resilience
 *   3. AlertTriangle — Operational Risks
 *   4. Clock         — Intervention Timing
 *   5. FileText      — Predictive Narratives
 */

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  TrendingUp,
  Shield,
  AlertTriangle,
  Clock,
  FileText,
  ChevronLeft,
  Loader2,
  RefreshCcw,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

// ── Types ─────────────────────────────────────────────────────────────────────

type WindowDays = 30 | 90 | 365;

type ForecastState = 'OPTIMIZING' | 'STABLE' | 'WATCHING' | 'FRAGMENTED' | 'CRITICAL';
type Trend         = 'IMPROVING' | 'STABLE' | 'DECLINING';
type RiskLevel     = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
type ResState      = 'RESILIENT' | 'RECOVERING' | 'FRAGILE' | 'UNSTABLE';
type TrajType      = 'RECOVERING' | 'DECLINING' | 'OSCILLATING' | 'PLATEAUED' | 'STABLE';
type IntWindow     = 'IMMEDIATE' | 'SHORT_TERM' | 'MONITOR' | 'LOW_PRIORITY';

interface OrgMeta { name: string; slug: string; tier: string }

interface Forecast {
  organizationId: string; org: OrgMeta | null;
  currentState: ForecastState; projectedState30d: ForecastState; projectedState90d: ForecastState;
  continuityTrend: Trend; confidence: string; forecastStability: string;
  forecastDivergence: number; continuityAcceleration: string;
  drivingSignals: string[]; forecastMemoryQuality: string;
  forecastIntegrity: { eventDensity: string; replayCoverage: string; volatilityPenaltyApplied: boolean };
}

interface Trajectory {
  organizationId: string; org: OrgMeta | null;
  trajectoryType: TrajType; momentum: string; trajectoryConfidence: string;
  forecastMemoryQuality: string;
}

interface Resilience {
  organizationId: string; org: OrgMeta | null;
  resilienceState: ResState; resilienceScore: number; durabilityWeightApplied: boolean;
  strongestProtectiveFactors: string[]; strongestRiskFactors: string[];
  forecastMemoryQuality: string;
}

interface TimingInsight {
  organizationId: string; org: OrgMeta | null;
  recommendedInterventionWindow: IntWindow; historicalEffectiveness: string;
  averageRecoveryDays?: number; timingConfidence: string;
  basedOnPatterns: string[]; forecastMemoryQuality: string;
}

interface ForecastRisk { riskType: string; likelihood: string; rationale: string; riskPersistence: string }
interface RiskForecast {
  organizationId: string; org: OrgMeta | null;
  riskLevel: RiskLevel; projectedRisks: ForecastRisk[];
  strongestIndicators: string[]; forecastWindowDays: number;
  forecastMemoryQuality: string;
}

interface Narrative {
  organizationId: string; org: OrgMeta | null;
  forecastSummary: string; strongestForecastSignals: string[];
  strongestProtectiveSignals: string[]; projectedContinuityDirection: Trend;
  generatedFrom: string; forecastMemoryQuality: string;
}

interface Summary {
  totalOrgs: number; byCurrentState: Record<string, number>;
  byResilienceState: Record<string, number>; byRiskLevel: Record<string, number>;
  byTrajectory: Record<string, number>; totalHighRisk: number;
  totalImmediate: number; totalProjectedRisks: number;
}

interface ForecastingData {
  summary: Summary;
  forecasts: Forecast[]; trajectories: Trajectory[]; resiliences: Resilience[];
  timings: TimingInsight[]; risks: RiskForecast[]; narratives: Narrative[];
}

// ── Badge helpers ─────────────────────────────────────────────────────────────

function forecastStateBadge(s: ForecastState) {
  const map: Record<ForecastState, string> = {
    OPTIMIZING: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    STABLE:     'bg-blue-50 text-blue-700 border-blue-200',
    WATCHING:   'bg-amber-50 text-amber-700 border-amber-200',
    FRAGMENTED: 'bg-orange-50 text-orange-700 border-orange-200',
    CRITICAL:   'bg-red-50 text-red-700 border-red-200',
  };
  return <Badge variant="outline" className={`text-xs font-medium ${map[s]}`}>{s}</Badge>;
}

function trendBadge(t: Trend) {
  const map: Record<Trend, string> = {
    IMPROVING: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    STABLE:    'bg-slate-50 text-slate-600 border-slate-200',
    DECLINING: 'bg-orange-50 text-orange-700 border-orange-200',
  };
  return <Badge variant="outline" className={`text-xs ${map[t]}`}>{t}</Badge>;
}

function riskBadge(r: RiskLevel) {
  const map: Record<RiskLevel, string> = {
    LOW:      'bg-emerald-50 text-emerald-700 border-emerald-200',
    MEDIUM:   'bg-amber-50 text-amber-700 border-amber-200',
    HIGH:     'bg-orange-50 text-orange-700 border-orange-200',
    CRITICAL: 'bg-red-50 text-red-700 border-red-200',
  };
  return <Badge variant="outline" className={`text-xs font-medium ${map[r]}`}>{r}</Badge>;
}

function resBadge(r: ResState) {
  const map: Record<ResState, string> = {
    RESILIENT:  'bg-emerald-50 text-emerald-700 border-emerald-200',
    RECOVERING: 'bg-blue-50 text-blue-700 border-blue-200',
    FRAGILE:    'bg-amber-50 text-amber-700 border-amber-200',
    UNSTABLE:   'bg-orange-50 text-orange-700 border-orange-200',
  };
  return <Badge variant="outline" className={`text-xs ${map[r]}`}>{r}</Badge>;
}

function windowBadge(w: IntWindow) {
  const map: Record<IntWindow, string> = {
    IMMEDIATE:    'bg-red-50 text-red-700 border-red-200',
    SHORT_TERM:   'bg-orange-50 text-orange-700 border-orange-200',
    MONITOR:      'bg-amber-50 text-amber-700 border-amber-200',
    LOW_PRIORITY: 'bg-slate-50 text-slate-600 border-slate-200',
  };
  const labels: Record<IntWindow, string> = {
    IMMEDIATE:    'Immediate',
    SHORT_TERM:   'Short Term',
    MONITOR:      'Monitor',
    LOW_PRIORITY: 'Low Priority',
  };
  return <Badge variant="outline" className={`text-xs ${map[w]}`}>{labels[w]}</Badge>;
}

function memQualityBadge(q: string) {
  const map: Record<string, string> = {
    RICH:     'bg-emerald-50 text-emerald-700 border-emerald-200',
    MODERATE: 'bg-blue-50 text-blue-700 border-blue-200',
    SPARSE:   'bg-slate-50 text-slate-500 border-slate-200',
  };
  return <Badge variant="outline" className={`text-xs ${map[q] ?? ''}`}>{q}</Badge>;
}

// ── Shared layout components ──────────────────────────────────────────────────

function SectionHeader({
  icon: Icon, title, description, chips,
}: {
  icon: React.ElementType; title: string; description: string; chips?: React.ReactNode;
}) {
  return (
    <div className="mb-5">
      <div className="flex items-center gap-2 mb-1">
        <Icon className="w-4 h-4 text-primary" />
        <h2 className="text-base font-semibold text-foreground">{title}</h2>
      </div>
      <p className="text-sm text-muted-foreground mb-2">{description}</p>
      {chips && <div className="flex flex-wrap gap-2">{chips}</div>}
    </div>
  );
}

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

export default function ForecastingPage() {
  const [data, setData]         = useState<ForecastingData | null>(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [window, setWindow]     = useState<WindowDays>(90);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res  = await fetch(`/api/admin/forecasting?window=${window}`);
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
            <h1 className="text-lg font-semibold text-foreground">Operational Forecasting</h1>
            <p className="text-xs text-muted-foreground">
              Deterministic continuity trajectory forecasting — no AI, no autonomous actions.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Window selector */}
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
      <div className="flex items-center gap-1 border-b border-border/50 -mx-6 px-6 pb-0">
        {[
          { label: "Overview",    href: "/admin/intelligence", active: false },
          { label: "Continuity",  href: "/admin/continuity",  active: false },
          { label: "Forecasting", href: "/admin/forecasting", active: true },
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
          <Loader2 className="w-4 h-4 animate-spin" /> Loading forecast data…
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
            { label: 'Organizations',    value: sum.totalOrgs },
            { label: 'High / Critical Risk', value: sum.totalHighRisk },
            { label: 'Immediate Action', value: sum.totalImmediate },
            { label: 'Projected Risks',  value: sum.totalProjectedRisks },
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
          {/* ── Panel 1: Continuity Forecasts ─────────────────────────────── */}
          <Card className="border-border/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-primary" />
                Continuity Forecasts
              </CardTitle>
              <CardDescription className="text-xs">
                Projected continuity states at 30-day and 90-day horizons using deterministic trajectory extrapolation.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {data.forecasts.length === 0 ? (
                <p className="text-sm text-muted-foreground">No forecast data available.</p>
              ) : (
                <div className="space-y-4">
                  {data.forecasts.map((f) => (
                    <div key={f.organizationId} className="border-b border-border/30 pb-4 last:border-0 last:pb-0">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <OrgName org={f.org} id={f.organizationId} />
                        <div className="flex items-center gap-1.5 flex-wrap justify-end">
                          {trendBadge(f.continuityTrend)}
                          <Badge variant="outline" className="text-xs border-slate-200 text-slate-500">
                            {f.forecastStability}
                          </Badge>
                          <Badge variant="outline" className="text-xs border-slate-200 text-slate-500">
                            {f.confidence} confidence
                          </Badge>
                        </div>
                      </div>
                      {/* State progression */}
                      <div className="flex items-center gap-2 mb-2 flex-wrap">
                        <span className="text-xs text-muted-foreground">Now</span>
                        {forecastStateBadge(f.currentState)}
                        <span className="text-xs text-muted-foreground">→ 30d</span>
                        {forecastStateBadge(f.projectedState30d)}
                        <span className="text-xs text-muted-foreground">→ 90d</span>
                        {forecastStateBadge(f.projectedState90d)}
                        {f.forecastDivergence >= 10 && (
                          <span className="text-xs text-muted-foreground ml-1">
                            (divergence: {f.forecastDivergence}pts)
                          </span>
                        )}
                      </div>
                      {/* Driving signals */}
                      {f.drivingSignals.length > 0 && (
                        <ul className="space-y-0.5">
                          {f.drivingSignals.map((s, i) => (
                            <li key={i} className="text-xs text-muted-foreground">· {s}</li>
                          ))}
                        </ul>
                      )}
                      {/* Integrity */}
                      <div className="flex items-center gap-2 mt-2">
                        <span className="text-xs text-muted-foreground">Memory:</span>
                        {memQualityBadge(f.forecastMemoryQuality)}
                        {f.forecastIntegrity.volatilityPenaltyApplied && (
                          <span className="text-xs text-amber-600">volatility penalty applied</span>
                        )}
                        <span className="text-xs text-muted-foreground ml-1">
                          Acceleration: {f.continuityAcceleration.replace(/_/g, ' ').toLowerCase()}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* ── Panel 2: Organizational Resilience ────────────────────────── */}
          <Card className="border-border/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Shield className="w-4 h-4 text-primary" />
                Organizational Resilience
              </CardTitle>
              <CardDescription className="text-xs">
                Resilience score weighted toward stability, cadence, and durable recovery — not temporary spikes.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {data.resiliences.length === 0 ? (
                <p className="text-sm text-muted-foreground">No resilience data available.</p>
              ) : (
                <div className="space-y-4">
                  {data.resiliences.map((r) => (
                    <div key={r.organizationId} className="border-b border-border/30 pb-4 last:border-0 last:pb-0">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <OrgName org={r.org} id={r.organizationId} />
                        <div className="flex items-center gap-1.5">
                          {resBadge(r.resilienceState)}
                          <span className="text-xs text-muted-foreground">{r.resilienceScore}/100</span>
                          {r.durabilityWeightApplied && (
                            <Badge variant="outline" className="text-xs border-slate-200 text-slate-500">
                              durability weighted
                            </Badge>
                          )}
                        </div>
                      </div>
                      {/* Score bar */}
                      <div className="h-1.5 bg-slate-100 rounded-full mb-3 overflow-hidden">
                        <div
                          className={`h-full rounded-full ${r.resilienceScore >= 70 ? 'bg-emerald-400' : r.resilienceScore >= 45 ? 'bg-amber-400' : 'bg-orange-400'}`}
                          style={{ width: `${r.resilienceScore}%` }}
                        />
                      </div>
                      {r.strongestProtectiveFactors.length > 0 && (
                        <div className="mb-1.5">
                          <p className="text-xs text-muted-foreground font-medium mb-0.5">Protective</p>
                          <ul className="space-y-0.5">
                            {r.strongestProtectiveFactors.map((s, i) => (
                              <li key={i} className="text-xs text-emerald-700">· {s}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {r.strongestRiskFactors.length > 0 && (
                        <div>
                          <p className="text-xs text-muted-foreground font-medium mb-0.5">Risk factors</p>
                          <ul className="space-y-0.5">
                            {r.strongestRiskFactors.map((s, i) => (
                              <li key={i} className="text-xs text-orange-700">· {s}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* ── Panel 3: Operational Risks ────────────────────────────────── */}
          <Card className="border-border/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-primary" />
                Operational Risk Forecasts
              </CardTitle>
              <CardDescription className="text-xs">
                Projected operational risks across 7 categories. Deterministic — derived from observed patterns, not AI inference.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {data.risks.length === 0 ? (
                <p className="text-sm text-muted-foreground">No risk forecast data available.</p>
              ) : (
                <div className="space-y-4">
                  {data.risks.map((r) => (
                    <div key={r.organizationId} className="border-b border-border/30 pb-4 last:border-0 last:pb-0">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <OrgName org={r.org} id={r.organizationId} />
                        <div className="flex items-center gap-1.5">
                          {riskBadge(r.riskLevel)}
                          <span className="text-xs text-muted-foreground">{r.forecastWindowDays}d window</span>
                        </div>
                      </div>
                      {r.projectedRisks.length === 0 ? (
                        <p className="text-xs text-muted-foreground">No projected risks detected.</p>
                      ) : (
                        <div className="space-y-1.5">
                          {r.projectedRisks.map((risk, i) => (
                            <div key={i} className="flex items-start gap-2">
                              <Badge
                                variant="outline"
                                className={`text-xs shrink-0 ${risk.likelihood === 'HIGH' ? 'border-orange-200 text-orange-700' : risk.likelihood === 'MEDIUM' ? 'border-amber-200 text-amber-700' : 'border-slate-200 text-slate-500'}`}
                              >
                                {risk.likelihood}
                              </Badge>
                              <div>
                                <span className="text-xs font-medium text-foreground">
                                  {risk.riskType.replace(/_/g, ' ')}
                                </span>
                                <span className="text-xs text-muted-foreground ml-1.5">
                                  [{risk.riskPersistence.toLowerCase()}]
                                </span>
                                <p className="text-xs text-muted-foreground mt-0.5">{risk.rationale}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* ── Panel 4: Intervention Timing ──────────────────────────────── */}
          <Card className="border-border/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Clock className="w-4 h-4 text-primary" />
                Intervention Timing
              </CardTitle>
              <CardDescription className="text-xs">
                Advisory timing recommendations based on historical intervention effectiveness. No automatic actions.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {data.timings.length === 0 ? (
                <p className="text-sm text-muted-foreground">No timing data available.</p>
              ) : (
                <div className="space-y-4">
                  {data.timings.map((t) => (
                    <div key={t.organizationId} className="border-b border-border/30 pb-4 last:border-0 last:pb-0">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <OrgName org={t.org} id={t.organizationId} />
                        <div className="flex items-center gap-1.5">
                          {windowBadge(t.recommendedInterventionWindow)}
                          <Badge variant="outline" className="text-xs border-slate-200 text-slate-500">
                            {t.historicalEffectiveness} effectiveness
                          </Badge>
                          <Badge variant="outline" className="text-xs border-slate-200 text-slate-500">
                            {t.timingConfidence} confidence
                          </Badge>
                        </div>
                      </div>
                      {t.averageRecoveryDays !== undefined && (
                        <p className="text-xs text-muted-foreground mb-1.5">
                          Average recovery: {t.averageRecoveryDays} day(s) based on prior interventions.
                        </p>
                      )}
                      {t.basedOnPatterns.length > 0 && (
                        <ul className="space-y-0.5">
                          {t.basedOnPatterns.map((p, i) => (
                            <li key={i} className="text-xs text-muted-foreground">· {p}</li>
                          ))}
                        </ul>
                      )}
                      <div className="mt-1.5">
                        {memQualityBadge(t.forecastMemoryQuality)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* ── Panel 5: Predictive Narratives ────────────────────────────── */}
          <Card className="border-border/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <FileText className="w-4 h-4 text-primary" />
                Predictive Narratives
              </CardTitle>
              <CardDescription className="text-xs">
                Deterministic, template-based forecasting summaries. No generative AI — derived entirely from operational signals.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {data.narratives.length === 0 ? (
                <p className="text-sm text-muted-foreground">No narrative data available.</p>
              ) : (
                <div className="space-y-5">
                  {data.narratives.map((n) => (
                    <div key={n.organizationId} className="border-b border-border/30 pb-5 last:border-0 last:pb-0">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <OrgName org={n.org} id={n.organizationId} />
                        <div className="flex items-center gap-1.5">
                          {trendBadge(n.projectedContinuityDirection)}
                          {memQualityBadge(n.forecastMemoryQuality)}
                          <Badge variant="outline" className="text-xs border-slate-200 text-slate-500">
                            from {n.generatedFrom.toLowerCase()}
                          </Badge>
                        </div>
                      </div>
                      {/* Summary prose */}
                      <p className="text-sm text-foreground leading-relaxed mb-3">{n.forecastSummary}</p>
                      {/* Signals */}
                      <div className="grid grid-cols-2 gap-3">
                        {n.strongestForecastSignals.length > 0 && (
                          <div>
                            <p className="text-xs font-medium text-muted-foreground mb-1">Forecast signals</p>
                            <ul className="space-y-0.5">
                              {n.strongestForecastSignals.map((s, i) => (
                                <li key={i} className="text-xs text-orange-700">· {s}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {n.strongestProtectiveSignals.length > 0 && (
                          <div>
                            <p className="text-xs font-medium text-muted-foreground mb-1">Protective signals</p>
                            <ul className="space-y-0.5">
                              {n.strongestProtectiveSignals.map((s, i) => (
                                <li key={i} className="text-xs text-emerald-700">· {s}</li>
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
