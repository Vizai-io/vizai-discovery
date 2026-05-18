"use client";

/**
 * /admin/alerts — Intelligence Alert History (Sprint 16 Task 4).
 *
 * Paginated view of all intelligence alerts across all organizations.
 * Admins can acknowledge and resolve alerts from this page.
 *
 * Alert states: UNREAD → ACKNOWLEDGED → RESOLVED
 */

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  RefreshCcw,
  AlertTriangle,
  CheckCircle2,
  Clock,
  MessageSquare,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

type AlertStatus = 'all' | 'unread' | 'acknowledged' | 'resolved';

type AlertState = 'UNREAD' | 'READ' | 'ACKNOWLEDGED' | 'RESOLVED';

interface Alert {
  id:             string;
  organizationId: string;
  type:           string;
  severity:       string;
  title:          string;
  message:        string;
  isRead:         boolean;
  createdAt:      string;
  acknowledgedAt: string | null;
  resolvedAt:     string | null;
  resolvedBy:     string | null;
  resolutionNote: string | null;
  state:          AlertState;
  organization:   { name: string; slug: string; tier: string } | null;
}

interface AlertsResponse {
  page:       number;
  limit:      number;
  total:      number;
  totalPages: number;
  alerts:     Alert[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const STATE_STYLES: Record<AlertState, string> = {
  UNREAD:       'bg-red-50    text-red-700    border-red-200',
  READ:         'bg-slate-50  text-slate-600  border-slate-200',
  ACKNOWLEDGED: 'bg-amber-50  text-amber-700  border-amber-200',
  RESOLVED:     'bg-emerald-50 text-emerald-700 border-emerald-200',
};

const SEVERITY_STYLES: Record<string, string> = {
  CRITICAL: 'bg-red-50    text-red-700    border-red-200',
  WARNING:  'bg-amber-50  text-amber-700  border-amber-200',
  INFO:     'bg-blue-50   text-blue-700   border-blue-200',
};

const TYPE_LABELS: Record<string, string> = {
  CONTINUITY_STATE_DECLINED: 'Continuity Declined',
  ARCHETYPE_TRANSITION:      'Archetype Transition',
  INTERVENTION_REQUIRED:     'Intervention Required',
  RISK_ESCALATED:            'Risk Escalated',
};

function StateBadge({ state }: { state: AlertState }) {
  const labels: Record<AlertState, string> = {
    UNREAD: 'Unread', READ: 'Read', ACKNOWLEDGED: 'Acknowledged', RESOLVED: 'Resolved',
  };
  return (
    <Badge variant="outline" className={cn("text-[10px] font-bold uppercase tracking-wide h-5 px-2", STATE_STYLES[state])}>
      {labels[state]}
    </Badge>
  );
}

// ── Alert Row ─────────────────────────────────────────────────────────────────

function AlertRow({ alert, onAction }: {
  alert: Alert;
  onAction: (id: string, action: 'acknowledge' | 'resolve', note?: string) => Promise<void>;
}) {
  const [resolveOpen, setResolveOpen] = useState(false);
  const [note, setNote]               = useState('');
  const [busy, setBusy]               = useState(false);

  const act = async (action: 'acknowledge' | 'resolve') => {
    setBusy(true);
    await onAction(alert.id, action, action === 'resolve' ? note : undefined);
    setBusy(false);
    setResolveOpen(false);
    setNote('');
  };

  return (
    <div className="border-b border-border/30 last:border-0 py-4">
      <div className="flex items-start gap-3">
        {/* State dot */}
        <div className={cn("w-2 h-2 rounded-full mt-2 shrink-0",
          alert.state === 'UNREAD'       ? 'bg-red-500'    :
          alert.state === 'ACKNOWLEDGED' ? 'bg-amber-400'  :
          alert.state === 'RESOLVED'     ? 'bg-emerald-400':
          'bg-slate-300'
        )} />

        <div className="flex-1 min-w-0">
          {/* Header row */}
          <div className="flex items-start justify-between gap-2 mb-1">
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground truncate">{alert.title}</p>
              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                <Badge variant="outline" className={cn("text-[10px] font-bold h-4 px-1.5", SEVERITY_STYLES[alert.severity])}>
                  {alert.severity}
                </Badge>
                <span className="text-[10px] text-muted-foreground">
                  {TYPE_LABELS[alert.type] ?? alert.type.replace(/_/g, ' ')}
                </span>
                <span className="text-[10px] text-muted-foreground">·</span>
                <span className="text-[10px] font-medium text-primary">
                  {alert.organization?.name ?? alert.organizationId}
                </span>
                <span className="text-[10px] text-muted-foreground">
                  {new Date(alert.createdAt).toLocaleDateString(undefined, {
                    month: 'short', day: 'numeric', year: 'numeric',
                    hour: 'numeric', minute: '2-digit',
                  })}
                </span>
              </div>
            </div>
            <StateBadge state={alert.state} />
          </div>

          {/* Message */}
          {alert.message && (
            <p className="text-xs text-muted-foreground mb-2 line-clamp-2">{alert.message}</p>
          )}

          {/* Resolution info */}
          {alert.resolvedAt && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-2">
              <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0" />
              <span>Resolved {new Date(alert.resolvedAt).toLocaleDateString()}</span>
              {alert.resolutionNote && (
                <span className="italic">— {alert.resolutionNote}</span>
              )}
            </div>
          )}
          {alert.acknowledgedAt && !alert.resolvedAt && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-2">
              <Clock className="w-3 h-3 text-amber-500 shrink-0" />
              <span>Acknowledged {new Date(alert.acknowledgedAt).toLocaleDateString()}</span>
            </div>
          )}

          {/* Actions */}
          {alert.state !== 'RESOLVED' && (
            <div className="flex items-start gap-2 flex-wrap">
              {alert.state === 'UNREAD' && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-6 text-xs gap-1 border-amber-200 text-amber-700 hover:bg-amber-50"
                  onClick={() => act('acknowledge')}
                  disabled={busy}
                >
                  {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Clock className="w-3 h-3" />}
                  Acknowledge
                </Button>
              )}

              {!resolveOpen ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-6 text-xs gap-1 border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                  onClick={() => setResolveOpen(true)}
                  disabled={busy}
                >
                  <CheckCircle2 className="w-3 h-3" />
                  Resolve
                </Button>
              ) : (
                <div className="flex items-start gap-2 w-full mt-1">
                  <div className="flex-1">
                    <textarea
                      className="w-full text-xs border border-border rounded px-2 py-1.5 resize-none focus:outline-none focus:ring-1 focus:ring-primary"
                      rows={2}
                      placeholder="Optional resolution note (max 500 chars)…"
                      value={note}
                      onChange={(e) => setNote(e.target.value.slice(0, 500))}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5 shrink-0">
                    <Button
                      size="sm"
                      variant="default"
                      className="h-6 text-xs"
                      onClick={() => act('resolve')}
                      disabled={busy}
                    >
                      {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Confirm'}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 text-xs text-muted-foreground"
                      onClick={() => { setResolveOpen(false); setNote(''); }}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )}

              <Link href={`/admin/org/${alert.organizationId}`}>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 text-xs text-muted-foreground gap-1"
                >
                  View org →
                </Button>
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function AlertsPage() {
  const [data,    setData]    = useState<AlertsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);
  const [status,  setStatus]  = useState<AlertStatus>('all');
  const [page,    setPage]    = useState(1);

  const load = useCallback(async (p = page, s = status) => {
    setLoading(true);
    setError(null);
    try {
      const res  = await fetch(`/api/admin/alerts?page=${p}&limit=25&status=${s}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Load failed');
      setData(json);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [page, status]);

  useEffect(() => { load(); }, [load]);

  const handleStatusChange = (s: AlertStatus) => {
    setStatus(s);
    setPage(1);
    load(1, s);
  };

  const handlePageChange = (p: number) => {
    setPage(p);
    load(p, status);
  };

  const handleAction = async (id: string, action: 'acknowledge' | 'resolve', note?: string) => {
    try {
      const res = await fetch(`/api/admin/alerts/${id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ action, resolutionNote: note }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? 'Action failed');
      }
      // Refresh current page
      await load(page, status);
    } catch (e: any) {
      setError(e.message);
    }
  };

  return (
    <div className="min-h-screen bg-background p-6 max-w-4xl mx-auto space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/admin/health-center">
            <Button variant="ghost" size="sm" className="gap-1 text-muted-foreground">
              <ChevronLeft className="w-4 h-4" /> Health Center
            </Button>
          </Link>
          <div>
            <h1 className="text-lg font-semibold text-foreground">Intelligence Alerts</h1>
            <p className="text-xs text-muted-foreground">
              Acknowledge and resolve operational intelligence alerts across all organizations.
            </p>
          </div>
        </div>
        <Button size="sm" variant="ghost" onClick={() => load(page, status)} disabled={loading} className="gap-1 text-muted-foreground">
          <RefreshCcw className="w-3.5 h-3.5" /> Refresh
        </Button>
      </div>

      {/* Status filter */}
      <div className="flex items-center gap-1.5">
        {(['all', 'unread', 'acknowledged', 'resolved'] as AlertStatus[]).map((s) => (
          <Button
            key={s}
            size="sm"
            variant={status === s ? 'default' : 'outline'}
            className="text-xs h-7 capitalize"
            onClick={() => handleStatusChange(s)}
          >
            {s}
          </Button>
        ))}
        {data && (
          <span className="text-xs text-muted-foreground ml-2">
            {data.total} alert{data.total !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-16 gap-2 text-muted-foreground text-sm">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading alerts…
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Alert list */}
      {!loading && !error && data && (
        <Card className="border-border/50">
          <CardContent className="pt-2 px-6">
            {data.alerts.length === 0 ? (
              <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground">
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                <p className="text-sm">No alerts match this filter.</p>
              </div>
            ) : (
              data.alerts.map((alert) => (
                <AlertRow key={alert.id} alert={alert} onAction={handleAction} />
              ))
            )}
          </CardContent>
        </Card>
      )}

      {/* Pagination */}
      {data && data.totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs gap-1"
            onClick={() => handlePageChange(page - 1)}
            disabled={page <= 1 || loading}
          >
            <ChevronLeft className="w-3 h-3" /> Prev
          </Button>
          <span className="text-xs text-muted-foreground">
            Page {data.page} of {data.totalPages}
          </span>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs gap-1"
            onClick={() => handlePageChange(page + 1)}
            disabled={page >= data.totalPages || loading}
          >
            Next <ChevronRight className="w-3 h-3" />
          </Button>
        </div>
      )}
    </div>
  );
}
