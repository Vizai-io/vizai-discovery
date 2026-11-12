"use client";

/**
 * @fileOverview /approvals — Confirm outputs.
 *
 * The control room: everything the agents have produced that is waiting
 * for Jeremy to confirm before it goes out. Three queues from
 * GET /api/approvals:
 *
 *   Reply drafts    — a lead's reply draft (DRAFT). Approve it and it is
 *                     ready to send; dismiss it to clear it.
 *   Truth drafts    — a DRAFT truth publish record, one per company
 *                     profile. Review and publish it from the Monitoring
 *                     page's truth panel.
 *   Recommendations — an OPEN fix plan. Start it (IN_PROGRESS) or dismiss
 *                     it (DISMISSED).
 *
 * Nothing here sends email, publishes, or contacts a lead on its own.
 * Every action is Jeremy confirming an output.
 */

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/contexts/auth-context";
import {
  CheckCircle2,
  XCircle,
  Loader2,
  AlertCircle,
  Mail,
  BookOpenCheck,
  Lightbulb,
  Inbox,
  ArrowRight,
  Play,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import Link from "next/link";

type ReplyDraft = {
  id: string;
  business_name: string;
  website_url: string | null;
  contact_email: string | null;
  lead_status: string;
  draft_subject: string | null;
  draft_body: string;
  drafted_at: string | null;
  created_at: string;
};

type TruthDraft = {
  id: string;
  company_profile_id: string;
  business_name: string;
  website_url: string | null;
  version: number;
  payload_hash: string;
  notes: string | null;
  created_at: string;
};

type Recommendation = {
  id: string;
  perception_scan_id: string | null;
  business_name: string | null;
  priority: "HIGH" | "MEDIUM" | "LOW";
  category: string;
  title: string;
  reason: string;
  recommended_action: string;
  service_link: string | null;
  source: string | null;
  opened_at: string | null;
  created_at: string;
};

type ApprovalsData = {
  counts: { reply_drafts: number; truth_drafts: number; recommendations: number; total: number };
  reply_drafts: ReplyDraft[];
  truth_drafts: TruthDraft[];
  recommendations: Recommendation[];
};

const priorityTone: Record<string, string> = {
  HIGH: "bg-red-100 text-red-800 border-red-200",
  MEDIUM: "bg-amber-100 text-amber-800 border-amber-200",
  LOW: "bg-slate-100 text-slate-700 border-slate-200",
};

export default function ApprovalsPage() {
  const { user } = useAuth();
  const [data, setData] = useState<ApprovalsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [acting, setActing] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/approvals");
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Failed to load approvals (${res.status})`);
      }
      setData(await res.json());
    } catch (e: any) {
      setError(e.message || "Failed to load approvals");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user) load();
  }, [user, load]);

  async function act(
    key: string,
    url: string,
    method: string,
    body: unknown,
    okMsg: string,
  ) {
    setActing(key);
    try {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        throw new Error(b.error || `Request failed (${res.status})`);
      }
      toast({ title: okMsg });
      await load();
    } catch (e: any) {
      toast({ title: "Action failed", description: e.message, variant: "destructive" });
    } finally {
      setActing(null);
    }
  }

  const approveReply = (id: string) =>
    act(`approve-reply-${id}`, `/api/leads/${id}`, "PATCH", { draftStatus: "APPROVED" }, "Reply draft approved — ready to send.");
  const dismissReply = (id: string) =>
    act(`dismiss-reply-${id}`, `/api/leads/${id}`, "PATCH", { draftStatus: "NONE", draftSubject: null, draftBody: null }, "Reply draft cleared.");
  const startRec = (id: string) =>
    act(`start-rec-${id}`, `/api/recommendations/${id}`, "PATCH", { status: "IN_PROGRESS" }, "Recommendation started.");
  const dismissRec = (id: string) =>
    act(`dismiss-rec-${id}`, `/api/recommendations/${id}`, "PATCH", { status: "DISMISSED" }, "Recommendation dismissed.");

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground font-bold uppercase tracking-widest">Loading approvals...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-6">
        <Card className="border-red-200">
          <CardContent className="pt-6 flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-red-600" />
            <p className="text-sm">{error || "Could not load approvals."}</p>
            <Button variant="outline" size="sm" onClick={load} className="ml-auto">Retry</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { counts } = data;
  const empty = counts.total === 0;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <CheckCircle2 className="w-6 h-6 text-primary" />
            Confirm outputs
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Everything the agents produced that is waiting for you to confirm before it goes out.
            Nothing here sends, publishes, or contacts anyone on its own.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline">{counts.total} waiting</Badge>
          <Button variant="outline" size="sm" onClick={load}>Refresh</Button>
        </div>
      </div>

      {empty && (
        <Card>
          <CardContent className="pt-6 flex items-center gap-3">
            <Inbox className="w-5 h-5 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Nothing waiting for confirmation. When a scan creates a lead, the reply agent drafts a reply,
              or a truth draft is ready, it will show up here.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Reply drafts */}
      {data.reply_drafts.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Mail className="w-5 h-5" /> Reply drafts
            <Badge variant="outline">{data.reply_drafts.length}</Badge>
          </h2>
          {data.reply_drafts.map((d) => (
            <Card key={d.id}>
              <CardHeader>
                <CardTitle className="text-base">{d.business_name}</CardTitle>
                <CardDescription>
                  {d.contact_email || "No email on file"} · Lead {d.lead_status} · {d.website_url || ""}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <p className="text-sm font-semibold">Subject: {d.draft_subject || "(no subject)"}</p>
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap mt-2">{d.draft_body}</p>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    disabled={acting === `approve-reply-${d.id}`}
                    onClick={() => approveReply(d.id)}
                  >
                    {acting === `approve-reply-${d.id}` ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                    Approve — ready to send
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={acting === `dismiss-reply-${d.id}`}
                    onClick={() => dismissReply(d.id)}
                  >
                    <XCircle className="w-4 h-4" /> Dismiss
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </section>
      )}

      {/* Truth drafts */}
      {data.truth_drafts.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <BookOpenCheck className="w-5 h-5" /> Truth drafts
            <Badge variant="outline">{data.truth_drafts.length}</Badge>
          </h2>
          {data.truth_drafts.map((t) => (
            <Card key={t.id}>
              <CardHeader>
                <CardTitle className="text-base">{t.business_name}</CardTitle>
                <CardDescription>
                  Version {t.version} · {t.website_url || ""} · {new Date(t.created_at).toLocaleDateString()}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  A draft truth record is ready for this profile. Review the payload and publish it
                  from the Monitoring page — publishing is human-only.
                </p>
                {t.notes && <p className="text-sm">{t.notes}</p>}
                <div>
                  <Link href="/monitoring">
                    <Button size="sm" variant="outline">
                      Review &amp; publish <ArrowRight className="w-4 h-4" />
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          ))}
        </section>
      )}

      {/* Recommendations */}
      {data.recommendations.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Lightbulb className="w-5 h-5" /> Fix plans
            <Badge variant="outline">{data.recommendations.length}</Badge>
          </h2>
          {data.recommendations.map((r) => (
            <Card key={r.id}>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2 flex-wrap">
                  {r.title}
                  <Badge className={cn("border", priorityTone[r.priority])}>{r.priority}</Badge>
                  <Badge variant="outline">{r.category}</Badge>
                </CardTitle>
                <CardDescription>
                  {r.business_name || "Unknown business"} · {r.source || "INTELLIGENCE"}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">{r.reason}</p>
                <p className="text-sm"><span className="font-semibold">Fix: </span>{r.recommended_action}</p>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    disabled={acting === `start-rec-${r.id}`}
                    onClick={() => startRec(r.id)}
                  >
                    {acting === `start-rec-${r.id}` ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                    Start this fix
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={acting === `dismiss-rec-${r.id}`}
                    onClick={() => dismissRec(r.id)}
                  >
                    <XCircle className="w-4 h-4" /> Dismiss
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </section>
      )}
    </div>
  );
}
