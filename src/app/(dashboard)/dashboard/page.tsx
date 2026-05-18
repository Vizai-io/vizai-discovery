"use client";

/**
 * @fileOverview /dashboard — Adaptive operational intelligence command center.
 *
 * Phase 2.0: Maturity-aware adaptive composition.
 *
 * Layout zones (fixed order — never reordered between maturity states):
 *   Zone 1: Header
 *   Zone 2: MaturityBanner   — hidden in MATURE; prominent in SETUP
 *   Zone 3: Running scan     — conditional on scan status
 *   Zone 4: PrimaryActionCard — always present
 *   Zone 5: WorkflowContinuity — hidden in SETUP
 *   Zone 6: Score cards       — hidden in SETUP (no meaningful data)
 *   Zone 7: Chart + sidebar   — hidden in SETUP
 *   Zone 8: Next Best Actions — hidden in SETUP
 *   Zone 9: Recent Audits     — hidden in SETUP; auto-expanded in MATURE
 *
 * Data:
 *  - GET /api/operational-state   (maturity, primary action, continuity, counts)
 *  - GET /api/perception-scans    (scores, chart data, audit table, top recs)
 *
 * Density rules:
 *  - MAX 1 primary chart
 *  - MAX 5 top-level metrics
 *  - Single primary operational focus (PrimaryActionCard)
 *  - Progressive disclosure enforced by maturity
 */

import { useState, useEffect, useMemo } from "react";
import { useAuth } from "@/contexts/auth-context";
import {
  Search, ShieldCheck, Target, Brain, CheckCircle2,
  Zap, Activity, Calendar, Lightbulb, Loader2,
  AlertCircle, LineChart, TrendingDown,
  ArrowRight, ArrowUpRight, Clock, ChevronDown, ChevronUp,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScoreCard } from "@/components/dashboard/score-card";
import { PrimaryActionCard } from "@/components/dashboard/primary-action-card";
import { WorkflowContinuity, WorkflowContinuitySkeleton } from "@/components/dashboard/workflow-continuity";
import { MaturityBanner } from "@/components/dashboard/maturity-banner";
import { DriftSummaryCard } from "@/components/publishing/drift-summary-card";
import {
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, AreaChart, Area,
} from "recharts";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { computeScanDelta } from "@/lib/services/scan-delta.service";
import type { OperationalState } from "@/lib/services/operational-cohesion.service";

// ── Types ─────────────────────────────────────────────────────────────────────

type ScanItem = {
  id: string;
  status: string;
  businessName: string;
  createdAt: string;
  completedAt: string | null;
  currentStep: string | null;
  accuracyScore: number | null;
  coverageScore: number | null;
  entityUnderstandingScore: number | null;
  consistencyScore: number | null;
  consistencyLabel: string | null;
  perceptionSummary: string | null;
  topRecommendations: { id: string; title: string; category: string }[];
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function avgScore(s: ScanItem): number {
  const vals = [
    s.accuracyScore,
    s.coverageScore,
    s.entityUnderstandingScore,
    s.consistencyScore,
  ].filter((v): v is number => v != null);
  if (vals.length === 0) return 0;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function nextRunLabel(date: Date | string | null): string {
  if (!date) return "—";
  const d = new Date(date);
  const now = new Date();
  const diffMs = d.getTime() - now.getTime();
  if (diffMs < 0) return "Overdue";
  const days = Math.ceil(diffMs / 86400000);
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days <= 7) return `In ${days} days`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { userProfile } = useAuth();
  const [scans, setScans] = useState<ScanItem[]>([]);
  const [opState, setOpState] = useState<OperationalState | null>(null);
  const [loading, setLoading] = useState(true);
  const [auditsExpanded, setAuditsExpanded] = useState(false);
  const [intel, setIntel] = useState<any>(null);

  useEffect(() => {
    let mounted = true;
    Promise.all([
      fetch("/api/operational-state").then((r) => r.json()),
      fetch("/api/perception-scans?limit=20").then((r) => r.json()),
      fetch("/api/intelligence").then((r) => r.ok ? r.json() : null).catch(() => null),
    ])
      .then(([opData, scanData, intelData]) => {
        if (!mounted) return;
        const op = opData as OperationalState;
        setOpState(op);
        setScans(scanData.scans ?? []);
        if (intelData && !intelData.error) setIntel(intelData);
        // MATURE orgs care about trend history — expand audits by default
        if (op?.maturity === "MATURE") {
          setAuditsExpanded(true);
        }
      })
      .catch(() => {})
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, []);

  // Derived scan data
  const completedScans = useMemo(
    () => scans.filter((s) => s.status === "COMPLETE"),
    [scans],
  );
  const runningScans = useMemo(
    () => scans.filter((s) => s.status === "RUNNING"),
    [scans],
  );
  const latestScan = completedScans[0] ?? null;
  const previousScan = completedScans[1] ?? null;

  const delta = useMemo(
    () =>
      latestScan && previousScan
        ? computeScanDelta(latestScan, previousScan)
        : null,
    [latestScan, previousScan],
  );

  const overallLatest = latestScan ? avgScore(latestScan) : 0;
  const overallDelta = delta?.overallDelta ?? 0;

  const chartData = useMemo(
    () =>
      [...completedScans].reverse().map((s) => ({
        name: shortDate(s.createdAt),
        score: parseFloat(avgScore(s).toFixed(1)),
      })),
    [completedScans],
  );

  // Top 3 recommendations from latest scan (pre-ranked by the scan engine)
  const topActions = useMemo(
    () => (latestScan?.topRecommendations ?? []).slice(0, 3),
    [latestScan],
  );

  // Maturity-driven section visibility
  // SETUP hides sections that require data — avoids misleading empty states
  const maturity = opState?.maturity ?? "ACTIVE";
  const isSetup = maturity === "SETUP";

  // ── Loading state ──────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <Loader2 className="w-10 h-10 text-primary animate-spin" />
        <p className="text-muted-foreground text-sm font-medium">Loading intelligence…</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">

      {/* ── Zone 1: Header ── */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <h2 className="text-2xl font-bold text-primary">Intelligence Command Center</h2>
          <p className="text-muted-foreground text-sm">
            Strategic overview of your AI perception footprint.
          </p>
        </div>
        <div className="flex gap-2">
          {/* Monitoring — ADMIN only in ACTIVE+ (no schedule to view in SETUP) */}
          {!isSetup && (
            <Link href="/monitoring">
              <Button variant="outline" size="sm" className="gap-2">
                <Activity className="w-3.5 h-3.5" /> Monitoring
              </Button>
            </Link>
          )}
          {userProfile?.role === "admin" && (
            <Link href="/scans/new">
              <Button size="sm" className="gap-2">
                <Zap className="w-3.5 h-3.5" /> New Scan
              </Button>
            </Link>
          )}
        </div>
      </div>

      {/* ── Zone 2: MaturityBanner ── */}
      {/* Hides itself in MATURE; shrinks from prominent→compact→pill as maturity grows */}
      {opState && (
        <MaturityBanner
          maturity={opState.maturity}
          reason={opState.maturity_reason}
          next_milestone={opState.maturity_next_milestone}
        />
      )}

      {/* ── Zone 3: Running scan banner ── */}
      {runningScans.length > 0 && (
        <Card className="border-none bg-blue-50">
          <CardContent className="py-3 px-5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Loader2 className="w-4 h-4 text-blue-600 animate-spin" />
              <div>
                <div className="text-sm font-bold text-blue-800">
                  {runningScans.length} scan{runningScans.length > 1 ? "s" : ""} in progress
                </div>
                <div className="text-[10px] text-blue-600">
                  {runningScans[0]?.businessName} — {runningScans[0]?.currentStep ?? "Processing…"}
                </div>
              </div>
            </div>
            <Link href={`/scans/results/${runningScans[0]?.id}`}>
              <Button variant="outline" size="sm" className="text-[10px] font-bold border-blue-200 text-blue-700 hover:bg-blue-100">
                View Progress
              </Button>
            </Link>
          </CardContent>
        </Card>
      )}

      {/* ── Zone 4: Primary action card — always present ── */}
      {opState ? (
        <PrimaryActionCard action={opState.primary_action} />
      ) : (
        <PrimaryActionCard
          action={{
            type: "all_clear",
            urgency: "low",
            title: "Operations are in good shape",
            what_happened: "No critical issues detected.",
            why_it_matters: "Maintaining momentum keeps your AI visibility stable.",
            what_to_do: "Continue monitoring and run scans on schedule.",
            href: "/monitoring",
            cta_label: "View Monitoring",
          }}
        />
      )}

      {/* ── Zone 5: Workflow continuity — hidden in SETUP (no workflow data yet) ── */}
      {!isSetup && (
        opState
          ? <WorkflowContinuity items={opState.continuity_items} />
          : <WorkflowContinuitySkeleton />
      )}

      {/* ── Zone 5.5: Intelligence Summary Panel — hidden in SETUP + requires snapshot ── */}
      {!isSetup && intel && (
        <Card className="border-none shadow-sm bg-white">
          <CardContent className="py-4 px-6">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  <span className="text-xs font-bold text-primary uppercase tracking-wider">Operational Intelligence</span>
                  {intel.continuityState && (
                    <Badge variant="outline" className={cn("text-[10px] font-bold h-5 px-2",
                      intel.continuityState === 'Optimizing'               ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                      intel.continuityState === 'Needs Immediate Attention' ? 'bg-red-50 text-red-700 border-red-200' :
                      intel.continuityState === 'Needs Attention'           ? 'bg-orange-50 text-orange-700 border-orange-200' :
                      'bg-blue-50 text-blue-700 border-blue-200'
                    )}>
                      {intel.continuityState}
                    </Badge>
                  )}
                  {intel.operationalProfile && (
                    <span className="text-xs text-muted-foreground">{intel.operationalProfile}</span>
                  )}
                </div>
                <div className="flex items-center gap-5 flex-wrap">
                  {intel.resilienceScore != null && (
                    <div>
                      <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Resilience</span>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="text-lg font-black text-primary">{intel.resilienceScore}</span>
                        <span className="text-[10px] text-muted-foreground">/100</span>
                        <div className="w-16 h-1 bg-slate-100 rounded-full overflow-hidden ml-1">
                          <div className={cn("h-full rounded-full",
                            intel.resilienceScore >= 70 ? 'bg-emerald-400' :
                            intel.resilienceScore >= 45 ? 'bg-amber-400' : 'bg-orange-400'
                          )} style={{ width: `${intel.resilienceScore}%` }} />
                        </div>
                      </div>
                    </div>
                  )}
                  {intel.topRisk && (
                    <div>
                      <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Risk Signal</span>
                      <p className="text-xs font-medium text-orange-700 mt-0.5">{intel.topRisk}</p>
                    </div>
                  )}
                  {!intel.topRisk && (
                    <div className="flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                      <span className="text-xs text-muted-foreground">No active risk signals</span>
                    </div>
                  )}
                </div>
              </div>
              <Link href="/intelligence" className="shrink-0">
                <Button variant="outline" size="sm" className="text-xs h-7 gap-1 border-primary/20 text-primary">
                  Full report <ArrowRight className="w-3 h-3" />
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Zones 6–8: Data-dependent sections — hidden in SETUP ── */}
      {/* Revealing these in SETUP would show empty/zero states that mislead. */}
      {/* They unlock naturally when the org completes its first scan + schedule. */}
      {!isSetup && (
        <>
          {/* ── Zone 6: 5 Metric score cards ── */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <ScoreCard
              title="Overall"
              score={overallLatest}
              trend={delta ? parseFloat(overallDelta.toFixed(1)) : undefined}
              icon={Search}
              description="Avg. all signals"
              tooltip="Average of accuracy, coverage, entity understanding, and consistency."
            />
            <ScoreCard
              title="Accuracy"
              score={latestScan?.accuracyScore ?? 0}
              trend={delta ? parseFloat(delta.accuracyDelta.toFixed(1)) : undefined}
              icon={ShieldCheck}
              description="Factual alignment"
              tooltip="How accurately AI models describe your business vs. ground truth."
            />
            <ScoreCard
              title="Coverage"
              score={latestScan?.coverageScore ?? 0}
              trend={delta ? parseFloat(delta.coverageDelta.toFixed(1)) : undefined}
              icon={Target}
              description="Service indexing"
              tooltip="How completely AI models cover your services and offerings."
            />
            <ScoreCard
              title="Entity IQ"
              score={latestScan?.entityUnderstandingScore ?? 0}
              trend={delta ? parseFloat(delta.entityDelta.toFixed(1)) : undefined}
              icon={Brain}
              description="Business identity"
              tooltip="How well AI models understand your business type and differentiators."
            />
            <ScoreCard
              title="Consistency"
              score={latestScan?.consistencyScore ?? 0}
              trend={delta ? parseFloat(delta.consistencyDelta.toFixed(1)) : undefined}
              icon={CheckCircle2}
              description="Cross-model drift"
              tooltip="How consistent AI model responses are across different providers."
            />
          </div>

          {/* ── Zone 7: Trend chart + operational sidebar ── */}
          <div className="grid lg:grid-cols-3 gap-5">
            {/* Trend chart (the one chart) */}
            <Card className="lg:col-span-2 border-none shadow-sm bg-white">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <div>
                  <CardTitle className="text-base font-bold text-primary">Perception Score Trend</CardTitle>
                  <CardDescription className="text-[11px]">
                    Average score over time
                    {delta && (
                      <span className={cn("ml-2 font-bold", overallDelta >= 0 ? "text-green-600" : "text-red-500")}>
                        {overallDelta >= 0 ? "+" : ""}{overallDelta.toFixed(1)} since last scan
                      </span>
                    )}
                  </CardDescription>
                </div>
                <LineChart className="w-4 h-4 text-muted-foreground" />
              </CardHeader>
              <CardContent className="h-[220px] w-full pt-0">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData.length > 0 ? chartData : [{ name: "—", score: 0 }]}>
                    <defs>
                      <linearGradient id="colorScore" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#174C80" stopOpacity={0.1} />
                        <stop offset="95%" stopColor="#174C80" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                    <XAxis dataKey="name" stroke="#888" fontSize={11} tickLine={false} axisLine={false} />
                    <YAxis stroke="#888" fontSize={11} tickLine={false} axisLine={false} domain={[0, 100]} />
                    <Tooltip
                      contentStyle={{ borderRadius: "10px", border: "none", boxShadow: "0 4px 16px rgba(0,0,0,0.08)" }}
                      labelStyle={{ fontWeight: "bold", color: "#174C80" }}
                    />
                    <Area type="monotone" dataKey="score" stroke="#174C80" strokeWidth={2.5} fillOpacity={1} fill="url(#colorScore)" />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Operational sidebar */}
            <div className="space-y-4">
              {/* Monitoring status */}
              <Card className="border-none shadow-sm bg-white">
                <CardHeader className="pb-2 border-b">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-bold text-primary">Monitoring</CardTitle>
                    <Activity className="w-3.5 h-3.5 text-accent" />
                  </div>
                </CardHeader>
                <CardContent className="pt-3 space-y-2.5 text-sm">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Calendar className="w-3.5 h-3.5" />
                      Last scan
                    </div>
                    <span className="text-xs font-bold text-primary">
                      {latestScan ? shortDate(latestScan.createdAt) : "—"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Clock className="w-3.5 h-3.5" />
                      Next scan
                    </div>
                    <span className="text-xs font-bold text-primary">
                      {opState?.next_scheduled_run
                        ? nextRunLabel(opState.next_scheduled_run)
                        : "None scheduled"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Total audits
                    </div>
                    <span className="text-xs font-bold text-primary">
                      {opState?.completed_scan_count ?? completedScans.length}
                    </span>
                  </div>
                  <Link href="/monitoring" className="block">
                    <Button variant="ghost" size="sm" className="w-full text-[10px] font-bold uppercase h-7 text-primary hover:bg-primary/5">
                      Manage Schedules
                    </Button>
                  </Link>
                </CardContent>
              </Card>

              {/* Open actions */}
              <Card className="border-none shadow-sm bg-white">
                <CardHeader className="pb-2 border-b">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-bold text-primary">Open Actions</CardTitle>
                    <Lightbulb className="w-3.5 h-3.5 text-accent" />
                  </div>
                </CardHeader>
                <CardContent className="pt-3">
                  {(opState?.open_high_priority_count ?? 0) === 0 ? (
                    <p className="text-xs text-muted-foreground italic text-center py-3">
                      {latestScan ? "No high-priority items open." : "Run a scan to see recommendations."}
                    </p>
                  ) : (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-2xl font-black text-primary">
                          {opState!.open_high_priority_count}
                        </span>
                        <Badge variant="outline" className="text-[9px] bg-yellow-50 text-yellow-700 border-yellow-200 font-bold">
                          High Priority
                        </Badge>
                      </div>
                      <Link href="/recommendations?priority=HIGH" className="block">
                        <Button variant="outline" size="sm" className="w-full text-[10px] font-bold uppercase h-7 gap-1">
                          View All <ArrowRight className="w-3 h-3" />
                        </Button>
                      </Link>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>

          {/* ── Zone 8a: Drift Summary (contextual — MODERATE+ only) ── */}
          {opState && opState.drift_level && opState.drift_level !== "NONE" && opState.drift_level !== "LOW" && (
            <DriftSummaryCard
              level={opState.drift_level}
              signals={[]}
              summary={
                opState.drift_level === "CRITICAL"
                  ? "AI perception has critical drift from your canonical business truth."
                  : opState.drift_level === "HIGH"
                    ? "AI perception has significant drift from your canonical business truth."
                    : "AI perception is drifting from your canonical business truth."
              }
              recommended_action="Publish your canonical truth and run a new scan to measure improvement."
            />
          )}

          {/* ── Zone 8b: Next Best Actions (top 3 from latest scan) ── */}
          {topActions.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold text-primary uppercase tracking-widest">
                  Next Best Actions
                </h3>
                <Link href="/recommendations">
                  <Button variant="ghost" size="sm" className="text-[10px] gap-1 text-muted-foreground h-6">
                    See all <ArrowRight className="w-3 h-3" />
                  </Button>
                </Link>
              </div>
              <div className="grid sm:grid-cols-3 gap-3">
                {topActions.map((rec, i) => (
                  <Card key={rec.id ?? i} className="border shadow-sm bg-white hover:shadow-md transition-shadow">
                    <CardContent className="p-4 space-y-2">
                      <span className="text-[10px] text-muted-foreground truncate block">{rec.category}</span>
                      <p className="text-sm font-semibold text-primary leading-snug line-clamp-2">{rec.title}</p>
                      <Link href="/recommendations">
                        <Button variant="ghost" size="sm" className="w-full text-[10px] h-7 gap-1 text-accent hover:text-accent/90 font-bold p-0 justify-start">
                          View & action <ArrowRight className="w-3 h-3" />
                        </Button>
                      </Link>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* ── Zone 9: Recent Audits — hidden in SETUP; auto-expanded for MATURE ── */}
      {!isSetup && (
        <Card className="border-none shadow-sm bg-white">
          <CardHeader
            className="flex flex-row items-center justify-between pb-3 cursor-pointer select-none"
            onClick={() => setAuditsExpanded((v) => !v)}
          >
            <div>
              <CardTitle className="text-base font-bold text-primary">Recent Audits</CardTitle>
              <CardDescription className="text-[11px]">
                {auditsExpanded
                  ? "Latest intelligence runs"
                  : `${completedScans.length} scan${completedScans.length !== 1 ? "s" : ""} completed`}
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              {!auditsExpanded && (
                <Link
                  href="/scans"
                  className="text-[10px] text-muted-foreground hover:text-primary transition-colors"
                  onClick={(e) => e.stopPropagation()}
                >
                  All scans <ArrowRight className="w-3 h-3 inline" />
                </Link>
              )}
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground">
                {auditsExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </Button>
            </div>
          </CardHeader>

          {auditsExpanded && (
            <CardContent className="p-0">
              {scans.length === 0 ? (
                <div className="p-10 text-center space-y-3">
                  <AlertCircle className="w-10 h-10 text-muted-foreground/20 mx-auto" />
                  <p className="text-sm text-muted-foreground italic">
                    {userProfile?.role === "admin"
                      ? "No audits yet. Launch a scan to begin."
                      : "No audits available yet."}
                  </p>
                  {userProfile?.role === "admin" && (
                    <Link href="/scans/new">
                      <Button variant="outline" size="sm">Initiate First Audit</Button>
                    </Link>
                  )}
                </div>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-muted/50 text-muted-foreground font-bold uppercase text-[9px] tracking-widest">
                        <tr>
                          <th className="px-5 py-3">Date</th>
                          <th className="px-5 py-3">Business</th>
                          <th className="px-5 py-3 text-right">Score</th>
                          <th className="px-5 py-3 text-right">Δ</th>
                          <th className="px-5 py-3"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {scans.slice(0, 5).map((scan, i) => {
                          const avg = avgScore(scan);
                          const prev = completedScans[i + 1] ? avgScore(completedScans[i + 1]) : null;
                          const scanDelta = prev != null ? avg - prev : null;
                          return (
                            <tr key={scan.id} className="hover:bg-muted/30 transition-colors">
                              <td className="px-5 py-3 font-medium text-primary text-sm">
                                {shortDate(scan.createdAt)}
                              </td>
                              <td className="px-5 py-3 text-muted-foreground text-sm">{scan.businessName}</td>
                              <td className="px-5 py-3 text-right font-bold text-primary">
                                {scan.status === "COMPLETE" ? avg.toFixed(1) : (
                                  <Badge variant="outline" className="text-[9px] capitalize">{scan.status.toLowerCase()}</Badge>
                                )}
                              </td>
                              <td className="px-5 py-3 text-right text-xs font-bold">
                                {scanDelta != null ? (
                                  <span className={cn(scanDelta >= 0 ? "text-green-600" : "text-red-500")}>
                                    {scanDelta >= 0
                                      ? <ArrowUpRight className="w-3 h-3 inline" />
                                      : <TrendingDown className="w-3 h-3 inline" />}
                                    {Math.abs(scanDelta).toFixed(1)}
                                  </span>
                                ) : "—"}
                              </td>
                              <td className="px-5 py-3 text-right">
                                <Link href={`/scans/results/${scan.id}`}>
                                  <Button variant="ghost" size="sm" className="text-primary text-xs font-bold h-7">
                                    View
                                  </Button>
                                </Link>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <div className="px-5 py-3 border-t">
                    <Link href="/scans">
                      <Button variant="ghost" size="sm" className="text-[10px] gap-1 text-muted-foreground h-7">
                        All scans <ArrowRight className="w-3 h-3" />
                      </Button>
                    </Link>
                  </div>
                </>
              )}
            </CardContent>
          )}
        </Card>
      )}
    </div>
  );
}
