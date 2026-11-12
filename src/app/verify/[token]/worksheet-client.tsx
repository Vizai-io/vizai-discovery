/**
 * WP-21C â€” client-side worksheet for /verify/[token].
 *
 * One row per fact: statement, category, truth type, source link, current
 * verification state. PENDING / UNSURE facts get Confirm / Edit / Remove /
 * Unsure controls. Confirm and Unsure are one-click; Edit opens an inline
 * input; Remove asks for confirmation. Each action posts to the token-aware
 * endpoint POST /api/verify/[token]/facts/[factId].
 *
 * "Submit verification" shows a summary (confirmed / edited / removed /
 * unsure) and a thank-you state. It does not change any Canon version.
 */

"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

export type WorksheetFact = {
  id: string;
  category: string;
  statement: string;
  truthType: string;
  verificationState: string;
  status: string;
  sourceUrl: string | null;
  evidenceRequired: boolean;
  key: string | null;
};

type Action = "confirm" | "edit" | "remove" | "unsure";

const STATE_LABEL: Record<string, string> = {
  PENDING: "Awaiting review",
  CONFIRMED: "Confirmed",
  EDITED: "Edited by you",
  REMOVED: "Removed by you",
  UNSURE: "Unsure",
};

const STATE_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  PENDING: "outline",
  CONFIRMED: "default",
  EDITED: "secondary",
  REMOVED: "destructive",
  UNSURE: "secondary",
};

function truthTypeLabel(t: string) {
  if (t === "OBSERVED") return "Observed (from public sources)";
  if (t === "DECLARED") return "Declared (from you)";
  return "Verified";
}

export default function VerifyWorksheet({
  token,
  businessName,
  websiteUrl,
  facts: initialFacts,
}: {
  token: string;
  businessName: string;
  websiteUrl: string | null;
  facts: WorksheetFact[];
}) {
  const [facts, setFacts] = useState<WorksheetFact[]>(initialFacts);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const summary = useMemo(() => {
    const counts: Record<string, number> = {
      CONFIRMED: 0,
      EDITED: 0,
      REMOVED: 0,
      UNSURE: 0,
      PENDING: 0,
    };
    for (const f of facts) {
      if (counts[f.verificationState] !== undefined) counts[f.verificationState] += 1;
    }
    return counts;
  }, [facts]);

  async function submitAction(fact: WorksheetFact, action: Action, value?: string) {
    setError(null);
    setNotice(null);
    setBusyId(fact.id);
    try {
      const res = await fetch(
        `/api/verify/${encodeURIComponent(token)}/facts/${encodeURIComponent(fact.id)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, value }),
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error || `Could not save that change (HTTP ${res.status}).`);
        return;
      }
      const updated = data.fact as WorksheetFact;
      setFacts((prev) => prev.map((f) => (f.id === fact.id ? { ...f, ...updated } : f)));
      if (data.gateBlocked) {
        setNotice(
          `Saved as confirmed. Note: ${data.gateReason || "it still needs evidence review before it counts as fully verified."}`,
        );
      }
      setEditingId(null);
    } catch {
      setError("Network error â€” please try again.");
    } finally {
      setBusyId(null);
    }
  }

  function startEdit(fact: WorksheetFact) {
    setEditingId(fact.id);
    setEditValue(fact.statement);
    setError(null);
    setNotice(null);
  }

  function requestRemove(fact: WorksheetFact) {
    if (window.confirm("Remove this fact? It will not be published for your business.")) {
      void submitAction(fact, "remove");
    }
  }

  if (submitted) {
    return (
      <main className="mx-auto w-full max-w-3xl px-4 py-10">
        <Card>
          <CardHeader>
            <CardTitle>Thank you â€” verification submitted</CardTitle>
            <CardDescription>
              Your review of {businessName} has been recorded. VizAI will use
              your answers when preparing the verified record of your business.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>
              <strong>{summary.CONFIRMED}</strong> confirmed Â·{" "}
              <strong>{summary.EDITED}</strong> edited Â·{" "}
              <strong>{summary.REMOVED}</strong> removed Â·{" "}
              <strong>{summary.UNSURE}</strong> unsure
              {summary.PENDING > 0 ? (
                <>
                  {" Â· "}
                  <strong>{summary.PENDING}</strong> left unanswered
                </>
              ) : null}
            </p>
            <p className="text-muted-foreground">
              If anything changes, just ask VizAI for a fresh verification link.
            </p>
          </CardContent>
        </Card>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10">
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Verify your business facts</CardTitle>
          <CardDescription>
            Please review each fact we hold about{" "}
            <strong>{businessName}</strong>
            {websiteUrl ? (
              <>
                {" ("}
                <a
                  className="underline"
                  href={websiteUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  {websiteUrl}
                </a>
                {")"}
              </>
            ) : null}
            . Confirm what is correct, edit what is wrong, remove what should
            not be listed, or mark anything you are unsure about.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            {facts.length - summary.PENDING} of {facts.length} reviewed Â·{" "}
            {summary.CONFIRMED} confirmed Â· {summary.EDITED} edited Â·{" "}
            {summary.REMOVED} removed Â· {summary.UNSURE} unsure
          </p>
          {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
          {notice ? <p className="mt-3 text-sm text-amber-700">{notice}</p> : null}
        </CardContent>
      </Card>

      {facts.length === 0 ? (
        <Card>
          <CardContent className="pt-6 text-sm text-muted-foreground">
            There are no facts to review for this business yet.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {facts.map((fact) => {
            const actionable =
              fact.verificationState === "PENDING" || fact.verificationState === "UNSURE";
            const busy = busyId === fact.id;
            const editing = editingId === fact.id;
            return (
              <Card key={fact.id}>
                <CardContent className="space-y-3 pt-6">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="space-y-1">
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        {fact.category}
                      </p>
                      <p className="text-sm font-medium leading-relaxed">{fact.statement}</p>
                      <p className="text-xs text-muted-foreground">
                        {truthTypeLabel(fact.truthType)}
                        {fact.sourceUrl ? (
                          <>
                            {" Â· "}
                            <a
                              className="underline"
                              href={fact.sourceUrl}
                              target="_blank"
                              rel="noreferrer"
                            >
                              Source
                            </a>
                          </>
                        ) : null}
                        {fact.evidenceRequired ? " Â· Evidence required" : null}
                      </p>
                    </div>
                    <Badge variant={STATE_VARIANT[fact.verificationState] ?? "outline"}>
                      {STATE_LABEL[fact.verificationState] ?? fact.verificationState}
                    </Badge>
                  </div>

                  {editing ? (
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <Input
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        disabled={busy}
                        aria-label="Corrected fact"
                      />
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          disabled={busy || editValue.trim().length === 0}
                          onClick={() => void submitAction(fact, "edit", editValue.trim())}
                        >
                          Save
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy}
                          onClick={() => setEditingId(null)}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : actionable ? (
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        disabled={busy}
                        onClick={() => void submitAction(fact, "confirm")}
                      >
                        Confirm
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() => startEdit(fact)}
                      >
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() => requestRemove(fact)}
                      >
                        Remove
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busy}
                        onClick={() => void submitAction(fact, "unsure")}
                      >
                        Unsure
                      </Button>
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      Answered â€” to change it, ask VizAI for a fresh link.
                    </p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <div className="mt-6 flex justify-end">
        <Button size="lg" onClick={() => setSubmitted(true)}>
          Submit verification
        </Button>
      </div>
    </main>
  );
}
