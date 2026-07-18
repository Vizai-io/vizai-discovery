'use server';

import crypto from 'node:crypto';
import { headers } from 'next/headers';
import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';

const EMAIL_LIMIT_PER_DAY = 1;
const IP_LIMIT_PER_DAY = 3;
const WINDOW_MS = 24 * 60 * 60 * 1000;

export type UsageValidationResult = {
  allowed: boolean;
  reason?: string;
};

class RateLimitExceeded extends Error {
  constructor(public readonly dimension: 'email' | 'ip') {
    super(`${dimension} rate limit exceeded`);
  }
}

function hashIdentifier(kind: 'email' | 'ip', value: string): string {
  const secret = process.env.RATE_LIMIT_HASH_SECRET ?? process.env.CRON_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('RATE_LIMIT_HASH_SECRET is required in production.');
    }
    return crypto.createHash('sha256').update(`development:${kind}:${value}`).digest('hex');
  }
  return crypto.createHmac('sha256', secret).update(`${kind}:${value}`).digest('hex');
}

function utcDayWindow(now: Date): { start: Date; expiresAt: Date; suffix: string } {
  const suffix = now.toISOString().slice(0, 10);
  const start = new Date(`${suffix}T00:00:00.000Z`);
  return { start, expiresAt: new Date(start.getTime() + WINDOW_MS), suffix };
}

async function consumeCounter(
  tx: Prisma.TransactionClient,
  key: string,
  limit: number,
  dimension: 'email' | 'ip',
  windowStart: Date,
  expiresAt: Date,
): Promise<number> {
  const current = await tx.rateLimitCounter.findUnique({ where: { key } });
  if (!current || current.expiresAt <= new Date()) {
    await tx.rateLimitCounter.upsert({
      where: { key },
      create: { key, count: 1, windowStart, expiresAt },
      update: { count: 1, windowStart, expiresAt },
    });
    return 1;
  }

  if (current.count >= limit) throw new RateLimitExceeded(dimension);
  const updated = await tx.rateLimitCounter.update({
    where: { key },
    data: { count: { increment: 1 } },
    select: { count: true },
  });
  return updated.count;
}

export async function validateFreeScanRequest(
  email: string,
  honeypot: string,
): Promise<UsageValidationResult> {
  const traceId = crypto.randomUUID();
  if (honeypot.length > 0) {
    console.warn('[RATE_LIMIT] Honeypot triggered', { traceId });
    return { allowed: false, reason: 'Security validation failed. Please try again.' };
  }

  const headerList = await headers();
  const ip =
    headerList.get('x-vercel-forwarded-for')?.split(',')[0]?.trim() ||
    headerList.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    headerList.get('x-real-ip')?.trim() ||
    'unknown';
  const normalizedEmail = email.toLowerCase().trim();
  const now = new Date();
  const window = utcDayWindow(now);
  const emailHash = hashIdentifier('email', normalizedEmail);
  const ipHash = hashIdentifier('ip', ip);
  const emailKey = `free-scan:email:${emailHash}:${window.suffix}`;
  const ipKey = `free-scan:ip:${ipHash}:${window.suffix}`;

  try {
    const counts = await db.$transaction(async (tx) => {
      const emailCount = await consumeCounter(
        tx,
        emailKey,
        EMAIL_LIMIT_PER_DAY,
        'email',
        window.start,
        window.expiresAt,
      );
      const ipCount = await consumeCounter(
        tx,
        ipKey,
        IP_LIMIT_PER_DAY,
        'ip',
        window.start,
        window.expiresAt,
      );
      return { emailCount, ipCount };
    }, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });

    console.info('[RATE_LIMIT] allowed', {
      traceId,
      emailHash: emailHash.slice(0, 12),
      ipHash: ipHash.slice(0, 12),
      ...counts,
    });

    if (Math.random() < 0.01) {
      void db.rateLimitCounter.deleteMany({ where: { expiresAt: { lt: now } } }).catch(() => {});
    }
    return { allowed: true };
  } catch (error) {
    if (error instanceof RateLimitExceeded) {
      console.info('[RATE_LIMIT] blocked', {
        traceId,
        dimension: error.dimension,
        emailHash: emailHash.slice(0, 12),
        ipHash: ipHash.slice(0, 12),
      });
      return {
        allowed: false,
        reason: error.dimension === 'email'
          ? 'Daily limit reached for this email. Sign in to run additional scans.'
          : 'Daily limit reached for this network. Please try again tomorrow or sign in.',
      };
    }

    console.error('[RATE_LIMIT] durable limiter failed', {
      traceId,
      error: error instanceof Error ? error.message : 'unknown',
    });
    return process.env.RATE_LIMIT_FAIL_OPEN === 'true'
      ? { allowed: true }
      : { allowed: false, reason: 'Scan capacity is temporarily unavailable. Please try again shortly.' };
  }
}
