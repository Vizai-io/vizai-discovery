"use client";

/**
 * @fileOverview /admin/memory — Organizational Memory Dashboard.
 *
 * Sprint 7 Task 7. Renders 5 panels of temporal operational memory.
 * Text-first, calm design (Refinement F) — no animations, no timeline theater.
 *
 * Panels:
 *   1. Organizational Timelines    — chronological events + transitions
 *   2. Operational Milestones      — lifecycle landmarks with significance
 *   3. Intervention Lineage        — chains, outcomes, unresolved patterns
 *   4. Continuity Replay           — proxy score snapshots over time
 *   5. Organizational Narratives   — deterministic summaries
 */

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ChevronLeft, RefreshCcw, Loader2, AlertTriangle,
  Clock, Flag, GitBranch, RotateCcw, FileText,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ── Types (minimal — enough for the dashboard) ────────────────────────────────

type WindowDays = 30 | 90 | 365;
interface OrgMeta { name: string; slug: string; tier: string }

interface TimelineEvent {
  eventId: string; category: string; timestamp: string;
  severity: string; title: string; description: string;
}
interface ContinuityTransition {
  scanId: string; changedAt: string; from: string; to: string;
  scoreBefore: number; scoreAfter: number; likelyDrivers: string[];
}
interface TimelineRow {
  organizationId: string; org: OrgMeta | null;
  events: TimelineEvent[]; continuityTransitions: ContinuityTransition[];
  significantMoments: TimelineEvent[]; confidence: string; windowDays: number;
  generatedFromWindow: { start: string; end: string };
}
interface MilestoneRow {
  milestoneType: string; achievedAt: string;
  significance: string; persistenceScore: number;
  explanation: string; derivedFrom: string[];
}
interface LineageItem {
  interventionId: string; triggeredBy: string; startedAt: string;
  outcome: string; causalityStrength: string; scoreDelta?: number;
  frictionBefore: number; frictionAfter: number;
  downstreamEffects: string[]; linkedMilestones: string[]; confidence: string;
}
interface LineageRow {
  organizationId: string; org: OrgMeta | null;
  lineages: LineageItem[]; successfulCount: number; partialCount: number;
  failedCount: number; unknownCount: number;
}
interface UnresolvedPattern {
  eventType: string; occurrenceCount: number; debtCategory: string; description: string;
}
interface MemoryRow {
  organizationId: string; org: OrgMeta | null;
  unresolvedPatterns: UnresolvedPattern[]; memoryDensity: string; confidence: string;
}
interface ContinuitySnapshot {
  snapshotAt: string; proxyScore: number; state: string;
  scansIn30d: number; assertionsIn7d: number; isInferred: boolean;
}
interface ReplayRow {
  organizationId: string; org: OrgMeta | null;
  snapshots: ContinuitySnapshot[]; transitions: any[]; historicalVolatility: string;
  integrityChecks: { missingWindows: number; incompleteSnapshots: number; inferredTransitions: number };
}
interface NarrativeRow {
  organizationId: string; org: OrgMeta | null;
  operationalStateSummary: string; dominantRiskFactors: string[];
  strongestRecoverySignals: string[]; continuityTrend: string;
  memoryDensity: string; confidence: string;
}

interface MemoryData {
  traceId: string; windowDays: WindowDays; generatedAt: string;
  summary: {
    totalOrgs: number; byVolatility: Record<string, number>;
    byTrend: Record<string, number>; byDensity: Record<string, number>;
    totalMilestones: number; totalLineages: number; totalTransitions: number;
  };
  timelines:  TimelineRow[];
  milestones: Record<string, MilestoneRow[]>;
  memories:   MemoryRow[];
  lineages:   LineageRow[];
  replays:    ReplayRow[];
  narratives: NarrativeRow[];
}

// ── Color maps ────────────────────────────────────────────────────────────────

const SEVERITY_COLORS: Record<string, string> = {
  INFO:     "bg-blue-50   text-blue-700   border-blue-200",
  WARNING:  "bg-yellow-50 text-yellow-700 border-yellow-200",
  ERROR:    "bg-orange-50 text-orange-700 border-orange-200",
  CRITICAL: "bg-red-50    text-red-700    border-red-200",
};
const SIGNIFICANCE_COLORS: Record<string, string> = {
  LOW:      "bg-blue-50   text-blue-700   border-blue-200",
  MEDIUM:   "bg-yellow-50 text-yellow-700 border-yellow-200",
  HIGH:     "bg-green-50  text-green-700  border-green-200",
  CRITICAL: "bg-red-50    text-red-700    border-red-200",
};
const OUTCOME_COLORS: Record<string, string> = {
  SUCCESSFUL:       "bg-green-50  text-green-700  border-green-200",
  PARTIAL:          "bg-yellow-50 text-yellow-700 border-yellow-200",
  FAILED:           "bg-red-50    text-red-700    border-red-200",
  UNKNOWN:          "bg-gray-50   text-gray-600   border-gray-200",
};
const TREND_COLORS: Record<string, string> = {
  IMPROVING: "bg-green-50  text-green-700  border-green-200",
  STABLE:    "bg-blue-50   text-blue-700   border-blue-200",
  DECLINING: "bg-orange-50 text-orange-700 border-orange-200",
};
const STATE_COLORS: Record<string, string> = {
  HEALTHY:   "bg-green-50  text-green-700  border-green-200",
  WATCHING:  "bg-yellow-50 text-yellow-700 border-yellow-200",
  FRAGMENTED:"bg-orange-50 text-orange-700 border-orange-200",
  STALLED:   "bg-red-50    text-red-700    border-red-200",
};

// ── Section header ────────────────────────────────────────────────────────────

function SectionHeader({ icon: Icon, title, description, chips }: {
  icon: React.ElementType; title: string; description: string;
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
            <Badge key={label} variant="outline"
              className={cn("text-[9px] font-black uppercase tracking-wider h-5 gap-1 px-2", colorClass)}>
              {count} {label}
            </Badge>
          ))}
        </div>
      )}
    </CardHeader>
  );
}

function Chip({ label, colorClass }: { label: string; colorClass: string }) {
  return (
    <Badge variant="outline"
      className={cn("text-[9px] font-black uppercase tracking-wider h-4 px-1.5", colorClass)}>
      {label}
    </Badge>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function MemoryDashboard() {
  const [data,    setData]    = useState<MemoryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);
  const [window,  setWindow]  = useState<WindowDays>(90);

  const fetchData = useCallback(async (w: WindowDays) => {
    setLoading(true); setError(null);
    try {
      const res = await fetch(`/api/admin/memory?window=${w}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData(await res.json());
    } catch (e: any) {
      setError(e?.message ?? "Failed to load memory data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(window); }, [fetchData, window]);

  const handleWindow = (w: WindowDays) => { setWindow(w); fetchData(w); };

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
            <Clock className="w-5 h-5 text-primary" />
            <h1 className="text-xl font-headline font-bold text-primary">Organizational Memory</h1>
          </div>
          {data && (
            <span className="text-xs text-muted-foreground ml-2">
              {data.summary.totalOrgs} org{data.summary.totalOrgs !== 1 ? "s" : ""} · {window}d window
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-md border border-primary/20 overflow-hidden text-xs font-bold">
            {([30, 90, 365] as const).map((w) => (
              <button key={w} onClick={() => handleWindow(w)}
                className={cn("px-3 py-1.5 transition-colors",
                  window === w ? "bg-primary text-primary-foreground" : "bg-white text-primary/70 hover:bg-muted/40")}>
                {w}d
              </button>
            ))}
          </div>
          <Button variant="outline" size="sm" className="gap-2 text-xs font-bold border-primary/20"
            onClick={() => fetchData(window)} disabled={loading}>
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
            {/* ── Panel 1: Organizational Timelines ── */}
            <Card className="border-none shadow-sm bg-white">
              <SectionHeader icon={Clock} title="Organizational Timelines"
                description={`Chronological operational events per organization over the last ${data.windowDays} days. Significant moments highlighted.`}
                chips={[
                  { label: "timelines", count: data.timelines.length, colorClass: "bg-muted text-muted-foreground border-muted" },
                  { label: "total events", count: data.timelines.reduce((s, t) => s + t.events.length, 0), colorClass: "bg-muted text-muted-foreground border-muted" },
                  { label: "transitions", count: data.summary.totalTransitions, colorClass: "bg-yellow-50 text-yellow-700 border-yellow-200" },
                ]}
              />
              <CardContent className="p-0 divide-y">
                {data.timelines.length === 0 ? (
                  <p className="text-sm text-muted-foreground italic text-center py-10">No timeline data.</p>
                ) : (
                  data.timelines.map((tl) => (
                    <div key={tl.organizationId} className="px-8 py-5 hover:bg-muted/10 transition-colors">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-primary">{tl.org?.name ?? tl.organizationId}</span>
                          <Chip label={tl.confidence} colorClass="bg-muted text-muted-foreground border-muted" />
                          <span className="text-[10px] text-muted-foreground">{tl.events.length} events</span>
                        </div>
                        <span className="text-[10px] text-muted-foreground">
                          {new Date(tl.generatedFromWindow.start).toLocaleDateString()} – {new Date(tl.generatedFromWindow.end).toLocaleDateString()}
                        </span>
                      </div>

                      {/* Significant moments only (calm, not full chronology) */}
                      {tl.significantMoments.length > 0 ? (
                        <div className="space-y-1.5">
                          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Significant moments</p>
                          {tl.significantMoments.slice(0, 6).map((ev) => (
                            <div key={ev.eventId} className="flex items-start gap-2">
                              <Chip label={ev.category} colorClass={SEVERITY_COLORS[ev.severity] ?? "bg-muted text-muted-foreground border-muted"} />
                              <span className="text-[11px] text-primary/80 flex-1">{ev.description}</span>
                              <span className="text-[10px] text-muted-foreground shrink-0">
                                {new Date(ev.timestamp).toLocaleDateString()}
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-[11px] text-muted-foreground italic">No significant moments in this window.</p>
                      )}

                      {/* Continuity transitions */}
                      {tl.continuityTransitions.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-muted/30">
                          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Continuity transitions</p>
                          <div className="flex flex-wrap gap-2">
                            {tl.continuityTransitions.map((t, i) => (
                              <span key={i} className="text-[11px] bg-muted/30 border border-muted px-2 py-1 rounded">
                                <span className={cn("font-bold", t.to === 'STALLED' || t.to === 'FRAGMENTED' ? "text-orange-700" : "text-green-700")}>
                                  {t.from} → {t.to}
                                </span>
                                <span className="text-muted-foreground ml-1">
                                  ({t.scoreBefore} → {t.scoreAfter}) {new Date(t.changedAt).toLocaleDateString()}
                                </span>
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            {/* ── Panel 2: Operational Milestones ── */}
            <Card className="border-none shadow-sm bg-white">
              <SectionHeader icon={Flag} title="Operational Milestones"
                description="Lifecycle landmarks per organization. persistenceScore (0–100) reflects how durable the improvement was."
                chips={[
                  { label: "total milestones", count: data.summary.totalMilestones, colorClass: "bg-muted text-muted-foreground border-muted" },
                  { label: "CRITICAL", count: Object.values(data.milestones).flat().filter((m: any) => m.significance === 'CRITICAL').length, colorClass: SIGNIFICANCE_COLORS.CRITICAL },
                  { label: "HIGH",     count: Object.values(data.milestones).flat().filter((m: any) => m.significance === 'HIGH').length,     colorClass: SIGNIFICANCE_COLORS.HIGH },
                ]}
              />
              <CardContent className="p-0 divide-y">
                {Object.keys(data.milestones).length === 0 ? (
                  <p className="text-sm text-muted-foreground italic text-center py-10">No milestones detected.</p>
                ) : (
                  Object.entries(data.milestones).map(([orgId, ms]) => {
                    const org = data.timelines.find((t) => t.organizationId === orgId)?.org;
                    return (
                      <div key={orgId} className="px-8 py-4 hover:bg-muted/10 transition-colors">
                        <p className="text-sm font-bold text-primary mb-2">{org?.name ?? orgId}</p>
                        {(ms as MilestoneRow[]).length === 0 ? (
                          <p className="text-[11px] text-muted-foreground italic">No milestones detected in this window.</p>
                        ) : (
                          <div className="space-y-2">
                            {(ms as MilestoneRow[]).map((m, i) => (
                              <div key={i} className="flex items-start gap-3">
                                <Chip label={m.significance} colorClass={SIGNIFICANCE_COLORS[m.significance] ?? ""} />
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs font-bold text-primary font-mono">{m.milestoneType}</span>
                                    <span className="text-[10px] text-muted-foreground">{new Date(m.achievedAt).toLocaleDateString()}</span>
                                    <span className="text-[10px] text-muted-foreground">persistence: {m.persistenceScore}/100</span>
                                  </div>
                                  <p className="text-[11px] text-muted-foreground mt-0.5">{m.explanation}</p>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </CardContent>
            </Card>

            {/* ── Panel 3: Intervention Lineage ── */}
            <Card className="border-none shadow-sm bg-white">
              <SectionHeader icon={GitBranch} title="Intervention Lineage"
                description="Operational intervention chains — assertion events → recommendations → scan outcomes. causalityStrength classifies reliability."
                chips={[
                  { label: "successful",  count: data.lineages.reduce((s, l) => s + l.successfulCount, 0), colorClass: OUTCOME_COLORS.SUCCESSFUL },
                  { label: "partial",     count: data.lineages.reduce((s, l) => s + l.partialCount,    0), colorClass: OUTCOME_COLORS.PARTIAL },
                  { label: "failed",      count: data.lineages.reduce((s, l) => s + l.failedCount,     0), colorClass: OUTCOME_COLORS.FAILED },
                  { label: "unknown",     count: data.lineages.reduce((s, l) => s + l.unknownCount,    0), colorClass: OUTCOME_COLORS.UNKNOWN },
                ].filter((c) => c.count > 0)}
              />
              <CardContent className="p-0 divide-y">
                {data.lineages.length === 0 ? (
                  <p className="text-sm text-muted-foreground italic text-center py-10">No intervention chains detected.</p>
                ) : (
                  data.lineages.map((rep) => (
                    <div key={rep.organizationId} className="px-8 py-4 hover:bg-muted/10 transition-colors">
                      <p className="text-sm font-bold text-primary mb-2">{rep.org?.name ?? rep.organizationId}</p>
                      {rep.lineages.length === 0 ? (
                        <p className="text-[11px] text-muted-foreground italic">No intervention chains in this window.</p>
                      ) : (
                        <div className="space-y-2">
                          {rep.lineages.slice(0, 5).map((l, i) => (
                            <div key={i} className="flex items-start gap-2">
                              <Chip label={l.outcome} colorClass={OUTCOME_COLORS[l.outcome] ?? ""} />
                              <Chip label={l.causalityStrength} colorClass="bg-muted text-muted-foreground border-muted" />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                                  <span>from <strong className="text-primary">{l.triggeredBy}</strong></span>
                                  <span>·</span>
                                  <span>{new Date(l.startedAt).toLocaleDateString()}</span>
                                  {l.scoreDelta !== undefined && (
                                    <>
                                      <span>·</span>
                                      <span className={l.scoreDelta > 0 ? "text-green-700 font-bold" : l.scoreDelta < 0 ? "text-red-700 font-bold" : ""}>
                                        {l.scoreDelta > 0 ? "+" : ""}{l.scoreDelta?.toFixed(1)} score
                                      </span>
                                    </>
                                  )}
                                </div>
                                {l.downstreamEffects.length > 0 && (
                                  <p className="text-[10px] text-muted-foreground mt-0.5">{l.downstreamEffects[0]}</p>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      {/* Unresolved patterns from memory */}
                      {(() => {
                        const mem = data.memories.find((m) => m.organizationId === rep.organizationId);
                        return mem?.unresolvedPatterns && mem.unresolvedPatterns.length > 0 ? (
                          <div className="mt-3 pt-2 border-t border-muted/30">
                            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Unresolved patterns</p>
                            {mem.unresolvedPatterns.slice(0, 3).map((p, i) => (
                              <div key={i} className="flex items-center gap-2 text-[11px] text-orange-700 mt-0.5">
                                <span className="font-mono font-bold">{p.eventType}</span>
                                <span>×{p.occurrenceCount}</span>
                                <Chip label={p.debtCategory} colorClass="bg-orange-50 text-orange-700 border-orange-200" />
                              </div>
                            ))}
                          </div>
                        ) : null;
                      })()}
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            {/* ── Panel 4: Continuity Replay ── */}
            <Card className="border-none shadow-sm bg-white">
              <SectionHeader icon={RotateCcw} title="Continuity Replay"
                description="Proxy continuity score at regular intervals — reconstructed from raw historical data. isInferred = sparse-data estimate."
                chips={Object.entries(data.summary.byVolatility).map(([v, count]) => ({
                  label: `${v} volatility`,
                  count,
                  colorClass: v === 'HIGH' ? "bg-red-50 text-red-700 border-red-200" :
                               v === 'MODERATE' ? "bg-yellow-50 text-yellow-700 border-yellow-200" :
                               "bg-green-50 text-green-700 border-green-200",
                }))}
              />
              <CardContent className="p-0 divide-y">
                {data.replays.length === 0 ? (
                  <p className="text-sm text-muted-foreground italic text-center py-10">No replay data.</p>
                ) : (
                  data.replays.map((rep) => (
                    <div key={rep.organizationId} className="px-8 py-4 hover:bg-muted/10 transition-colors">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-primary">{rep.org?.name ?? rep.organizationId}</span>
                          <Chip label={`${rep.historicalVolatility} volatility`}
                            colorClass={rep.historicalVolatility === 'HIGH' ? "bg-red-50 text-red-700 border-red-200" :
                              rep.historicalVolatility === 'MODERATE' ? "bg-yellow-50 text-yellow-700 border-yellow-200" :
                              "bg-green-50 text-green-700 border-green-200"} />
                        </div>
                        <span className="text-[10px] text-muted-foreground">
                          {rep.integrityChecks.incompleteSnapshots} incomplete · {rep.integrityChecks.inferredTransitions} inferred
                        </span>
                      </div>
                      {/* Compact snapshot table */}
                      <div className="overflow-x-auto">
                        <div className="flex gap-1 min-w-max">
                          {rep.snapshots.map((s, i) => (
                            <div key={i}
                              className={cn("flex flex-col items-center px-1.5 py-1 rounded text-center min-w-[52px]",
                                s.isInferred ? "opacity-50" : "",
                                STATE_COLORS[s.state] ?? "bg-muted border-muted")}
                              title={`${new Date(s.snapshotAt).toLocaleDateString()} — ${s.state} (${s.proxyScore})`}>
                              <span className="text-[9px] font-black">{s.proxyScore}</span>
                              <span className="text-[8px] uppercase tracking-wide leading-tight">{s.state.slice(0, 4)}</span>
                              <span className="text-[8px] opacity-70">{new Date(s.snapshotAt).toLocaleDateString('en', { month: 'numeric', day: 'numeric' })}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                      {rep.transitions.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {rep.transitions.map((t, i) => (
                            <span key={i} className="text-[10px] bg-muted/40 border border-muted rounded px-1.5 py-0.5 text-muted-foreground">
                              {t.from} → {t.to} ({new Date(t.changedAt).toLocaleDateString()})
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            {/* ── Panel 5: Organizational Narratives ── */}
            <Card className="border-none shadow-sm bg-white">
              <SectionHeader icon={FileText} title="Organizational Narratives"
                description="Deterministic operational summaries derived from timeline, memory, replay, and lineage. No AI. Template-based synthesis."
                chips={Object.entries(data.summary.byTrend).map(([t, count]) => ({
                  label: t, count, colorClass: TREND_COLORS[t] ?? "",
                }))}
              />
              <CardContent className="p-0 divide-y">
                {data.narratives.length === 0 ? (
                  <p className="text-sm text-muted-foreground italic text-center py-10">No narratives generated.</p>
                ) : (
                  data.narratives.map((n) => (
                    <div key={n.organizationId} className="px-8 py-5 hover:bg-muted/10 transition-colors">
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-primary">{n.org?.name ?? n.organizationId}</span>
                          <Chip label={n.continuityTrend} colorClass={TREND_COLORS[n.continuityTrend] ?? ""} />
                          <Chip label={n.memoryDensity}   colorClass="bg-muted text-muted-foreground border-muted" />
                        </div>
                        <span className="text-[10px] text-muted-foreground">conf: {n.confidence}</span>
                      </div>
                      <p className="text-xs text-muted-foreground mb-3 leading-relaxed">{n.operationalStateSummary}</p>
                      {n.dominantRiskFactors.length > 0 && (
                        <div className="mb-2">
                          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Risk factors</p>
                          <ul className="space-y-0.5">
                            {n.dominantRiskFactors.map((r, i) => (
                              <li key={i} className="text-[11px] text-orange-700 flex items-start gap-1">
                                <span className="mt-0.5">·</span>{r}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {n.strongestRecoverySignals.length > 0 && (
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Recovery signals</p>
                          <ul className="space-y-0.5">
                            {n.strongestRecoverySignals.map((r, i) => (
                              <li key={i} className="text-[11px] text-green-700 flex items-start gap-1">
                                <span className="mt-0.5">·</span>{r}
                              </li>
                            ))}
                          </ul>
                        </div>
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
