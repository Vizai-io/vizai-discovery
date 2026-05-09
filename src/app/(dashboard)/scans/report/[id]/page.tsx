
"use client";

import { use, useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Printer,
  ChevronLeft,
  ShieldCheck,
  Target,
  Search,
  Zap,
  AlertTriangle,
  CheckCircle2,
  FileText,
  TrendingUp,
  Loader2,
  AlertCircle,
  GitCompare,
} from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

// ── Inline types ──────────────────────────────────────────────────────────────

type ComparisonItem = {
  category: string;
  detail: string;
  models_involved: string[];
};

type ComparisonRow = {
  type: "agreement" | "difference" | "conflict";
  item: ComparisonItem;
};

type Recommendation = {
  id: string;
  priority: string;
  category: string;
  title: string;
  reason: string;
  recommended_action: string;
  service_link: string | null;
  is_actioned: boolean;
};

type PerceptionScanResult = {
  scan_id: string;
  status: string;
  business_name: string | null;
  created_at: string;
  completed_at: string | null;
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
  recommendations: Recommendation[];
  model_summaries: {
    model_id: string;
    provider: string;
    summary: string | null;
  }[];
};

// ─────────────────────────────────────────────────────────────────────────────

export default function ClientReportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [scan, setScan] = useState<PerceptionScanResult | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchScan() {
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
        setFetchError(e.message || "Failed to load report");
      } finally {
        setLoading(false);
      }
    }
    fetchScan();
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

  const PERCEPTION_SCORES = useMemo(
    () => [
      { label: "Accuracy", score: scan?.accuracy_score ?? 0, icon: ShieldCheck },
      { label: "Coverage", score: scan?.coverage_score ?? 0, icon: Zap },
      { label: "Entity Understanding", score: scan?.entity_understanding_score ?? 0, icon: Target },
      { label: "Consistency", score: scan?.consistency_score ?? 0, icon: GitCompare },
    ],
    [scan],
  );

  const comparisonRows = useMemo((): ComparisonRow[] => {
    if (!scan?.comparison) return [];
    const agreements = (scan.comparison.agreements as ComparisonItem[]).map(
      (item) => ({ type: "agreement" as const, item }),
    );
    const differences = (scan.comparison.differences as ComparisonItem[]).map(
      (item) => ({ type: "difference" as const, item }),
    );
    const conflicts = (scan.comparison.conflicts as ComparisonItem[]).map(
      (item) => ({ type: "conflict" as const, item }),
    );
    return [...agreements, ...differences, ...conflicts].slice(0, 10);
  }, [scan]);

  const handlePrint = () => {
    window.print();
  };

  // ── Loading ───────────────────────────────────────────────
  if (loading) {
    return (
      <div className="p-20 text-center flex flex-col items-center gap-4">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <p className="text-muted-foreground">Constructing final report...</p>
      </div>
    );
  }

  // ── Error / not found ─────────────────────────────────────
  if (fetchError || !scan) {
    return (
      <div className="p-20 text-center flex flex-col items-center gap-4">
        <AlertCircle className="w-8 h-8 text-destructive" />
        <p className="text-muted-foreground">{fetchError || "Report not found"}</p>
      </div>
    );
  }

  const auditDate = new Date(scan.completed_at ?? scan.created_at).toLocaleDateString();

  return (
    <div className="max-w-5xl mx-auto space-y-8 pb-20 print:space-y-6 print:pb-0">

      {/* ── Report Controls — Hidden on Print ── */}
      <div className="flex items-center justify-between print:hidden">
        <Link href={`/scans/results/${id}`}>
          <Button variant="ghost" className="gap-2">
            <ChevronLeft className="w-4 h-4" /> Back to Analytics
          </Button>
        </Link>
        <Button onClick={handlePrint} className="gap-2 bg-primary text-white shadow-lg">
          <Printer className="w-4 h-4" /> Export / Print Audit
        </Button>
      </div>

      {/* ── Report Header ── */}
      <header className="border-b-4 border-primary pb-8 space-y-6 print:pb-4">
        <div className="flex justify-between items-start">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-[10px] font-bold text-muted-foreground uppercase tracking-[0.2em]">
              <FileText className="w-3 h-3 text-accent" />
              Client Intelligence Report • Private &amp; Confidential
            </div>
            <h1 className="text-4xl font-headline font-bold text-primary leading-tight">
              AI Visibility Discovery Audit
            </h1>
            <p className="text-lg text-muted-foreground">
              Comprehensive analysis of search prominence and LLM recommendation patterns.
            </p>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold text-primary">VizAI</div>
            <div className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest">
              Consulting Group
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 bg-muted/30 p-6 rounded-2xl border print:p-4 print:bg-white print:border-slate-200">
          <div className="space-y-1">
            <div className="text-[10px] font-bold text-muted-foreground uppercase">
              Target Organization
            </div>
            <div className="text-sm font-bold text-primary truncate">
              {scan.business_name || "Client Account"}
            </div>
          </div>
          <div className="space-y-1">
            <div className="text-[10px] font-bold text-muted-foreground uppercase">
              Analysis Scale
            </div>
            <div className="text-sm font-bold text-primary">Multi-Vector</div>
          </div>
          <div className="space-y-1">
            <div className="text-[10px] font-bold text-muted-foreground uppercase">Status</div>
            <div className="text-sm font-bold text-primary capitalize">
              {scan.status === "COMPLETE" ? "Complete" : scan.status.toLowerCase()}
            </div>
          </div>
          <div className="space-y-1">
            <div className="text-[10px] font-bold text-muted-foreground uppercase">Audit Date</div>
            <div className="text-sm font-bold text-primary">{auditDate}</div>
          </div>
        </div>
      </header>

      {/* ── Executive Summary ── */}
      <section className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-end gap-6 border-b pb-6 print:pb-4">
          <div className="space-y-2">
            <h2 className="text-2xl font-bold text-primary">Executive Summary</h2>
            <div className="text-sm text-muted-foreground max-w-2xl leading-relaxed">
              {scan.perception_summary ||
                "This audit details the AI Visibility Index and discoverability footprint for your organization. Tactical adjustments to entity signals and capability positioning are required to regain parity."}
            </div>
          </div>
          <div className="sm:ml-auto text-center p-4 bg-primary text-white rounded-2xl shadow-xl min-w-[140px] print:shadow-none print:border print:border-primary print:text-primary print:bg-white">
            <div className="text-[10px] font-bold uppercase tracking-widest opacity-80">
              Overall Score
            </div>
            <div className="text-5xl font-bold">{overallScore}</div>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {PERCEPTION_SCORES.map((cat, i) => (
            <div
              key={i}
              className="p-4 bg-white rounded-xl border border-slate-100 flex flex-col items-center text-center space-y-2 print:border-slate-200 shadow-sm print:shadow-none"
            >
              <div className="p-2 rounded-lg bg-primary/5 text-primary">
                <cat.icon className="w-5 h-5" />
              </div>
              <div className="text-[10px] font-bold text-muted-foreground uppercase leading-tight">
                {cat.label}
              </div>
              <div className="text-2xl font-bold text-primary">{cat.score}%</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Strategic Actions ── */}
      {scan.recommendations.length > 0 && (
        <section className="space-y-4 pt-8 print:pt-4 page-break-before-auto">
          <h3 className="text-xl font-bold text-primary flex items-center gap-2">
            <Zap className="w-5 h-5 text-accent" />
            Strategic Actions
          </h3>
          <div className="space-y-4">
            {scan.recommendations.map((rec, i) => (
              <div
                key={rec.id}
                className="p-6 bg-white border border-slate-100 rounded-2xl flex flex-col sm:flex-row items-start gap-6 print:border-slate-200 shadow-sm print:shadow-none"
              >
                <div className="w-12 h-12 rounded-xl bg-primary text-white flex items-center justify-center font-bold text-lg shrink-0 print:border print:border-primary print:text-primary print:bg-white">
                  {i + 1}
                </div>
                <div className="space-y-2 flex-1">
                  <div className="flex items-center gap-3">
                    <div className="text-[10px] font-bold text-accent uppercase tracking-widest">
                      {rec.category}
                    </div>
                    <Badge
                      variant={rec.priority === "high" ? "destructive" : "secondary"}
                      className="text-[8px] uppercase h-4 px-1 leading-none"
                    >
                      {rec.priority} Priority
                    </Badge>
                  </div>
                  <div className="text-lg font-bold text-primary">{rec.title}</div>
                  <p className="text-sm text-muted-foreground leading-relaxed">{rec.reason}</p>
                  <div className="pt-2">
                    <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/5 text-primary text-[10px] font-bold uppercase">
                      <TrendingUp className="w-3 h-3 text-accent" />
                      Recommended Action: {rec.recommended_action}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Intelligence Signal Coverage ── */}
      {comparisonRows.length > 0 && (
        <section className="space-y-4 pt-8 print:pt-4 page-break-before-auto">
          <div className="flex justify-between items-center border-b pb-2">
            <h3 className="text-xl font-bold text-primary flex items-center gap-2">
              <Search className="w-5 h-5 text-accent" />
              Intelligence Signal Coverage
            </h3>
            <Badge
              variant="outline"
              className="text-[10px] uppercase font-bold text-primary border-primary/20"
            >
              Multi-Model Comparison
            </Badge>
          </div>

          <div className="overflow-hidden rounded-xl border border-slate-200 print:rounded-none">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 border-b print:bg-white">
                <tr>
                  <th className="px-6 py-3 font-bold text-muted-foreground uppercase text-[10px] tracking-widest">
                    Finding
                  </th>
                  <th className="px-6 py-3 font-bold text-muted-foreground uppercase text-[10px] tracking-widest">
                    Category
                  </th>
                  <th className="px-6 py-3 font-bold text-muted-foreground uppercase text-[10px] tracking-widest">
                    Detail
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {comparisonRows.map((row, i) => {
                  const isAgreement = row.type === "agreement";
                  const isConflict = row.type === "conflict";
                  return (
                    <tr key={i} className="print:bg-white">
                      <td className="px-6 py-4">
                        <div className="inline-flex items-center gap-1.5">
                          {isAgreement ? (
                            <CheckCircle2 className="w-4 h-4 text-green-500" />
                          ) : (
                            <AlertTriangle
                              className={cn(
                                "w-4 h-4",
                                isConflict ? "text-red-400" : "text-amber-400",
                              )}
                            />
                          )}
                          <span
                            className={cn(
                              "text-[10px] font-bold uppercase",
                              isAgreement
                                ? "text-green-600"
                                : isConflict
                                  ? "text-red-500"
                                  : "text-amber-600",
                            )}
                          >
                            {row.type}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                        {row.item.category}
                      </td>
                      <td className="px-6 py-4 text-sm text-primary font-medium">
                        {row.item.detail}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ── Print Footer ── */}
      <footer className="hidden print:block pt-12 text-center space-y-2 border-t mt-12">
        <div className="text-sm font-bold text-primary">VizAI Discovery Intelligence Audit</div>
        <div className="text-[10px] text-muted-foreground uppercase tracking-[0.3em]">
          www.vizai-scanner.ai • Confidential Proprietary Analysis
        </div>
      </footer>
    </div>
  );
}
