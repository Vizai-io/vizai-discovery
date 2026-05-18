"use client";

/**
 * @fileOverview WorkflowContinuity
 *
 * "Continue where you left off" — a compact strip of open operational threads.
 *
 * Renders ContinuityItem[] from OperationalCohesionService.getState():
 *  - in_progress_recs   — recs the user started (≤30 days, freshness enforced)
 *  - open_high_priority — unresolved HIGH items from latest scan
 *  - unread_critical    — unread CRITICAL notifications (billing etc.)
 *
 * Renders nothing if continuity_items is empty (no visual noise when org is clean).
 */

import Link from "next/link";
import { ClipboardList, TriangleAlert, BellDot, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ContinuityItem } from "@/lib/services/operational-cohesion.service";

// ── Item config ────────────────────────────────────────────────────────────────

const ITEM_CONFIG = {
  in_progress_recs: {
    icon: ClipboardList,
    colorClass: "text-blue-500",
    bgClass: "bg-blue-50",
  },
  open_high_priority: {
    icon: TriangleAlert,
    colorClass: "text-amber-500",
    bgClass: "bg-amber-50",
  },
  unread_critical: {
    icon: BellDot,
    colorClass: "text-red-500",
    bgClass: "bg-red-50",
  },
} as const;

// ── Skeleton ───────────────────────────────────────────────────────────────────

export function WorkflowContinuitySkeleton() {
  return (
    <div className="flex items-center gap-2 animate-pulse">
      {[1, 2].map((i) => (
        <div key={i} className="h-8 w-48 bg-muted rounded-md" />
      ))}
    </div>
  );
}

// ── Component ──────────────────────────────────────────────────────────────────

type Props = {
  items: ContinuityItem[];
};

export function WorkflowContinuity({ items }: Props) {
  if (!items || items.length === 0) return null;

  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
        Continue where you left off
      </p>
      <div className="flex flex-wrap gap-2">
        {items.map((item) => {
          const config = ITEM_CONFIG[item.type];
          if (!config) return null;
          const Icon = config.icon;

          return (
            <Link
              key={item.type}
              href={item.href}
              className={cn(
                "inline-flex items-center gap-2 text-xs font-medium px-3 py-1.5 rounded-md border border-border bg-card hover:bg-accent transition-colors",
              )}
            >
              <span className={cn("flex items-center justify-center w-5 h-5 rounded", config.bgClass)}>
                <Icon className={cn("w-3 h-3", config.colorClass)} />
              </span>
              <span className="text-foreground">{item.label}</span>
              <ArrowRight className="w-3 h-3 text-muted-foreground" />
            </Link>
          );
        })}
      </div>
    </div>
  );
}
