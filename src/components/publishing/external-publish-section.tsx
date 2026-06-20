"use client";

/**
 * @fileOverview ExternalPublishSection (WP-19G)
 *
 * Manual external-publish controls, shown after a candidate is approved (READY/DRAFT). Lets an admin
 * export the clean package (for a human business-registry PR) and — after the human merges — record
 * the publication (PR URL + confirmed contentHash). It NEVER publishes automatically: no GitHub call,
 * no business-registry write, no MCP/signal write.
 */

import { useState } from "react";
import { Upload, Copy, Loader2, CheckCircle2, AlertCircle, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";

const EXTERNAL_PUBLISH_WARNING = "This step creates material for a human PR. It does not publish automatically.";

type ExportPackage = {
  warning: string;
  artifact: Record<string, any>;
  entitySlug: string;
  profileVersion: number;
  contentHash: string;
  suggestedRegistryPath: string;
  prTitle: string;
  prDescription: string;
  validationChecklist: string[];
  internalReview: { heldClaimsExcluded: any[] };
};

function copyText(text: string, label: string) {
  navigator.clipboard?.writeText(text).then(
    () => toast({ title: "Copied", description: label }),
    () => toast({ title: "Copy failed", variant: "destructive" }),
  );
}

export function ExternalPublishSection({
  registryProfileId,
  truthPublishRecordId,
  contentHash,
}: {
  registryProfileId: string;
  truthPublishRecordId: string;
  contentHash: string;
}) {
  const [pkg, setPkg] = useState<ExportPackage | null>(null);
  const [exporting, setExporting] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [published, setPublished] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [prUrl, setPrUrl] = useState("");
  const [confirmedHash, setConfirmedHash] = useState("");

  const doExport = async () => {
    setExporting(true);
    setError(null);
    try {
      const res = await fetch(`/api/registry-profile/${registryProfileId}/external-publish/export`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || `Export failed (${res.status})`);
        return;
      }
      setPkg(data as ExportPackage);
    } catch (e: any) {
      setError(e.message || "Export failed");
    } finally {
      setExporting(false);
    }
  };

  const markPublished = async () => {
    setPublishing(true);
    setError(null);
    try {
      const res = await fetch(`/api/registry-profile/${registryProfileId}/external-publish/mark-published`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ truthPublishRecordId, prUrl, confirmedContentHash: confirmedHash }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 409) {
        setError(data.error || "contentHash mismatch or wrong status — cannot mark published.");
        return;
      }
      if (!res.ok) {
        setError(data.error || `Mark published failed (${res.status})`);
        return;
      }
      setPublished(true);
      toast({ title: "Recorded as published", description: "RegistryProfile + TruthPublishRecord are PUBLISHED." });
    } catch (e: any) {
      setError(e.message || "Mark published failed");
    } finally {
      setPublishing(false);
    }
  };

  const canMark = !!prUrl.trim() && !!confirmedHash.trim() && !published;

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden mt-4">
      <div className="px-5 py-4 border-b border-border flex items-center gap-2.5">
        <Upload className="w-4 h-4 text-muted-foreground" />
        <p className="text-sm font-semibold text-foreground">Manual external publish</p>
      </div>

      <div className="px-5 py-5 space-y-4">
        <div className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2.5">
          <Lock className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          {pkg?.warning ?? EXTERNAL_PUBLISH_WARNING}
        </div>

        <Button size="sm" onClick={doExport} disabled={exporting} className="gap-1.5 text-xs">
          {exporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
          {exporting ? "Exporting…" : "Export package"}
        </Button>

        {error && (
          <div className="flex items-start gap-2 text-sm text-red-600">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            {error}
          </div>
        )}

        {pkg && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              <div>
                <span className="text-muted-foreground">Suggested path:</span> <code>{pkg.suggestedRegistryPath}</code>
              </div>
              <div>
                <span className="text-muted-foreground">profileVersion:</span> {pkg.profileVersion}
              </div>
              <div className="sm:col-span-2 break-all">
                <span className="text-muted-foreground">contentHash:</span> <code>{pkg.contentHash}</code>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={() => copyText(JSON.stringify(pkg.artifact, null, 2), "clean artifact JSON")}>
                <Copy className="w-3.5 h-3.5" /> Copy artifact JSON
              </Button>
              <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={() => copyText(pkg.suggestedRegistryPath, "registry path")}>
                <Copy className="w-3.5 h-3.5" /> Copy path
              </Button>
              <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={() => copyText(pkg.prTitle, "PR title")}>
                <Copy className="w-3.5 h-3.5" /> Copy PR title
              </Button>
              <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={() => copyText(pkg.prDescription, "PR description")}>
                <Copy className="w-3.5 h-3.5" /> Copy PR description
              </Button>
            </div>

            <div>
              <p className="text-xs font-semibold text-foreground/70 mb-1">Validation checklist</p>
              {pkg.validationChecklist.map((c, i) => (
                <p key={i} className="text-xs text-muted-foreground">
                  • {c}
                </p>
              ))}
            </div>

            <div className="space-y-2 border-t border-border pt-3">
              <p className="text-xs font-semibold text-foreground/70">
                After the human PR is merged, confirm to record publication:
              </p>
              <input
                value={prUrl}
                onChange={(e) => setPrUrl(e.target.value)}
                placeholder="business-registry PR URL"
                className="w-full h-9 rounded-md border border-border bg-background px-3 text-sm"
              />
              <input
                value={confirmedHash}
                onChange={(e) => setConfirmedHash(e.target.value)}
                placeholder="confirmed contentHash (must match the candidate)"
                className="w-full h-9 rounded-md border border-border bg-background px-3 text-sm"
              />
              <Button size="sm" onClick={markPublished} disabled={publishing || !canMark} className="gap-1.5 text-xs">
                {publishing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                {publishing ? "Recording…" : "Mark as published"}
              </Button>
            </div>
          </div>
        )}

        {published && (
          <div className="flex items-start gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-md px-3 py-2.5">
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
            Recorded as PUBLISHED. RegistryProfile + TruthPublishRecord are now PUBLISHED.
          </div>
        )}
      </div>
    </div>
  );
}
