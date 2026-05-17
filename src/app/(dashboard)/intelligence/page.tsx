"use client";

/**
 * /intelligence — Customer operational intelligence dashboard (Sprint 11 Task 4).
 *
 * Plain-language view of the org's continuity state, operational profile,
 * resilience, and top risk/action signal.
 *
 * 5 sections:
 *   1. Continuity Overview  — state, trend, 30d projection
 *   2. Operational Profile  — archetype in plain language + stability
 *   3. Resilience           — score bar + summary
 *   4. Risk Signal          — top risk in calm language (max 1)
 *   5. Recommended Focus    — top action from timing insight (max 1)
 *
 * No cross-org data. No benchmarks. Advisory only.
 */

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  Activity,
  Shield,
  AlertCircle,
  Lightbulb,
  ChevronLeft,
  Loader2,
  RefreshCcw,
  TrendingUp,
  TrendingDown,
  Minus,
  ArrowUpRight,
  ArrowDownRight,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

// ── Types ─────────────────────────────────────────────────────────────────────

type WindowDays = 30 | 90 | 365;

interface CustomerIntelligenceSummary {
  organizationId:           string;
  continuityLabel:          string;
  continuityState:          string;
  projectedLabel:           string;
  continuityTrend:          string;
  operationalProfile:       string;
  operationalProfileDetail: string;
  resilienceScore:          number;
  resilienceSummary:        string;
  topRisk?:                 { label: string; rationale: string };
  topAction?:               { action: string; rationale: string };
  stateChangedSince?:       string;
  previousState?:           string;
  resilienceScoreDelta?:    number;
  generatedAt:              string;
  windowDays:               number;
}

// ── Badge helpers ─────────────────────────────────────────────────────────────

function stateColor(state: string) {
  const map: Record<string, string> = {
    OPTIMIZING: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    STABLE:     'bg-blue-50 text-blue-700 border-blue-200',
    WATCHING:   'bg-amber-50 text-amber-700 border-amber-200',
    FRAGMENTED: 'bg-orange-50 text-orange-700 border-orange-200',
    CRITICAL:   'bg-red-50 text-red-700 border-red-200',
  };
  return map[state] ?? 'bg-slate-50 text-slate-600 border-slate-200';
}

function resilienceColor(score: number) {
  if (score >= 70) return 'bg-emerald-400';
  if (score >= 45) return 'bg-amber-400';
  return 'bg-orange-400';
}

function trendIcon(trend: string) {
  if (trend === 'IMPROVING') return <TrendingUp className="w-4 h-4 text-emerald-600" />;
  if (trend === 'DECLINING') return <TrendingDown className="w-4 h-4 text-orange-600" />;
  return <Minus className="w-4 h-4 text-slate-400" />;
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function IntelligencePage() {
  const [data, setData]       = useState<CustomerIntelligenceSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [window, setWindow]   = useState<WindowDays>(90);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res  = await fetch(`/api/intelligence?window=${window}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Load failed');
      if (!json.data) {
        setData(null);
      } else {
        setData(json.data);
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [window]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="min-h-screen bg-background p-6 max-w-3xl mx-auto space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/dashboard">
            <Button variant="ghost" size="sm" className="gap-1 text-muted-foreground">
              <ChevronLeft className="w-4 h-4" /> Dashboard
            </Button>
          </Link>
          <div>
            <h1 className="text-lg font-semibold text-foreground">Operational Intelligence</h1>
            <p className="text-xs text-muted-foreground">
              Your organization's continuity health — updated from your recent activity.
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
            <RefreshCcw className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-16 gap-2 text-muted-foreground text-sm">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading your operational data…
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* No data */}
      {!loading && !error && !data && (
        <Card className="border-border/50">
          <CardContent className="pt-6 pb-6 text-center">
            <p className="text-sm text-muted-foreground">
              Not enough operational activity yet to generate an intelligence summary.
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Complete your first scan to start tracking your continuity.
            </p>
            <Link href="/scans/new" className="mt-3 inline-block">
              <Button size="sm" variant="outline" className="gap-1">
                Start a scan <ArrowUpRight className="w-3.5 h-3.5" />
              </Button>
            </Link>
          </CardContent>
        </Card>
      )}

      {!loading && !error && data && (
        <>
          {/* ── Section 1: Continuity Overview ──────────────────────────────── */}
          <Card className="border-border/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Activity className="w-4 h-4 text-primary" />
                Continuity Overview
              </CardTitle>
              <CardDescription className="text-xs">
                Based on your last {data.windowDays} days of operational activity.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {/* State + trend */}
              <div className="flex items-center gap-3 mb-3">
                <Badge variant="outline" className={`text-sm font-medium px-3 py-1 ${stateColor(data.continuityState)}`}>
                  {data.continuityLabel}
                </Badge>
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  {trendIcon(data.continuityTrend)}
                  <span>
                    {data.continuityTrend === 'IMPROVING' ? 'Improving' :
                     data.continuityTrend === 'DECLINING' ? 'Declining' : 'Stable'}
                  </span>
                </div>
              </div>
              {/* Projection */}
              <p className="text-sm text-foreground">{data.projectedLabel}</p>
              {/* Delta */}
              {data.previousState && data.stateChangedSince && (
                <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
                  {data.continuityTrend === 'IMPROVING'
                    ? <ArrowUpRight className="w-3 h-3 text-emerald-600" />
                    : <ArrowDownRight className="w-3 h-3 text-orange-600" />}
                  Previously <span className="font-medium">{data.previousState}</span> — updated{' '}
                  {new Date(data.stateChangedSince).toLocaleDateString()}
                </p>
              )}
            </CardContent>
          </Card>

          {/* ── Section 2: Operational Profile ──────────────────────────────── */}
          <Card className="border-border/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">
                {data.operationalProfile}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-foreground">{data.operationalProfileDetail}</p>
            </CardContent>
          </Card>

          {/* ── Section 3: Resilience ────────────────────────────────────────── */}
          <Card className="border-border/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Shield className="w-4 h-4 text-primary" />
                Operational Resilience
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-foreground font-medium">{data.resilienceSummary}</span>
                <span className="text-xs text-muted-foreground">{data.resilienceScore}/100</span>
              </div>
              <div className="h-2 bg-slate-100 rounded-full overflow-hidden mb-2">
                <div
                  className={`h-full rounded-full transition-all ${resilienceColor(data.resilienceScore)}`}
                  style={{ width: `${data.resilienceScore}%` }}
                />
              </div>
              {data.resilienceScoreDelta !== undefined && (
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  {data.resilienceScoreDelta > 0
                    ? <><ArrowUpRight className="w-3 h-3 text-emerald-600" /> +{data.resilienceScoreDelta} points since last update</>
                    : <><ArrowDownRight className="w-3 h-3 text-orange-600" /> {data.resilienceScoreDelta} points since last update</>}
                </p>
              )}
            </CardContent>
          </Card>

          {/* ── Section 4: Risk Signal ──────────────────────────────────────── */}
          {data.topRisk ? (
            <Card className="border-border/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-amber-500" />
                  Area to Watch
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm font-medium text-foreground mb-1 capitalize">{data.topRisk.label}</p>
                <p className="text-sm text-muted-foreground">{data.topRisk.rationale}</p>
              </CardContent>
            </Card>
          ) : (
            <Card className="border-border/50">
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center gap-2 text-emerald-700">
                  <AlertCircle className="w-4 h-4" />
                  <p className="text-sm font-medium">No significant risk signals detected.</p>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Your operational patterns are within normal bounds for this window.
                </p>
              </CardContent>
            </Card>
          )}

          {/* ── Section 5: Recommended Focus ────────────────────────────────── */}
          {data.topAction && (
            <Card className="border-border/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Lightbulb className="w-4 h-4 text-primary" />
                  Recommended Focus
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-foreground mb-2">{data.topAction.action}</p>
                {data.topAction.rationale && (
                  <p className="text-xs text-muted-foreground">{data.topAction.rationale}</p>
                )}
                <Link href="/recommendations" className="mt-3 inline-block">
                  <Button size="sm" variant="outline" className="gap-1 text-xs">
                    View recommendations <ArrowUpRight className="w-3 h-3" />
                  </Button>
                </Link>
              </CardContent>
            </Card>
          )}

          {/* Footer */}
          <p className="text-xs text-muted-foreground text-center pb-4">
            Updated {new Date(data.generatedAt).toLocaleString()} ·{' '}
            based on your last {data.windowDays} days of activity ·{' '}
            advisory only
          </p>
        </>
      )}
    </div>
  );
}
