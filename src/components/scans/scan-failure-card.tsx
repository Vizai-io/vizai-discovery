"use client";

/**
 * @fileOverview ScanFailureCard
 *
 * Calm, structured failure/timeout UX for perception scans.
 *
 * Covers three terminal non-success states:
 *  - FAILED   — scan engine encountered an unrecoverable error
 *  - TIMEOUT  — scan ran past the 30-minute execution window
 *  - PARTIAL  — some models failed, but results are available (NOT a failure)
 *
 * Design principles (refinement 2):
 *  - Calm tone — never alarming
 *  - Structured — What / Impact / Next step / Data safe?
 *  - PARTIAL is framed as useful partial data, not as an error
 *  - Actionable — one clear CTA ("Run a new scan")
 *
 * Props:
 *  - status: "FAILED" | "TIMEOUT" | "PARTIAL"
 *  - errorMessage?: string — optional context from the DB record
 *  - scanId: string — for "View partial results" link when PARTIAL
 *  - businessName?: string
 */

import Link from "next/link";
import {
  AlertCircle,
  Clock,
  CheckCircle2,
  RefreshCw,
  Shield,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ── Status config ──────────────────────────────────────────────────────────────

type FailureStatus = "FAILED" | "TIMEOUT" | "PARTIAL";

type StatusConfig = {
  icon: React.ElementType;
  iconClass: string;
  borderClass: string;
  bgClass: string;
  headline: string;
  what: string;
  impact: string;
  next: string;
  dataSafe: string;
  ctaLabel: string;
  ctaHref: string;
};

const STATUS_CONFIG: Record<FailureStatus, StatusConfig> = {
  TIMEOUT: {
    icon: Clock,
    iconClass: "text-amber-500",
    borderClass: "border-l-amber-500",
    bgClass: "bg-amber-50",
    headline: "Scan timed out",
    what: "This scan ran longer than expected and was automatically stopped.",
    impact: "No results were saved from this scan. Your existing reports are unaffected.",
    next: "Run a fresh scan — it will start immediately and typically completes in under 2 minutes.",
    dataSafe: "All your historical scan data, recommendations, and reports are intact.",
    ctaLabel: "Run a new scan",
    ctaHref: "/scans/new",
  },
  FAILED: {
    icon: AlertCircle,
    iconClass: "text-red-500",
    borderClass: "border-l-red-500",
    bgClass: "bg-red-50",
    headline: "Scan encountered an error",
    what: "An unexpected error occurred while processing this scan.",
    impact: "Results from this scan were not saved. Your other reports are unaffected.",
    next: "Run a fresh scan. If the issue persists, contact your account team.",
    dataSafe: "All your historical scan data, recommendations, and reports are intact.",
    ctaLabel: "Run a new scan",
    ctaHref: "/scans/new",
  },
  PARTIAL: {
    icon: CheckCircle2,
    iconClass: "text-blue-500",
    borderClass: "border-l-blue-500",
    bgClass: "bg-blue-50",
    headline: "Partial results available",
    what: "Most AI models responded successfully. One or more models were unavailable during this scan.",
    impact: "Results are based on the models that responded — they are usable and reliable.",
    next: "Review your results below. Run a new scan when you want a complete multi-model response.",
    dataSafe: "All results that were collected have been saved.",
    ctaLabel: "Run a new scan",
    ctaHref: "/scans/new",
  },
};

// ── Component ──────────────────────────────────────────────────────────────────

type Props = {
  status: FailureStatus;
  errorMessage?: string | null;
  scanId?: string;
  businessName?: string | null;
  /** When true, adds a "View partial results" secondary link below the CTA */
  showPartialLink?: boolean;
};

export function ScanFailureCard({
  status,
  errorMessage,
  scanId,
  businessName,
  showPartialLink,
}: Props) {
  const cfg = STATUS_CONFIG[status];
  const Icon = cfg.icon;

  return (
    <div
      className={cn(
        "rounded-lg border border-border border-l-4 p-6 space-y-5",
        cfg.borderClass,
        cfg.bgClass,
      )}
    >
      {/* Header */}
      <div className="flex items-center gap-3">
        <Icon className={cn("w-5 h-5 shrink-0", cfg.iconClass)} />
        <h3 className="text-base font-semibold text-foreground">
          {cfg.headline}
          {businessName ? ` — ${businessName}` : ""}
        </h3>
      </div>

      {/* Structured four-question guidance */}
      <div className="space-y-2 text-sm text-muted-foreground">
        <p>
          <span className="font-semibold text-foreground/80">What happened: </span>
          {cfg.what}
        </p>
        <p>
          <span className="font-semibold text-foreground/80">Impact: </span>
          {cfg.impact}
        </p>
        <p>
          <span className="font-semibold text-foreground/80">Next step: </span>
          {cfg.next}
        </p>
        <div className="flex items-start gap-1.5 pt-1">
          <Shield className="w-3.5 h-3.5 text-green-500 shrink-0 mt-0.5" />
          <p className="text-xs text-muted-foreground">
            <span className="font-semibold text-foreground/70">Your data is safe: </span>
            {cfg.dataSafe}
          </p>
        </div>
      </div>

      {/* Optional technical detail — shown only when present, de-emphasized */}
      {errorMessage && status !== "PARTIAL" && (
        <p className="text-xs text-muted-foreground/60 border-t pt-3 font-mono leading-relaxed">
          {errorMessage}
        </p>
      )}

      {/* CTA */}
      <div className="flex flex-wrap items-center gap-3 pt-1">
        <Link
          href={cfg.ctaHref}
          className="inline-flex items-center gap-1.5 text-sm font-medium px-4 py-2 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          {cfg.ctaLabel}
        </Link>

        {/* Partial: secondary link to view the results that were captured */}
        {showPartialLink && scanId && (
          <Link
            href={`/scans/results/${scanId}`}
            className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors underline underline-offset-2"
          >
            View partial results
          </Link>
        )}
      </div>
    </div>
  );
}
