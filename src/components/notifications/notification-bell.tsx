"use client";

/**
 * @fileOverview NotificationBell — header icon with operational unread badge.
 *
 * Badge rules (Refinement 4 — calm read-state UX):
 *  - No badge:             0 unread
 *  - Primary badge:        unread INFO or SUCCESS only
 *  - Amber badge:          unread WARNING (no CRITICAL)
 *  - Red badge:            any unread CRITICAL
 *  - Cap: 9+
 *
 * Loads once on mount — does not poll or auto-refresh.
 * Clicking navigates to /notifications.
 */

import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

type BellState = {
  unreadCount: number;
  criticalUnreadCount: number;
};

export function NotificationBell() {
  const [state, setState] = useState<BellState | null>(null);

  useEffect(() => {
    fetch("/api/notifications?unreadOnly=true")
      .then((r) => r.json())
      .then((data) => {
        setState({
          unreadCount: data.unread_count ?? 0,
          criticalUnreadCount: data.critical_unread_count ?? 0,
        });
      })
      .catch(() => setState({ unreadCount: 0, criticalUnreadCount: 0 }));
  }, []);

  // Not yet loaded — render placeholder to prevent layout shift
  if (state === null) {
    return (
      <div className="w-8 h-8 flex items-center justify-center">
        <Bell className="w-4 h-4 text-muted-foreground" />
      </div>
    );
  }

  const { unreadCount, criticalUnreadCount } = state;

  // Badge color: escalates only for CRITICAL — calm for everything else
  const badgeColor =
    criticalUnreadCount > 0
      ? "bg-red-500"                // CRITICAL present — red
      : unreadCount > 0
        ? "bg-primary"              // INFO/SUCCESS/WARNING — primary (no alarm)
        : null;

  const displayCount = unreadCount > 9 ? "9+" : String(unreadCount);

  return (
    <Link
      href="/notifications"
      className="relative flex items-center justify-center w-8 h-8 rounded-full text-muted-foreground hover:text-primary hover:bg-primary/5 transition-colors"
      aria-label={
        unreadCount > 0
          ? `${unreadCount} unread notification${unreadCount > 1 ? "s" : ""}`
          : "Notifications"
      }
    >
      <Bell className={cn("w-4 h-4", unreadCount > 0 && "text-primary")} />
      {badgeColor && unreadCount > 0 && (
        <span
          className={cn(
            "absolute -top-0.5 -right-0.5 flex items-center justify-center rounded-full text-white font-bold leading-none",
            displayCount.length > 1 ? "w-4 h-4 text-[8px]" : "w-3.5 h-3.5 text-[8px]",
            badgeColor,
          )}
        >
          {displayCount}
        </span>
      )}
    </Link>
  );
}
