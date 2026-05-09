
"use client";

import { use, useState, useEffect, useMemo } from "react";
import { ScoreCard } from "@/components/dashboard/score-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  ShieldCheck,
  Target,
  Search,
  Zap,
  FileText,
  Lightbulb,
  ExternalLink,
  Loader2,
  ArrowRight,
  ShieldAlert,
  ArrowUpRight,
  GitCompare,
  Radar,
  Lock,
  AlertCircle,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { ConsultationRequestDialog } from "@/components/consultation/consultation-request-dialog";
import { ScanFailureCard } from "@/components/scans/scan-failure-card";

// ── Inline types ──────────────────────────────────────────────────────────────

type Recommendation = {
  id: string;
  priority: "high" | "medium" | "low";
  category: string;
  title: string;
  reason: string;
  recommended_action: string;
  service_link: string | null;
  is_actioned: boolean;
};

type ModelSummary = {
  model_id: string;
  provider: string;
  summary: string | null;
  business_type: string | null;
  services: string[];
  industries: string[];
  locations: string[];
  customers: string[];
  differentiators: string[];
  latency_ms: number | null;
};

type ScanStatus = "PENDING" | "RUNNING" | "COMPLETE" | "PARTIAL" | "FAILED" | "TIMEOUT";

type PerceptionScanResult = {
  scan_id: string;
  status: ScanStatus;
  business_name: string | null;
  website_url: string | null;
  created_at: string;
  completed_at: string | null;
  error_message: string | null;
  accuracy_score: number | null;
  coverage_score: number | null;
  entity_understanding_score: number | null;
  consistency_score: number | null;
  consistency_label: string | null;
  perception_summary: string | null;
  comparison: {
    agreements: unknown[];
    differences: unknown[];
    conflicts: unknown[];
  } | null;
  consistency_notes: string[];
  recommendations: Recommendation[];
  model_summaries: ModelSummary[];
};

// ─────────────────────────────────────────────────────────────────────────────

export default function ScanResultsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [scan, setScan] = useState<PerceptionScanResult | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setFetchError(null);
      try {
        const res = await fetch(`/api/scan/${id}`);
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setFetchError(data.error || `Request failed (${res.status})`);
          return;
        }
        const data = await res.json();
        setScan(data);
      } catch (e: any) {
        setFetchError(e.message || "Failed to load scan");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  const overallScore = useMemo(() => {
    if (!scan) return 0;
    const scores = [
      scan.accuracy_score,
      scan.coverage_score,
      scan.entity_understanding_score,
      scan.consistency_score,
    ].filter((s): s is number => s !== null && s !== undefined);
    if (scores.length === 0) return 0;
    return Math.round(scores.reduce((sum, s) => sum + s, 0) / scores.length);
  }, [scan]);

  const priorityStyle = (priority: string) => {
    if (priority === "high") return "bg-red-50 text-red-700 border-red-200";
    if (priority === "medium") return "bg-amber-50 text-amber-700 border-amber-200";
    return "bg-muted text-muted-foreground border-border";
  };

  // ── Loading ───────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <Loader2 className="w-12 h-12 text-primary animate-spin" />
        <p className="text-muted-foreground font-medium">
          Reconstructing intelligence knowledge graph...
        </p>
      </div>
    );
  }

  // ── Fetch error / not found ───────────────────────────────
  if (fetchError || !scan) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <AlertCircle className="w-12 h-12 text-destructive" />
        <p className="text-muted-foreground font-medium">
          {fetchError || "Scan not found"}
        </p>
      </div>
    );
  }

  // ── TIMEOUT — calm, structured, no results to show ────────
  if (scan.status === "TIMEOUT") {
    return (
      <div className="max-w-2xl mx-auto pt-12">
        <ScanFailureCard
          status="TIMEOUT"
          errorMessage={scan.error_message}
          scanId={id}
          businessName={scan.business_name}
        />
      </div>
    );
  }

  // ── FAILED — calm, structured, no results to show ─────────
  if (scan.status === "FAILED") {
    return (
      <div className="max-w-2xl mx-auto pt-12">
        <ScanFailureCard
          status="FAILED"
          errorMessage={scan.error_message}
          scanId={id}
          businessName={scan.business_name}
        />
      </div>
    );
  }

  const isLowVisibility = overallScore < 40;

  return (
    <div className="space-y-8 max-w-7xl mx-auto pb-12 animate-in fade-in duration-700">

      {/* ── Executive Report Header ────────────────────────────── */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 border-b pb-8">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-[10px] font-bold text-muted-foreground uppercase tracking-[0.2em]">
            <FileText className="w-3 h-3 text-accent" />
            Report Identifier: SCAN-{id.slice(0, 8).toUpperCase()}
          </div>
          <h2 className="text-4xl font-headline font-black text-primary tracking-tighter">
            Discovery Intelligence Audit
          </h2>
          <p className="text-muted-foreground flex items-center gap-2">
            Subject:{" "}
            <strong className="text-primary font-black">
              {scan.business_name || "Client Account"}
            </strong>{" "}
            •{" "}
            {new Date().toLocaleDateString(undefined, { dateStyle: "long" })}
          </p>
        </div>
        <div className="flex gap-3">
          <Button
            variant="outline"
            className="gap-2 border-primary/20 hover:bg-primary/5 rounded-full opacity-50 cursor-not-allowed"
            disabled
          >
            <Lock className="w-4 h-4" /> Share Access
          </Button>
          <Link href={`/scans/report/${id}`}>
            <Button className="gap-2 bg-primary hover:bg-primary/90 text-white shadow-xl shadow-primary/20 rounded-full px-6">
              <ExternalLink className="w-4 h-4" /> Presentation View
            </Button>
          </Link>
        </div>
      </div>

      {/* ── PARTIAL notice — some models unavailable, results still usable ── */}
      {scan.status === "PARTIAL" && (
        <ScanFailureCard
          status="PARTIAL"
          scanId={id}
          businessName={scan.business_name}
          showPartialLink={false}
        />
      )}

      {/* ── Critical Visibility CTA ────────────────────────────── */}
      {isLowVisibility && (
        <Card className="border-none shadow-lg bg-destructive/5 border-l-4 border-l-destructive overflow-hidden">
          <CardContent className="p-6 flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-destructive/10 text-destructive flex items-center justify-center shrink-0">
                <ShieldAlert className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <p className="text-lg font-bold text-destructive">
                  Critical Visibility Deficit Detected
                </p>
                <p className="text-sm text-muted-foreground font-medium">
                  Your organization is largely invisible to primary AI discovery
                  vectors. Strategic optimization is required.
                </p>
              </div>
            </div>
            <ConsultationRequestDialog
              sourceScanId={scan.scan_id}
              trigger={
                <Button className="bg-destructive hover:bg-destructive/90 text-white font-bold px-8 rounded-full h-12 shadow-lg shadow-destructive/20 gap-2">
                  Request Emergency Optimization Plan{" "}
                  <ArrowRight className="w-4 h-4" />
                </Button>
              }
            />
          </CardContent>
        </Card>
      )}

      {/* ── Score Cards ───────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <ScoreCard
          title="Overall Visibility"
          score={overallScore}
          trend={0}
          icon={Search}
          className="bg-primary text-white"
          description="Avg. perception score"
        />
        <ScoreCard
          title="Accuracy"
          score={scan.accuracy_score ?? 0}
          trend={0}
          icon={ShieldCheck}
          description="Factual alignment"
        />
        <ScoreCard
          title="Coverage"
          score={scan.coverage_score ?? 0}
          trend={0}
          icon={Zap}
          description="Service & offering depth"
        />
        <ScoreCard
          title="Entity Understanding"
          score={scan.entity_understanding_score ?? 0}
          trend={0}
          icon={Target}
          description="Business identity clarity"
        />
        <ScoreCard
          title="Consistency"
          score={scan.consistency_score ?? 0}
          trend={0}
          icon={GitCompare}
          description="Cross-model agreement"
        />
      </div>

      {/* ── Perception Summary ────────────────────────────────── */}
      {scan.perception_summary && (
        <Card className="border-none shadow-md bg-white overflow-hidden">
          <CardHeader className="pb-4 border-b bg-muted/20">
            <CardTitle className="text-sm font-black text-primary flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-accent" />
              Perception Summary
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground leading-relaxed">
              {scan.perception_summary}
            </p>
          </CardContent>
        </Card>
      )}

      {/* ── Consistency Gauge + Model Responses ──────────────── */}
      <div className="grid lg:grid-cols-12 gap-6">

        {/* Model Consistency */}
        <Card className="lg:col-span-4 border-none shadow-md bg-white overflow-hidden">
          <CardHeader className="pb-4 border-b bg-muted/20">
            <CardTitle className="text-sm font-black text-primary flex items-center gap-2">
              <Radar className="w-4 h-4 text-accent" />
              Model Consistency
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-8 space-y-6 text-center">
            <div className="relative inline-flex items-center justify-center">
              <svg className="w-32 h-32 transform -rotate-90">
                <circle
                  cx="64"
                  cy="64"
                  r="58"
                  stroke="currentColor"
                  strokeWidth="8"
                  fill="transparent"
                  className="text-muted/30"
                />
                <circle
                  cx="64"
                  cy="64"
                  r="58"
                  stroke="currentColor"
                  strokeWidth="8"
                  fill="transparent"
                  strokeDasharray={364.4}
                  strokeDashoffset={
                    364.4 - (364.4 * (scan.consistency_score ?? 0)) / 100
                  }
                  className="text-accent transition-all duration-1000 ease-out"
                  strokeLinecap="round"
                />
              </svg>
              <div className="absolute flex flex-col items-center">
                <span className="text-3xl font-black text-primary">
                  {scan.consistency_score ?? 0}%
                </span>
                <span className="text-[8px] font-bold text-muted-foreground uppercase tracking-widest">
                  Consistency
                </span>
              </div>
            </div>
            {scan.consistency_label && (
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">
                {scan.consistency_label.replace(/_/g, " ")}
              </p>
            )}
            {scan.consistency_notes.length > 0 && (
              <div className="text-left space-y-2 pt-2 border-t">
                {scan.consistency_notes.slice(0, 2).map((note, i) => (
                  <p key={i} className="text-xs text-muted-foreground">
                    {note}
                  </p>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Model Responses */}
        <Card className="lg:col-span-8 border-none shadow-md bg-white overflow-hidden border-l-4 border-l-accent">
          <CardHeader className="flex flex-row items-center justify-between bg-accent/5 py-4 px-8">
            <CardTitle className="text-lg font-black text-primary flex items-center gap-2 tracking-tight">
              <GitCompare className="w-5 h-5 text-accent" /> Model Responses
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="grid divide-y">
              {scan.model_summaries.length === 0 ? (
                <p className="p-6 text-sm text-muted-foreground">
                  No model responses recorded.
                </p>
              ) : (
                scan.model_summaries.slice(0, 3).map((model, i) => (
                  <div key={i} className="p-6 space-y-2">
                    <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                      {model.model_id}
                    </div>
                    <p className="text-sm text-primary leading-relaxed line-clamp-3">
                      {model.summary || "No summary available."}
                    </p>
                    {model.services.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {model.services.slice(0, 4).map((s, j) => (
                          <Badge
                            key={j}
                            variant="secondary"
                            className="text-[10px]"
                          >
                            {s}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Recommendations ───────────────────────────────────── */}
      {scan.recommendations.length > 0 && (
        <Card className="border-none shadow-md bg-white overflow-hidden">
          <CardHeader className="pb-4 border-b bg-muted/20">
            <CardTitle className="text-sm font-black text-primary flex items-center gap-2">
              <Lightbulb className="w-4 h-4 text-accent" />
              Strategic Recommendations
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6 space-y-3">
            {scan.recommendations.map((rec) => (
              <div
                key={rec.id}
                className="flex items-start gap-4 p-4 rounded-xl bg-muted/30 border"
              >
                <Badge
                  variant="outline"
                  className={cn(
                    "shrink-0 text-[10px] uppercase font-bold tracking-wider",
                    priorityStyle(rec.priority),
                  )}
                >
                  {rec.priority}
                </Badge>
                <div className="space-y-1 flex-1 min-w-0">
                  <p className="text-sm font-bold text-primary">{rec.title}</p>
                  <p className="text-xs text-muted-foreground">{rec.reason}</p>
                  <p className="text-xs text-muted-foreground font-medium mt-1">
                    {rec.recommended_action}
                  </p>
                </div>
                {rec.service_link && (
                  <a
                    href={rec.service_link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0"
                  >
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <ArrowUpRight className="w-4 h-4" />
                    </Button>
                  </a>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* ── Guidance bar — next step after reviewing results ── */}
      <div className="rounded-lg border border-border bg-card p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-primary/5 shrink-0">
            <Lightbulb className="w-4 h-4 text-primary" />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">
              Ready to act on these findings?
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Track your progress, mark recommendations complete, and improve your AI visibility score.
            </p>
          </div>
        </div>
        <div className="flex gap-2 shrink-0">
          <Link href={`/recommendations?scanId=${id}`}>
            <Button size="sm" className="gap-1.5 text-xs">
              View Recommendations
              <ArrowRight className="w-3.5 h-3.5" />
            </Button>
          </Link>
          <Link href="/dashboard">
            <Button variant="outline" size="sm" className="text-xs">
              Back to Dashboard
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
