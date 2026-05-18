"use client";

/**
 * @fileOverview /notifications — Operational notification center.
 *
 * Design principles (Phase 1.8 refinements):
 *  ✓ Priority ordering: unread CRITICAL → WARNING → SUCCESS → INFO → read
 *  ✓ Grouped by groupKey (scan / billing / recommendations / onboarding)
 *  ✓ Recent (≤14 days) shown by default; older collapsed under "Older Events"
 *  ✓ Unread visually distinct, read visually softened — never aggressive
 *  ✓ CRITICAL badge escalates (red), others stay calm (primary)
 *  ✓ Mark individual or all read — lightweight feel
 *  ✓ No infinite scroll, no feed behavior, no social mechanics
 *  ✓ Max 50 active notifications fetched — archived excluded
 *
 * Data source: GET /api/notifications (priority-sorted by repository)
 * Actions:
 *   PATCH /api/notifications         — mark all read
 *   PATCH /api/notifications/[id]    — mark single read
 */

import { useState, useEffect, useMemo } from "react";
import {
  Bell, CheckCircle2, AlertTriangle, AlertCircle, Info,
  Loader2, CheckCheck, ChevronDown, ChevronUp, ArrowRight,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import Link from "next/link";

// ── Types ─────────────────────────────────────────────────────────────────────

type Severity = "INFO" | "SUCCESS" | "WARNING" | "CRITICAL";

type NotificationItem = {
  id: string;
  type: string;
  severity: Severity;
  title: string;
  message: string;
  is_read: boolean;
  group_key: string | null;
  related_scan_id: string | null;
  related_recommendation_id: string | null;
  created_at: string;
  archived_at: string | null;
};

// ── Severity config ───────────────────────────────────────────────────────────

const SEVERITY_CFG: Record<
  Severity,
  { Icon: React.ElementType; iconClass: string; borderClass: string; badgeClass: string; label: string }
> = {
  CRITICAL: {
    Icon: AlertCircle,
    iconClass: "text-red-500",
    borderClass: "border-l-red-400",
    badgeClass: "bg-red-50 text-red-700 border-red-200",
    label: "Critical",
  },
  WARNING: {
    Icon: AlertTriangle,
    iconClass: "text-yellow-500",
    borderClass: "border-l-yellow-400",
    badgeClass: "bg-yellow-50 text-yellow-700 border-yellow-200",
    label: "Warning",
  },
  SUCCESS: {
    Icon: CheckCircle2,
    iconClass: "text-green-500",
    borderClass: "border-l-green-400",
    badgeClass: "bg-green-50 text-green-700 border-green-200",
    label: "Success",
  },
  INFO: {
    Icon: Info,
    iconClass: "text-blue-400",
    borderClass: "border-l-blue-300",
    badgeClass: "bg-blue-50 text-blue-700 border-blue-200",
    label: "Info",
  },
};

// ── Group label map ───────────────────────────────────────────────────────────

function groupLabel(groupKey: string | null): string {
  if (!groupKey) return "General";
  if (groupKey.startsWith("scan:")) return "Scan Event";
  if (groupKey.startsWith("intelligence:")) return "AI Intelligence";
  if (groupKey === "scan_failed") return "Scan Failure";
  if (groupKey === "billing") return "Billing";
  if (groupKey === "onboarding") return "Onboarding";
  if (groupKey === "recommendations") return "Recommendations";
  return "Operational";
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000;

function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 14) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

// ── Resolution CTA mapping ────────────────────────────────────────────────────

/**
 * Maps a notification to a contextual resolution action.
 * Ensures every notification leads somewhere — no orphaned events.
 * Scan-linked and recommendation-linked notifs are handled inline (see NotifRow).
 */
function getResolutionAction(
  notif: NotificationItem,
): { label: string; href: string } | null {
  // Scan-linked: "View scan" already rendered inline
  if (notif.related_scan_id) return null;
  // Recommendation-linked: "View recommendations" already rendered inline
  if (notif.related_recommendation_id) return null;

  switch (notif.type) {
    case "BILLING_PAYMENT_FAILED":
      return { label: "Resolve billing", href: "/billing" };
    case "BILLING_WARNING":
      return { label: "View billing", href: "/billing" };
    case "SCAN_FAILED":
      return { label: "Run new scan", href: "/scans/new" };
    case "RECOMMENDATION_BACKLOG_GROWING":
    case "RECOMMENDATION_MILESTONE":
      return { label: "View recommendations", href: "/recommendations" };
    case "ONBOARDING_COMPLETE":
      return { label: "Go to dashboard", href: "/dashboard" };
    // ── Intelligence alert types (Sprint 12/17) ─────────────────────────────
    case "CONTINUITY_STATE_DECLINED":
    case "ARCHETYPE_TRANSITION":
    case "INTERVENTION_REQUIRED":
    case "RISK_ESCALATED":
      return { label: "View AI Health", href: "/dashboard" };
    default:
      return null;
  }
}

// ── Single notification row ───────────────────────────────────────────────────

function NotifRow({
  notif,
  onMarkRead,
}: {
  notif: NotificationItem;
  onMarkRead: (id: string) => void;
}) {
  const cfg = SEVERITY_CFG[notif.severity] ?? SEVERITY_CFG.INFO;
  const { Icon } = cfg;
  const resolution = getResolutionAction(notif);

  const handleMarkRead = async () => {
    try {
      await fetch(`/api/notifications/${notif.id}`, { method: "PATCH" });
      onMarkRead(notif.id);
    } catch { /* silent — non-critical UI action */ }
  };

  return (
    <div
      className={cn(
        "flex gap-3 px-4 py-3.5 border-l-4 transition-colors group",
        cfg.borderClass,
        notif.is_read
          ? "bg-white opacity-50 hover:opacity-70"
          : "bg-white",
      )}
    >
      {/* Severity icon */}
      <div className="pt-0.5 shrink-0">
        <Icon className={cn("w-4 h-4", cfg.iconClass)} />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2 mb-1">
          <span className={cn(
            "text-sm font-semibold",
            notif.is_read ? "text-muted-foreground" : "text-primary",
          )}>
            {notif.title}
          </span>
          <Badge
            variant="outline"
            className={cn("text-[9px] h-4 px-1.5 font-bold shrink-0", cfg.badgeClass)}
          >
            {cfg.label}
          </Badge>
          {/* Unread dot — subtle, not alarming */}
          {!notif.is_read && (
            <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
          )}
        </div>

        <p className={cn(
          "text-xs leading-relaxed",
          notif.is_read ? "text-muted-foreground/70" : "text-muted-foreground",
        )}>
          {notif.message}
        </p>

        {/* Actions row — every notification leads somewhere */}
        <div className="flex flex-wrap items-center gap-3 mt-2">
          <span className="text-[10px] text-muted-foreground/60">
            {relativeTime(notif.created_at)}
          </span>
          {!notif.is_read && (
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
              {groupLabel(notif.group_key)}
            </span>
          )}
          {/* Scan-linked CTA */}
          {notif.related_scan_id && (
            <Link
              href={`/scans/results/${notif.related_scan_id}`}
              className="text-[10px] font-bold text-primary hover:underline inline-flex items-center gap-1"
            >
              View scan results <ArrowRight className="w-2.5 h-2.5" />
            </Link>
          )}
          {/* Recommendation-linked CTA */}
          {notif.related_recommendation_id && !notif.related_scan_id && (
            <Link
              href="/recommendations"
              className="text-[10px] font-bold text-primary hover:underline inline-flex items-center gap-1"
            >
              View recommendations <ArrowRight className="w-2.5 h-2.5" />
            </Link>
          )}
          {/* Type-resolved CTA (billing, scan-failed, onboarding, backlog) */}
          {resolution && (
            <Link
              href={resolution.href}
              className={cn(
                "text-[10px] font-bold hover:underline inline-flex items-center gap-1",
                notif.severity === "CRITICAL" ? "text-red-600" : "text-primary",
              )}
            >
              {resolution.label} <ArrowRight className="w-2.5 h-2.5" />
            </Link>
          )}
        </div>
      </div>

      {/* Mark-read button */}
      {!notif.is_read && (
        <button
          onClick={handleMarkRead}
          className="shrink-0 mt-0.5 text-muted-foreground/40 hover:text-primary transition-colors"
          title="Mark as read"
          aria-label="Mark as read"
        >
          <CheckCircle2 className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}

// ── Notification group (by groupKey) ─────────────────────────────────────────

function NotifGroup({
  label,
  items,
  onMarkRead,
}: {
  label: string;
  items: NotificationItem[];
  onMarkRead: (id: string) => void;
}) {
  const hasUnread = items.some((n) => !n.is_read);

  return (
    <div>
      {/* Group header — only shown when group has items from multiple types */}
      {items.length > 1 && (
        <div className="flex items-center gap-2 px-4 py-1.5 bg-muted/30 border-b">
          <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest">
            {label}
          </span>
          {hasUnread && (
            <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
          )}
        </div>
      )}
      <div className="divide-y">
        {items.map((n) => (
          <NotifRow key={n.id} notif={n} onMarkRead={onMarkRead} />
        ))}
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function NotificationsPage() {
  const [notifs, setNotifs] = useState<NotificationItem[]>([]);
  const [criticalUnreadCount, setCriticalUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [markingAll, setMarkingAll] = useState(false);
  const [olderExpanded, setOlderExpanded] = useState(false);

  useEffect(() => {
    fetch("/api/notifications")
      .then((r) => r.json())
      .then((data) => {
        if (!data.error) {
          setNotifs(data.notifications ?? []);
          setCriticalUnreadCount(data.critical_unread_count ?? 0);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleMarkRead = (id: string) => {
    setNotifs((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)));
    setCriticalUnreadCount((c) => {
      const notif = notifs.find((n) => n.id === id);
      return notif?.severity === "CRITICAL" ? Math.max(0, c - 1) : c;
    });
  };

  const handleMarkAllRead = async () => {
    setMarkingAll(true);
    try {
      const res = await fetch("/api/notifications", { method: "PATCH" });
      if (res.ok) {
        setNotifs((prev) => prev.map((n) => ({ ...n, is_read: true })));
        setCriticalUnreadCount(0);
        toast({ title: "All notifications marked as read." });
      }
    } catch {
      toast({ title: "Failed to mark all read", variant: "destructive" });
    } finally {
      setMarkingAll(false);
    }
  };

  const cutoff = useMemo(() => new Date(Date.now() - FOURTEEN_DAYS_MS), []);

  // Repository already priority-sorts. We just split by age for progressive disclosure.
  const recent = useMemo(
    () => notifs.filter((n) => new Date(n.created_at) >= cutoff),
    [notifs, cutoff],
  );
  const older = useMemo(
    () => notifs.filter((n) => new Date(n.created_at) < cutoff),
    [notifs, cutoff],
  );

  // Group recent notifications by groupKey for display
  const recentGroups = useMemo(() => {
    const map = new Map<string, NotificationItem[]>();
    for (const n of recent) {
      const key = n.group_key ?? "general";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(n);
    }
    // Preserve priority order: groups ordered by first item's priority
    return Array.from(map.entries()).map(([key, items]) => ({
      key,
      label: groupLabel(key),
      items,
    }));
  }, [recent]);

  const unreadCount = useMemo(() => notifs.filter((n) => !n.is_read).length, [notifs]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl mx-auto pb-20">

      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="space-y-1">
          <h2 className="text-3xl font-bold text-primary flex items-center gap-3">
            <Bell className="w-7 h-7 text-accent" />
            Notifications
          </h2>
          <p className="text-muted-foreground text-sm">
            Operational guidance events for your account.
          </p>
        </div>
        {unreadCount > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleMarkAllRead}
            disabled={markingAll}
            className="gap-2 shrink-0"
          >
            {markingAll
              ? <Loader2 className="w-3 h-3 animate-spin" />
              : <CheckCheck className="w-3.5 h-3.5" />
            }
            Mark all read
          </Button>
        )}
      </div>

      {/* ── Status strip ── */}
      {notifs.length > 0 && (
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          {criticalUnreadCount > 0 && (
            <span className="flex items-center gap-1.5 font-bold text-red-600">
              <AlertCircle className="w-3.5 h-3.5" />
              {criticalUnreadCount} critical unresolved
            </span>
          )}
          {unreadCount > 0 && criticalUnreadCount === 0 && (
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-primary" />
              {unreadCount} unread
            </span>
          )}
          {unreadCount === 0 && (
            <span className="flex items-center gap-1.5 text-green-600">
              <CheckCircle2 className="w-3.5 h-3.5" />
              All caught up
            </span>
          )}
        </div>
      )}

      {/* ── Empty state ── */}
      {notifs.length === 0 && (
        <Card className="border-dashed border-2 py-20 text-center bg-muted/10">
          <div className="w-14 h-14 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
            <Bell className="w-6 h-6 text-muted-foreground/30" />
          </div>
          <p className="text-sm font-medium text-muted-foreground">No operational events yet.</p>
          <p className="text-xs text-muted-foreground/70 mt-1 max-w-xs mx-auto">
            Notifications appear when scans complete, visibility changes, or action is required.
          </p>
        </Card>
      )}

      {/* ── Recent notifications (grouped, ≤14 days) ── */}
      {recentGroups.length > 0 && (
        <Card className="border shadow-sm overflow-hidden">
          <CardHeader className="border-b bg-muted/10 py-2.5 px-4">
            <CardTitle className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
              Recent — last 14 days
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0 divide-y">
            {recentGroups.map(({ key, label, items }) => (
              <NotifGroup key={key} label={label} items={items} onMarkRead={handleMarkRead} />
            ))}
          </CardContent>
        </Card>
      )}

      {/* ── Older notifications (>14 days, collapsed by default) ── */}
      {older.length > 0 && (
        <div>
          <button
            onClick={() => setOlderExpanded((e) => !e)}
            className="flex items-center gap-2 text-[10px] font-bold text-muted-foreground uppercase tracking-widest w-full text-left py-2 hover:text-primary transition-colors"
          >
            {olderExpanded
              ? <ChevronUp className="w-3 h-3" />
              : <ChevronDown className="w-3 h-3" />
            }
            Older Operational Events ({older.length})
          </button>
          {olderExpanded && (
            <Card className="border shadow-sm overflow-hidden mt-1">
              <CardContent className="p-0 divide-y">
                {older.map((n) => (
                  <NotifRow key={n.id} notif={n} onMarkRead={handleMarkRead} />
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* ── Footer ── */}
      {notifs.length > 0 && (
        <p className="text-[10px] text-muted-foreground/50 text-center leading-relaxed">
          Showing active notifications — archived events excluded.
          Notifications older than 90 days are automatically archived.
        </p>
      )}
    </div>
  );
}
