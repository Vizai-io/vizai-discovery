"use client";

/**
 * @fileOverview /leads — Lead list with Confirm button.
 *
 * Admin-only list of every Lead-model record (GET /api/leads), with a
 * Confirm button per row. Confirming a lead (NEW/CONTACTED → OPPORTUNITY)
 * is Jeremy's decision point in the customer journey: it is what kicks off
 * the truth-file work. The button calls POST /api/leads/:id/confirm as the
 * signed-in admin (plain same-origin fetch, session cookies ride along —
 * no Authorization header), so confirmedBy is recorded as Jeremy's admin
 * email, not a service-key identity.
 *
 * The route itself only flips the status and stamps confirmedAt/confirmedBy.
 * It does NOT trigger the opportunity agent, create a company profile,
 * build a truth draft, or send anything.
 *
 * Leads with no reply draft never appear in /approvals, so this page is the
 * only place every lead — including draft-less NEW leads — can be confirmed.
 *
 * Each row can expand to show the lead's intake checklist (the opportunity
 * agent's verify/collect list: what to confirm with the customer vs what
 * still needs collecting). Render-only: items have no status field, so
 * there is no check-off UI, and nothing here writes back. Leads without a
 * checklist show "No checklist yet" instead of a toggle.
 *
 * Once an opportunity has a linked company profile, the row also has a
 * Mint worksheet link button. It POSTs to
 * /api/company-profiles/:id/verify-token with no body (14-day default) and
 * shows the returned worksheet url + expiry in a copyable field, so Jeremy
 * can copy the link and send it to the customer himself. No email is sent:
 * the mint route only mints the token, and Resend is not set up.
 */

import { useState, useEffect, useCallback, Fragment } from "react";
import { useAuth } from "@/contexts/auth-context";
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Loader2,
  AlertCircle,
  ShieldAlert,
  Users,
  RefreshCw,
  Inbox,
  Copy,
  Link2,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

type IntakeChecklistItem = {
  item: string;
  detail: string;
  ask: string;
};

type IntakeChecklist = {
  verify?: IntakeChecklistItem[] | null;
  collect?: IntakeChecklistItem[] | null;
};

type Lead = {
  id: string;
  business_name: string;
  website_url: string | null;
  contact_name: string | null;
  contact_email: string | null;
  industry: string | null;
  source: string | null;
  status: string;
  draft_status: string | null;
  company_profile_id: string | null;
  confirmed_at: string | null;
  confirmed_by: string | null;
  intake_checklist: IntakeChecklist | null;
  created_at: string;
};

const STATUS_FILTERS = ["ALL", "NEW", "CONTACTED", "OPPORTUNITY", "WON", "LOST"] as const;

const statusTone: Record<string, string> = {
  NEW: "bg-blue-100 text-blue-800 border-blue-200",
  CONTACTED: "bg-amber-100 text-amber-800 border-amber-200",
  OPPORTUNITY: "bg-green-100 text-green-800 border-green-200",
  WON: "bg-emerald-100 text-emerald-800 border-emerald-200",
  LOST: "bg-slate-100 text-slate-500 border-slate-200",
};

const isConfirmable = (status: string) => status === "NEW" || status === "CONTACTED";

// Total checklist items for a lead (verify + collect). The API returns
// intake_checklist as { verify: [...], collect: [...] } or null when the
// opportunity agent has not built one yet; either group may be absent.
const checklistCount = (checklist: IntakeChecklist | null | undefined) =>
  (checklist?.verify?.length ?? 0) + (checklist?.collect?.length ?? 0);

// One checklist group (Verify or Collect). Each item shows its title
// (item), the value or note (detail), and the question to ask (ask).
function ChecklistGroup({ title, items }: { title: string; items: IntakeChecklistItem[] }) {
  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
        {title}
      </h3>
      <ul className="space-y-3">
        {items.map((it, i) => (
          <li key={`${it.item}-${i}`} className="border-l-2 border-primary/40 pl-3">
            <p className="font-medium">{it.item}</p>
            <p className="text-muted-foreground whitespace-pre-wrap break-words">{it.detail}</p>
            <p className="text-muted-foreground">
              <span className="font-medium text-foreground">Ask: </span>
              {it.ask}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}

// Copy helper - same pattern as ExternalPublishSection: clipboard write
// with toast feedback, so Jeremy can copy a minted worksheet link.
function copyText(text: string, label: string) {
  navigator.clipboard?.writeText(text).then(
    () => toast({ title: "Copied", description: label }),
    () => toast({ title: "Copy failed", variant: "destructive" }),
  );
}

type MintedWorksheetLink = {
  url: string;
  expiresAt: string;
};

const ADMIN_PERMISSION_MSG =
  "Admin permission required — this action needs a signed-in human admin";

export default function LeadsPage() {
  const { user, userProfile, loading: authLoading } = useAuth();
  const isAdmin = userProfile?.role === "admin";

  const [leads, setLeads] = useState<Lead[]>([]);
  const [total, setTotal] = useState(0);
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [minting, setMinting] = useState<string | null>(null);
  // Minted worksheet links, keyed by lead id. Tokens are stateless and are
  // not stored anywhere, so a minted link only lives until the page reloads:
  // mint, copy, send.
  const [mintedLinks, setMintedLinks] = useState<Record<string, MintedWorksheetLink>>({});
  // Id of the lead whose checklist row is expanded (one at a time).
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const load = useCallback(async (status: string) => {
    setLoading(true);
    setError(null);
    try {
      const qs = status !== "ALL" ? `?status=${encodeURIComponent(status)}` : "";
      const res = await fetch(`/api/leads${qs}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Failed to load leads (${res.status})`);
      }
      const data = await res.json();
      setLeads(data.leads || []);
      setTotal(data.total ?? (data.leads || []).length);
    } catch (e: any) {
      setError(e.message || "Failed to load leads");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user && isAdmin) load(statusFilter);
  }, [user, isAdmin, statusFilter, load]);

  async function confirmLead(id: string, businessName: string) {
    setConfirming(id);
    try {
      // Session auth, same pattern as the canon Approve and consent buttons:
      // plain same-origin POST, no Authorization header, no credentials
      // option. The Supabase httpOnly session cookies ride along, so the
      // route records confirmedBy as the signed-in admin's email.
      // The route takes no body.
      const res = await fetch(`/api/leads/${id}/confirm`, { method: "POST" });
      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          throw new Error(ADMIN_PERMISSION_MSG);
        }
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Confirm failed (${res.status})`);
      }
      const updated = await res.json();
      // Update the row in place — no full reload.
      setLeads((prev) => prev.map((l) => (l.id === id ? { ...l, ...updated } : l)));
      toast({ title: `Lead confirmed — ${businessName} is now an Opportunity.` });
    } catch (e: any) {
      toast({ title: "Confirm failed", description: e.message, variant: "destructive" });
    } finally {
      setConfirming(null);
    }
  }

  async function mintWorksheetLink(lead: Lead) {
    if (!lead.company_profile_id) return;
    setMinting(lead.id);
    try {
      // Same session-auth pattern as confirmLead: plain same-origin POST,
      // no body (14-day default), no Authorization header. The route mints
      // a stateless HMAC token and returns the worksheet url + expiresAt.
      // No email is sent - Jeremy copies the link below and sends it
      // himself (email, message, whatever he uses) until Resend is set up.
      const res = await fetch(`/api/company-profiles/${lead.company_profile_id}/verify-token`, { method: "POST" });
      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          throw new Error(ADMIN_PERMISSION_MSG);
        }
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Mint failed (${res.status})`);
      }
      const data = await res.json();
      setMintedLinks((prev) => ({ ...prev, [lead.id]: { url: data.url, expiresAt: data.expiresAt } }));
      toast({ title: `Worksheet link minted for ${lead.business_name}.`, description: "Copy the link below and send it to the customer." });
    } catch (e: any) {
      toast({ title: "Mint failed", description: e.message, variant: "destructive" });
    } finally {
      setMinting(null);
    }
  }

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground font-bold uppercase tracking-widest">Loading leads...</p>
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <ShieldAlert className="w-4 h-4" />
            Admin access is required to view leads.
          </CardContent>
        </Card>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground font-bold uppercase tracking-widest">Loading leads...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <Card className="border-red-200">
          <CardContent className="pt-6 flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-red-600" />
            <p className="text-sm">{error}</p>
            <Button variant="outline" size="sm" onClick={() => load(statusFilter)} className="ml-auto">Retry</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Users className="w-6 h-6 text-primary" />
            Leads
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Every lead from scans and intake. Confirm a NEW or CONTACTED lead to move it to
            Opportunity — that is what kicks off the truth-file work. Confirming changes
            nothing else: no agent runs, no profile is created, nothing is sent.
            For an Opportunity with a linked company profile, Mint worksheet link
            creates the customer verification link - copy it and send it yourself;
            no email is sent.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline">{total} lead{total === 1 ? "" : "s"}</Badge>
          <Button variant="outline" size="sm" onClick={() => load(statusFilter)}>
            <RefreshCw className="w-4 h-4" /> Refresh
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {STATUS_FILTERS.map((s) => (
          <Button
            key={s}
            size="sm"
            variant={statusFilter === s ? "default" : "outline"}
            onClick={() => setStatusFilter(s)}
          >
            {s === "ALL" ? "All" : s.charAt(0) + s.slice(1).toLowerCase()}
          </Button>
        ))}
      </div>

      {leads.length === 0 ? (
        <Card>
          <CardContent className="pt-6 flex items-center gap-3">
            <Inbox className="w-5 h-5 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              No leads{statusFilter !== "ALL" ? ` with status ${statusFilter}` : ""} yet. When a scan
              creates a lead, it will show up here.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="px-4 py-3 font-semibold">Business</th>
                  <th className="px-4 py-3 font-semibold">Contact</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold">Reply draft</th>
                  <th className="px-4 py-3 font-semibold">Confirmed</th>
                  <th className="px-4 py-3 font-semibold">Checklist</th>
                  <th className="px-4 py-3 font-semibold text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {leads.map((l) => (
                  <Fragment key={l.id}>
                    <tr className="border-b last:border-0 align-top">
                    <td className="px-4 py-3">
                      <p className="font-semibold">{l.business_name}</p>
                      {l.website_url && (
                        <a
                          href={l.website_url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs text-primary underline break-all"
                        >
                          {l.website_url}
                        </a>
                      )}
                      {l.industry && <p className="text-xs text-muted-foreground">{l.industry}</p>}
                    </td>
                    <td className="px-4 py-3">
                      <p>{l.contact_name || "—"}</p>
                      <p className="text-xs text-muted-foreground break-all">{l.contact_email || "No email on file"}</p>
                      {l.source && <p className="text-xs text-muted-foreground">via {l.source}</p>}
                    </td>
                    <td className="px-4 py-3">
                      <Badge className={cn("border", statusTone[l.status] || "bg-slate-100 text-slate-700 border-slate-200")}>
                        {l.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{l.draft_status || "—"}</td>
                    <td className="px-4 py-3">
                      {l.confirmed_at ? (
                        <>
                          <p>{new Date(l.confirmed_at).toLocaleDateString()}</p>
                          <p className="text-xs text-muted-foreground break-all" title={l.confirmed_by || ""}>
                            {l.confirmed_by || ""}
                          </p>
                        </>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {checklistCount(l.intake_checklist) > 0 ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setExpandedId(expandedId === l.id ? null : l.id)}
                          aria-expanded={expandedId === l.id}
                        >
                          {expandedId === l.id ? (
                            <ChevronDown className="w-4 h-4" />
                          ) : (
                            <ChevronRight className="w-4 h-4" />
                          )}
                          Checklist ({checklistCount(l.intake_checklist)})
                        </Button>
                      ) : (
                        <span className="text-xs text-muted-foreground">No checklist yet</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex flex-col items-end gap-2">
                      {isConfirmable(l.status) ? (
                        <Button
                          size="sm"
                          disabled={confirming === l.id}
                          onClick={() => confirmLead(l.id, l.business_name)}
                        >
                          {confirming === l.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <CheckCircle2 className="w-4 h-4" />
                          )}
                          Confirm
                        </Button>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          {l.status === "OPPORTUNITY" ? "Confirmed" : l.status.charAt(0) + l.status.slice(1).toLowerCase()}
                        </span>
                      )}
                      {l.company_profile_id && (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={minting === l.id}
                          onClick={() => mintWorksheetLink(l)}
                        >
                          {minting === l.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Link2 className="w-4 h-4" />
                          )}
                          {mintedLinks[l.id] ? "Mint new link" : "Mint worksheet link"}
                        </Button>
                      )}
                      </div>
                    </td>
                  </tr>
                  {expandedId === l.id && checklistCount(l.intake_checklist) > 0 && (
                    <tr className="border-b last:border-0 bg-muted/30">
                      <td colSpan={7} className="px-4 py-4">
                        <p className="font-semibold mb-3">Intake checklist</p>
                        <div className="grid gap-6 md:grid-cols-2">
                          {(l.intake_checklist?.verify?.length ?? 0) > 0 && (
                            <ChecklistGroup title="Verify" items={l.intake_checklist?.verify ?? []} />
                          )}
                          {(l.intake_checklist?.collect?.length ?? 0) > 0 && (
                            <ChecklistGroup title="Collect" items={l.intake_checklist?.collect ?? []} />
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                  {mintedLinks[l.id] && (
                    <tr className="border-b last:border-0 bg-muted/30">
                      <td colSpan={7} className="px-4 py-4">
                        <p className="font-semibold mb-1">Customer worksheet link</p>
                        <p className="text-xs text-muted-foreground mb-2">
                          Send this link to the customer - it opens their verification worksheet.
                          No email is sent automatically.
                          {mintedLinks[l.id].expiresAt && (
                            <> Expires {new Date(mintedLinks[l.id].expiresAt).toLocaleString()}.</>
                          )}
                        </p>
                        <div className="flex flex-wrap items-center gap-2">
                          <input
                            readOnly
                            value={mintedLinks[l.id].url}
                            onFocus={(e) => e.target.select()}
                            className="flex-1 min-w-0 h-9 rounded-md border border-border bg-background px-3 text-sm"
                            aria-label="Worksheet link"
                          />
                          <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={() => copyText(mintedLinks[l.id].url, "worksheet link")}>
                            <Copy className="w-3.5 h-3.5" /> Copy link
                          </Button>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
