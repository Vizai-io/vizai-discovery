"use client";

/**
 * /admin/health-center — Unified Admin Health Center (Sprint 13 Task 3).
 *
 * Primary admin entry point. Three-zone layout:
 *   Zone 1: Platform Status Bar — overall state, counts, alert summary
 *   Zone 2: Attention Queue     — prioritized orgs needing review
 *   Zone 3: Platform Trend      — continuity state history chart
 *
 * Reads from persisted snapshots (Sprint 10) — fast, no pipeline re-run.
 * Shows a "no snapshots yet" state when the cron hasn't run.
 */

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  AlertCircle,
  CheckCircle2,
  ChevronLeft,
  ChevronDown,
  ChevronUp,
  Loader2,
  RefreshCcw,
  Clock,
  AlertTriangle,
  Activity,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

// ── Types ─────────────────────────────────────────────────────────────────────

type WindowDays = 30 | 90 | 365;
type UrgencyLevel = 'IMMEDIATE' | 'ELEVATED' | 'MONITOR' | 'HEALTHY';

interface OrgAttentionItem {
  organizationId:     string;
  org:                { name: string; slug: string; tier: string };
  priorityScore:      number;
  urgencyLevel:       UrgencyLevel;
  primaryReason:      string;
  keySignals:         string[];
  archetype:          string;
  continuityState:    string;
  riskLevel:          string;
  resilienceScore:    number;
  interventionWindow: string;
  lastSnapshotAt?:    string;
  recentAlerts:       { type: string; severity: string; title: string; createdAt: string; isRead: boolean }[];
}

interface PlatformTrend {
  date:               string;
  stableCount:        number;
  watchingCount:      number;
  fragmentedCount:    number;
  criticalCount:      number;
  optimizingCount:    number;
  avgResilienceScore: number;
}

interface HealthCenterData {
  hasSnapshots:       boolean;
  attentionItems:     OrgAttentionItem[];
  platformTrend:      PlatformTrend[];
  archetypeBreakdown: Record<string, number>;
  alertSummary:       { total: number; critical: number; warning: number; unread: number };
  orgsWithImmediate:  number;
  orgsAtRisk:         number;
  orgsHealthy:        number;
  generatedAt:        string;
  // Sprint 15 — staleness
  staleSnapshotCount: number;
  oldestSnapshotAt:   string | null;
  staleOrgs:          { orgId: string; name: string; snapshotAt: string }[];
}

interface PipelineRun {
  id:                 string;
  traceId:            string;
  ranAt:              string;
  severity:           string;
  message:            string;
  orgsProcessed:      number | null;
  persisted:          number | null;
  skipped:            number | null;
  alertsFired:        number | null;
  alertsDeduplicated: number | null;
  durationMs:         number | null;
}

interface PipelineData {
  lastRunAt:    string | null;
  runsThisWeek: number;
  runs:         PipelineRun[];
}

// ── Badge helpers ─────────────────────────────────────────────────────────────

function urgencyBadge(level: UrgencyLevel) {
  const map: Record<UrgencyLevel, string> = {
    IMMEDIATE: 'bg-red-50 text-red-700 border-red-200',
    ELEVATED:  'bg-orange-50 text-orange-700 border-orange-200',
    MONITOR:   'bg-amber-50 text-amber-700 border-amber-200',
    HEALTHY:   'bg-emerald-50 text-emerald-700 border-emerald-200',
  };
  return <Badge variant="outline" className={`text-xs font-medium ${map[level]}`}>{level}</Badge>;
}

function stateBadge(state: string) {
  const map: Record<string, string> = {
    OPTIMIZING: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    STABLE:     'bg-blue-50 text-blue-700 border-blue-200',
    WATCHING:   'bg-amber-50 text-amber-700 border-amber-200',
    FRAGMENTED: 'bg-orange-50 text-orange-700 border-orange-200',
    CRITICAL:   'bg-red-50 text-red-700 border-red-200',
  };
  return <Badge variant="outline" className={`text-xs ${map[state] ?? ''}`}>{state}</Badge>;
}

function riskBadge(level: string) {
  const map: Record<string, string> = {
    LOW:      'bg-emerald-50 text-emerald-700 border-emerald-200',
    MEDIUM:   'bg-amber-50 text-amber-700 border-amber-200',
    HIGH:     'bg-orange-50 text-orange-700 border-orange-200',
    CRITICAL: 'bg-red-50 text-red-700 border-red-200',
  };
  return <Badge variant="outline" className={`text-xs ${map[level] ?? ''}`}>{level}</Badge>;
}

function severityDot(severity: string) {
  const map: Record<string, string> = {
    CRITICAL: 'bg-red-500',
    WARNING:  'bg-amber-400',
    INFO:     'bg-blue-400',
    SUCCESS:  'bg-emerald-400',
  };
  return <span className={`inline-block w-2 h-2 rounded-full ${map[severity] ?? 'bg-slate-300'}`} />;
}

// ── Attention Item Row ────────────────────────────────────────────────────────

function AttentionItem({ item }: { item: OrgAttentionItem }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border-b border-border/30 last:border-0">
      <div
        className="flex items-center justify-between gap-2 py-3 px-1 cursor-pointer hover:bg-slate-50/50 rounded"
        onClick={() => setExpanded((e) => !e)}
      >
        {/* Left: urgency + org name */}
        <div className="flex items-center gap-3 min-w-0">
          {urgencyBadge(item.urgencyLevel)}
          <div className="min-w-0">
            <span className="font-medium text-sm text-foreground truncate block">{item.org.name}</span>
            <span className="text-xs text-muted-foreground">{item.primaryReason}</span>
          </div>
        </div>
        {/* Right: state + risk + expand */}
        <div className="flex items-center gap-2 shrink-0">
          {stateBadge(item.continuityState)}
          {riskBadge(item.riskLevel)}
          <span className="text-xs text-muted-foreground">{item.org.tier}</span>
          {expanded
            ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" />
            : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />}
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="pb-4 px-1 space-y-3">
          {/* Key signals */}
          {item.keySignals.length > 0 && (
            <div>
              <p className="text-xs text-muted-foreground font-medium mb-1">Signals</p>
              <ul className="space-y-0.5">
                {item.keySignals.map((s, i) => (
                  <li key={i} className="text-xs text-muted-foreground">· {s}</li>
                ))}
              </ul>
            </div>
          )}
          {/* Archetype + resilience */}
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span>Archetype: <span className="font-medium text-foreground">{item.archetype.replace(/_/g, ' ')}</span></span>
            <span>Resilience: <span className="font-medium text-foreground">{item.resilienceScore}/100</span></span>
            <span>Window: <span className="font-medium text-foreground">{item.interventionWindow.replace(/_/g, ' ')}</span></span>
          </div>
          {/* Recent alerts */}
          {item.recentAlerts.length > 0 && (
            <div>
              <p className="text-xs text-muted-foreground font-medium mb-1">Recent alerts</p>
              <ul className="space-y-1">
                {item.recentAlerts.map((a, i) => (
                  <li key={i} className="flex items-start gap-2">
                    {severityDot(a.severity)}
                    <span className="text-xs text-foreground">{a.title}</span>
                    {!a.isRead && (
                      <span className="text-xs text-amber-600 ml-auto shrink-0">unread</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {/* Last snapshot + detail link */}
          <div className="flex items-center justify-between">
            {item.lastSnapshotAt && (
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Clock className="w-3 h-3" />
                Last snapshot: {new Date(item.lastSnapshotAt).toLocaleString()}
              </p>
            )}
            <Link href={`/admin/org/${item.organizationId}`} className="ml-auto">
              <Button variant="outline" size="sm" className="h-7 text-xs gap-1 border-primary/20 text-primary hover:bg-primary/5">
                View Detail →
              </Button>
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function HealthCenterPage() {
  const [data, setData]             = useState<HealthCenterData | null>(null);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);
  const [window, setWindow]         = useState<WindowDays>(90);
  const [filter, setFilter]         = useState<UrgencyLevel | 'ALL'>('ALL');
  const [pipeline, setPipeline]     = useState<PipelineData | null>(null);
  const [pipelineOpen, setPipelineOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [hcRes, plRes] = await Promise.all([
        fetch(`/api/admin/health-center?window=${window}`),
        fetch('/api/admin/pipeline-health?limit=10'),
      ]);
      const hcJson = await hcRes.json();
      if (!hcRes.ok) throw new Error(hcJson.error ?? 'Load failed');
      setData(hcJson);
      if (plRes.ok) setPipeline(await plRes.json());
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [window]);

  useEffect(() => { load(); }, [load]);

  const filteredItems = data?.attentionItems.filter(
    (i) => filter === 'ALL' || i.urgencyLevel === filter,
  ) ?? [];

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
            <h1 className="text-lg font-semibold text-foreground">Admin Health Center</h1>
            <p className="text-xs text-muted-foreground">
              Prioritized view across all organizations — powered by persisted intelligence snapshots.
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

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-16 gap-2 text-muted-foreground text-sm">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading health center…
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {!loading && !error && data && (
        <>
          {/* Staleness warning — Sprint 15 */}
          {data.staleSnapshotCount > 0 && (
            <div className="flex items-start gap-3 rounded border border-amber-200 bg-amber-50 px-4 py-3">
              <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-amber-800">
                  {data.staleSnapshotCount} org{data.staleSnapshotCount !== 1 ? 's' : ''} with stale snapshots (&gt;25h)
                </p>
                <p className="text-xs text-amber-700 mt-0.5">
                  {data.staleOrgs.slice(0, 5).map((o) => o.name).join(', ')}
                  {data.staleOrgs.length > 5 && ` +${data.staleOrgs.length - 5} more`}
                  {' '}— run the intelligence snapshot cron to refresh.
                </p>
              </div>
            </div>
          )}

          {/* No snapshots yet */}
          {!data.hasSnapshots && (
            <Card className="border-border/50">
              <CardContent className="pt-6 pb-6 text-center">
                <AlertCircle className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
                <p className="text-sm font-medium text-foreground mb-1">No intelligence snapshots yet</p>
                <p className="text-xs text-muted-foreground max-w-md mx-auto">
                  The health center reads from persisted snapshots. Run{' '}
                  <code className="bg-slate-100 px-1 rounded">POST /api/cron/intelligence-snapshot</code>{' '}
                  to generate the first snapshot.
                </p>
              </CardContent>
            </Card>
          )}

          {/* ── Zone 1: Platform Status Strip ─────────────────────────────── */}
          <div className="grid grid-cols-4 gap-3">
            {[
              { label: 'Immediate Action',  value: data.orgsWithImmediate, color: 'text-red-600' },
              { label: 'Elevated Risk',     value: data.orgsAtRisk,        color: 'text-orange-600' },
              { label: 'Healthy',           value: data.orgsHealthy,       color: 'text-emerald-600' },
              { label: 'Unread Alerts',     value: data.alertSummary.unread, color: 'text-amber-600' },
            ].map((s) => (
              <Card key={s.label} className="border-border/50">
                <CardContent className="pt-4 pb-3">
                  <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{s.label}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Alert summary */}
          {data.alertSummary.total > 0 && (
            <div className="flex items-center gap-3 text-xs text-muted-foreground px-1">
              <span>Last 7 days:</span>
              {data.alertSummary.critical > 0 && (
                <span className="text-red-600 font-medium">{data.alertSummary.critical} critical</span>
              )}
              {data.alertSummary.warning > 0 && (
                <span className="text-amber-600 font-medium">{data.alertSummary.warning} warning</span>
              )}
              {data.alertSummary.unread > 0 && (
                <span className="text-foreground font-medium">{data.alertSummary.unread} unread</span>
              )}
              <Link href="/admin/alerts" className="ml-auto">
                <Button variant="outline" size="sm" className="h-6 text-xs border-primary/20 text-primary gap-1">
                  Manage Alerts →
                </Button>
              </Link>
            </div>
          )}

          {/* ── Zone 2: Attention Queue ────────────────────────────────────── */}
          <Card className="border-border/50">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-sm font-medium">Organization Attention Queue</CardTitle>
                  <CardDescription className="text-xs">
                    Ranked by operational urgency. Click any row to expand.
                  </CardDescription>
                </div>
                {/* Filter */}
                <div className="flex items-center gap-1.5">
                  {(['ALL', 'IMMEDIATE', 'ELEVATED', 'MONITOR', 'HEALTHY'] as const).map((f) => (
                    <Button
                      key={f}
                      size="sm"
                      variant={filter === f ? 'default' : 'outline'}
                      className="text-xs h-6 px-2"
                      onClick={() => setFilter(f)}
                    >
                      {f === 'ALL' ? 'All' : f.charAt(0) + f.slice(1).toLowerCase()}
                    </Button>
                  ))}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {filteredItems.length === 0 ? (
                <div className="flex items-center gap-2 py-6 justify-center text-muted-foreground">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                  <p className="text-sm">
                    {filter === 'ALL'
                      ? 'All organizations are operating within normal parameters.'
                      : `No organizations at ${filter.toLowerCase()} urgency level.`}
                  </p>
                </div>
              ) : (
                <div>
                  {filteredItems.map((item) => (
                    <AttentionItem key={item.organizationId} item={item} />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* ── Zone 3: Platform Trend ─────────────────────────────────────── */}
          {data.platformTrend.length > 0 && (
            <Card className="border-border/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Platform Continuity Trend</CardTitle>
                <CardDescription className="text-xs">
                  Continuity state distribution across all organizations over snapshot history.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {data.platformTrend.slice(-10).map((t) => {
                    const total = t.stableCount + t.watchingCount + t.fragmentedCount + t.criticalCount + t.optimizingCount;
                    return (
                      <div key={t.date} className="flex items-center gap-3">
                        <span className="text-xs text-muted-foreground w-20 shrink-0">
                          {new Date(t.date).toLocaleDateString('en', { month: 'short', day: 'numeric' })}
                        </span>
                        <div className="flex-1 flex h-4 rounded overflow-hidden gap-px">
                          {total > 0 && <>
                            {t.optimizingCount > 0 && <div className="bg-emerald-400" style={{ width: `${(t.optimizingCount / total) * 100}%` }} title={`${t.optimizingCount} optimizing`} />}
                            {t.stableCount > 0    && <div className="bg-blue-400"    style={{ width: `${(t.stableCount    / total) * 100}%` }} title={`${t.stableCount} stable`} />}
                            {t.watchingCount > 0  && <div className="bg-amber-400"  style={{ width: `${(t.watchingCount  / total) * 100}%` }} title={`${t.watchingCount} watching`} />}
                            {t.fragmentedCount > 0 && <div className="bg-orange-400" style={{ width: `${(t.fragmentedCount / total) * 100}%` }} title={`${t.fragmentedCount} fragmented`} />}
                            {t.criticalCount > 0  && <div className="bg-red-400"    style={{ width: `${(t.criticalCount  / total) * 100}%` }} title={`${t.criticalCount} critical`} />}
                          </>}
                        </div>
                        <span className="text-xs text-muted-foreground w-16 text-right shrink-0">
                          avg {t.avgResilienceScore}/100
                        </span>
                      </div>
                    );
                  })}
                  {/* Legend */}
                  <div className="flex items-center gap-3 pt-1">
                    {[
                      { color: 'bg-emerald-400', label: 'Optimizing' },
                      { color: 'bg-blue-400',    label: 'Stable' },
                      { color: 'bg-amber-400',   label: 'Watching' },
                      { color: 'bg-orange-400',  label: 'Fragmented' },
                      { color: 'bg-red-400',     label: 'Critical' },
                    ].map((l) => (
                      <div key={l.label} className="flex items-center gap-1">
                        <span className={`w-2.5 h-2.5 rounded-sm ${l.color}`} />
                        <span className="text-xs text-muted-foreground">{l.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Archetype breakdown */}
          {Object.keys(data.archetypeBreakdown).length > 0 && (
            <Card className="border-border/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Archetype Distribution</CardTitle>
                <CardDescription className="text-xs">
                  Current operational profile classification across all organizations.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(data.archetypeBreakdown)
                    .sort((a, b) => b[1] - a[1])
                    .map(([archetype, count]) => (
                      <Badge key={archetype} variant="outline" className="text-xs border-slate-200 text-slate-600">
                        {archetype.replace(/_/g, ' ')} × {count}
                      </Badge>
                    ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* ── Zone 4: Pipeline Health — Sprint 15 ───────────────────────── */}
          <Card className="border-border/50">
            <CardHeader className="pb-0">
              <button
                className="flex items-center justify-between w-full text-left"
                onClick={() => setPipelineOpen((o) => !o)}
              >
                <div>
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Activity className="w-4 h-4 text-primary/60" />
                    Pipeline Health
                  </CardTitle>
                  <CardDescription className="text-xs mt-0.5">
                    {pipeline
                      ? `${pipeline.runsThisWeek} run${pipeline.runsThisWeek !== 1 ? 's' : ''} this week · last run ${pipeline.lastRunAt ? new Date(pipeline.lastRunAt).toLocaleString() : 'never'}`
                      : 'Intelligence snapshot cron execution history'}
                  </CardDescription>
                </div>
                {pipelineOpen
                  ? <ChevronUp className="w-4 h-4 text-muted-foreground" />
                  : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
              </button>
            </CardHeader>

            {pipelineOpen && (
              <CardContent className="pt-4">
                {!pipeline || pipeline.runs.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">
                    No cron runs recorded yet. The first run will appear here after{' '}
                    <code className="bg-slate-100 px-1 rounded text-xs">POST /api/cron/intelligence-snapshot</code>.
                  </p>
                ) : (
                  <div className="space-y-0 divide-y divide-border/30">
                    {/* Column headers */}
                    <div className="grid grid-cols-5 gap-2 pb-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      <span>Ran At</span>
                      <span className="text-center">Persisted</span>
                      <span className="text-center">Alerts</span>
                      <span className="text-center">Duration</span>
                      <span className="text-right">Status</span>
                    </div>
                    {pipeline.runs.map((run) => (
                      <div key={run.id} className="grid grid-cols-5 gap-2 py-2.5 text-xs items-center">
                        <span className="text-muted-foreground">
                          {new Date(run.ranAt).toLocaleString(undefined, {
                            month: 'short', day: 'numeric',
                            hour: 'numeric', minute: '2-digit',
                          })}
                        </span>
                        <span className="text-center font-medium text-foreground">
                          {run.persisted != null ? `${run.persisted}/${(run.persisted ?? 0) + (run.skipped ?? 0)}` : '—'}
                        </span>
                        <span className="text-center text-foreground">
                          {run.alertsFired != null ? run.alertsFired : '—'}
                          {run.alertsDeduplicated != null && run.alertsDeduplicated > 0 && (
                            <span className="text-muted-foreground ml-1">({run.alertsDeduplicated} dedup)</span>
                          )}
                        </span>
                        <span className="text-center text-muted-foreground">
                          {run.durationMs != null ? `${(run.durationMs / 1000).toFixed(1)}s` : '—'}
                        </span>
                        <span className="text-right">
                          <Badge variant="outline" className={`text-[10px] font-bold ${
                            run.severity === 'INFO'     ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                            run.severity === 'WARNING'  ? 'bg-amber-50 text-amber-700 border-amber-200' :
                            'bg-red-50 text-red-700 border-red-200'
                          }`}>
                            {run.severity.toLowerCase()}
                          </Badge>
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            )}
          </Card>

          <p className="text-xs text-muted-foreground text-center pb-4">
            Updated {new Date(data.generatedAt).toLocaleString()} · reads from persisted snapshots
          </p>
        </>
      )}
    </div>
  );
}
