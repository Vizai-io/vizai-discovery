"use client";

/**
 * @fileOverview /admin/continuity — Workflow Intelligence Dashboard.
 *
 * Sprint 6 Task 7. Renders 5 panels of operational continuity intelligence.
 * Calm, text-first design (Refinement 8) — no gauges, no gamification.
 *
 * Panels:
 *   1. Operational Continuity   — composite scores and maturity classification
 *   2. Organizational Drift     — drift signals and recommended interventions
 *   3. Recommendation Impact    — effectiveness of completed recommendations
 *   4. Onboarding Quality       — activation state and blockers per org
 *   5. Operational Playbooks    — deterministic actions per org urgency
 */

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ChevronLeft,
  RefreshCcw,
  Loader2,
  AlertTriangle,
  Activity,
  TrendingDown,
  CheckSquare,
  UserCheck,
  BookOpen,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

type WindowDays = 7 | 30 | 90;

interface OrgMeta { name: string; slug: string; tier: string }

interface ScoreRow {
  organizationId: string;
  org:            OrgMeta | null;
  compositeScore: number;
  maturityState:  string;
  volatilityState:string;
  confidence:     string;
  components:     { continuityScore: number; inverseDriftScore: number; activationScore: number; frictionScore: number };
}

interface DriftRow {
  organizationId:           string;
  org:                      OrgMeta | null;
  driftScore:               number;
  driftState:               string;
  contributingSignals:      { signal: string; score: number; description: string }[];
  recommendedInterventions: string[];
  confidence:               string;
}

interface ImpactRow {
  recommendationId: string;
  organizationId:   string;
  org:              OrgMeta | null;
  category:         string;
  priority:         string;
  impactState:      string;
  confidence:       string;
  visibilityDelta:  number;
  frictionDelta:    number;
  timeToImpactDays?:number;
}

interface OnboardingRow {
  organizationId:          string;
  org:                     OrgMeta | null;
  onboardingState:         string;
  activationScore:         number;
  completionDurationHours: number;
  replayProvisioningCount: number;
  blockers:                string[];
  confidence:              string;
}

interface PlaybookAction {
  actionId:           string;
  title:              string;
  description:        string;
  explanation:        string;
  triggeredBySignals: string[];
  source:             string;
  priority:           number;
}

interface PlaybookRow {
  organizationId:     string;
  org:                OrgMeta | null;
  urgency:            string;
  recommendedActions: PlaybookAction[];
  generatedFrom:      string;
  rationale:          string;
  confidence:         string;
}

interface ContinuityData {
  traceId:     string;
  windowDays:  WindowDays;
  generatedAt: string;
  summary: {
    totalOrgs:        number;
    byMaturityState:  Record<string, number>;
    byDriftState:     Record<string, number>;
    byUrgency:        Record<string, number>;
    byOnboardingState:Record<string, number>;
    impactSummary:    { positive: number; neutral: number; negative: number; insufficient: number };
  };
  scores:     ScoreRow[];
  drifts:     DriftRow[];
  impacts:    ImpactRow[];
  onboardings:OnboardingRow[];
  playbooks:  PlaybookRow[];
}

// ── Color maps (Refinement 8 — calm, text-first) ──────────────────────────────

const MATURITY_COLORS: Record<string, string> = {
  OPTIMIZING: "bg-green-50  text-green-800  border-green-200",
  STABLE:     "bg-blue-50   text-blue-800   border-blue-200",
  WATCHING:   "bg-yellow-50 text-yellow-800 border-yellow-200",
  FRAGMENTED: "bg-orange-50 text-orange-800 border-orange-200",
  CRITICAL:   "bg-red-50    text-red-800    border-red-200",
};

const DRIFT_COLORS: Record<string, string> = {
  STABLE:    "bg-green-50  text-green-800  border-green-200",
  DRIFTING:  "bg-yellow-50 text-yellow-800 border-yellow-200",
  DEGRADING: "bg-orange-50 text-orange-800 border-orange-200",
  CRITICAL:  "bg-red-50    text-red-800    border-red-200",
};

const URGENCY_COLORS: Record<string, string> = {
  LOW:      "bg-blue-50   text-blue-800   border-blue-200",
  MEDIUM:   "bg-yellow-50 text-yellow-800 border-yellow-200",
  HIGH:     "bg-orange-50 text-orange-800 border-orange-200",
  CRITICAL: "bg-red-50    text-red-800    border-red-200",
};

const IMPACT_COLORS: Record<string, string> = {
  POSITIVE:          "bg-green-50  text-green-800  border-green-200",
  NEUTRAL:           "bg-gray-50   text-gray-700   border-gray-200",
  NEGATIVE:          "bg-red-50    text-red-800    border-red-200",
  INSUFFICIENT_DATA: "bg-muted     text-muted-foreground border-muted",
};

const ONBOARDING_COLORS: Record<string, string> = {
  SMOOTH:   "bg-green-50  text-green-800  border-green-200",
  FRICTION: "bg-yellow-50 text-yellow-800 border-yellow-200",
  STALLED:  "bg-red-50    text-red-800    border-red-200",
};

// ── Helper: state badge ────────────────────────────────────────────────────────

function StateBadge({ label, colorClass }: { label: string; colorClass: string }) {
  return (
    <Badge variant="outline" className={cn("text-[9px] font-black uppercase tracking-wider h-5 px-1.5", colorClass)}>
      {label}
    </Badge>
  );
}

// ── Helper: section header row ────────────────────────────────────────────────

function SectionHeader({ icon: Icon, title, description, chips }: {
  icon: React.ElementType;
  title: string;
  description: string;
  chips?: { label: string; count: number; colorClass: string }[];
}) {
  return (
    <CardHeader className="border-b bg-muted/10 py-5 px-8">
      <div className="flex items-center gap-2 mb-1">
        <Icon className="w-4 h-4 text-primary/70" />
        <CardTitle className="text-base font-bold text-primary">{title}</CardTitle>
      </div>
      <CardDescription className="text-xs text-muted-foreground mb-3">{description}</CardDescription>
      {chips && chips.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {chips.map(({ label, count, colorClass }) => (
            <Badge
              key={label}
              variant="outline"
              className={cn("text-[9px] font-black uppercase tracking-wider h-5 gap-1 px-2", colorClass)}
            >
              {count} {label}
            </Badge>
          ))}
        </div>
      )}
    </CardHeader>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function ContinuityDashboard() {
  const [data,    setData]    = useState<ContinuityData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);
  const [window,  setWindow]  = useState<WindowDays>(30);

  const fetchData = useCallback(async (w: WindowDays) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/continuity?window=${w}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData(await res.json());
    } catch (e: any) {
      setError(e?.message ?? "Failed to load continuity data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(window); }, [fetchData, window]);

  const handleWindowChange = (w: WindowDays) => {
    setWindow(w);
    fetchData(w);
  };

  return (
    <div className="min-h-screen bg-background animate-in fade-in duration-500">
      {/* ── Header ── */}
      <header className="bg-white border-b px-6 py-4 flex items-center justify-between sticky top-0 z-50">
        <div className="flex items-center gap-4">
          <Link href="/admin">
            <Button variant="ghost" size="icon" className="rounded-full">
              <ChevronLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div className="flex items-center gap-2">
            <Activity className="w-5 h-5 text-primary" />
            <h1 className="text-xl font-headline font-bold text-primary">Workflow Continuity</h1>
          </div>
          {data && (
            <span className="text-xs text-muted-foreground ml-2">
              {data.summary.totalOrgs} org{data.summary.totalOrgs !== 1 ? "s" : ""}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* Window selector */}
          <div className="flex rounded-md border border-primary/20 overflow-hidden text-xs font-bold">
            {([7, 30, 90] as const).map((w) => (
              <button
                key={w}
                onClick={() => handleWindowChange(w)}
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
            className="gap-2 text-xs font-bold border-primary/20"
            onClick={() => fetchData(window)}
            disabled={loading}
          >
            {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCcw className="w-3 h-3" />}
            Refresh
          </Button>
        </div>
      </header>

      <main className="p-8 space-y-8 max-w-7xl mx-auto">
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

        {data && (
          <>
            {/* ── Panel 1: Operational Continuity ── */}
            <Card className="border-none shadow-sm bg-white">
              <SectionHeader
                icon={Activity}
                title="Operational Continuity"
                description={`Composite maturity score per organization over the last ${data.windowDays} days. Score = continuity×0.35 + inverse-drift×0.30 + activation×0.20 + friction×0.15`}
                chips={Object.entries(data.summary.byMaturityState).map(([state, count]) => ({
                  label: state,
                  count,
                  colorClass: MATURITY_COLORS[state] ?? "",
                }))}
              />
              <CardContent className="p-0 divide-y">
                {data.scores.length === 0 ? (
                  <p className="text-sm text-muted-foreground italic text-center py-10">
                    No organizations to analyze.
                  </p>
                ) : (
                  data.scores
                    .sort((a, b) => a.compositeScore - b.compositeScore)
                    .map((s) => (
                      <div key={s.organizationId} className="px-8 py-4 hover:bg-muted/10 transition-colors">
                        <div className="flex items-start justify-between gap-4">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-sm font-bold text-primary truncate">
                                {s.org?.name ?? s.organizationId}
                              </span>
                              <StateBadge label={s.maturityState} colorClass={MATURITY_COLORS[s.maturityState] ?? ""} />
                              <StateBadge label={s.volatilityState} colorClass="bg-muted text-muted-foreground border-muted" />
                            </div>
                            <div className="flex flex-wrap gap-x-6 gap-y-1 text-[11px] text-muted-foreground">
                              <span>Continuity: <strong className="text-primary">{s.components.continuityScore}</strong></span>
                              <span>Inv-Drift: <strong className="text-primary">{s.components.inverseDriftScore}</strong></span>
                              <span>Activation: <strong className="text-primary">{s.components.activationScore}</strong></span>
                              <span>Friction: <strong className="text-primary">{s.components.frictionScore}</strong></span>
                              <span>Confidence: <strong className="text-primary">{s.confidence}</strong></span>
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <div className="text-2xl font-black text-primary">{s.compositeScore}</div>
                            <div className="text-[10px] text-muted-foreground">/ 100</div>
                          </div>
                        </div>
                      </div>
                    ))
                )}
              </CardContent>
            </Card>

            {/* ── Panel 2: Organizational Drift ── */}
            <Card className="border-none shadow-sm bg-white">
              <SectionHeader
                icon={TrendingDown}
                title="Organizational Drift"
                description="Drift signals indicate operational disengagement. Each signal contributes up to 12.5 points to the drift score."
                chips={Object.entries(data.summary.byDriftState).map(([state, count]) => ({
                  label: state,
                  count,
                  colorClass: DRIFT_COLORS[state] ?? "",
                }))}
              />
              <CardContent className="p-0 divide-y">
                {data.drifts.length === 0 ? (
                  <p className="text-sm text-muted-foreground italic text-center py-10">No drift data.</p>
                ) : (
                  data.drifts
                    .sort((a, b) => b.driftScore - a.driftScore)
                    .map((d) => (
                      <div key={d.organizationId} className="px-8 py-4 hover:bg-muted/10 transition-colors">
                        <div className="flex items-start justify-between gap-4">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-sm font-bold text-primary">{d.org?.name ?? d.organizationId}</span>
                              <StateBadge label={d.driftState} colorClass={DRIFT_COLORS[d.driftState] ?? ""} />
                              <span className="text-[10px] text-muted-foreground">conf: {d.confidence}</span>
                            </div>
                            {d.contributingSignals.length > 0 ? (
                              <ul className="mt-1 space-y-0.5">
                                {d.contributingSignals.map((sig) => (
                                  <li key={sig.signal} className="text-[11px] text-muted-foreground">
                                    <span className="font-mono font-bold text-primary/70">{sig.signal}</span>
                                    {" — "}
                                    {sig.description}
                                  </li>
                                ))}
                              </ul>
                            ) : (
                              <p className="text-[11px] text-muted-foreground mt-1">No drift signals detected.</p>
                            )}
                            {d.recommendedInterventions.length > 0 && (
                              <div className="mt-2 flex flex-wrap gap-1">
                                {d.recommendedInterventions.map((int, i) => (
                                  <span key={i} className="text-[10px] bg-muted/40 border border-muted px-2 py-0.5 rounded text-muted-foreground">
                                    {int}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                          <div className="text-right shrink-0">
                            <div className="text-2xl font-black text-primary">{d.driftScore}</div>
                            <div className="text-[10px] text-muted-foreground">/ 100</div>
                          </div>
                        </div>
                      </div>
                    ))
                )}
              </CardContent>
            </Card>

            {/* ── Panel 3: Recommendation Effectiveness ── */}
            <Card className="border-none shadow-sm bg-white">
              <SectionHeader
                icon={CheckSquare}
                title="Recommendation Effectiveness"
                description="Impact assessment of completed recommendations. Visibility delta = after scan score minus before scan score."
                chips={[
                  { label: "Positive", count: data.summary.impactSummary.positive,     colorClass: IMPACT_COLORS["POSITIVE"] },
                  { label: "Neutral",  count: data.summary.impactSummary.neutral,      colorClass: IMPACT_COLORS["NEUTRAL"] },
                  { label: "Negative", count: data.summary.impactSummary.negative,     colorClass: IMPACT_COLORS["NEGATIVE"] },
                  { label: "No data",  count: data.summary.impactSummary.insufficient, colorClass: IMPACT_COLORS["INSUFFICIENT_DATA"] },
                ].filter((c) => c.count > 0)}
              />
              <CardContent className="p-0 divide-y">
                {data.impacts.length === 0 ? (
                  <p className="text-sm text-muted-foreground italic text-center py-10">
                    No completed recommendations to assess yet.
                  </p>
                ) : (
                  data.impacts
                    .sort((a, b) => {
                      const order: Record<string, number> = { NEGATIVE: 0, NEUTRAL: 1, POSITIVE: 2, INSUFFICIENT_DATA: 3 };
                      return (order[a.impactState] ?? 9) - (order[b.impactState] ?? 9);
                    })
                    .map((i) => (
                      <div key={i.recommendationId} className="px-8 py-3 hover:bg-muted/10 transition-colors flex items-center gap-4">
                        <StateBadge label={i.impactState.replace("_", " ")} colorClass={IMPACT_COLORS[i.impactState] ?? ""} />
                        <div className="min-w-0 flex-1">
                          <span className="text-xs font-bold text-primary">{i.org?.name ?? i.organizationId}</span>
                          <span className="text-[10px] text-muted-foreground ml-2">{i.category} · {i.priority}</span>
                        </div>
                        <div className="flex gap-5 text-[11px] text-right shrink-0">
                          <div>
                            <div className={cn(
                              "font-black text-sm",
                              i.visibilityDelta > 0 ? "text-green-700" : i.visibilityDelta < 0 ? "text-red-700" : "text-muted-foreground"
                            )}>
                              {i.visibilityDelta > 0 ? "+" : ""}{i.visibilityDelta}
                            </div>
                            <div className="text-[9px] text-muted-foreground uppercase tracking-wider">vis delta</div>
                          </div>
                          <div>
                            <div className={cn(
                              "font-black text-sm",
                              i.frictionDelta > 0 ? "text-green-700" : i.frictionDelta < 0 ? "text-red-700" : "text-muted-foreground"
                            )}>
                              {i.frictionDelta > 0 ? "+" : ""}{i.frictionDelta}
                            </div>
                            <div className="text-[9px] text-muted-foreground uppercase tracking-wider">friction</div>
                          </div>
                          {i.timeToImpactDays !== undefined && (
                            <div>
                              <div className="font-black text-sm text-primary">{i.timeToImpactDays}d</div>
                              <div className="text-[9px] text-muted-foreground uppercase tracking-wider">to impact</div>
                            </div>
                          )}
                        </div>
                      </div>
                    ))
                )}
              </CardContent>
            </Card>

            {/* ── Panel 4: Onboarding Quality ── */}
            <Card className="border-none shadow-sm bg-white">
              <SectionHeader
                icon={UserCheck}
                title="Onboarding Quality"
                description="Activation state per organization. Activation score = first scan (34) + active schedule (33) + ≥2 actioned recs (33)."
                chips={Object.entries(data.summary.byOnboardingState).map(([state, count]) => ({
                  label: state,
                  count,
                  colorClass: ONBOARDING_COLORS[state] ?? "",
                }))}
              />
              <CardContent className="p-0 divide-y">
                {data.onboardings.length === 0 ? (
                  <p className="text-sm text-muted-foreground italic text-center py-10">No onboarding data.</p>
                ) : (
                  data.onboardings
                    .sort((a, b) => a.activationScore - b.activationScore)
                    .map((o) => (
                      <div key={o.organizationId} className="px-8 py-4 hover:bg-muted/10 transition-colors">
                        <div className="flex items-start justify-between gap-4">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-sm font-bold text-primary">{o.org?.name ?? o.organizationId}</span>
                              <StateBadge label={o.onboardingState} colorClass={ONBOARDING_COLORS[o.onboardingState] ?? ""} />
                            </div>
                            <div className="flex flex-wrap gap-x-5 gap-y-1 text-[11px] text-muted-foreground mb-1">
                              <span>
                                Completion:{" "}
                                <strong className="text-primary">
                                  {o.completionDurationHours >= 0 ? `${o.completionDurationHours}h` : "—"}
                                </strong>
                              </span>
                              <span>Replays: <strong className="text-primary">{o.replayProvisioningCount}</strong></span>
                              <span>Confidence: <strong className="text-primary">{o.confidence}</strong></span>
                            </div>
                            {o.blockers.length > 0 && (
                              <ul className="space-y-0.5">
                                {o.blockers.map((b, i) => (
                                  <li key={i} className="text-[11px] text-orange-700 flex items-start gap-1">
                                    <span className="mt-0.5 shrink-0">·</span>
                                    {b}
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                          <div className="text-right shrink-0">
                            <div className="text-2xl font-black text-primary">{o.activationScore}</div>
                            <div className="text-[10px] text-muted-foreground">/ 100</div>
                          </div>
                        </div>
                      </div>
                    ))
                )}
              </CardContent>
            </Card>

            {/* ── Panel 5: Operational Playbooks ── */}
            <Card className="border-none shadow-sm bg-white">
              <SectionHeader
                icon={BookOpen}
                title="Operational Playbooks"
                description="Deterministic, explainable actions derived from continuity signals. Every action is justified by the signals that triggered it."
                chips={Object.entries(data.summary.byUrgency).map(([urg, count]) => ({
                  label: urg,
                  count,
                  colorClass: URGENCY_COLORS[urg] ?? "",
                }))}
              />
              <CardContent className="p-0 divide-y">
                {data.playbooks.length === 0 ? (
                  <p className="text-sm text-muted-foreground italic text-center py-10">
                    No playbooks generated.
                  </p>
                ) : (
                  data.playbooks
                    .sort((a, b) => {
                      const order: Record<string, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
                      return (order[a.urgency] ?? 9) - (order[b.urgency] ?? 9);
                    })
                    .map((p) => (
                      <div key={p.organizationId} className="px-8 py-5 hover:bg-muted/10 transition-colors">
                        <div className="flex items-start justify-between gap-4 mb-3">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-bold text-primary">{p.org?.name ?? p.organizationId}</span>
                            <StateBadge label={p.urgency} colorClass={URGENCY_COLORS[p.urgency] ?? ""} />
                            <span className="text-[10px] text-muted-foreground">from {p.generatedFrom}</span>
                          </div>
                          <span className="text-[10px] text-muted-foreground shrink-0">conf: {p.confidence}</span>
                        </div>
                        <p className="text-xs text-muted-foreground mb-3 italic">{p.rationale}</p>
                        {p.recommendedActions.length > 0 ? (
                          <ol className="space-y-2">
                            {p.recommendedActions.map((action, idx) => (
                              <li key={action.actionId} className="flex gap-3">
                                <span className="text-[10px] font-black text-muted-foreground w-4 shrink-0 pt-0.5">
                                  {idx + 1}.
                                </span>
                                <div>
                                  <p className="text-xs font-bold text-primary">{action.title}</p>
                                  <p className="text-[11px] text-muted-foreground mt-0.5">{action.explanation}</p>
                                  {action.triggeredBySignals.length > 0 && (
                                    <div className="flex flex-wrap gap-1 mt-1">
                                      {action.triggeredBySignals.map((sig) => (
                                        <span key={sig} className="text-[9px] font-mono bg-muted/50 border border-muted px-1.5 py-0.5 rounded text-primary/60">
                                          {sig}
                                        </span>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              </li>
                            ))}
                          </ol>
                        ) : (
                          <p className="text-[11px] text-muted-foreground italic">
                            No actions required — organization is operating normally.
                          </p>
                        )}
                      </div>
                    ))
                )}
              </CardContent>
            </Card>
          </>
        )}
      </main>
    </div>
  );
}
