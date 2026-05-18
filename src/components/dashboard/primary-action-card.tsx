"use client";

/**
 * @fileOverview PrimaryActionCard
 *
 * "What matters most right now" — the single operational focus surface.
 *
 * Renders the primary action from OperationalCohesionService.getState():
 *  - Urgency-colored left border (red=critical, amber=high, blue=medium, muted=low)
 *  - Three structured answers: what happened, why it matters, what to do
 *  - Single CTA button pointing to the appropriate page
 *
 * Props:
 *  - action: PrimaryAction — the deterministic primary action object
 *  - loading?: boolean — skeleton state
 */

import Link from "next/link";
import { ArrowRight, AlertCircle, AlertTriangle, Info, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PrimaryAction } from "@/lib/services/operational-cohesion.service";

// ── Urgency config ─────────────────────────────────────────────────────────────

const URGENCY_CONFIG = {
  critical: {
    border: "border-l-red-500",
    icon: AlertCircle,
    iconClass: "text-red-500",
    badge: "bg-red-50 text-red-700 border border-red-200",
    label: "Critical",
  },
  high: {
    border: "border-l-amber-500",
    icon: AlertTriangle,
    iconClass: "text-amber-500",
    badge: "bg-amber-50 text-amber-700 border border-amber-200",
    label: "High Priority",
  },
  medium: {
    border: "border-l-blue-500",
    icon: Info,
    iconClass: "text-blue-500",
    badge: "bg-blue-50 text-blue-700 border border-blue-200",
    label: "Action Needed",
  },
  low: {
    border: "border-l-muted-foreground/30",
    icon: CheckCircle2,
    iconClass: "text-muted-foreground",
    badge: "bg-muted text-muted-foreground border border-border",
    label: "Low",
  },
} as const;

// ── Skeleton ───────────────────────────────────────────────────────────────────

function PrimaryActionCardSkeleton() {
  return (
    <div className="rounded-lg border border-border bg-card border-l-4 border-l-muted p-5 animate-pulse">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 space-y-3">
          <div className="h-4 w-24 bg-muted rounded" />
          <div className="h-5 w-64 bg-muted rounded" />
          <div className="space-y-2 pt-1">
            <div className="h-3 w-full bg-muted rounded" />
            <div className="h-3 w-5/6 bg-muted rounded" />
            <div className="h-3 w-4/6 bg-muted rounded" />
          </div>
        </div>
        <div className="h-9 w-32 bg-muted rounded shrink-0" />
      </div>
    </div>
  );
}

// ── Component ──────────────────────────────────────────────────────────────────

type Props = {
  action: PrimaryAction;
  loading?: boolean;
};

export function PrimaryActionCard({ action, loading }: Props) {
  if (loading || !action) return <PrimaryActionCardSkeleton />;

  const config = URGENCY_CONFIG[action.urgency];
  if (!config) return <PrimaryActionCardSkeleton />;
  const Icon = config.icon;

  return (
    <div
      className={cn(
        "rounded-lg border border-border bg-card border-l-4 p-5 transition-shadow hover:shadow-sm",
        config.border,
      )}
    >
      <div className="flex items-start justify-between gap-4">
        {/* Left content */}
        <div className="flex-1 min-w-0">
          {/* Urgency badge */}
          <div className="flex items-center gap-2 mb-2">
            <Icon className={cn("w-3.5 h-3.5 shrink-0", config.iconClass)} />
            <span className={cn("text-xs font-medium px-2 py-0.5 rounded-full", config.badge)}>
              {config.label}
            </span>
          </div>

          {/* Title */}
          <h3 className="text-sm font-semibold text-foreground leading-snug mb-3">
            {action.title}
          </h3>

          {/* Structured three-part guidance */}
          <div className="space-y-1.5 text-xs text-muted-foreground">
            <p>
              <span className="font-medium text-foreground/80">What: </span>
              {action.what_happened}
            </p>
            <p>
              <span className="font-medium text-foreground/80">Why: </span>
              {action.why_it_matters}
            </p>
            <p>
              <span className="font-medium text-foreground/80">Next: </span>
              {action.what_to_do}
            </p>
          </div>
        </div>

        {/* CTA button — suppressed when href is empty (e.g. await_first_scan) */}
        {action.href && action.cta_label && (
          <Link
            href={action.href}
            className={cn(
              "inline-flex items-center gap-1.5 shrink-0 text-xs font-medium px-3.5 py-2 rounded-md transition-colors whitespace-nowrap",
              action.urgency === "critical"
                ? "bg-red-500 text-white hover:bg-red-600"
                : action.urgency === "high"
                  ? "bg-amber-500 text-white hover:bg-amber-600"
                  : "bg-primary text-primary-foreground hover:bg-primary/90",
            )}
          >
            {action.cta_label}
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        )}
      </div>
    </div>
  );
}
