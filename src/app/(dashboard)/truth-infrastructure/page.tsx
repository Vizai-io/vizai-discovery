"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BookOpenCheck,
  Boxes,
  Download,
  FileCheck2,
  GitBranch,
  Globe2,
  Link as LinkIcon,
  Loader2,
  Network,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

type CanonState = {
  profile: { id: string; businessName: string; websiteUrl: string | null };
  latestDraft: CanonVersion | null;
  latestApproved: CanonVersion | null;
  latestPublished: CanonVersion | null;
  evidenceCount: number;
  claimCount: number;
  entityCount: number;
};

type CanonVersion = {
  id: string;
  version: number;
  status: string;
  title: string;
  summary: string | null;
  payloadHash: string;
  approvedAt: string | null;
  publishedAt: string | null;
};

type EvidenceSource = {
  id: string;
  title: string;
  type: string;
  url: string | null;
  createdAt: string;
};

type GraphPayload = {
  entities: Array<{ id: string; type: string; name: string }>;
  edges: Array<{ id: string; relationType: string; fromEntity: { name: string }; toEntity: { name: string } }>;
};

type AuthorityMap = {
  sources: Array<{ id: string; name: string; type: string; status: string; url: string | null; recommendedAction: string | null }>;
};

type DriftRun = {
  id: string;
  summary: string;
  overallSeverity: string | null;
  createdAt: string;
  findings: Array<{ id: string; severity: string; title: string; action: string }>;
};

const evidenceTypes = [
  "WEBSITE",
  "SOCIAL_PROFILE",
  "DIRECTORY",
  "GOVERNMENT_RECORD",
  "TRADE_ASSOCIATION",
  "REVIEW_PLATFORM",
  "PRESS",
  "CUSTOMER_PROVIDED",
  "OTHER",
];

export default function TruthInfrastructurePage() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [state, setState] = useState<CanonState | null>(null);
  const [evidence, setEvidence] = useState<EvidenceSource[]>([]);
  const [graph, setGraph] = useState<GraphPayload | null>(null);
  const [authorityMap, setAuthorityMap] = useState<AuthorityMap | null>(null);
  const [driftRuns, setDriftRuns] = useState<DriftRun[]>([]);
  const [evidenceForm, setEvidenceForm] = useState({
    type: "WEBSITE",
    title: "",
    url: "",
    evidenceText: "",
  });

  const activeCanon = state?.latestPublished ?? state?.latestApproved ?? state?.latestDraft ?? null;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [canonRes, evidenceRes, graphRes, authorityRes, driftRes] = await Promise.all([
        fetch("/api/truth-canon"),
        fetch("/api/evidence-sources"),
        fetch("/api/truth-graph"),
        fetch("/api/authority-map"),
        fetch("/api/drift-runs"),
      ]);

      if (canonRes.ok) setState(await canonRes.json());
      if (evidenceRes.ok) setEvidence((await evidenceRes.json()).evidenceSources ?? []);
      if (graphRes.ok) setGraph((await graphRes.json()).graph ?? null);
      if (authorityRes.ok) setAuthorityMap((await authorityRes.json()).authorityMap ?? null);
      if (driftRes.ok) setDriftRuns((await driftRes.json()).driftRuns ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const truthScore = useMemo(() => {
    if (!state) return 0;
    let score = 20;
    if (state.latestPublished) score += 30;
    if (state.evidenceCount > 0) score += 20;
    if (state.claimCount > 0) score += 15;
    if (state.entityCount > 0) score += 15;
    return Math.min(100, score);
  }, [state]);

  async function runAction(label: string, action: () => Promise<void>) {
    setBusy(label);
    try {
      await action();
      await load();
    } catch (err: any) {
      toast({ title: "Action failed", description: err.message, variant: "destructive" });
    } finally {
      setBusy(null);
    }
  }

  async function createDraft() {
    await runAction("draft", async () => {
      const res = await fetch("/api/truth-canon", { method: "POST", body: JSON.stringify({}) });
      if (!res.ok) throw new Error((await res.json()).error ?? "Could not create draft");
      toast({ title: "Draft created", description: "Truth Canon draft was generated from current business facts and evidence." });
    });
  }

  async function approveCanon() {
    if (!state?.latestDraft) return;
    await runAction("approve", async () => {
      const res = await fetch(`/api/truth-canon/${state.latestDraft!.id}/approve`, { method: "POST" });
      if (!res.ok) throw new Error((await res.json()).error ?? "Could not approve Canon");
      toast({ title: "Canon approved", description: "The draft is ready to publish." });
    });
  }

  async function publishCanon() {
    const canon = state?.latestApproved ?? state?.latestDraft;
    if (!canon) return;
    await runAction("publish", async () => {
      const res = await fetch(`/api/truth-canon/${canon.id}/publish`, { method: "POST" });
      if (!res.ok) throw new Error((await res.json()).error ?? "Could not publish Canon");
      toast({ title: "Canon published", description: "Registry profile and authority map were generated." });
    });
  }

  async function addEvidence() {
    if (!state?.profile) return;
    await runAction("evidence", async () => {
      const res = await fetch("/api/evidence-sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyProfileId: state.profile.id,
          type: evidenceForm.type,
          title: evidenceForm.title,
          url: evidenceForm.url || null,
          evidenceText: evidenceForm.evidenceText || null,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Could not add evidence");
      setEvidenceForm({ type: "WEBSITE", title: "", url: "", evidenceText: "" });
      toast({ title: "Evidence saved", description: "Regenerate the Canon draft to include this evidence." });
    });
  }

  async function runDrift() {
    await runAction("drift", async () => {
      const res = await fetch("/api/drift-runs", { method: "POST", body: JSON.stringify({}) });
      if (!res.ok) throw new Error((await res.json()).error ?? "Could not run drift check");
      toast({ title: "Drift run complete", description: "Findings were persisted to drift history." });
    });
  }

  function exportUrl(format: string) {
    if (!activeCanon) return "#";
    return `/api/truth-canon/${activeCanon.id}/export?format=${format}`;
  }

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!state) {
    return (
      <div className="max-w-3xl">
        <h1 className="text-2xl font-bold text-primary">Truth Infrastructure</h1>
        <p className="mt-2 text-sm text-muted-foreground">Create a company profile before building a Truth Canon.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-primary">Truth Infrastructure</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {state.profile.businessName} · Canon, evidence, graph, registry, authority, and drift.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={createDraft} disabled={!!busy} className="gap-2">
            {busy === "draft" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Generate Draft
          </Button>
          <Button variant="outline" onClick={approveCanon} disabled={!!busy || !state.latestDraft} className="gap-2">
            <FileCheck2 className="h-4 w-4" />
            Approve
          </Button>
          <Button variant="outline" onClick={publishCanon} disabled={!!busy || (!state.latestApproved && !state.latestDraft)} className="gap-2">
            <ShieldCheck className="h-4 w-4" />
            Publish
          </Button>
          <Button variant="outline" onClick={runDrift} disabled={!!busy || !state.latestPublished} className="gap-2">
            <GitBranch className="h-4 w-4" />
            Run Drift
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Metric icon={BookOpenCheck} label="Truth Score" value={`${truthScore}%`} />
        <Metric icon={LinkIcon} label="Evidence" value={String(state.evidenceCount)} />
        <Metric icon={Boxes} label="Claims" value={String(state.claimCount)} />
        <Metric icon={Network} label="Graph Entities" value={String(state.entityCount)} />
      </div>

      <section className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="rounded-lg border bg-card p-5">
          <div className="mb-4 flex items-center justify-between gap-4">
            <div>
              <h2 className="text-sm font-semibold text-foreground">Canon State</h2>
              <p className="text-xs text-muted-foreground">Current operational source of truth in Postgres.</p>
            </div>
            <span className="rounded-full border px-2.5 py-1 text-xs font-semibold">{activeCanon?.status ?? "NO CANON"}</span>
          </div>
          {activeCanon ? (
            <div className="space-y-3 text-sm">
              <Row label="Title" value={activeCanon.title} />
              <Row label="Version" value={String(activeCanon.version)} />
              <Row label="Hash" value={activeCanon.payloadHash.slice(0, 16)} />
              <Row label="Published" value={activeCanon.publishedAt ? new Date(activeCanon.publishedAt).toLocaleString() : "Not published"} />
              <div className="flex flex-wrap gap-2 pt-2">
                {["json", "markdown", "schemaorg", "registry"].map((format) => (
                  <Button key={format} asChild variant="outline" size="sm" className="gap-1.5">
                    <a href={exportUrl(format)} target="_blank" rel="noreferrer">
                      <Download className="h-3.5 w-3.5" />
                      {format}
                    </a>
                  </Button>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Generate a draft to create the first evidence-backed Canon.</p>
          )}
        </div>

        <div className="rounded-lg border bg-card p-5">
          <h2 className="text-sm font-semibold text-foreground">Add Evidence</h2>
          <div className="mt-4 space-y-3">
            <div>
              <Label>Type</Label>
              <Select value={evidenceForm.type} onValueChange={(type) => setEvidenceForm((prev) => ({ ...prev, type }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {evidenceTypes.map((type) => <SelectItem key={type} value={type}>{type}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Title</Label>
              <Input value={evidenceForm.title} onChange={(event) => setEvidenceForm((prev) => ({ ...prev, title: event.target.value }))} />
            </div>
            <div>
              <Label>URL</Label>
              <Input value={evidenceForm.url} onChange={(event) => setEvidenceForm((prev) => ({ ...prev, url: event.target.value }))} />
            </div>
            <div>
              <Label>Evidence Text</Label>
              <Textarea rows={4} value={evidenceForm.evidenceText} onChange={(event) => setEvidenceForm((prev) => ({ ...prev, evidenceText: event.target.value }))} />
            </div>
            <Button onClick={addEvidence} disabled={!!busy || !evidenceForm.title} className="w-full gap-2">
              <LinkIcon className="h-4 w-4" />
              Save Evidence
            </Button>
          </div>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-3">
        <Panel title="Evidence Sources" icon={LinkIcon}>
          <ListEmpty empty="No evidence captured yet.">
            {evidence.slice(0, 6).map((item) => (
              <CompactItem key={item.id} title={item.title} meta={`${item.type}${item.url ? ` · ${item.url}` : ""}`} />
            ))}
          </ListEmpty>
        </Panel>

        <Panel title="Truth Graph" icon={Network}>
          <ListEmpty empty="Generate a Canon draft to materialize graph entities.">
            {graph?.edges.slice(0, 6).map((edge) => (
              <CompactItem key={edge.id} title={`${edge.fromEntity.name} ${edge.relationType.toLowerCase()} ${edge.toEntity.name}`} meta={edge.relationType} />
            ))}
          </ListEmpty>
        </Panel>

        <Panel title="Authority Map" icon={Globe2}>
          <ListEmpty empty="Publish a Canon to generate authority targets.">
            {authorityMap?.sources.slice(0, 6).map((source) => (
              <CompactItem key={source.id} title={source.name} meta={`${source.status} · ${source.recommendedAction ?? ""}`} />
            ))}
          </ListEmpty>
        </Panel>
      </section>

      <section className="rounded-lg border bg-card p-5">
        <h2 className="text-sm font-semibold text-foreground">Drift History</h2>
        <div className="mt-4 space-y-3">
          {driftRuns.length === 0 ? (
            <p className="text-sm text-muted-foreground">No persisted drift runs yet.</p>
          ) : (
            driftRuns.slice(0, 5).map((run) => (
              <div key={run.id} className="rounded-md border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold">{run.summary}</p>
                  <span className="rounded-full border px-2 py-0.5 text-xs font-semibold">{run.overallSeverity ?? "NONE"}</span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{new Date(run.createdAt).toLocaleString()}</p>
                {run.findings.slice(0, 3).map((finding) => (
                  <p key={finding.id} className="mt-2 text-xs text-muted-foreground">
                    {finding.severity}: {finding.title}
                  </p>
                ))}
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}

function Metric({ icon: Icon, label, value }: { icon: typeof BookOpenCheck; label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <Icon className="h-4 w-4 text-muted-foreground" />
      <p className="mt-3 text-xs font-semibold uppercase text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-bold text-primary">{value}</p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[100px_1fr] gap-3">
      <span className="text-xs font-semibold uppercase text-muted-foreground">{label}</span>
      <span className="break-words text-sm text-foreground">{value}</span>
    </div>
  );
}

function Panel({ title, icon: Icon, children }: { title: string; icon: typeof LinkIcon; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border bg-card p-5">
      <div className="mb-4 flex items-center gap-2">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function ListEmpty({ empty, children }: { empty: string; children: React.ReactNode }) {
  const items = Array.isArray(children) ? children.filter(Boolean) : children;
  if (Array.isArray(items) && items.length === 0) {
    return <p className="text-sm text-muted-foreground">{empty}</p>;
  }
  return <>{children}</>;
}

function CompactItem({ title, meta }: { title: string; meta: string }) {
  return (
    <div className="rounded-md border p-3">
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{meta}</p>
    </div>
  );
}
