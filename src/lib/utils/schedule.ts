/**
 * @fileOverview Schedule utility helpers.
 * Computes the next run date for a given recurrence interval.
 */

import type { RecurrenceInterval } from "@prisma/client";

/**
 * Compute the next run timestamp from now for a given recurrence interval.
 */
export function computeNextRunAt(interval: RecurrenceInterval): Date {
  const now = new Date();
  switch (interval) {
    case "WEEKLY":
      return new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    case "BIWEEKLY":
      return new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
    case "MONTHLY":
      return new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    case "QUARTERLY":
      return new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);
    default:
      return new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  }
}

/**
 * Human-readable label for a recurrence interval.
 */
export function intervalLabel(interval: RecurrenceInterval): string {
  switch (interval) {
    case "WEEKLY":    return "Weekly";
    case "BIWEEKLY":  return "Bi-Weekly";
    case "MONTHLY":   return "Monthly";
    case "QUARTERLY": return "Quarterly";
    default:          return interval;
  }
}
