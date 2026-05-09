/**
 * @fileOverview Admin Scan Review — Sprint 4 stub.
 *
 * Previously read/wrote scan data from Firestore `scans` collection.
 * Now: reads from GET /api/scan/[id] (Postgres).
 *
 * Refinement 3 (Sprint 4): Explicit stabilization degradation notice in UI.
 * Save path INTENTIONALLY DISABLED during stabilization sprint.
 * Rationale: The Postgres scan data model uses ScanReport + Recommendation rows,
 * not the flat ScanRecord shape this page was designed for. The review/approval
 * workflow must be redesigned for the new schema before re-enabling saves.
 * This is flagged in the UI so the admin knows the page is read-only.
 *
 * Field mapping (Firestore ScanRecord → Postgres):
 *   results.companyName     → jsonReport.companyName
 *   results.overview        → scanReport.perceptionSummary
 *   results.priorityActions → recommendations table
 *   results.categoryScores  → jsonReport.categoryScores
 *   internalNotes           → (not in Postgres schema — Sprint 5)
 *   reviewStatus            → (not in Postgres schema — Sprint 5)
 *   shareEnabled            → (not in Postgres schema — Sprint 5)
 */

"use client";

import { use, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  FileSearch,
  ChevronLeft,
  ShieldCheck,
  Loader2,
  AlertTriangle,
  Briefcase,
  StickyNote
} from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

type ScanData = {
  id:          string;
  companyName: string;
  status:      string;
  overallScore?: number;
  categoryScores?: Record<string, number>;
  overview?:   string;
  recommendations?: Array<{
    id:       string;
    title:    string;
    priority: string;
    category: string;
    reason:   string;
  }>;
};

export default function ScanReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id }  = use(params);
  const router  = useRouter();
  const [scan,  setScan]    = useState<ScanData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchScan() {
      setLoading(true);
      try {
        const res = await fetch(`/api/scan/${id}`);
        if (!res.ok) throw new Error(`API error ${res.status}`);
        const data = await res.json();

        const s       = data.scan;
        const report  = s?.scanReport;
        const jsonRpt = report?.jsonReport as any ?? {};

        setScan({
          id:           s.id,
          companyName:  jsonRpt.companyName ?? s.companyProfile?.businessName ?? 'Unknown',
          status:       s.status,
          overallScore: jsonRpt.overallScore,
          categoryScores: jsonRpt.categoryScores,
          overview:     report?.perceptionSummary,
          recommendations: s.recommendations?.map((r: any) => ({
            id:       r.id,
            title:    r.title,
            priority: r.priority,
            category: r.category,
            reason:   r.reason,
          })) ?? [],
        });
      } catch (e) {
        console.error("Error fetching scan for review:", e);
      } finally {
        setLoading(false);
      }
    }
    fetchScan();
  }, [id]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <Loader2 className="w-12 h-12 text-primary animate-spin" />
        <p className="text-muted-foreground font-medium">Loading audit context...</p>
      </div>
    );
  }

  if (!scan) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <p className="text-muted-foreground font-medium">Scan not found.</p>
        <Button variant="outline" onClick={() => router.back()}>Go Back</Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-20 animate-in fade-in duration-500">
      <header className="bg-white border-b px-6 py-4 flex items-center justify-between sticky top-0 z-50">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" className="rounded-full" onClick={() => router.back()}><ChevronLeft className="w-5 h-5" /></Button>
          <div className="flex items-center gap-2">
            <FileSearch className="w-6 h-6 text-primary" />
            <div>
              <h1 className="text-lg font-bold text-primary">Intelligence Review: {scan.companyName}</h1>
              <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">Human Review Workflow • Status: {scan.status}</p>
            </div>
          </div>
        </div>
        <div className="flex gap-3">
          <Link href={`/admin/scans/${id}/proposal`}>
            <Button variant="outline" className="gap-2 border-accent text-primary font-bold">
              <Briefcase className="w-4 h-4 text-accent" />
              Build Proposal
            </Button>
          </Link>
          {/* Refinement 3: Save disabled during stabilization sprint */}
          <Button variant="outline" className="gap-2 opacity-50 cursor-not-allowed" disabled
            title="Save disabled during stabilization sprint — review schema migration pending Sprint 5">
            Save Draft (disabled)
          </Button>
          <Button className="gap-2 bg-primary/50 text-white cursor-not-allowed" disabled
            title="Approval disabled during stabilization sprint">
            Approve & Lock (disabled)
          </Button>
        </div>
      </header>

      {/* Refinement 3: Stabilization degradation notice */}
      <div className="bg-amber-50 border-b border-amber-200 px-6 py-2 flex items-center gap-2 text-amber-800 text-xs font-bold">
        <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
        <span>
          Stabilization Sprint 4 — Review page is read-only. Save, approval, and share management are disabled.
          The full review workflow will be re-enabled in Sprint 5 once the Postgres review schema is finalized.
        </span>
      </div>

      <main className="max-w-5xl mx-auto p-8 space-y-8">
        {/* Overview */}
        <Card className="border-none shadow-sm overflow-hidden bg-white">
          <CardHeader className="border-b bg-muted/10">
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-primary" />
              Executive Summary / Key Findings
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            <p className="text-sm leading-relaxed text-muted-foreground">
              {scan.overview || 'No overview available.'}
            </p>
          </CardContent>
        </Card>

        {/* Scores */}
        {scan.overallScore !== undefined && (
          <Card className="border-none shadow-sm bg-white">
            <CardHeader className="border-b bg-muted/10">
              <CardTitle className="text-sm font-bold">Visibility Scores</CardTitle>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4 mb-6">
                <div className="text-5xl font-black text-primary">{scan.overallScore?.toFixed(1)}</div>
                <div className="text-xs text-muted-foreground font-bold uppercase tracking-widest">Overall Score</div>
              </div>
              {scan.categoryScores && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {Object.entries(scan.categoryScores).map(([key, val]) => (
                    <div key={key} className="p-4 bg-muted/20 rounded-xl">
                      <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">{key.replace(/([A-Z])/g, ' $1').trim()}</div>
                      <div className="text-2xl font-black text-primary mt-1">{typeof val === 'number' ? val.toFixed(1) : val}</div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Recommendations */}
        {(scan.recommendations?.length ?? 0) > 0 && (
          <Card className="border-none shadow-sm overflow-hidden bg-white">
            <CardHeader className="border-b bg-muted/10">
              <CardTitle className="text-sm font-bold">Strategic Priority Actions</CardTitle>
              <CardDescription className="text-xs">Read-only during stabilization sprint.</CardDescription>
            </CardHeader>
            <CardContent className="pt-6 space-y-4">
              {scan.recommendations!.map((rec) => (
                <div key={rec.id} className="p-4 bg-muted/20 rounded-xl border space-y-2">
                  <div className="flex items-center gap-3">
                    <Badge variant="outline" className={cn(
                      "text-[9px] font-black uppercase",
                      rec.priority === 'HIGH'   ? 'border-red-200 text-red-700 bg-red-50'
                      : rec.priority === 'MEDIUM' ? 'border-amber-200 text-amber-700 bg-amber-50'
                      : 'border-green-200 text-green-700 bg-green-50'
                    )}>
                      {rec.priority}
                    </Badge>
                    <span className="text-[10px] font-bold text-accent uppercase tracking-widest">{rec.category}</span>
                  </div>
                  <div className="font-bold text-primary text-sm">{rec.title}</div>
                  <p className="text-xs text-muted-foreground">{rec.reason}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Internal Notes — read-only placeholder */}
        <Card className="border-none shadow-sm bg-white overflow-hidden opacity-60">
          <CardHeader className="border-b bg-muted/20">
            <CardTitle className="text-xs font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
              <StickyNote className="w-3 h-3" />
              Internal Admin Notes (Sprint 5)
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground italic">Internal notes are not yet stored in Postgres. Will be re-enabled in Sprint 5.</p>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
