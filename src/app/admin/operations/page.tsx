"use client";

/**
 * @fileOverview /admin/operations — Operational State Dashboard.
 *
 * Sprint 5 Task 3: "Calm operational clarity" design.
 * Derives CALM / WATCHING / DEGRADED / CRITICAL state from last-hour event counts.
 * Shows recent alerts, event breakdown by type and severity, and meta-observability counters.
 *
 * Refinement 7: calmnessState drives the banner color and status indicator.
 * Refinement 4: metaCounters (writeFailures, throughput, dedupSkips, sampleSkips) shown inline.
 */

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ChevronLeft,
  RefreshCcw,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  Eye,
  Flame,
  Activity,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

type CalmnessState = "CALM" | "WATCHING" | "DEGRADED" | "CRITICAL";

interface OperationsData {
  traceId:       string;
  windowMinutes: number;
  calmnessState: CalmnessState;
  summary: {
    total:       number;
    bySeverity:  Record<string, number>;
    byEventType: Record<string, number>;
  };
  recentAlerts: {
    id:             string;
    eventType:      string;
    severity:       string;
    source:         string;
    message:        string;
    organizationId: string | null;
    entityType:     string | null;
    entityId:       string | null;
    traceId:        string;
    createdAt:      string;
  }[];
  recentEvents: {
    id:        string;
    eventType: string;
    severity:  string;
    source:    string;
    message:   string;
    createdAt: string;
  }[];
  metaCounters: {
    writeFailures: number;
    throughput:    number;
    dedupSkips:    number;
    sampleSkips:   number;
  };
}

// ── Calmness state config ─────────────────────────────────────────────────────

const CALMNESS_CONFIG: Record<CalmnessState, {
  label:       string;
  description: string;
  bannerClass: string;
  badgeClass:  string;
  Icon:        React.ElementType;
}> = {
  CALM: {
    label:       "CALM",
    description: "No errors or warnings in the last hour. Platform is operating normally.",
    bannerClass: "bg-green-50 border-green-200 text-green-800",
    badgeClass:  "bg-green-100 text-green-800 border-green-200",
    Icon:        CheckCircle2,
  },
  WATCHING: {
    label:       "WATCHING",
    description: "Warnings detected in the last hour. No errors or critical events.",
    bannerClass: "bg-yellow-50 border-yellow-200 text-yellow-800",
    badgeClass:  "bg-yellow-100 text-yellow-800 border-yellow-200",
    Icon:        Eye,
  },
  DEGRADED: {
    label:       "DEGRADED",
    description: "Errors detected in the last hour. Platform may be impaired — investigate alerts below.",
    bannerClass: "bg-orange-50 border-orange-200 text-orange-900",
    badgeClass:  "bg-orange-100 text-orange-900 border-orange-200",
    Icon:        AlertTriangle,
  },
  CRITICAL: {
    label:       "CRITICAL",
    description: "Critical events detected. Immediate investigation required.",
    bannerClass: "bg-red-50 border-red-200 text-red-900",
    badgeClass:  "bg-red-100 text-red-900 border-red-200",
    Icon:        Flame,
  },
};

// ── Severity colors ───────────────────────────────────────────────────────────

const SEVERITY_COLORS: Record<string, string> = {
  INFO:     "bg-blue-50 text-blue-700 border-blue-200",
  WARNING:  "bg-yellow-50 text-yellow-700 border-yellow-200",
  ERROR:    "bg-orange-50 text-orange-700 border-orange-200",
  CRITICAL: "bg-red-50 text-red-700 border-red-200",
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function OperationsDashboard() {
  const [data, setData]       = useState<OperationsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/operations");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setData(json);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load operational data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const calmConfig = data ? CALMNESS_CONFIG[data.calmnessState] : null;

  return (
    <div className="min-h-screen bg-background animate-in fade-in duration-500">
      {/* Header */}
      <header className="bg-white border-b px-6 py-4 flex items-center justify-between sticky top-0 z-50">
        <div className="flex items-center gap-4">
          <Link href="/admin">
            <Button variant="ghost" size="icon" className="rounded-full">
              <ChevronLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div className="flex items-center gap-2">
            <Activity className="w-6 h-6 text-primary" />
            <h1 className="text-xl font-headline font-bold text-primary">Operational State</h1>
          </div>
          {data && calmConfig && (
            <Badge
              variant="outline"
              className={cn("text-[10px] font-black uppercase tracking-widest h-6 gap-1.5 ml-2", calmConfig.badgeClass)}
            >
              <calmConfig.Icon className="w-3 h-3" />
              {calmConfig.label}
            </Badge>
          )}
        </div>
        <Button
          variant="outline"
          size="sm"
          className="gap-2 text-xs font-bold border-primary/20"
          onClick={fetchData}
          disabled={loading}
        >
          {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCcw className="w-3 h-3" />}
          Refresh
        </Button>
      </header>

      {/* Calmness Banner */}
      {data && calmConfig && (
        <div className={cn("border-b px-6 py-3 flex items-center gap-3", calmConfig.bannerClass)}>
          <calmConfig.Icon className="w-4 h-4 shrink-0" />
          <div>
            <span className="font-black text-sm uppercase tracking-wider mr-2">{calmConfig.label}</span>
            <span className="text-sm">{calmConfig.description}</span>
          </div>
          <span className="ml-auto text-xs opacity-60">
            Last {data.windowMinutes} min · {data.summary.total} events
          </span>
        </div>
      )}

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
            {/* Summary row */}
            <div className="grid md:grid-cols-4 gap-6">
              {(["CRITICAL", "ERROR", "WARNING", "INFO"] as const).map((sev) => (
                <Card key={sev} className="border-none shadow-sm bg-white">
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
                      {sev}
                    </CardTitle>
                    <Badge
                      variant="outline"
                      className={cn("text-[9px] font-black uppercase h-4 px-1.5", SEVERITY_COLORS[sev])}
                    >
                      {sev[0]}
                    </Badge>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-black text-primary">
                      {data.summary.bySeverity[sev] ?? 0}
                    </div>
                    <p className="text-[10px] text-muted-foreground font-bold mt-1">last hour</p>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Meta-observability counters (Refinement 4) */}
            <Card className="border-none shadow-sm bg-white">
              <CardHeader className="border-b bg-muted/10 py-4 px-8">
                <div className="flex items-center gap-2">
                  <Zap className="w-4 h-4 text-accent" />
                  <CardTitle className="text-base font-bold text-primary">Event Service Health</CardTitle>
                </div>
                <CardDescription className="text-xs text-muted-foreground">
                  In-memory counters since last server start · resets on deploy
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <div className="grid grid-cols-4 divide-x">
                  {([
                    { key: "throughput",    label: "Events Written",  description: "total Postgres writes" },
                    { key: "writeFailures", label: "Write Failures",  description: "emit() caught errors" },
                    { key: "dedupSkips",    label: "Dedup Skips",     description: "5-min window suppressed" },
                    { key: "sampleSkips",   label: "Sample Skips",    description: "dropped by sampleRate" },
                  ] as const).map(({ key, label, description }) => (
                    <div key={key} className="p-6">
                      <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">{label}</p>
                      <p className={cn(
                        "text-3xl font-black mt-1",
                        key === "writeFailures" && data.metaCounters.writeFailures > 0
                          ? "text-red-600"
                          : "text-primary",
                      )}>
                        {data.metaCounters[key]}
                      </p>
                      <p className="text-[10px] text-muted-foreground mt-1">{description}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Event breakdown by type */}
            <Card className="border-none shadow-sm bg-white">
              <CardHeader className="border-b bg-muted/10 py-4 px-8">
                <CardTitle className="text-base font-bold text-primary">Event Breakdown (last hour)</CardTitle>
                <CardDescription className="text-xs text-muted-foreground">
                  Count by event type — {data.summary.total} total events
                </CardDescription>
              </CardHeader>
              <CardContent className="p-6">
                {Object.keys(data.summary.byEventType).length === 0 ? (
                  <p className="text-sm text-muted-foreground italic text-center py-8">
                    No events in the last hour. Platform is quiet.
                  </p>
                ) : (
                  <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {Object.entries(data.summary.byEventType)
                      .sort(([, a], [, b]) => b - a)
                      .map(([eventType, count]) => (
                        <div
                          key={eventType}
                          className="flex items-center justify-between px-4 py-2.5 rounded-lg bg-muted/30 border border-muted"
                        >
                          <span className="text-xs font-bold text-primary font-mono">{eventType}</span>
                          <span className="text-sm font-black text-primary ml-4">{count}</span>
                        </div>
                      ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Recent alerts (errors + criticals) */}
            {data.recentAlerts.length > 0 && (
              <Card className="border-none shadow-sm bg-white">
                <CardHeader className="border-b bg-red-50/60 py-4 px-8">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-red-600" />
                    <CardTitle className="text-base font-bold text-primary">Recent Alerts</CardTitle>
                  </div>
                  <CardDescription className="text-xs text-muted-foreground">
                    ERROR and CRITICAL events from the last hour — {data.recentAlerts.length} total
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-0 divide-y">
                  {data.recentAlerts.map((alert) => (
                    <div key={alert.id} className="px-8 py-4 hover:bg-muted/20 transition-colors">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <Badge
                              variant="outline"
                              className={cn("text-[9px] font-black uppercase h-4 px-1.5", SEVERITY_COLORS[alert.severity])}
                            >
                              {alert.severity}
                            </Badge>
                            <span className="text-xs font-mono font-bold text-primary">{alert.eventType}</span>
                            <span className="text-[10px] text-muted-foreground">·</span>
                            <span className="text-[10px] text-muted-foreground font-mono">{alert.source}</span>
                          </div>
                          <p className="text-sm text-primary/80 truncate">{alert.message}</p>
                          {alert.entityId && (
                            <p className="text-[10px] text-muted-foreground mt-1 font-mono">
                              entity: {alert.entityType}/{alert.entityId}
                            </p>
                          )}
                        </div>
                        <span className="text-[10px] text-muted-foreground whitespace-nowrap shrink-0">
                          {new Date(alert.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {/* Recent event stream */}
            <Card className="border-none shadow-sm bg-white">
              <CardHeader className="border-b bg-muted/10 py-4 px-8">
                <CardTitle className="text-base font-bold text-primary">Event Stream</CardTitle>
                <CardDescription className="text-xs text-muted-foreground">
                  Last 50 events across all sources — newest first
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0 divide-y">
                {data.recentEvents.length === 0 ? (
                  <p className="text-sm text-muted-foreground italic text-center py-12">
                    No events recorded in the last hour.
                  </p>
                ) : (
                  data.recentEvents.map((event) => (
                    <div
                      key={event.id}
                      className="px-8 py-3 hover:bg-muted/20 transition-colors flex items-center gap-3"
                    >
                      <Badge
                        variant="outline"
                        className={cn("text-[9px] font-black uppercase h-4 px-1.5 shrink-0", SEVERITY_COLORS[event.severity])}
                      >
                        {event.severity[0]}
                      </Badge>
                      <span className="text-xs font-mono font-bold text-primary/70 shrink-0 w-52 truncate">
                        {event.eventType}
                      </span>
                      <span className="text-xs text-primary/80 flex-1 truncate">{event.message}</span>
                      <span className="text-[10px] text-muted-foreground font-mono shrink-0">
                        {new Date(event.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                      </span>
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
