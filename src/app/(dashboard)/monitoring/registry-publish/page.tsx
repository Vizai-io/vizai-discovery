"use client";

/**
 * @fileOverview /monitoring/registry-publish — WP-19F-UI-MOUNT
 *
 * Hidden admin page (intentionally NOT in nav) that mounts the standalone B-lineage
 * `RegistryPublishReviewPanel`. The operator supplies a `canonVersionId` — either via
 * `?canonVersionId=<id>` in the URL or by pasting it into the input below — then reviews
 * and approves an INTERNAL public-registry candidate.
 *
 * Internal candidate only: there is NO external business-registry publish here.
 * Not lineage A: it does not reuse the older canonical-truth publish panel or its endpoints.
 */

import { useState, useEffect } from "react";
import { BookOpenCheck, Lock, ShieldAlert } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/auth-context";
import { RegistryPublishReviewPanel } from "@/components/publishing/registry-publish-review-panel";

const INTERNAL_ONLY_WARNING =
  "This prepares an internal public-registry candidate only. It does not publish externally.";

export default function RegistryPublishReviewPage() {
  const { userProfile } = useAuth();
  const isAdmin = userProfile?.role === "admin";

  const [canonVersionId, setCanonVersionId] = useState("");
  const [input, setInput] = useState("");

  // Read ?canonVersionId from the URL on the client (avoids useSearchParams/Suspense).
  useEffect(() => {
    const qp = new URLSearchParams(window.location.search).get("canonVersionId");
    if (qp) {
      setCanonVersionId(qp);
      setInput(qp);
    }
  }, []);

  return (
    <div className="space-y-6 max-w-3xl mx-auto pb-20">
      {/* Header */}
      <div className="space-y-1">
        <h2 className="text-2xl font-bold text-primary flex items-center gap-2.5">
          <BookOpenCheck className="w-6 h-6 text-accent" />
          Registry Publish Review
        </h2>
        <p className="text-muted-foreground text-sm">
          Prepare and approve an internal public-registry candidate from an approved Truth Canon.
        </p>
      </div>

      {/* Internal-only warning */}
      <div className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2.5">
        <Lock className="w-3.5 h-3.5 shrink-0 mt-0.5" />
        {INTERNAL_ONLY_WARNING}
      </div>

      {!isAdmin ? (
        <Card>
          <CardContent className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <ShieldAlert className="w-4 h-4" />
            Admin access is required to review registry publish candidates.
          </CardContent>
        </Card>
      ) : (
        <>
          {/* canonVersionId input */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Canon version</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Paste a canonVersionId…"
                  className="flex-1 h-9 rounded-md border border-border bg-background px-3 text-sm"
                />
                <Button size="sm" onClick={() => setCanonVersionId(input.trim())} disabled={!input.trim()}>
                  Load
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Or open this page with <code>?canonVersionId=&lt;id&gt;</code>.
              </p>
            </CardContent>
          </Card>

          {/* The review panel renders only once a canonVersionId is available */}
          {canonVersionId && <RegistryPublishReviewPanel canonVersionId={canonVersionId} />}
        </>
      )}
    </div>
  );
}
