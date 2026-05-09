"use client";

/**
 * @fileOverview History / Intelligence Timeline page.
 *
 * Previously read from Firestore — now reads from Postgres via GET /api/scan.
 * No Firebase imports. No onSnapshot. No getDocs.
 *
 * Data shape returned by GET /api/scan:
 * {
 *   scans: Array<{
 *     id, status, businessName, createdAt, completedAt,
 *     overallScore, accuracyScore, coverageScore,
 *     entityUnderstandingScore, consistencyScore
 *   }>
 * }
 */

import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  History,
  TrendingUp,
  TrendingDown,
  Loader2,
  LineChart,
  Activity,
  Filter,
  ChevronRight,
  AlertCircle,
} from "lucide-react";
import Link from "next/link";
import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
} from "recharts";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

type ScanSummary = {
  id: string;
  status: string;
  businessName: string | null;
  createdAt: string;
  completedAt: string | null;
  overallScore: number | null;
  accuracyScore: number | null;
  coverageScore: number | null;
  entityUnderstandingScore: number | null;
  consistencyScore: number | null;
};

// ── Page ──────────────────────────────────────────────────────────────────────

export default function HistoryPage() {
  const [scans, setScans] = useState<ScanSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchHistory() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/scan");
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setError(data.error ?? `Request failed (${res.status})`);
          return;
        }
        const data = await res.json();
        setScans(data.scans ?? []);
      } catch (err: any) {
        setError(err.message ?? "Failed to load scan history");
      } finally {
        setLoading(false);
      }
    }
    fetchHistory();
  }, []);

  // ── Derived data ────────────────────────────────────────────────────────────

  const chartData = useMemo(() => {
    return [...scans]
      .filter((s) => s.overallScore !== null)
      .reverse()
      .map((s) => ({
        name: new Date(s.createdAt).toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
        }),
        score: s.overallScore ?? 0,
      }));
  }, [scans]);

  const stats = useMemo(() => {
    const scored = scans.filter((s) => s.overallScore !== null);
    if (scored.length < 2) return null;
    const latest = scored[0].overallScore!;
    const previous = scored[1].overallScore!;
    const drift = latest - previous;
    const avg = scored.reduce((acc, s) => acc + (s.overallScore ?? 0), 0) / scored.length;
    return { latest, drift, avg, totalScans: scans.length };
  }, [scans]);

  // ── Loading state ───────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <Loader2 className="w-12 h-12 text-primary animate-spin" />
        <p className="text-muted-foreground font-medium uppercase tracking-[0.2em] text-[10px] font-bold">
          Aggregating Chronological Data...
        </p>
      </div>
    );
  }

  // ── Error state ──────────────────────────────────────────────────────────────

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center">
        <AlertCircle className="w-10 h-10 text-red-500" />
        <p className="text-sm text-muted-foreground max-w-sm">
          Could not load scan history. {error}
        </p>
        <Button variant="outline" onClick={() => window.location.reload()}>
          Retry
        </Button>
      </div>
    );
  }

  // ── Empty state ──────────────────────────────────────────────────────────────

  if (scans.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center">
        <History className="w-10 h-10 text-muted-foreground" />
        <div className="space-y-1">
          <p className="text-sm font-semibold text-foreground">No scan history yet</p>
          <p className="text-xs text-muted-foreground max-w-xs">
            Completed scans will appear here. Run your first scan to establish a baseline.
          </p>
        </div>
        <Link href="/scans">
          <Button>Go to Scans</Button>
        </Link>
      </div>
    );
  }

  // ── Main view ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-8 animate-in fade-in duration-500 max-w-7xl mx-auto pb-20">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="space-y-1">
          <h2 className="text-3xl font-bold text-primary flex items-center gap-3">
            <History className="w-8 h-8 text-accent" />
            Intelligence Timeline
          </h2>
          <p className="text-muted-foreground italic">
            Track visibility drift and historical discoverability performance across all audit
            cycles.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            className="gap-2 border-primary/10 h-10 font-bold text-[10px] uppercase tracking-widest rounded-full"
            disabled
          >
            <Filter className="w-3.5 h-3.5" /> Filter Date Range
          </Button>
        </div>
      </div>

      <div className="grid lg:grid-cols-12 gap-8">
        {/* Trend Visualization */}
        <Card className="lg:col-span-8 border-none shadow-sm overflow-hidden bg-white">
          <CardHeader className="flex flex-row items-center justify-between border-b bg-muted/10 py-4 px-8">
            <div className="space-y-1">
              <CardTitle className="text-sm font-bold text-primary flex items-center gap-2">
                <LineChart className="w-4 h-4 text-accent" />
                Visibility Performance Curve
              </CardTitle>
              <CardDescription className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                Aggregate Portfolio Trend
              </CardDescription>
            </div>
            {stats && (
              <Badge
                variant="outline"
                className={cn(
                  "h-6 px-3 text-[10px] font-black uppercase tracking-widest",
                  stats.drift >= 0
                    ? "bg-green-50 text-green-700 border-green-200"
                    : "bg-red-50 text-red-700 border-red-200",
                )}
              >
                {stats.drift >= 0 ? (
                  <TrendingUp className="w-3 h-3 mr-1" />
                ) : (
                  <TrendingDown className="w-3 h-3 mr-1" />
                )}
                {Math.abs(stats.drift).toFixed(1)} Drift
              </Badge>
            )}
          </CardHeader>
          <CardContent className="h-[350px] pt-8 px-4">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={
                  chartData.length > 0 ? chartData : [{ name: "No data", score: 0 }]
                }
              >
                <defs>
                  <linearGradient id="colorHistory" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#174C80" stopOpacity={0.1} />
                    <stop offset="95%" stopColor="#174C80" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                <XAxis
                  dataKey="name"
                  stroke="#888888"
                  fontSize={10}
                  tickLine={false}
                  axisLine={false}
                  dy={10}
                />
                <YAxis
                  stroke="#888888"
                  fontSize={10}
                  tickLine={false}
                  axisLine={false}
                  domain={[0, 100]}
                />
                <Tooltip
                  contentStyle={{
                    borderRadius: "16px",
                    border: "none",
                    boxShadow: "0 8px 32px rgba(0,0,0,0.1)",
                  }}
                  labelStyle={{ fontWeight: "bold", color: "#174C80", marginBottom: "4px" }}
                />
                <Area
                  type="monotone"
                  dataKey="score"
                  stroke="#174C80"
                  strokeWidth={4}
                  fillOpacity={1}
                  fill="url(#colorHistory)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Drift Summary Sidebar */}
        <div className="lg:col-span-4 space-y-6">
          <Card className="border-none shadow-sm bg-primary text-white overflow-hidden relative group">
            <div className="absolute top-0 right-0 w-32 h-32 bg-accent/20 blur-3xl rounded-full -translate-y-1/2 translate-x-1/2 transition-transform duration-700 group-hover:scale-125" />
            <CardHeader className="pb-2 border-b bg-white/5 px-6">
              <CardTitle className="text-xs font-bold uppercase tracking-widest text-white/60">
                Portfolio Yield
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6 px-6 space-y-6">
              <div className="space-y-1">
                <div className="text-5xl font-black tracking-tighter text-accent">
                  {stats?.avg.toFixed(1) ?? "—"}
                </div>
                <div className="text-[9px] font-bold text-white/40 uppercase tracking-[0.2em]">
                  Median Visibility Index
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4 pt-4 border-t border-white/10">
                <div className="space-y-1">
                  <div className="text-xl font-bold">{stats?.totalScans ?? scans.length}</div>
                  <div className="text-[8px] font-bold text-white/40 uppercase">Total Audits</div>
                </div>
                <div className="space-y-1">
                  <div className="text-xl font-bold text-green-400">Active</div>
                  <div className="text-[8px] font-bold text-white/40 uppercase">System Health</div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-none shadow-sm bg-white overflow-hidden">
            <CardHeader className="pb-2 border-b bg-muted/10 px-6">
              <CardTitle className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                Recent Shifts
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y divide-muted/50">
                {scans.slice(0, 4).map((scan) => (
                  <Link
                    key={scan.id}
                    href={`/scans/results/${scan.id}`}
                    className="p-4 flex items-center justify-between hover:bg-muted/20 transition-colors block"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-primary/5 flex items-center justify-center text-primary">
                        <Activity className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="text-[10px] font-bold text-primary truncate max-w-[120px]">
                          {scan.businessName ?? "Audit Record"}
                        </div>
                        <div className="text-[8px] text-muted-foreground font-medium">
                          {new Date(scan.createdAt).toLocaleDateString(undefined, {
                            month: "short",
                            day: "numeric",
                          })}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-black text-primary">
                        {scan.overallScore !== null ? scan.overallScore.toFixed(1) : "—"}
                      </div>
                      <Badge
                        variant="outline"
                        className="text-[7px] font-black h-3 px-1 border-primary/10"
                      >
                        {scan.status === "PARTIAL" ? "Partial" : "Verified"}
                      </Badge>
                    </div>
                  </Link>
                ))}
              </div>
              <div className="p-4 border-t bg-muted/10">
                <Link href="/scans">
                  <Button
                    variant="ghost"
                    className="w-full text-[9px] font-bold uppercase tracking-widest h-8 text-primary hover:bg-primary/5"
                  >
                    View Full Inventory <ChevronRight className="w-3 h-3 ml-1" />
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
