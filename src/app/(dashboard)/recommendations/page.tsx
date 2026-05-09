"use client";

/**
 * @fileOverview /recommendations — Operational workflow for recommendations.
 *
 * Data source: GET /api/recommendations (Postgres, org-scoped)
 * Status updates: PATCH /api/recommendations/[id]
 *
 * Removed all Firestore references (collection, db, ScanRecord, StrategicRecommendation).
 * Rebuilt as a workflow-first view: track, progress, complete, dismiss.
 */

import { useState, useEffect, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import {
  Lightbulb,
  Loader2,
  Target,
  CheckCircle2,
  Clock,
  XCircle,
  ChevronDown,
  ChevronUp,
  ArrowRight,
  Zap,
  AlertCircle,
  ExternalLink,
  Sparkles,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import Link from "next/link";
import { useAuth } from "@/contexts/auth-context";

// ── Types ─────────────────────────────────────────────────────────────────────

type RecStatus = "OPEN" | "IN_PROGRESS" | "COMPLETED" | "DISMISSED";

type RecommendationItem = {
  id: string;
  perception_scan_id: string;
  scan_created_at: string;
  business_name: string;
  priority: "HIGH" | "MEDIUM" | "LOW";
  category: string;
  title: string;
  reason: string;
  recommended_action: string;
  service_link: string | null;
  status: RecStatus;
  opened_at: string | null;
  in_progress_at: string | null;
  completed_at: string | null;
  dismissed_at: string | null;
  created_at: string;
};

// ── Constants ─────────────────────────────────────────────────────────────────

const STATUS_TABS: { label: string; value: RecStatus | "ALL" }[] = [
  { label: "All", value: "ALL" },
  { label: "Open", value: "OPEN" },
  { label: "In Progress", value: "IN_PROGRESS" },
  { label: "Completed", value: "COMPLETED" },
  { label: "Dismissed", value: "DISMISSED" },
];

const PRIORITY_COLORS: Record<string, string> = {
  HIGH: "bg-red-50 text-red-700 border-red-200",
  MEDIUM: "bg-yellow-50 text-yellow-700 border-yellow-200",
  LOW: "bg-blue-50 text-blue-700 border-blue-200",
};

const STATUS_META: Record<
  RecStatus,
  { label: string; icon: React.ElementType; className: string }
> = {
  OPEN: { label: "Open", icon: AlertCircle, className: "text-muted-foreground" },
  IN_PROGRESS: { label: "In Progress", icon: Clock, className: "text-blue-600" },
  COMPLETED: { label: "Completed", icon: CheckCircle2, className: "text-green-600" },
  DISMISSED: { label: "Dismissed", icon: XCircle, className: "text-muted-foreground" },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// ── Status Transition Buttons ─────────────────────────────────────────────────

function WorkflowButtons({
  rec,
  onUpdate,
}: {
  rec: RecommendationItem;
  onUpdate: (id: string, status: RecStatus) => void;
}) {
  const [loading, setLoading] = useState(false);

  const act = async (status: RecStatus) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/recommendations/${rec.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        const data = await res.json();
        toast({ title: "Update failed", description: data.error, variant: "destructive" });
        return;
      }
      onUpdate(rec.id, status);
    } catch {
      toast({ title: "Update failed", description: "Unexpected error.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />;
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {rec.status !== "IN_PROGRESS" && rec.status !== "COMPLETED" && rec.status !== "DISMISSED" && (
        <Button
          variant="outline"
          size="sm"
          className="text-[10px] h-7 border-blue-200 text-blue-700 hover:bg-blue-50"
          onClick={() => act("IN_PROGRESS")}
        >
          <Clock className="w-3 h-3 mr-1" /> Start
        </Button>
      )}
      {rec.status !== "COMPLETED" && rec.status !== "DISMISSED" && (
        <Button
          variant="outline"
          size="sm"
          className="text-[10px] h-7 border-green-200 text-green-700 hover:bg-green-50"
          onClick={() => act("COMPLETED")}
        >
          <CheckCircle2 className="w-3 h-3 mr-1" /> Complete
        </Button>
      )}
      {rec.status === "COMPLETED" && (
        <Button
          variant="outline"
          size="sm"
          className="text-[10px] h-7 border-muted text-muted-foreground hover:bg-muted/50"
          onClick={() => act("OPEN")}
        >
          Reopen
        </Button>
      )}
      {rec.status !== "DISMISSED" && rec.status !== "COMPLETED" && (
        <Button
          variant="ghost"
          size="sm"
          className="text-[10px] h-7 text-muted-foreground hover:text-destructive"
          onClick={() => act("DISMISSED")}
        >
          Dismiss
        </Button>
      )}
      {rec.status === "DISMISSED" && (
        <Button
          variant="outline"
          size="sm"
          className="text-[10px] h-7"
          onClick={() => act("OPEN")}
        >
          Reopen
        </Button>
      )}
    </div>
  );
}

// ── Recommendation Card ───────────────────────────────────────────────────────

function RecCard({
  rec,
  onUpdate,
}: {
  rec: RecommendationItem;
  onUpdate: (id: string, status: RecStatus) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [justCompleted, setJustCompleted] = useState(false);
  const StatusIcon = STATUS_META[rec.status].icon;

  const handleUpdate = (id: string, status: RecStatus) => {
    if (status === "COMPLETED") {
      setJustCompleted(true);
      // Clear the celebration message after 4 seconds
      setTimeout(() => setJustCompleted(false), 4000);
    }
    onUpdate(id, status);
  };

  return (
    <Card
      className={cn(
        "border transition-all",
        rec.status === "COMPLETED" && !justCompleted && "opacity-60",
        rec.status === "DISMISSED" && "opacity-40",
        justCompleted && "border-green-300 bg-green-50/30",
      )}
    >
      <CardContent className="p-0">
        {/* Completion follow-through message */}
        {justCompleted && (
          <div className="flex items-center gap-2 px-4 py-2.5 bg-green-50 border-b border-green-200">
            <Sparkles className="w-3.5 h-3.5 text-green-600 shrink-0" />
            <p className="text-xs font-medium text-green-700">
              Nice work — recommendation marked complete. Keep going to improve your AI visibility score.
            </p>
            <Link
              href="/recommendations?status=IN_PROGRESS"
              className="text-[10px] font-bold text-green-700 hover:underline ml-auto shrink-0 inline-flex items-center gap-0.5"
            >
              Continue <ArrowRight className="w-2.5 h-2.5" />
            </Link>
          </div>
        )}

        {/* Header row */}
        <div className="flex items-start gap-3 p-4">
          <div className="flex flex-col items-center gap-1 pt-0.5 shrink-0">
            <StatusIcon className={cn("w-4 h-4", STATUS_META[rec.status].className)} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <Badge
                variant="outline"
                className={cn("text-[9px] uppercase font-bold h-4 px-1.5", PRIORITY_COLORS[rec.priority])}
              >
                {rec.priority}
              </Badge>
              <Badge variant="outline" className="text-[9px] h-4 px-1.5 text-muted-foreground">
                {rec.category}
              </Badge>
              <span className="text-[10px] text-muted-foreground ml-auto shrink-0">
                {rec.business_name} · {formatDate(rec.scan_created_at)}
              </span>
            </div>
            <p className="text-sm font-semibold text-primary leading-snug">{rec.title}</p>
          </div>
          <button
            onClick={() => setExpanded((e) => !e)}
            className="text-muted-foreground hover:text-primary shrink-0 mt-0.5"
            aria-label="Toggle details"
          >
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>

        {/* Expanded body */}
        {expanded && (
          <div className="px-4 pb-4 pt-0 space-y-3 border-t bg-muted/20">
            <div className="pt-3 space-y-1">
              <div className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest">Why this matters</div>
              <p className="text-xs text-muted-foreground leading-relaxed">{rec.reason}</p>
            </div>
            <div className="space-y-1">
              <div className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest">Recommended action</div>
              <p className="text-xs text-primary font-medium leading-relaxed">{rec.recommended_action}</p>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              <WorkflowButtons rec={rec} onUpdate={handleUpdate} />
              {rec.service_link || process.env.NEXT_PUBLIC_VIZAI_SERVICES_URL ? (
                <a
                  href={rec.service_link ?? process.env.NEXT_PUBLIC_VIZAI_SERVICES_URL ?? "/services"}
                  className="text-[10px] font-bold text-accent hover:underline inline-flex items-center gap-1"
                >
                  Let VizAI fix this <ArrowRight className="w-2.5 h-2.5" />
                </a>
              ) : null}
            </div>
            {/* Scan evidence link */}
            <div className="flex items-center justify-between pt-1 border-t">
              <Link
                href={`/scans/results/${rec.perception_scan_id}`}
                className="text-[10px] text-muted-foreground hover:text-primary inline-flex items-center gap-1 transition-colors"
              >
                <ExternalLink className="w-2.5 h-2.5" />
                View scan evidence
              </Link>
              {/* Timestamps */}
              <div className="text-[9px] text-muted-foreground flex gap-3">
                {rec.in_progress_at && <span>Started {formatDate(rec.in_progress_at)}</span>}
                {rec.completed_at && <span>Completed {formatDate(rec.completed_at)}</span>}
                {rec.dismissed_at && <span>Dismissed {formatDate(rec.dismissed_at)}</span>}
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function RecommendationsPage() {
  const { userProfile } = useAuth();
  const searchParams = useSearchParams();
  const [recs, setRecs] = useState<RecommendationItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Initialise tab from ?status= URL param (dashboard links use this)
  const initialStatus = (searchParams.get("status") ?? "ALL") as RecStatus | "ALL";
  const [activeTab, setActiveTab] = useState<RecStatus | "ALL">(initialStatus);

  // ?scanId= filter — show only recs from a specific scan (from scan results guidance bar)
  const scanIdFilter = searchParams.get("scanId");
  // ?priority= filter — show only specific priority (from dashboard open actions)
  const priorityFilter = searchParams.get("priority");

  useEffect(() => {
    const params = new URLSearchParams();
    if (scanIdFilter) params.set("scanId", scanIdFilter);
    fetch(`/api/recommendations?${params.toString()}`)
      .then((r) => r.json())
      .then((data) => {
        if (!data.error) {
          let items: RecommendationItem[] = data.recommendations ?? [];
          // Apply priority filter client-side (avoids extra API param complexity)
          if (priorityFilter) {
            items = items.filter((r) => r.priority === priorityFilter.toUpperCase());
          }
          setRecs(items);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [scanIdFilter, priorityFilter]);

  const handleUpdate = (id: string, status: RecStatus) => {
    setRecs((prev) =>
      prev.map((r) =>
        r.id === id
          ? {
              ...r,
              status,
              in_progress_at: status === "IN_PROGRESS" ? new Date().toISOString() : r.in_progress_at,
              completed_at: status === "COMPLETED" ? new Date().toISOString() : r.completed_at,
              dismissed_at: status === "DISMISSED" ? new Date().toISOString() : r.dismissed_at,
            }
          : r,
      ),
    );
  };

  const filtered = useMemo(
    () => (activeTab === "ALL" ? recs : recs.filter((r) => r.status === activeTab)),
    [recs, activeTab],
  );

  // Counts per tab
  const counts = useMemo(() => {
    const c: Record<string, number> = { ALL: recs.length };
    for (const s of ["OPEN", "IN_PROGRESS", "COMPLETED", "DISMISSED"] as RecStatus[]) {
      c[s] = recs.filter((r) => r.status === s).length;
    }
    return c;
  }, [recs]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <Loader2 className="w-10 h-10 text-primary animate-spin" />
        <p className="text-muted-foreground text-sm font-medium">Loading recommendations…</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-20">
      {/* ── Header ── */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="space-y-1">
          <h2 className="text-3xl font-bold text-primary flex items-center gap-3">
            <Lightbulb className="w-7 h-7 text-accent" />
            Recommendations
          </h2>
          <p className="text-muted-foreground text-sm">
            Track, action, and close recommendations from your scans.
          </p>
        </div>
        {userProfile?.role === "admin" && (
          <Link href="/scans/new">
            <Button className="gap-2" size="sm">
              <Zap className="w-3.5 h-3.5" /> New Scan
            </Button>
          </Link>
        )}
      </div>

      {/* ── Active filter context banner ── */}
      {(scanIdFilter || priorityFilter) && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-blue-50 border border-blue-200 text-xs text-blue-700">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          <span>
            {scanIdFilter
              ? `Showing recommendations from scan ${scanIdFilter.slice(0, 8).toUpperCase()}.`
              : `Filtered to ${priorityFilter} priority recommendations.`}
          </span>
          <Link href="/recommendations" className="ml-auto font-bold underline hover:no-underline shrink-0">
            Clear filter
          </Link>
        </div>
      )}

      {/* ── Summary strip ── */}
      {recs.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {(["OPEN", "IN_PROGRESS", "COMPLETED", "DISMISSED"] as RecStatus[]).map((s) => {
            const meta = STATUS_META[s];
            const Icon = meta.icon;
            return (
              <button
                key={s}
                onClick={() => setActiveTab(s)}
                className={cn(
                  "flex items-center gap-2 p-3 rounded-lg border text-left transition-all",
                  activeTab === s
                    ? "bg-primary text-white border-primary shadow-sm"
                    : "bg-white hover:border-primary/30",
                )}
              >
                <Icon className={cn("w-4 h-4 shrink-0", activeTab === s ? "text-white" : meta.className)} />
                <div>
                  <div className={cn("text-[10px] font-bold uppercase tracking-widest", activeTab === s ? "text-white/70" : "text-muted-foreground")}>
                    {meta.label}
                  </div>
                  <div className={cn("text-xl font-black", activeTab === s ? "text-white" : "text-primary")}>
                    {counts[s]}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* ── Tab bar ── */}
      {recs.length > 0 && (
        <div className="flex gap-1 border-b pb-0">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.value}
              onClick={() => setActiveTab(tab.value)}
              className={cn(
                "px-3 py-2 text-xs font-bold uppercase tracking-widest border-b-2 transition-colors",
                activeTab === tab.value
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-primary",
              )}
            >
              {tab.label}
              {counts[tab.value] != null && (
                <span className="ml-1.5 text-[9px] text-muted-foreground">
                  ({counts[tab.value]})
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* ── Empty state ── */}
      {recs.length === 0 && (
        <Card className="border-dashed border-2 py-20 text-center space-y-4 bg-muted/10">
          <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto">
            <Target className="w-8 h-8 text-muted-foreground/40" />
          </div>
          <div className="space-y-1 max-w-sm mx-auto px-6">
            <h3 className="text-lg font-bold text-primary">No recommendations yet</h3>
            <p className="text-sm text-muted-foreground">
              {userProfile?.role === "admin"
                ? "Run a scan to generate recommendations."
                : "No recommendations available yet."}
            </p>
          </div>
          {userProfile?.role === "admin" && (
            <Link href="/scans/new">
              <Button size="sm" className="gap-2">
                <Zap className="w-3.5 h-3.5" /> New Scan
              </Button>
            </Link>
          )}
        </Card>
      )}

      {/* ── Filtered empty ── */}
      {recs.length > 0 && filtered.length === 0 && (
        <Card className="py-10 text-center border-dashed">
          <p className="text-sm text-muted-foreground">
            No {activeTab.toLowerCase().replace("_", " ")} recommendations.
          </p>
        </Card>
      )}

      {/* ── Recommendation list ── */}
      <div className="space-y-3">
        {filtered.map((rec) => (
          <RecCard key={rec.id} rec={rec} onUpdate={handleUpdate} />
        ))}
      </div>

      {/* ── Footer CTA ── */}
      {recs.length > 0 && (
        <Card className="border-none bg-muted/30">
          <CardContent className="pt-4 pb-4 flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-xs text-muted-foreground leading-relaxed">
              Need help implementing recommendations? Our team can deploy these improvements for you.
            </p>
            <a href={process.env.NEXT_PUBLIC_VIZAI_SERVICES_URL ?? "/services"}>
              <Button variant="outline" size="sm" className="gap-2 shrink-0">
                <ArrowRight className="w-3.5 h-3.5" /> Explore VizAI Services
              </Button>
            </a>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
