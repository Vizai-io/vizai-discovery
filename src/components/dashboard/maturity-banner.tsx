"use client";

/**
 * @fileOverview MaturityBanner
 *
 * Contextual maturity guidance — explains the org's current operational stage.
 * Adapts its own visibility based on maturity: prominent → compact → pill → hidden.
 *
 * Answers for the user:
 *   - Why am I seeing this?   (reason — current operational state)
 *   - What does it mean?      (state label + description)
 *   - What should I do next?  (next_milestone — specific next step)
 *
 * Rendering by maturity state:
 *   SETUP:      Full-width, prominent, non-dismissible — user needs this guidance
 *   ACTIVE:     Compact, collapsible — helpful but not critical
 *   OPTIMIZING: Minimal inline pill — informational only, low visual weight
 *   MATURE:     Hidden entirely — clean orgs don't need operational stage noise
 *
 * Design principles:
 *   - Never more prominent than the PrimaryActionCard
 *   - Never demands action (the PrimaryActionCard does that)
 *   - Shrinks as maturity grows — operational confidence increases, less scaffolding needed
 */

import { useState } from "react";
import { ChevronDown, ChevronUp, Zap, TrendingUp, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { OrgMaturity } from "@/lib/services/operational-maturity.service";

// ── Maturity config ────────────────────────────────────────────────────────────

type MaturityCfg = {
  label: string;
  icon: React.ElementType;
  bg: string;
  border: string;
  iconClass: string;
  labelClass: string;
};

const MATURITY_CFG: Record<OrgMaturity, MaturityCfg> = {
  SETUP: {
    label: "Getting Started",
    icon: AlertCircle,
    bg: "bg-blue-50",
    border: "border-blue-200",
    iconClass: "text-blue-500",
    labelClass: "text-blue-800",
  },
  ACTIVE: {
    label: "Active Monitoring",
    icon: Zap,
    bg: "bg-green-50",
    border: "border-green-200",
    iconClass: "text-green-600",
    labelClass: "text-green-800",
  },
  OPTIMIZING: {
    label: "Optimizing",
    icon: TrendingUp,
    bg: "bg-purple-50",
    border: "border-purple-200",
    iconClass: "text-purple-500",
    labelClass: "text-purple-800",
  },
  // MATURE cfg is never used (component returns null), but satisfies the type.
  MATURE: {
    label: "Mature",
    icon: Zap,
    bg: "bg-muted",
    border: "border-border",
    iconClass: "text-muted-foreground",
    labelClass: "text-foreground",
  },
};

// ── Component ──────────────────────────────────────────────────────────────────

type Props = {
  maturity: OrgMaturity;
  reason: string;
  next_milestone: string;
};

export function MaturityBanner({ maturity, reason, next_milestone }: Props) {
  const [collapsed, setCollapsed] = useState(false);

  // MATURE: hidden — no noise for operationally healthy orgs
  if (maturity === "MATURE") return null;

  const cfg = MATURITY_CFG[maturity];
  if (!cfg) return null; // guard: unexpected maturity value (e.g. API error / unknown state)
  const Icon = cfg.icon;

  // ── OPTIMIZING: minimal inline pill ──────────────────────────────────────────
  // Low visual weight — org is in good shape, just tracking progress
  if (maturity === "OPTIMIZING") {
    return (
      <div
        className={cn(
          "inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs",
          cfg.bg,
          cfg.border,
        )}
      >
        <Icon className={cn("w-3 h-3 shrink-0", cfg.iconClass)} />
        <span className={cn("font-semibold", cfg.labelClass)}>{cfg.label}</span>
        <span className="text-muted-foreground/50">·</span>
        <span className="text-muted-foreground">{next_milestone}</span>
      </div>
    );
  }

  // ── ACTIVE: compact, collapsible ──────────────────────────────────────────────
  // Helpful context, but org is operational — can be collapsed after first read
  if (maturity === "ACTIVE") {
    return (
      <div className={cn("rounded-lg border", cfg.bg, cfg.border)}>
        <button
          onClick={() => setCollapsed((c) => !c)}
          className="flex items-center gap-2.5 w-full text-left px-4 py-2.5 group"
          aria-expanded={!collapsed}
        >
          <Icon className={cn("w-3.5 h-3.5 shrink-0", cfg.iconClass)} />
          <span className={cn("text-xs font-bold flex-1", cfg.labelClass)}>
            {cfg.label}
          </span>
          {collapsed ? (
            <span className="text-xs text-muted-foreground mr-1 truncate max-w-xs">
              {next_milestone}
            </span>
          ) : null}
          {collapsed
            ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            : <ChevronUp className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          }
        </button>
        {!collapsed && (
          <div className="px-4 pb-3 space-y-1">
            <p className="text-xs text-muted-foreground leading-relaxed">{reason}</p>
            <p className="text-xs font-medium text-foreground/80">
              <span className="text-muted-foreground">Next: </span>
              {next_milestone}
            </p>
          </div>
        )}
      </div>
    );
  }

  // ── SETUP: prominent, non-dismissible ─────────────────────────────────────────
  // User genuinely needs this guidance — they're in onboarding stage
  return (
    <div className={cn("rounded-lg border p-4 space-y-2.5", cfg.bg, cfg.border)}>
      <div className="flex items-center gap-2">
        <Icon className={cn("w-4 h-4 shrink-0", cfg.iconClass)} />
        <span className={cn("text-sm font-bold", cfg.labelClass)}>{cfg.label}</span>
      </div>
      <p className="text-xs text-muted-foreground leading-relaxed">{reason}</p>
      <div className="flex items-start gap-1.5 pt-0.5">
        <span className="text-xs font-semibold text-foreground/70 shrink-0 pt-px">Next:</span>
        <p className="text-xs text-foreground/70 leading-relaxed">{next_milestone}</p>
      </div>
    </div>
  );
}
