
'use server';

/**
 * @fileOverview Server Actions for rate limiting and abuse protection.
 *
 * STATUS: MIGRATED (Sprint 3 Task 3) — Firestore removed.
 *
 * Rate limiting is now enforced via an in-memory Map keyed by identifier + date.
 * This is the correct stabilization tradeoff:
 *  - Eliminates Firestore dependency from the public acquisition flow
 *  - Maintains fail-open behavior during stabilization
 *  - Avoids new Postgres table during migration convergence
 *
 * Operational characteristics:
 *  - State resets on server restart (acceptable for MVP)
 *  - Per-process only (single-server deployment assumed)
 *  - Future upgrade: move to Redis or Postgres if horizontal scaling is needed
 *
 * Refinement A: All logs include traceId for request correlation.
 * Refinement 2: Structured [RATE_LIMIT] log emitted on every check
 *   for operational visibility into abuse attempts and traffic patterns.
 */

import { headers } from 'next/headers';

// ── In-memory rate limit store ────────────────────────────────────────────────
// Key: "{type}_{identifier}_{YYYY-MM-DD}"
// Value: { count: number; windowStart: number }
//
// TTL: entries older than 48h are pruned on each write to prevent unbounded growth.
// The window is per-day (resets at UTC midnight via key rotation).

type RateLimitEntry = {
  count: number;
  windowStart: number; // epoch ms — used for TTL pruning
};

const rateLimitStore = new Map<string, RateLimitEntry>();

function pruneExpiredEntries(): void {
  const cutoff = Date.now() - 48 * 60 * 60 * 1000;
  for (const [key, entry] of rateLimitStore.entries()) {
    if (entry.windowStart < cutoff) {
      rateLimitStore.delete(key);
    }
  }
}

function getCount(key: string): number {
  return rateLimitStore.get(key)?.count ?? 0;
}

function increment(key: string): void {
  const existing = rateLimitStore.get(key);
  if (existing) {
    existing.count += 1;
  } else {
    rateLimitStore.set(key, { count: 1, windowStart: Date.now() });
  }
}

// ── Limits ────────────────────────────────────────────────────────────────────

const EMAIL_LIMIT_PER_DAY = 1;
const IP_LIMIT_PER_DAY    = 3;

// ── Public API ────────────────────────────────────────────────────────────────

export type UsageValidationResult = {
  allowed: boolean;
  reason?: string;
};

/**
 * Validates a free scan request based on IP and email rate limits.
 * Implements honeypot protection against bots.
 *
 * Fail-open: any unexpected error returns { allowed: true } so legitimate
 * scans are never blocked by infrastructure failures.
 */
export async function validateFreeScanRequest(
  email: string,
  honeypot: string,
): Promise<UsageValidationResult> {
  const traceId = crypto.randomUUID();

  // 1. Honeypot check — bots fill hidden fields
  if (honeypot && honeypot.length > 0) {
    console.warn('[RATE_LIMIT] Honeypot triggered', { traceId, email: email.toLowerCase() });
    return { allowed: false, reason: 'Security validation failed. Please try again.' };
  }

  const headerList = await headers();
  const ip = headerList.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD (UTC)

  const emailKey = `email_${email.toLowerCase().trim()}_${today}`;
  const ipKey    = `ip_${ip.replace(/\./g, '_')}_${today}`;

  try {
    const emailCount = getCount(emailKey);
    const ipCount    = getCount(ipKey);

    // 2. Check email limit (1/day)
    if (emailCount >= EMAIL_LIMIT_PER_DAY) {
      console.log('[RATE_LIMIT]', {
        traceId,
        email: email.toLowerCase(),
        ip,
        emailCount,
        ipCount,
        blocked: true,
        reason: 'email_limit',
      });
      return {
        allowed: false,
        reason: 'Daily limit reached for this email. Sign in to run unlimited scans.',
      };
    }

    // 3. Check IP limit (3/day)
    if (ipCount >= IP_LIMIT_PER_DAY) {
      console.log('[RATE_LIMIT]', {
        traceId,
        email: email.toLowerCase(),
        ip,
        emailCount,
        ipCount,
        blocked: true,
        reason: 'ip_limit',
      });
      return {
        allowed: false,
        reason: 'Daily limit reached for this network. Please try again tomorrow or sign in.',
      };
    }

    // 4. Record usage
    pruneExpiredEntries();
    increment(emailKey);
    increment(ipKey);

    console.log('[RATE_LIMIT]', {
      traceId,
      email: email.toLowerCase(),
      ip,
      emailCount: emailCount + 1,
      ipCount: ipCount + 1,
      blocked: false,
    });

    return { allowed: true };

  } catch (error: any) {
    // Fail open — never block legitimate scans due to rate limiter failure
    console.error('[RATE_LIMIT] Rate limit check error (fail-open)', {
      traceId,
      error: error?.message ?? 'unknown',
    });
    return { allowed: true };
  }
}
