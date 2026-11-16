/**
 * WP-21C — client-side worksheet for /verify/[token].
 *
 * One row per fact: statement, category, truth type, source link, current
 * verification state. PENDING / UNSURE facts get Confirm / Edit / Remove /
 * Unsure controls. Confirm and Unsure are one-click; Edit opens an inline
 * input; Remove asks for confirmation. Each action posts to the token-aware
 * endpoint POST /api/verify/[token]/facts/[factId].
 *
 * "Submit verification" POSTs to /api/verify/[token]/submit (the server-side
 * submit event, which notifies the org) and then shows a summary (confirmed /
 * edited / removed / unsure) and a thank-you state. It does not change any
 * Canon version. Customers can also add a fact we missed: POST
 * /api/verify/[token]/facts creates it as DECLARED / PENDING, and it appears
 * in the list with the normal Confirm / Edit / Remove / Unsure controls.
 */

"use client";

import { useMemo, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  evidenceStatus: string;
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

const EVIDENCE_STATUS_LABEL: Record<string, string> = {
  no_evidence_provided: "No evidence provided yet",
  evidence_requested: "Evidence requested \u2014 please upload proof below",
  evidence_received: "Evidence received \u2014 awaiting verification",
  evidence_verified: "Evidence verified",
  expired_or_stale: "Evidence expired or stale \u2014 please upload current proof",
  do_not_publish: "Evidence on file \u2014 not for publication",
};

const EVIDENCE_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: "certificate", label: "Certificate" },
  { value: "renewal_notice", label: "Renewal notice" },
  { value: "award_letter", label: "Award letter" },
  { value: "official_directory_listing", label: "Official directory listing" },
  { value: "membership_record", label: "Membership record" },
  { value: "government_registry_record", label: "Government registry record" },
  { value: "customer_provided_document", label: "Other document" },
  { value: "other", label: "Other" },
];

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
  const [submitting, setSubmitting] = useState(false);
  const [submitNote, setSubmitNote] = useState<string | null>(null);
  const [addCategory, setAddCategory] = useState("");
  const [addCustomCategory, setAddCustomCategory] = useState("");
  const [addStatement, setAddStatement] = useState("");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [evidenceOpenId, setEvidenceOpenId] = useState<string | null>(null);
  const [evidenceType, setEvidenceType] = useState("certificate");
  const [evidenceBusyId, setEvidenceBusyId] = useState<string | null>(null);
  const [evidenceError, setEvidenceError] = useState<string | null>(null);

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


  const categories = useMemo(
    () => Array.from(new Set(facts.map((f) => f.category))).sort(),
    [facts],
  );

  const OTHER_CATEGORY = "__other";

  const SUBMIT_NOTIFY_FAILED =
    "Your answers were saved, but VizAI could not be notified automatically. Your review is still recorded \u2014 VizAI will pick it up from the saved answers.";

  async function submitVerification() {
    setSubmitting(true);
    try {
      const res = await fetch(
        `/api/verify/${encodeURIComponent(token)}/submit`,
        { method: "POST" },
      );
      if (!res.ok) {
        setSubmitNote(SUBMIT_NOTIFY_FAILED);
      }
    } catch {
      setSubmitNote(SUBMIT_NOTIFY_FAILED);
    } finally {
      setSubmitting(false);
      setSubmitted(true);
    }
  }

  async function addFact() {
    const category =
      addCategory === OTHER_CATEGORY ? addCustomCategory.trim() : addCategory;
    const statement = addStatement.trim();
    if (!category || !statement) {
      setAddError("Choose a category and write the fact first.");
      return;
    }
    setAddError(null);
    setAdding(true);
    try {
      const res = await fetch(
        `/api/verify/${encodeURIComponent(token)}/facts`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ category, statement }),
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setAddError(data?.error || `Could not add that fact (HTTP ${res.status}).`);
        return;
      }
      const addedFact = data.fact as WorksheetFact;
      setFacts((prev) => [
        ...prev,
        {
          ...addedFact,
          evidenceStatus:
            addedFact.evidenceStatus ?? "no_evidence_provided",
        },
      ]);
      setNotice(
        "Fact added \u2014 it is awaiting review, so you can confirm it in the list like any other fact.",
      );
      setAddStatement("");
      setAddCustomCategory("");
      setAddCategory("");
    } catch {
      setAddError("Network error \u2014 your text is still here, please try again.");
    } finally {
      setAdding(false);
    }
  }

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
      setError("Network error — please try again.");
    } finally {
      setBusyId(null);
    }
  }

  async function uploadEvidence(
    e: FormEvent<HTMLFormElement>,
    fact: WorksheetFact,
  ) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setEvidenceError(null);
    setEvidenceBusyId(fact.id);
    try {
      const form = new FormData(e.currentTarget);
      const res = await fetch(
        `/api/verify/${encodeURIComponent(token)}/facts/${encodeURIComponent(fact.id)}/evidence`,
        { method: "POST", body: form },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setEvidenceError(
          data?.error || `Could not upload that file (HTTP ${res.status}).`,
        );
        return;
      }
      const updated = data.fact as WorksheetFact;
      setFacts((prev) =>
        prev.map((f) => (f.id === fact.id ? { ...f, ...updated } : f)),
      );
      setEvidenceOpenId(null);
      setNotice(
        "Evidence uploaded \u2014 VizAI will review it before this fact can count as verified.",
      );
    } catch {
      setEvidenceError("Network error \u2014 please try again.");
    } finally {
      setEvidenceBusyId(null);
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
            <CardTitle>Thank you — verification submitted</CardTitle>
            <CardDescription>
              Your review of {businessName} has been recorded. VizAI will use
              your answers when preparing the verified record of your business.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>
              <strong>{summary.CONFIRMED}</strong> confirmed ·{" "}
              <strong>{summary.EDITED}</strong> edited ·{" "}
              <strong>{summary.REMOVED}</strong> removed ·{" "}
              <strong>{summary.UNSURE}</strong> unsure
              {summary.PENDING > 0 ? (
                <>
                  {" · "}
                  <strong>{summary.PENDING}</strong> left unanswered
                </>
              ) : null}
            </p>
            {submitNote ? (
              <p className="text-sm text-amber-700">{submitNote}</p>
            ) : null}
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
            {facts.length - summary.PENDING} of {facts.length} reviewed ·{" "}
            {summary.CONFIRMED} confirmed · {summary.EDITED} edited ·{" "}
            {summary.REMOVED} removed · {summary.UNSURE} unsure
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
                            {" · "}
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
                        {fact.evidenceRequired ? " · Evidence required" : null}
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
                      Answered — to change it, ask VizAI for a fresh link.
                    </p>
                  )}

                  {fact.evidenceRequired ? (
                    <div className="space-y-2 border-t pt-3">
                      <p
                        className={
                          fact.evidenceStatus === "evidence_verified"
                            ? "text-xs font-medium text-green-700"
                            : "text-xs font-medium text-amber-700"
                        }
                      >
                        {EVIDENCE_STATUS_LABEL[fact.evidenceStatus] ??
                          "Evidence required"}
                      </p>
                      {fact.evidenceStatus === "evidence_verified" ? null : evidenceOpenId ===
                        fact.id ? (
                        <form
                          className="space-y-2"
                          onSubmit={(e) => void uploadEvidence(e, fact)}
                        >
                          <input
                            type="file"
                            name="file"
                            required
                            disabled={evidenceBusyId === fact.id}
                            aria-label="Evidence file"
                            className="block w-full text-sm text-muted-foreground file:mr-2 file:rounded-md file:border file:border-input file:bg-background file:px-3 file:py-1.5 file:text-sm file:font-medium"
                          />
                          <div className="flex flex-col gap-2 sm:flex-row">
                            <Select
                              value={evidenceType}
                              onValueChange={setEvidenceType}
                              disabled={evidenceBusyId === fact.id}
                            >
                              <SelectTrigger aria-label="Evidence type">
                                <SelectValue placeholder="Document type" />
                              </SelectTrigger>
                              <SelectContent>
                                {EVIDENCE_TYPE_OPTIONS.map((o) => (
                                  <SelectItem key={o.value} value={o.value}>
                                    {o.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <Input
                              name="notes"
                              disabled={evidenceBusyId === fact.id}
                              placeholder="Note (optional)"
                              aria-label="Evidence note"
                            />
                          </div>
                          <p className="text-xs text-muted-foreground">
                            Upload the proof for this fact (max 10 MB). It is
                            sent to VizAI for review \u2014 uploading does not
                            publish anything.
                          </p>
                          {evidenceError ? (
                            <p className="text-sm text-red-600">
                              {evidenceError}
                            </p>
                          ) : null}
                          <div className="flex gap-2">
                            <Button
                              type="submit"
                              size="sm"
                              disabled={evidenceBusyId === fact.id}
                            >
                              {evidenceBusyId === fact.id
                                ? "Uploading\u2026"
                                : "Upload evidence"}
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={evidenceBusyId === fact.id}
                              onClick={() => {
                                setEvidenceOpenId(null);
                                setEvidenceError(null);
                              }}
                            >
                              Cancel
                            </Button>
                          </div>
                        </form>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy}
                          onClick={() => {
                            setEvidenceOpenId(fact.id);
                            setEvidenceError(null);
                            setEvidenceType("certificate");
                          }}
                        >
                          Add evidence
                        </Button>
                      )}
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Add a fact we missed</CardTitle>
          <CardDescription>
            Is something about {businessName} missing, or wrong in a way none
            of the facts above cover? Add it here. It will appear in the list
            as awaiting review, and you can confirm it like any other fact.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row">
            <Select
              value={addCategory}
              onValueChange={(v) => {
                setAddCategory(v);
                setAddError(null);
              }}
              disabled={adding}
            >
              <SelectTrigger aria-label="Fact category">
                <SelectValue placeholder="Choose a category" />
              </SelectTrigger>
              <SelectContent>
                {categories.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
                <SelectItem value={OTHER_CATEGORY}>Other…</SelectItem>
              </SelectContent>
            </Select>
            {addCategory === OTHER_CATEGORY ? (
              <Input
                value={addCustomCategory}
                onChange={(e) => setAddCustomCategory(e.target.value)}
                disabled={adding}
                placeholder="Category"
                aria-label="Custom category"
              />
            ) : null}
          </div>
          <Input
            value={addStatement}
            onChange={(e) => setAddStatement(e.target.value)}
            disabled={adding}
            placeholder="e.g. We also offer same-day courier delivery"
            aria-label="New fact"
          />
          {addError ? <p className="text-sm text-red-600">{addError}</p> : null}
          <Button
            disabled={
              adding ||
              addStatement.trim().length === 0 ||
              addCategory.length === 0 ||
              (addCategory === OTHER_CATEGORY &&
                addCustomCategory.trim().length === 0)
            }
            onClick={() => void addFact()}
          >
            {adding ? "Adding\u2026" : "Add fact"}
          </Button>
        </CardContent>
      </Card>

      <div className="mt-6 flex justify-end">
        <Button
          size="lg"
          disabled={submitting}
          onClick={() => void submitVerification()}
        >
          {submitting ? "Submitting\u2026" : "Submit verification"}
        </Button>
      </div>
    </main>
  );
}
