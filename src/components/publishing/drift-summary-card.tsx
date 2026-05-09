"use client";

/**
 * @fileOverview DriftSummaryCard
 *
 * Calm, operational drift summary integrated into the dashboard.
 * Shown only when drift is MODERATE or higher — NONE and LOW are not surfaced.
 *
 * Refinement 3: calm UX. No "catastrophic failure" language. No SEO panic.
 * Every item answers: What / Why / Action.
 *
 * Refinement 7: drift is part of workflow continuity, not a standalone dashboard.
 * This card integrates into existing dashboard zones — never a separate page.
 *
 * Refinement 10: progressive disclosure. Signals are collapsed by default;
 * user expands the card to see detail. Signal count shown in collapsed state.
 *
 * Props:
 *  - level: DriftLevel — current drift classification
 *  - signals: DriftSignal[] — individual drift signals (may be empty)
 *  - summary: string — one-sentence summary
 *  - recommended_action: string — the single most important next step
 *  - loading?: boolean
 */

import { useState } from "react";
import { ChevronDown, ChevronUp, TrendingDown, AlertTriangle, AlertCircle, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import Link from "next/link";
import type { DriftLevel, DriftSignal } from "@/lib/services/perception-drift.service";

// ── Level config ───────────────────────────────────────────────────────────────

type LevelConfig = {
  icon: React.ElementType;
  iconClass: string;
  borderClass: string;
  bgClass: string;
  badgeClass: string;
  label: string;
};

const LEVEL_CONFIG: Record<"MODERATE" | "HIGH" | "CRITICAL", LevelConfig> = {
  MODERATE: {
    icon: TrendingDown,
    iconClass: "text-blue-500",
    borderClass: "border-l-blue-400",
    bgClass: "bg-blue-50/50",
    badgeClass: "bg-blue-50 text-blue-700 border border-blue-200",
    label: "Moderate Drift",
  },
  HIGH: {
    icon: AlertTriangle,
    iconClass: "text-amber-500",
    borderClass: "border-l-amber-500",
    bgClass: "bg-amber-50/50",
    badgeClass: "bg-amber-50 text-amber-700 border border-amber-200",
    label: "Significant Drift",
  },
  CRITICAL: {
    icon: AlertCircle,
    iconClass: "text-red-500",
    borderClass: "border-l-red-500",
    bgClass: "bg-red-50/50",
    badgeClass: "bg-red-50 text-red-700 border border-red-200",
    label: "Critical Drift",
  },
};

// ── Severity badge ─────────────────────────────────────────────────────────────

function SeverityBadge({ severity }: { severity: DriftSignal["severity"] }) {
  const cls =
    severity === "CRITICAL"
      ? "bg-red-50 text-red-600 border border-red-200"
      : severity === "HIGH"
        ? "bg-amber-50 text-amber-700 border border-amber-200"
        : severity === "MODERATE"
          ? "bg-blue-50 text-blue-600 border border-blue-200"
          : "bg-muted text-muted-foreground border border-border";
  return (
    <span className={cn("text-[10px] font-semibold px-1.5 py-0.5 rounded uppercase tracking-wide", cls)}>
      {severity}
    </span>
  );
}

// ── Signal row ────────────────────────────────────────────────────────────────

function SignalRow({ signal }: { signal: DriftSignal }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border-b last:border-b-0 py-2.5 px-1">
      <button
        onClick={() => setExpanded((e) => !e)}
        className="w-full text-left flex items-start gap-2 group"
        aria-expanded={expanded}
      >
        <SeverityBadge severity={signal.severity} />
        <span className="text-xs text-foreground/80 flex-1 leading-snug pt-0.5">
          {signal.what}
        </span>
        {expanded
          ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />
          : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />
        }
      </button>

      {expanded && (
        <div className="mt-2 ml-[3.5rem] space-y-1.5 text-xs text-muted-foreground">
          <p>
            <span className="font-medium text-foreground/70">Why it matters: </span>
            {signal.why}
          </p>
          <p>
            <span className="font-medium text-foreground/70">Impact: </span>
            {signal.impact}
          </p>
          <p>
            <span className="font-medium text-foreground/70">Action: </span>
            {signal.action}
          </p>
          {signal.affectedItems.length > 0 && (
            <div className="flex flex-wrap gap-1 pt-0.5">
              {signal.affectedItems.map((item, i) => (
                <span
                  key={i}
                  className="text-[10px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground border border-border"
                >
                  {item}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function DriftSummaryCardSkeleton() {
  return (
    <div className="rounded-lg border border-border border-l-4 border-l-muted p-4 animate-pulse">
      <div className="flex items-center gap-2 mb-3">
        <div className="h-3.5 w-3.5 bg-muted rounded-full" />
        <div className="h-4 w-32 bg-muted rounded" />
      </div>
      <div className="h-3 w-full bg-muted rounded mb-2" />
      <div className="h-3 w-4/5 bg-muted rounded" />
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

type Props = {
  level: DriftLevel;
  signals: DriftSignal[];
  summary: string;
  recommended_action: string;
  loading?: boolean;
};

export function DriftSummaryCard({ level, signals, summary, recommended_action, loading }: Props) {
  const [expanded, setExpanded] = useState(false);

  if (loading) return <DriftSummaryCardSkeleton />;

  // Only render for MODERATE and above (refinement 7 — no noise for LOW/NONE)
  if (level === "NONE" || level === "LOW") return null;

  const cfg = LEVEL_CONFIG[level as "MODERATE" | "HIGH" | "CRITICAL"];
  const Icon = cfg.icon;
  const signalCount = signals.length;

  return (
    <div
      className={cn(
        "rounded-lg border border-border border-l-4 p-4 transition-shadow hover:shadow-sm",
        cfg.borderClass,
        cfg.bgClass,
      )}
    >
      {/* Header row */}
      <button
        onClick={() => setExpanded((e) => !e)}
        className="w-full text-left flex items-center gap-2 group"
        aria-expanded={expanded}
      >
        <Icon className={cn("w-3.5 h-3.5 shrink-0", cfg.iconClass)} />
        <span className={cn("text-xs font-semibold px-2 py-0.5 rounded-full", cfg.badgeClass)}>
          {cfg.label}
        </span>
        <span className="text-xs text-muted-foreground flex-1 line-clamp-1 ml-1">
          {expanded ? "" : summary}
        </span>
        {signalCount > 0 && !expanded && (
          <span className="text-xs text-muted-foreground shrink-0">
            {signalCount} signal{signalCount > 1 ? "s" : ""}
          </span>
        )}
        {expanded
          ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        }
      </button>

      {/* Expanded body */}
      {expanded && (
        <div className="mt-3 space-y-3">
          {/* Summary + recommended action */}
          <div className="space-y-1 text-xs text-muted-foreground">
            <p>{summary}</p>
            <p className="font-medium text-foreground/80">
              <span className="text-muted-foreground font-normal">Recommended: </span>
              {recommended_action}
            </p>
          </div>

          {/* Signals list */}
          {signalCount > 0 && (
            <div className="border rounded-md overflow-hidden bg-card">
              {signals.map((signal, i) => (
                <SignalRow key={i} signal={signal} />
              ))}
            </div>
          )}

          {/* CTA */}
          <Link
            href="/monitoring"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:text-primary/80 transition-colors"
          >
            Review publishing
            <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
      )}
    </div>
  );
}
