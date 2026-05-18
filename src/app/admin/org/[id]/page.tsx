"use client";

/**
 * /admin/org/[id] — Per-org Intelligence Detail (Sprint 14 Task 1).
 *
 * Unified view of all intelligence dimensions for one organization.
 * Linked from Health Center attention items.
 *
 * Sections:
 *   1. Intelligence Overview — archetype, continuity state, resilience, risk, intervention
 *   2. Forecast & Trajectory — current/projected states, trend, momentum, confidence
 *   3. Risk & Intervention   — risk factors, mitigation, timing, recommended actions
 *   4. Memory Highlights     — milestones, significant events, lineage summary
 *   5. Change Signals        — diff from last snapshot
 */

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ChevronLeft,
  Loader2,
  RefreshCcw,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Minus,
  Shield,
  Activity,
  Clock,
  Flag,
  Bell,
  ArrowUpRight,
  ArrowDownRight,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

type WindowDays = 30 | 90 | 365;

interface OrgDetail {
  traceId: string;
  windowDays: WindowDays;
  generatedAt: string;
  org: { id: string; name: string; slug: string; tier: string; createdAt: string };
  forecast:   any | null;
  trajectory: any | null;
  resilience: any | null;
  timing:     any | null;
  risk:       any | null;
  archetype:  any | null;
  validation: any | null;
  lineage:    any | null;
  memory:     any | null;
  timeline:   any | null;
  replay:     any | null;
  diff:       any | null;
  lastSnapshotAt: string | null;
  recentAlerts: any[];
}

// ── Color helpers ─────────────────────────────────────────────────────────────

const STATE_COLORS: Record<string, string> = {
  OPTIMIZING: "bg-emerald-50 text-emerald-800 border-emerald-200",
  STABLE:     "bg-blue-50   text-blue-800   border-blue-200",
  WATCHING:   "bg-yellow-50 text-yellow-800 border-yellow-200",
  FRAGMENTED: "bg-orange-50 text-orange-800 border-orange-200",
  CRITICAL:   "bg-red-50    text-red-800    border-red-200",
};

const RISK_COLORS: Record<string, string> = {
  LOW:      "bg-blue-50   text-blue-800   border-blue-200",
  MEDIUM:   "bg-yellow-50 text-yellow-800 border-yellow-200",
  HIGH:     "bg-orange-50 text-orange-800 border-orange-200",
  CRITICAL: "bg-red-50    text-red-800    border-red-200",
};

const WINDOW_COLORS: Record<string, string> = {
  IMMEDIATE:    "bg-red-50    text-red-800    border-red-200",
  SHORT_TERM:   "bg-orange-50 text-orange-800 border-orange-200",
  MONITOR:      "bg-yellow-50 text-yellow-800 border-yellow-200",
  LOW_PRIORITY: "bg-blue-50   text-blue-800   border-blue-200",
};

const ARCHETYPE_COLORS: Record<string, string> = {
  FRAGMENTING_ORGANIZATION: "bg-red-50    text-red-800    border-red-200",
  SILENT_DEGRADER:          "bg-red-50    text-red-800    border-red-200",
  VOLATILE_OPERATOR:        "bg-orange-50 text-orange-800 border-orange-200",
  HIGH_INTERVENTION_ORG:    "bg-orange-50 text-orange-800 border-orange-200",
  RECOVERY_ORIENTED:        "bg-yellow-50 text-yellow-800 border-yellow-200",
  PLATEAUED_ORGANIZATION:   "bg-yellow-50 text-yellow-800 border-yellow-200",
  STABLE_OPERATOR:          "bg-blue-50   text-blue-800   border-blue-200",
  RESILIENT_GROWER:         "bg-emerald-50 text-emerald-800 border-emerald-200",
};

const SEVERITY_COLORS: Record<string, string> = {
  CRITICAL: "bg-red-50    text-red-800    border-red-200",
  WARNING:  "bg-yellow-50 text-yellow-800 border-yellow-200",
  INFO:     "bg-blue-50   text-blue-800   border-blue-200",
};

function StateBadge({ label, colorClass }: { label: string; colorClass: string }) {
  return (
    <Badge variant="outline" className={cn("text-[10px] font-black uppercase tracking-wider h-5 px-2", colorClass)}>
      {label.replace(/_/g, " ")}
    </Badge>
  );
}

function SectionCard({ title, description, icon: Icon, children }: {
  title: string;
  description: string;
  icon: React.ElementType;
  children: React.ReactNode;
}) {
  return (
    <Card className="border-none shadow-sm bg-white">
      <CardHeader className="border-b bg-muted/10 py-5 px-8">
        <div className="flex items-center gap-2 mb-0.5">
          <Icon className="w-4 h-4 text-primary/70" />
          <CardTitle className="text-base font-bold text-primary">{title}</CardTitle>
        </div>
        <CardDescription className="text-xs text-muted-foreground">{description}</CardDescription>
      </CardHeader>
      <CardContent className="px-8 py-6">{children}</CardContent>
    </Card>
  );
}

function ScoreBar({ value, max = 100 }: { value: number; max?: number }) {
  const pct = Math.min(100, Math.round((value / max) * 100));
  const color =
    pct >= 70 ? "bg-emerald-400" :
    pct >= 45 ? "bg-amber-400"   :
    "bg-orange-400";
  return (
    <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden w-full">
      <div className={cn("h-full rounded-full", color)} style={{ width: `${pct}%` }} />
    </div>
  );
}

function DeltaBadge({ delta, label }: { delta: number; label: string }) {
  if (delta === 0) return null;
  const improved = delta > 0;
  return (
    <span className={cn("flex items-center gap-0.5 text-xs font-bold", improved ? "text-emerald-700" : "text-red-700")}>
      {improved ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
      {improved ? "+" : ""}{delta} {label}
    </span>
  );
}

// ── Tab nav ───────────────────────────────────────────────────────────────────

const INTEL_TABS = [
  { label: "Overview",    href: "/admin/intelligence" },
  { label: "Continuity",  href: "/admin/continuity" },
  { label: "Forecasting", href: "/admin/forecasting" },
  { label: "Memory",      href: "/admin/memory" },
] as const;

// ── Main page ─────────────────────────────────────────────────────────────────

export default function OrgDetailPage() {
  const params = useParams();
  const orgId  = params.id as string;

  const [data,    setData]    = useState<OrgDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);
  const [window,  setWindow]  = useState<WindowDays>(90);

  const fetchData = useCallback(async (w: WindowDays) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/org/${orgId}/intelligence?window=${w}`);
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? `HTTP ${res.status}`);
      }
      setData(await res.json());
    } catch (e: any) {
      setError(e?.message ?? "Failed to load org intelligence");
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => { fetchData(window); }, [fetchData, window]);

  const f   = data?.forecast;
  const traj = data?.trajectory;
  const res  = data?.resilience;
  const tim  = data?.timing;
  const risk = data?.risk;
  const arch = data?.archetype;
  const val  = data?.validation;
  const diff = data?.diff;

  return (
    <div className="min-h-screen bg-background animate-in fade-in duration-500">

      {/* ── Header ── */}
      <header className="bg-white border-b px-6 py-4 sticky top-0 z-50">
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          <div className="flex items-center gap-3">
            <Link href="/admin/health-center">
              <Button variant="ghost" size="icon" className="rounded-full">
                <ChevronLeft className="w-5 h-5" />
              </Button>
            </Link>
            <div>
              {loading || !data ? (
                <div className="h-5 w-48 bg-muted animate-pulse rounded" />
              ) : (
                <>
                  <h1 className="text-lg font-bold text-primary">{data.org.name}</h1>
                  <p className="text-xs text-muted-foreground">
                    {data.org.tier} · Intelligence Detail · {window}d window
                  </p>
                </>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Window selector */}
            <div className="flex rounded-md border border-primary/20 overflow-hidden text-xs font-bold">
              {([30, 90, 365] as WindowDays[]).map((w) => (
                <button
                  key={w}
                  onClick={() => { setWindow(w); fetchData(w); }}
                  className={cn(
                    "px-3 py-1.5 transition-colors",
                    window === w
                      ? "bg-primary text-primary-foreground"
                      : "bg-white text-primary/70 hover:bg-muted/40",
                  )}
                >
                  {w}d
                </button>
              ))}
            </div>
            <Button
              variant="outline"
              size="sm"
              className="gap-2 text-xs border-primary/20"
              onClick={() => fetchData(window)}
              disabled={loading}
            >
              {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCcw className="w-3 h-3" />}
              Refresh
            </Button>
          </div>
        </div>

        {/* Tab nav — platform intelligence views */}
        <div className="flex items-center gap-0 mt-3 max-w-7xl mx-auto border-t border-muted pt-3">
          <span className="text-xs text-muted-foreground mr-3">Platform views:</span>
          {INTEL_TABS.map((tab) => (
            <Link key={tab.label} href={tab.href}>
              <button className="px-3 py-1 text-xs text-muted-foreground hover:text-primary rounded transition-colors hover:bg-muted/30">
                {tab.label}
              </button>
            </Link>
          ))}
        </div>
      </header>

      <main className="p-8 space-y-6 max-w-7xl mx-auto">

        {loading && !data && (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {error && (
          <Card className="border-red-200 bg-red-50">
            <CardContent className="p-6 flex items-center gap-3 text-red-700">
              <AlertTriangle className="w-5 h-5 shrink-0" />
              <p className="text-sm font-bold">{error}</p>
            </CardContent>
          </Card>
        )}

        {data && !loading && (
          <>
            {/* ── Section 1: Intelligence Overview ── */}
            <SectionCard
              icon={Activity}
              title="Intelligence Overview"
              description="Current operational classification across all intelligence dimensions."
            >
              <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                {/* Archetype */}
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">Archetype</p>
                  {arch ? (
                    <>
                      <StateBadge label={arch.archetype} colorClass={ARCHETYPE_COLORS[arch.archetype] ?? "bg-muted text-muted-foreground border-muted"} />
                      <p className="text-[11px] text-muted-foreground mt-1.5">
                        {arch.confidence.toLowerCase()} confidence · {arch.archetypeStability.toLowerCase()} stability
                      </p>
                      {arch.derivedFromSignals.slice(0, 2).map((s: string, i: number) => (
                        <p key={i} className="text-[11px] text-muted-foreground">· {s}</p>
                      ))}
                    </>
                  ) : (
                    <p className="text-xs text-muted-foreground">—</p>
                  )}
                </div>

                {/* Continuity */}
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">Continuity State</p>
                  {f ? (
                    <>
                      <StateBadge label={f.currentState} colorClass={STATE_COLORS[f.currentState] ?? ""} />
                      <p className="text-[11px] text-muted-foreground mt-1.5">
                        30d → <span className="font-bold">{f.projectedState30d}</span>
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        90d → <span className="font-bold">{f.projectedState90d}</span>
                      </p>
                      {diff?.continuityStateChanged && diff.previousState && (
                        <p className="text-[10px] text-amber-600 mt-1">
                          ↑ was {diff.previousState.toLowerCase().replace(/_/g, " ")}
                        </p>
                      )}
                    </>
                  ) : (
                    <p className="text-xs text-muted-foreground">—</p>
                  )}
                </div>

                {/* Risk Level */}
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">Risk Level</p>
                  {risk ? (
                    <>
                      <StateBadge label={risk.riskLevel} colorClass={RISK_COLORS[risk.riskLevel] ?? ""} />
                      <p className="text-[11px] text-muted-foreground mt-1.5">{risk.riskCategory}</p>
                      {diff?.riskLevelChanged && diff.previousRiskLevel && (
                        <p className="text-[10px] text-amber-600 mt-1">
                          was {diff.previousRiskLevel.toLowerCase()}
                        </p>
                      )}
                    </>
                  ) : (
                    <p className="text-xs text-muted-foreground">—</p>
                  )}
                </div>

                {/* Intervention Window */}
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">Intervention Window</p>
                  {tim ? (
                    <>
                      <StateBadge label={tim.interventionWindow} colorClass={WINDOW_COLORS[tim.interventionWindow] ?? ""} />
                      <p className="text-[11px] text-muted-foreground mt-1.5">{tim.urgencyRationale}</p>
                    </>
                  ) : (
                    <p className="text-xs text-muted-foreground">—</p>
                  )}
                </div>
              </div>

              {/* Resilience score bar */}
              {res && (
                <div className="mt-6 pt-5 border-t border-muted">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      Resilience Score
                    </p>
                    <div className="flex items-center gap-3">
                      <span className="text-xl font-black text-primary">{res.resilienceScore}</span>
                      <span className="text-[10px] text-muted-foreground">/ 100</span>
                      {diff && <DeltaBadge delta={diff.resilienceScoreDelta} label="pts" />}
                    </div>
                  </div>
                  <ScoreBar value={res.resilienceScore} />
                  <p className="text-[11px] text-muted-foreground mt-1.5">
                    {res.resilienceState.toLowerCase().replace(/_/g, " ")} · {res.confidence.toLowerCase()} confidence
                  </p>
                </div>
              )}
            </SectionCard>

            {/* ── Section 2: Forecast & Trajectory ── */}
            <SectionCard
              icon={TrendingUp}
              title="Forecast & Trajectory"
              description="Continuity momentum, trend direction, and forward projections."
            >
              {!f && !traj ? (
                <p className="text-sm text-muted-foreground">No forecast data in this window.</p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  {/* Forecast */}
                  {f && (
                    <div>
                      <p className="text-xs font-bold text-primary mb-3">Continuity Forecast</p>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">Current state</span>
                          <StateBadge label={f.currentState} colorClass={STATE_COLORS[f.currentState] ?? ""} />
                        </div>
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">Projected 30d</span>
                          <StateBadge label={f.projectedState30d} colorClass={STATE_COLORS[f.projectedState30d] ?? ""} />
                        </div>
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">Projected 90d</span>
                          <StateBadge label={f.projectedState90d} colorClass={STATE_COLORS[f.projectedState90d] ?? ""} />
                        </div>
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">Trend</span>
                          <span className="font-bold text-primary">
                            {f.continuityTrend === "IMPROVING" ? "↑" : f.continuityTrend === "DECLINING" ? "↓" : "→"}{" "}
                            {f.continuityTrend.toLowerCase()}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">Confidence</span>
                          <span className="text-primary font-medium">{f.confidence.toLowerCase()}</span>
                        </div>
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">Stability</span>
                          <span className="text-primary font-medium">{f.forecastStability?.toLowerCase()}</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Trajectory */}
                  {traj && (
                    <div>
                      <p className="text-xs font-bold text-primary mb-3">Trajectory</p>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">Type</span>
                          <span className="font-bold text-primary">{traj.trajectoryType.toLowerCase().replace(/_/g, " ")}</span>
                        </div>
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">Momentum</span>
                          <span className="font-bold text-primary">{traj.momentum.toLowerCase()}</span>
                        </div>
                        {traj.continuityVelocity !== undefined && (
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-muted-foreground">Velocity</span>
                            <span className={cn("font-bold", traj.continuityVelocity > 0 ? "text-emerald-700" : traj.continuityVelocity < 0 ? "text-red-700" : "text-muted-foreground")}>
                              {traj.continuityVelocity > 0 ? "+" : ""}{traj.continuityVelocity}
                            </span>
                          </div>
                        )}
                        {traj.plateauDuration !== undefined && (
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-muted-foreground">Plateau duration</span>
                            <span className="font-medium text-primary">{traj.plateauDuration} scan{traj.plateauDuration !== 1 ? "s" : ""}</span>
                          </div>
                        )}
                        {traj.accelerationState && (
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-muted-foreground">Acceleration</span>
                            <span className="font-medium text-primary">{traj.accelerationState.toLowerCase()}</span>
                          </div>
                        )}
                      </div>

                      {/* Validation */}
                      {val && (
                        <div className="mt-4 pt-4 border-t border-muted">
                          <p className="text-xs font-bold text-primary mb-2">Forecast Validation</p>
                          <div className="space-y-1.5">
                            <div className="flex items-center justify-between text-xs">
                              <span className="text-muted-foreground">Result</span>
                              <Badge variant="outline" className={cn("text-[10px] font-bold",
                                val.validationResult === "ACCURATE"           ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
                                val.validationResult === "PARTIALLY_ACCURATE" ? "bg-amber-50 text-amber-700 border-amber-200" :
                                "bg-orange-50 text-orange-700 border-orange-200"
                              )}>
                                {val.validationResult.replace(/_/g, " ").toLowerCase()}
                              </Badge>
                            </div>
                            <div className="flex items-center justify-between text-xs">
                              <span className="text-muted-foreground">Predicted → Actual</span>
                              <span className="font-medium text-primary">
                                {val.predictedState} → {val.actualState}
                              </span>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </SectionCard>

            {/* ── Section 3: Risk & Intervention ── */}
            <SectionCard
              icon={Shield}
              title="Risk & Intervention"
              description="Operational risk factors and recommended intervention timing."
            >
              {!risk && !tim ? (
                <p className="text-sm text-muted-foreground">No risk or timing data in this window.</p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  {/* Risk */}
                  {risk && (
                    <div>
                      <p className="text-xs font-bold text-primary mb-3">Risk Forecast</p>
                      <StateBadge label={risk.riskLevel} colorClass={RISK_COLORS[risk.riskLevel] ?? ""} />
                      <p className="text-xs text-muted-foreground mt-2 mb-3">{risk.riskCategory}</p>

                      {risk.riskFactors?.length > 0 && (
                        <div className="mb-3">
                          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Risk Factors</p>
                          <ul className="space-y-1">
                            {risk.riskFactors.slice(0, 4).map((f: string, i: number) => (
                              <li key={i} className="text-xs text-muted-foreground flex items-start gap-1">
                                <span className="text-red-500 shrink-0">·</span> {f}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {risk.mitigationSuggestions?.length > 0 && (
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Mitigations</p>
                          <ul className="space-y-1">
                            {risk.mitigationSuggestions.slice(0, 3).map((m: string, i: number) => (
                              <li key={i} className="text-xs text-muted-foreground flex items-start gap-1">
                                <span className="text-emerald-600 shrink-0">→</span> {m}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Timing */}
                  {tim && (
                    <div>
                      <p className="text-xs font-bold text-primary mb-3">Intervention Timing</p>
                      <StateBadge label={tim.interventionWindow} colorClass={WINDOW_COLORS[tim.interventionWindow] ?? ""} />
                      <p className="text-xs text-muted-foreground mt-2 mb-3">{tim.urgencyRationale}</p>

                      {tim.recommendedInterventions?.length > 0 && (
                        <div className="mb-3">
                          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Recommended</p>
                          <ul className="space-y-1">
                            {tim.recommendedInterventions.slice(0, 3).map((r: string, i: number) => (
                              <li key={i} className="text-xs text-muted-foreground flex items-start gap-1">
                                <span className="text-primary/50 shrink-0">·</span> {r}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {tim.basedOnPatterns?.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {tim.basedOnPatterns.slice(0, 4).map((p: string, i: number) => (
                            <span key={i} className="text-[10px] bg-muted/40 border border-muted px-1.5 py-0.5 rounded text-muted-foreground font-mono">
                              {p}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </SectionCard>

            {/* ── Section 4: Memory Highlights ── */}
            <SectionCard
              icon={Clock}
              title="Memory Highlights"
              description="Significant operational moments, milestones, and continuity transitions."
            >
              {!data.timeline && !data.lineage ? (
                <p className="text-sm text-muted-foreground">No memory data in this window.</p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  {/* Significant moments */}
                  {data.timeline?.significantMoments?.length > 0 && (
                    <div>
                      <p className="text-xs font-bold text-primary mb-3">Significant Events</p>
                      <div className="space-y-3">
                        {data.timeline.significantMoments.slice(0, 5).map((e: any, i: number) => (
                          <div key={i} className="flex items-start gap-2">
                            <Flag className="w-3.5 h-3.5 text-primary/50 mt-0.5 shrink-0" />
                            <div>
                              <p className="text-xs font-medium text-primary">{e.title}</p>
                              <p className="text-[11px] text-muted-foreground">{e.description}</p>
                              <p className="text-[10px] text-muted-foreground mt-0.5">
                                {new Date(e.timestamp).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Continuity transitions + lineage */}
                  <div>
                    {data.timeline?.continuityTransitions?.length > 0 && (
                      <div className="mb-5">
                        <p className="text-xs font-bold text-primary mb-3">Continuity Transitions</p>
                        <div className="space-y-2">
                          {data.timeline.continuityTransitions.slice(0, 4).map((t: any, i: number) => (
                            <div key={i} className="flex items-center gap-2 text-xs">
                              <span className={cn("font-bold", STATE_COLORS[t.from]?.includes("emerald") ? "text-emerald-700" : "text-orange-700")}>
                                {t.from}
                              </span>
                              <span className="text-muted-foreground">→</span>
                              <span className={cn("font-bold", STATE_COLORS[t.to]?.includes("emerald") ? "text-emerald-700" : "text-orange-700")}>
                                {t.to}
                              </span>
                              <span className="text-[10px] text-muted-foreground ml-auto">
                                {t.scoreBefore} → {t.scoreAfter}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {data.lineage && (
                      <div>
                        <p className="text-xs font-bold text-primary mb-2">Intervention Lineage</p>
                        <div className="space-y-1">
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-muted-foreground">Total interventions</span>
                            <span className="font-bold text-primary">{data.lineage.totalInterventions ?? 0}</span>
                          </div>
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-muted-foreground">Unresolved patterns</span>
                            <span className={cn("font-bold", (data.lineage.unresolvedPatterns?.length ?? 0) > 0 ? "text-orange-700" : "text-emerald-700")}>
                              {data.lineage.unresolvedPatterns?.length ?? 0}
                            </span>
                          </div>
                        </div>
                        {data.lineage.unresolvedPatterns?.length > 0 && (
                          <ul className="mt-2 space-y-0.5">
                            {data.lineage.unresolvedPatterns.slice(0, 3).map((p: any, i: number) => (
                              <li key={i} className="text-[11px] text-orange-700">· {p.pattern ?? p}</li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </SectionCard>

            {/* ── Section 5: Change Signals ── */}
            <SectionCard
              icon={Bell}
              title="Change Signals"
              description="Intelligence changes since last snapshot and recent alerts."
            >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* Diff */}
                <div>
                  <p className="text-xs font-bold text-primary mb-3">Since Last Snapshot</p>
                  {!diff || !diff.hasDiff ? (
                    <p className="text-xs text-muted-foreground">
                      {diff ? "No significant changes since last snapshot." : "No prior snapshot available."}
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {diff.archetypeChanged && (
                        <div className="text-xs flex items-center gap-2">
                          <span className="text-muted-foreground">Archetype</span>
                          <span className="font-mono text-[10px] text-muted-foreground">{diff.previousArchetype?.replace(/_/g, " ")} →</span>
                          <span className="font-bold text-primary">{arch?.archetype?.replace(/_/g, " ")}</span>
                        </div>
                      )}
                      {diff.continuityStateChanged && (
                        <div className="text-xs flex items-center gap-2">
                          <span className="text-muted-foreground">Continuity</span>
                          <span className="font-mono text-[10px] text-muted-foreground">{diff.previousState} →</span>
                          <span className="font-bold text-primary">{f?.currentState}</span>
                          <span className={cn("text-[10px] font-bold ml-1", diff.continuityStateRankDelta > 0 ? "text-emerald-600" : "text-red-600")}>
                            ({diff.continuityStateRankDelta > 0 ? "↑ improved" : "↓ declined"})
                          </span>
                        </div>
                      )}
                      {diff.riskLevelChanged && (
                        <div className="text-xs flex items-center gap-2">
                          <span className="text-muted-foreground">Risk</span>
                          <span className="font-mono text-[10px] text-muted-foreground">{diff.previousRiskLevel} →</span>
                          <span className="font-bold text-primary">{risk?.riskLevel}</span>
                        </div>
                      )}
                      {Math.abs(diff.resilienceScoreDelta) >= 5 && (
                        <div className="text-xs flex items-center gap-2">
                          <span className="text-muted-foreground">Resilience</span>
                          <DeltaBadge delta={diff.resilienceScoreDelta} label="pts" />
                        </div>
                      )}
                      {diff.interventionWindowChanged && (
                        <div className="text-xs flex items-center gap-2">
                          <span className="text-muted-foreground">Intervention window</span>
                          <span className="font-mono text-[10px] text-muted-foreground">{diff.previousInterventionWindow} →</span>
                          <span className={cn("font-bold", diff.interventionWindowWorsened ? "text-red-700" : "text-emerald-700")}>
                            {tim?.interventionWindow}
                          </span>
                        </div>
                      )}
                      {data.lastSnapshotAt && (
                        <p className="text-[10px] text-muted-foreground mt-2">
                          Last snapshot: {new Date(data.lastSnapshotAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })}
                        </p>
                      )}
                    </div>
                  )}
                </div>

                {/* Recent alerts */}
                <div>
                  <p className="text-xs font-bold text-primary mb-3">Recent Alerts (30d)</p>
                  {data.recentAlerts.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No intelligence alerts in the last 30 days.</p>
                  ) : (
                    <div className="space-y-3">
                      {data.recentAlerts.slice(0, 5).map((a: any, i: number) => (
                        <div key={i} className="flex items-start gap-2">
                          <div className={cn("w-1.5 h-1.5 rounded-full mt-1.5 shrink-0", a.isRead ? "bg-muted" : "bg-primary")} />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 mb-0.5">
                              <StateBadge label={a.severity} colorClass={SEVERITY_COLORS[a.severity] ?? ""} />
                              <span className="text-[10px] text-muted-foreground">
                                {new Date(a.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                              </span>
                            </div>
                            <p className="text-xs font-medium text-primary truncate">{a.title}</p>
                            {a.message && (
                              <p className="text-[11px] text-muted-foreground line-clamp-2">{a.message}</p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </SectionCard>
          </>
        )}
      </main>
    </div>
  );
}
