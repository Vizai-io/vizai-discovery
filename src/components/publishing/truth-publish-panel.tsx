"use client";

/**
 * @fileOverview TruthPublishPanel
 *
 * Human-governed canonical truth publishing review panel.
 * Integrated into the /monitoring page as a collapsible ADMIN-only section.
 *
 * Refinement 4: simple workflow — review in this panel IS the review process.
 *   DRAFT → user reviews → user confirms → PUBLISHED
 *
 * Refinement 6: GitHub failure explained calmly.
 *   "Your canonical truth was published. GitHub sync had an issue and can be retried."
 *
 * Refinement 8 & 11: human governance.
 *   Explicit confirm button. No auto-publish. Diff shown before confirmation.
 *
 * Refinement 10: calm, minimal UX. Progressive disclosure.
 *   Panel collapsed by default. Expands to show canonical truth + drift + confirm.
 *
 * What this panel answers for the user:
 *   - What will be published? (canonical truth snapshot)
 *   - Has anything changed since the last publish? (up-to-date status)
 *   - What is the current drift level? (operational context)
 *   - What happens after I confirm? (explained below confirm button)
 */

import { useState, useEffect, useCallback } from "react";
import {
  BookOpen,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  Clock,
  Download,
  RefreshCw,
  Send,
  AlertCircle,
  Github,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import type { DriftLevel } from "@/lib/services/perception-drift.service";

// ── Types (matches /api/canonical-truth response) ─────────────────────────────

type CanonicalBusiness = {
  name: string;
  website: string | null;
  description: string | null;
  business_type: string | null;
  services: string[];
  locations: string[];
  industries: string[];
  differentiators: string[];
  customer_types: string[];
};

type DraftInfo = {
  record_id: string;
  version: number;
  up_to_date: boolean;
  payload_hash: string;
  last_published_at: string | null;
  last_published_version: number | null;
};

type PublishingState = {
  canonical: {
    organization_id: string;
    profile_id: string;
    business_name: string;
    business: CanonicalBusiness;
  } | null;
  draft: DraftInfo | null;
  drift: { level: DriftLevel; summary: string } | null;
  history: Array<{ id: string; version: number; status: string; published_at: string | null }>;
};

// ── Sub-components ────────────────────────────────────────────────────────────

function Field({ label, value }: { label: string; value: string[] | string | null }) {
  if (!value || (Array.isArray(value) && value.length === 0)) return null;
  const items = Array.isArray(value) ? value : [value];
  return (
    <div>
      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">
        {label}
      </p>
      {items.map((item, i) => (
        <p key={i} className="text-xs text-foreground/80 leading-relaxed">
          {items.length > 1 ? `• ${item}` : item}
        </p>
      ))}
    </div>
  );
}

function DriftBadge({ level }: { level: DriftLevel | null }) {
  if (!level || level === "NONE") {
    return (
      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-green-50 text-green-700 border border-green-200">
        No drift detected
      </span>
    );
  }
  const cls =
    level === "CRITICAL"
      ? "bg-red-50 text-red-700 border-red-200"
      : level === "HIGH"
        ? "bg-amber-50 text-amber-700 border-amber-200"
        : level === "MODERATE"
          ? "bg-blue-50 text-blue-700 border-blue-200"
          : "bg-muted text-muted-foreground border-border";
  return (
    <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full border", cls)}>
      {level.charAt(0) + level.slice(1).toLowerCase()} drift
    </span>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export function TruthPublishPanel() {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<PublishingState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishResult, setPublishResult] = useState<{
    success: boolean;
    version?: number;
    githubNote?: string;
  } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch("/api/canonical-truth");
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setLoadError(data.error || `Request failed (${res.status})`);
        return;
      }
      const data = await res.json();
      setState(data);
    } catch (e: any) {
      setLoadError(e.message || "Failed to load publishing state");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open && !state) load();
  }, [open, state, load]);

  const handlePublish = async () => {
    if (!state?.draft) return;
    setPublishing(true);
    setPublishResult(null);
    try {
      const res = await fetch(`/api/canonical-truth/${state.draft.record_id}/publish`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: "Publish failed", description: data.error, variant: "destructive" });
        return;
      }
      setPublishResult({
        success: true,
        version: data.version,
        githubNote: data.github?.note,
      });
      toast({ title: "Published", description: `Canonical truth version ${data.version} published.` });
      // Reload state to reflect the new PUBLISHED record
      await load();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setPublishing(false);
    }
  };

  const handleDownload = async (format: "json" | "markdown") => {
    const res = await fetch(`/api/canonical-truth/export?format=${format}`);
    if (!res.ok) {
      toast({ title: "Export failed", description: "Could not generate export.", variant: "destructive" });
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = format === "markdown" ? "canonical-truth.md" : "canonical-truth.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  const business = state?.canonical?.business;
  const draft = state?.draft;
  const drift = state?.drift;

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      {/* Collapsed header */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2.5 w-full text-left px-5 py-4 hover:bg-muted/30 transition-colors group"
        aria-expanded={open}
      >
        <BookOpen className="w-4 h-4 text-muted-foreground shrink-0" />
        <div className="flex-1">
          <p className="text-sm font-semibold text-foreground">Canonical Truth Publishing</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {draft?.up_to_date
              ? "Up to date with last publish"
              : draft?.last_published_at
                ? "Changes ready to publish"
                : "Never published — review and publish to establish baseline"}
          </p>
        </div>
        {draft && (
          <DriftBadge level={drift?.level ?? null} />
        )}
        {open
          ? <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" />
          : <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
        }
      </button>

      {/* Expanded body */}
      {open && (
        <div className="border-t border-border px-5 py-5 space-y-6">
          {loading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              Loading canonical truth…
            </div>
          )}

          {loadError && (
            <div className="flex items-start gap-2 text-sm text-red-600">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              {loadError}
            </div>
          )}

          {state && business && (
            <>
              {/* Status row */}
              <div className="flex flex-wrap items-center gap-3">
                {draft?.up_to_date ? (
                  <div className="flex items-center gap-1.5 text-xs text-green-600">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Up to date — no changes since last publish
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 text-xs text-amber-600">
                    <Clock className="w-3.5 h-3.5" />
                    {draft?.last_published_at
                      ? `Changes since last publish (version ${draft.last_published_version})`
                      : "Not yet published — establish your baseline now"}
                  </div>
                )}
                {drift?.level && drift.level !== "NONE" && (
                  <DriftBadge level={drift.level} />
                )}
              </div>

              {/* Canonical truth preview — what will publish */}
              <div>
                <p className="text-xs font-semibold text-foreground/70 mb-3">
                  What will publish
                </p>
                <div className="rounded-md border border-border bg-muted/20 p-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field label="Business name" value={business.name} />
                  <Field label="Business type" value={business.business_type} />
                  <Field label="Website" value={business.website} />
                  {business.description && (
                    <div className="sm:col-span-2">
                      <Field label="Description" value={business.description} />
                    </div>
                  )}
                  <Field label="Services" value={business.services} />
                  <Field label="Locations" value={business.locations} />
                  <Field label="Industries" value={business.industries} />
                  <Field label="Differentiators" value={business.differentiators} />
                  <Field label="Customer types" value={business.customer_types} />
                </div>
              </div>

              {/* GitHub sync note */}
              {publishResult?.githubNote && (
                <div className="flex items-start gap-2 text-xs text-muted-foreground bg-muted/30 border border-border rounded-md px-3 py-2.5">
                  <Github className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  {publishResult.githubNote}
                </div>
              )}

              {/* Actions row */}
              <div className="flex flex-wrap items-center gap-3 pt-1 border-t border-border">
                {/* Confirm publish button */}
                {!draft?.up_to_date ? (
                  <Button
                    size="sm"
                    onClick={handlePublish}
                    disabled={publishing || !draft}
                    className="gap-1.5 text-xs"
                  >
                    {publishing ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Send className="w-3.5 h-3.5" />
                    )}
                    {publishing ? "Publishing…" : "Confirm & Publish"}
                  </Button>
                ) : (
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
                    Already published — no new changes to confirm
                  </div>
                )}

                {/* Export buttons */}
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 text-xs"
                  onClick={() => handleDownload("json")}
                >
                  <Download className="w-3.5 h-3.5" />
                  Export JSON
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 text-xs"
                  onClick={() => handleDownload("markdown")}
                >
                  <Download className="w-3.5 h-3.5" />
                  Export Markdown
                </Button>
              </div>

              {/* What happens next — visible before confirming */}
              {!draft?.up_to_date && (
                <p className="text-xs text-muted-foreground">
                  Confirming will publish version {draft?.version} of your canonical truth. Your previous
                  published version is preserved in the audit trail. If GitHub is configured, the
                  export will be pushed to your repository automatically.
                </p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
