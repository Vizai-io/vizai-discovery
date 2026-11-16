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
 *   GET  /api/truth-canon/[id]/publish/candidate (restore an approved READY candidate on mount)
 *   POST /api/company-profiles/{id}/registry-consent (record consent — human admin only)
 *   DELETE /api/company-profiles/{id}/registry-consent (revoke consent — guarded, no READY candidate)
 *
 * READY/DRAFT is an APP-INTERNAL candidate only — there is no external business-registry publish here.
 * Isolated/ready for later placement; intentionally not wired into any page yet.
 */

import { useState, useEffect } from "react";
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
import { useAuth } from "@/contexts/auth-context";
import { ExternalPublishSection } from "./external-publish-section";

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
  registryProfileId: string;
  publishRecordId: string;
  registryProfileStatus: string;
  truthPublishStatus: string;
  contentHash: string;
  profileVersion: number;
};

type ConsentState = {
  companyProfileId: string | null;
  registryListingConsentAt: string | null;
  registryListingConsentedBy: string | null;
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
  const [loadingCandidate, setLoadingCandidate] = useState(canonVersionId !== "");
  const [candidateStale, setCandidateStale] = useState(false);
  const [consent, setConsent] = useState<ConsentState | null>(null);
  const [recording, setRecording] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const [consentError, setConsentError] = useState<string | null>(null);
  // Set from the candidate fetch (found:true) or a fresh approve; NOT cleared by
  // prepare() — the revoke guard must hold while a READY candidate exists in the DB.
  const [readyCandidateFound, setReadyCandidateFound] = useState(false);
  const { userProfile } = useAuth();

  // Restore a previously approved READY candidate on mount (Fix 1): if this
  // canon already has a READY RegistryProfile whose hash still matches the
  // current canon, show the READY banner + Export section immediately.
  // Drift => short stale notice + Prepare as today. No candidate => Prepare
  // as today. A fetch error surfaces like a prepare error (same message).
  useEffect(() => {
    if (!canonVersionId) return;
    let cancelled = false;
    fetch(`/api/truth-canon/${canonVersionId}/publish/candidate`)
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || `Candidate lookup failed (${res.status})`);
        return data;
      })
      .then((data) => {
        if (cancelled) return;
        setCandidateStale(!!data?.drift);
        setConsent({
          companyProfileId: data?.companyProfileId ?? null,
          registryListingConsentAt: data?.registryListingConsentAt ?? null,
          registryListingConsentedBy: data?.registryListingConsentedBy ?? null,
        });
        setReadyCandidateFound(!!data?.found);
        if (data?.found) {
          setApproved(data as ApproveResult);
        }
      })
      .catch((e: any) => {
        if (!cancelled) {
          setConsent(null);
          setReadyCandidateFound(false);
          setError(e.message || "Candidate lookup failed");
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingCandidate(false);
      });
    return () => {
      cancelled = true;
    };
  }, [canonVersionId]);

  const prepare = async () => {
    setPreparing(true);
    setError(null);
    setApproved(null);
    setCandidateStale(false);
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
      setReadyCandidateFound(true);
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

  const recordConsent = async () => {
    if (!consent?.companyProfileId) return;
    setRecording(true);
    setConsentError(null);
    try {
      const res = await fetch(`/api/company-profiles/${consent.companyProfileId}/registry-consent`, {
        method: "POST",
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) {
        setConsentError("Admin permission required — this action needs a signed-in human admin.");
        return;
      }
      if (!res.ok) {
        setConsentError(data.error || `Recording consent failed (${res.status})`);
        return;
      }
      setConsent({
        companyProfileId: consent.companyProfileId,
        registryListingConsentAt: data.consent?.registryListingConsentAt ?? new Date().toISOString(),
        registryListingConsentedBy: data.consent?.registryListingConsentedBy ?? null,
      });
      toast({
        title: "Registry listing consent recorded",
        description: "Prepare can now build a public registry candidate.",
      });
    } catch (e: any) {
      setConsentError(e.message || "Recording consent failed");
    } finally {
      setRecording(false);
    }
  };

  const revokeConsent = async () => {
    if (!consent?.companyProfileId) return;
    if (
      !window.confirm(
        "Revoke registry listing consent? This does NOT un-publish anything already public — it only clears the recorded consent, so a new candidate cannot be prepared until consent is recorded again.",
      )
    ) {
      return;
    }
    setRevoking(true);
    setConsentError(null);
    try {
      const res = await fetch(`/api/company-profiles/${consent.companyProfileId}/registry-consent`, {
        method: "DELETE",
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) {
        setConsentError("Admin permission required — this action needs a signed-in human admin.");
        return;
      }
      if (!res.ok) {
        setConsentError(data.error || `Revoking consent failed (${res.status})`);
        return;
      }
      setConsent({
        companyProfileId: consent.companyProfileId,
        registryListingConsentAt: null,
        registryListingConsentedBy: null,
      });
      toast({
        title: "Registry listing consent revoked",
        description: "Consent is no longer recorded for this company.",
      });
    } catch (e: any) {
      setConsentError(e.message || "Revoking consent failed");
    } finally {
      setRevoking(false);
    }
  };

  // registryListingConsentedBy is a raw Supabase user id — never present it as a
  // name. The signed-in admin sees "you"; anyone else sees a truncated id.
  const consentedByLabel =
    !consent?.registryListingConsentedBy
      ? null
      : consent.registryListingConsentedBy === userProfile?.uid
        ? `you (${userProfile.displayName ?? userProfile.email ?? "admin"})`
        : `${consent.registryListingConsentedBy.slice(0, 8)}…`;

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

        {/* Registry listing consent — hard gate for Prepare; shown even with no READY candidate */}
        {consent && (
          <div className="rounded-md border border-border bg-muted/20 p-4 space-y-3">
            <p className="text-xs font-semibold text-foreground/70">Registry listing consent</p>
            {consent.registryListingConsentAt ? (
              <div className="flex items-start gap-2 text-xs text-green-700 bg-green-50 border border-green-200 rounded-md px-3 py-2.5">
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                <span>
                  Consent recorded on {new Date(consent.registryListingConsentAt).toLocaleString()}
                  {consentedByLabel ? ` by ${consentedByLabel}` : ""}.
                </span>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                No registry listing consent recorded yet. Prepare cannot build a public registry
                candidate until consent is recorded.
              </p>
            )}
            {consentError && (
              <div className="flex items-start gap-2 text-xs text-red-600">
                <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                {consentError}
              </div>
            )}
            <div className="flex flex-wrap items-center gap-3">
              {!consent.registryListingConsentAt && consent.companyProfileId && (
                <Button size="sm" onClick={recordConsent} disabled={recording || loadingCandidate} className="gap-1.5 text-xs">
                  {recording ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />}
                  {recording ? "Saving…" : "Record registry listing consent"}
                </Button>
              )}
              {consent.registryListingConsentAt && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={revokeConsent}
                  disabled={revoking || readyCandidateFound}
                  className="gap-1.5 text-xs"
                >
                  {revoking ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                  {revoking ? "Revoking…" : "Revoke consent"}
                </Button>
              )}
              {consent.registryListingConsentAt && readyCandidateFound && (
                <span className="text-xs text-muted-foreground">
                  Revoke is disabled while a READY candidate exists for this canon.
                </span>
              )}
            </div>
          </div>
        )}

        <Button size="sm" onClick={prepare} disabled={preparing || loadingCandidate} className="gap-1.5 text-xs">
          {preparing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />}
          {preparing ? "Preparing…" : "Prepare public registry candidate"}
        </Button>

        {loadingCandidate && (
          <p className="text-xs text-muted-foreground flex items-center gap-1.5">
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Checking for a saved candidate…
          </p>
        )}

        {candidateStale && !approved && !draft && (
          <div className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2.5">
            <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            The saved candidate is stale — the canon changed since it was approved. Prepare a fresh candidate below.
          </div>
        )}

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
          <>
            <div className="flex items-start gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-md px-3 py-2.5">
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
              Candidate prepared (RegistryProfile {approved.registryProfileStatus}, TruthPublishRecord{" "}
              {approved.truthPublishStatus}, v{approved.profileVersion}). Not externally published.
            </div>
            <ExternalPublishSection
              registryProfileId={approved.registryProfileId}
              truthPublishRecordId={approved.publishRecordId}
              contentHash={approved.contentHash}
            />
          </>
        )}
      </div>
    </div>
  );
}
