"use client";

/**
 * @fileOverview RegistryPublishReviewPanel (WP-19F-UI)
 *
 * Standalone B-lineage operator-review panel for the PUBLIC-REGISTRY candidate:
 *   prepare draft -> operator review -> approve -> persist RegistryProfile READY + TruthPublishRecord DRAFT
 *
 * This is NOT lineage A (`truth-publish-panel.tsx` / canonical-truth) and does not reuse it.
 * It calls the WP-19F-UI routes:
 *   POST /api/truth-canon/[id]/publish/prepare   (read-only)
 *   POST /api/truth-canon/[id]/publish/approve   ({ expectedContentHash })
 *
 * READY/DRAFT is an APP-INTERNAL candidate only — there is no external business-registry publish here.
 * Isolated/ready for later placement; intentionally not wired into any page yet.
 */

import { useState } from "react";
import {
  BookOpenCheck,
  ShieldCheck,
  AlertCircle,
  Loader2,
  CheckCircle2,
  Send,
  Lock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";

type GateResult = { gate: string; status: "PASS" | "FAIL" | "PENDING" | "PREVIEW" | string; detail: string };
type HeldClaim = { name: string; credentialType?: string | null; status?: string | null; reason?: string };

type PrepareResult = {
  warning: string;
  canonVersionId: string;
  profileVersion: number;
  contentHash: string;
  targetRegistryPath: string;
  artifact: Record<string, any>;
  gateResults: GateResult[];
  heldClaimsExcluded: HeldClaim[];
  technicalPass: boolean;
  readyToPublish: boolean;
};

type ApproveResult = {
  registryProfileStatus: string;
  truthPublishStatus: string;
  contentHash: string;
  profileVersion: number;
};

const FALLBACK_WARNING = "This prepares a public registry artifact but does not publish externally.";

function GateRow({ g }: { g: GateResult }) {
  const cls =
    g.status === "PASS"
      ? "text-green-700 bg-green-50 border-green-200"
      : g.status === "FAIL"
        ? "text-red-700 bg-red-50 border-red-200"
        : "text-muted-foreground bg-muted border-border";
  return (
    <div className="flex items-start gap-2 text-xs">
      <span className={cn("font-semibold px-1.5 py-0.5 rounded border shrink-0", cls)}>{g.status}</span>
      <span className="font-medium text-foreground/80">{g.gate}</span>
      <span className="text-muted-foreground">{g.detail}</span>
    </div>
  );
}

function FieldList({ label, value }: { label: string; value: unknown }) {
  if (value === undefined || value === null) return null;
  const items = Array.isArray(value) ? value : [value];
  if (items.length === 0) return null;
  return (
    <div>
      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">{label}</p>
      {items.map((item, i) => (
        <p key={i} className="text-xs text-foreground/80 leading-relaxed">
          {items.length > 1 ? "• " : ""}
          {typeof item === "object" ? JSON.stringify(item) : String(item)}
        </p>
      ))}
    </div>
  );
}

export function RegistryPublishReviewPanel({ canonVersionId }: { canonVersionId: string }) {
  const [draft, setDraft] = useState<PrepareResult | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [approving, setApproving] = useState(false);
  const [approved, setApproved] = useState<ApproveResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const prepare = async () => {
    setPreparing(true);
    setError(null);
    setApproved(null);
    try {
      const res = await fetch(`/api/truth-canon/${canonVersionId}/publish/prepare`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setDraft(null);
        setError(data.error || `Prepare failed (${res.status})`);
        return;
      }
      setDraft(data as PrepareResult);
    } catch (e: any) {
      setError(e.message || "Prepare failed");
    } finally {
      setPreparing(false);
    }
  };

  const approve = async () => {
    if (!draft) return;
    setApproving(true);
    setError(null);
    try {
      const res = await fetch(`/api/truth-canon/${canonVersionId}/publish/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expectedContentHash: draft.contentHash }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 409) {
        setDraft(null);
        setError("The canon changed since you reviewed it (hash drift). Re-prepare before approving.");
        return;
      }
      if (!res.ok) {
        setError(data.error || `Approve failed (${res.status})`);
        return;
      }
      setApproved(data as ApproveResult);
      toast({
        title: "Registry candidate saved",
        description: `RegistryProfile READY, TruthPublishRecord DRAFT (v${data.profileVersion}). Not externally published.`,
      });
    } catch (e: any) {
      setError(e.message || "Approve failed");
    } finally {
      setApproving(false);
    }
  };

  const artifact = draft?.artifact ?? {};
  const profile = (artifact.profile ?? {}) as Record<string, any>;
  const canApprove = !!draft && draft.technicalPass && !approved;

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <div className="flex items-center gap-2.5 px-5 py-4 border-b border-border">
        <BookOpenCheck className="w-4 h-4 text-muted-foreground shrink-0" />
        <div className="flex-1">
          <p className="text-sm font-semibold text-foreground">Public Registry Candidate</p>
          <p className="text-xs text-muted-foreground mt-0.5">Review the clean public profile before saving the candidate.</p>
        </div>
      </div>

      <div className="px-5 py-5 space-y-5">
        {/* Warning — always visible */}
        <div className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2.5">
          <Lock className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          {draft?.warning ?? FALLBACK_WARNING}
        </div>

        <Button size="sm" onClick={prepare} disabled={preparing} className="gap-1.5 text-xs">
          {preparing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />}
          {preparing ? "Preparing…" : "Prepare public registry candidate"}
        </Button>

        {error && (
          <div className="flex items-start gap-2 text-sm text-red-600">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            {error}
          </div>
        )}

        {draft && (
          <div className="space-y-5">
            {/* Verified snapshot */}
            <div className="rounded-md border border-border bg-muted/20 p-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FieldList label="Entity" value={artifact.entitySlug} />
              <FieldList label="Category" value={artifact.category} />
              <FieldList label="Legal name" value={artifact.businessIdentifier?.legalName} />
              <FieldList label="Primary domain" value={artifact.businessIdentifier?.primaryDomain} />
              <FieldList label="Profile version" value={draft.profileVersion} />
              <FieldList label="Content hash" value={draft.contentHash} />
            </div>

            {/* Included claims */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FieldList label="Business type" value={profile.businessType} />
              <FieldList label="Services" value={profile.services} />
              <FieldList label="Locations" value={profile.locations} />
              <FieldList label="Industries served" value={profile.industriesServed} />
              <FieldList label="Claims" value={profile.claims} />
            </div>

            {/* Held / excluded claims — never negative */}
            <div>
              <p className="text-xs font-semibold text-foreground/70 mb-2">Held / excluded — requires verification</p>
              {draft.heldClaimsExcluded.length === 0 ? (
                <p className="text-xs text-muted-foreground">None.</p>
              ) : (
                draft.heldClaimsExcluded.map((h, i) => (
                  <p key={i} className="text-xs text-foreground/80">
                    • <span className="font-medium">{h.name}</span> — requires verification (not published)
                  </p>
                ))
              )}
            </div>

            {/* Gate results */}
            <div className="space-y-1.5">
              <p className="text-xs font-semibold text-foreground/70 mb-1">Gate results</p>
              {draft.gateResults.map((g, i) => (
                <GateRow key={i} g={g} />
              ))}
            </div>

            {/* Approve */}
            <div className="flex flex-wrap items-center gap-3 pt-1 border-t border-border">
              <Button size="sm" onClick={approve} disabled={!canApprove || approving} className="gap-1.5 text-xs">
                {approving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                {approving ? "Saving…" : "Approve & save candidate"}
              </Button>
              {!draft.technicalPass && (
                <span className="text-xs text-red-600">Gates did not pass — cannot approve.</span>
              )}
            </div>
          </div>
        )}

        {approved && (
          <div className="flex items-start gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-md px-3 py-2.5">
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
            Candidate prepared (RegistryProfile {approved.registryProfileStatus}, TruthPublishRecord{" "}
            {approved.truthPublishStatus}, v{approved.profileVersion}). Not externally published.
          </div>
        )}
      </div>
    </div>
  );
}
