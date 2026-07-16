import type { CrawlRunStatus } from "@prisma/client";

const TRANSITIONS: Record<CrawlRunStatus, ReadonlySet<CrawlRunStatus>> = {
  QUEUED: new Set(["PLANNING", "PAUSED", "FAILED", "CANCELLED"]),
  PLANNING: new Set(["CRAWLING", "PAUSED", "FAILED", "CANCELLED"]),
  CRAWLING: new Set(["EXTRACTING", "ASSESSING", "PAUSED", "PARTIAL", "FAILED", "CANCELLED"]),
  EXTRACTING: new Set(["ASSESSING", "PAUSED", "PARTIAL", "FAILED", "CANCELLED"]),
  ASSESSING: new Set(["COMPLETE", "PARTIAL", "PAUSED", "FAILED", "CANCELLED"]),
  PAUSED: new Set(["QUEUED", "CANCELLED"]),
  COMPLETE: new Set(),
  PARTIAL: new Set(),
  FAILED: new Set(),
  CANCELLED: new Set(),
};

export class InvalidRunTransitionError extends Error {
  constructor(public readonly from: CrawlRunStatus, public readonly to: CrawlRunStatus) {
    super(`Registry crawl run cannot transition from ${from} to ${to}.`);
    this.name = "InvalidRunTransitionError";
  }
}

export function canTransitionRun(from: CrawlRunStatus, to: CrawlRunStatus): boolean {
  return TRANSITIONS[from].has(to);
}

export function assertRunTransition(from: CrawlRunStatus, to: CrawlRunStatus): void {
  if (!canTransitionRun(from, to)) throw new InvalidRunTransitionError(from, to);
}

export function isTerminalRunStatus(status: CrawlRunStatus): boolean {
  return TRANSITIONS[status].size === 0;
}
