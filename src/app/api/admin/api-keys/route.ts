/**
 * @fileOverview GET|POST|PATCH /api/admin/api-keys — Service API key management (DEC-038).
 *
 * Issues and revokes per-consumer service keys (lmo-backend, NeuroOS hub,
 * MCP, …) validated by tryDbKeyAuth in get-auth-context.ts.
 *
 * GET   — List all keys (never the hash; prefix only) + active organizations
 *         (id/name, for the create dialog's org picker).
 * POST  — Create a key. The plaintext token (vizai_sk_…) is returned ONCE in
 *         this response and never retrievable again — only its SHA-256 hash
 *         is stored.
 * PATCH — Revoke a key ({ key_id, action: "revoke" }). Revocation is final:
 *         re-activation is deliberately unsupported — issue a new key instead.
 *
 * Admin-only (requireAdmin — session ADMIN or service key).
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import crypto from 'node:crypto';
import { requireAdmin, SERVICE_KEY_PREFIX } from '@/lib/auth/get-auth-context';
import { db } from '@/lib/db';
import { OperationalEventService, EVENT_TYPES, EVENT_SOURCES, SEVERITIES } from '@/lib/services/operational-event-service';

// Shown-once token: prefix + 192 bits of randomness (base64url, no padding).
function generateToken(): string {
  return SERVICE_KEY_PREFIX + crypto.randomBytes(24).toString('base64url');
}

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

const KEY_SELECT = {
  id:             true,
  name:           true,
  keyPrefix:      true,
  role:           true,
  organizationId: true,
  isActive:       true,
  expiresAt:      true,
  lastUsedAt:     true,
  createdBy:      true,
  createdAt:      true,
  revokedAt:      true,
  organization:   { select: { name: true } },
} as const;

// ── GET /api/admin/api-keys ───────────────────────────────────────────────────

export async function GET(_req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const [keys, organizations] = await Promise.all([
      db.serviceApiKey.findMany({
        orderBy: { createdAt: 'desc' },
        select:  KEY_SELECT,
      }),
      db.organization.findMany({
        where:   { isActive: true },
        orderBy: { name: 'asc' },
        select:  { id: true, name: true },
      }),
    ]);
    return NextResponse.json({ keys, organizations }, { status: 200 });
  } catch (err: any) {
    console.error('[admin/api-keys] GET failed', { error: err?.message });
    return NextResponse.json({ error: 'Failed to fetch API keys' }, { status: 500 });
  }
}

// ── POST /api/admin/api-keys ──────────────────────────────────────────────────

const CreateSchema = z.object({
  name:            z.string().min(2).max(100),
  organization_id: z.string().min(1),
  role:            z.enum(['ADMIN', 'CLIENT']).optional().default('ADMIN'),
  expires_in_days: z.number().int().min(1).max(3650).nullish(),
});

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 422 });
  }
  const input = parsed.data;

  try {
    const org = await db.organization.findUnique({
      where:  { id: input.organization_id },
      select: { id: true, name: true },
    });
    if (!org) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
    }

    const token = generateToken();
    const key = await db.serviceApiKey.create({
      data: {
        name:           input.name.trim(),
        keyPrefix:      token.slice(0, SERVICE_KEY_PREFIX.length + 8),
        keyHash:        hashToken(token),
        organizationId: org.id,
        role:           input.role,
        expiresAt:      input.expires_in_days
          ? new Date(Date.now() + input.expires_in_days * 24 * 60 * 60 * 1000)
          : null,
        createdBy:      auth.email,
      },
      select: KEY_SELECT,
    });

    void OperationalEventService.emit({
      eventType:      EVENT_TYPES.API_KEY_CREATED,
      severity:       SEVERITIES.INFO,
      source:         EVENT_SOURCES.ADMIN_API_KEYS_API,
      traceId:        crypto.randomUUID(),
      organizationId: org.id,
      entityType:     'api_key',
      entityId:       key.id,
      message:        `Service API key "${key.name}" created for org "${org.name}"`,
      metadata: {
        keyPrefix: key.keyPrefix,
        role:      key.role,
        expiresAt: key.expiresAt?.toISOString() ?? null,
        createdBy: auth.email,
      },
    });

    // `token` is returned exactly once — it is not stored and cannot be recovered.
    return NextResponse.json({ key, token }, { status: 201 });
  } catch (err: any) {
    console.error('[admin/api-keys] POST failed', { error: err?.message });
    return NextResponse.json({ error: 'Failed to create API key' }, { status: 500 });
  }
}

// ── PATCH /api/admin/api-keys ─────────────────────────────────────────────────

const PatchSchema = z.object({
  key_id: z.string().min(1),
  action: z.literal('revoke'),
});

export async function PATCH(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 422 });
  }

  try {
    const existing = await db.serviceApiKey.findUnique({
      where:  { id: parsed.data.key_id },
      select: { id: true, name: true, isActive: true, organizationId: true },
    });
    if (!existing) {
      return NextResponse.json({ error: 'API key not found' }, { status: 404 });
    }

    if (!existing.isActive) {
      const key = await db.serviceApiKey.findUnique({ where: { id: existing.id }, select: KEY_SELECT });
      return NextResponse.json({ key, already_revoked: true }, { status: 200 });
    }

    const key = await db.serviceApiKey.update({
      where:  { id: existing.id },
      data:   { isActive: false, revokedAt: new Date() },
      select: KEY_SELECT,
    });

    void OperationalEventService.emit({
      eventType:      EVENT_TYPES.API_KEY_REVOKED,
      severity:       SEVERITIES.WARNING,
      source:         EVENT_SOURCES.ADMIN_API_KEYS_API,
      traceId:        crypto.randomUUID(),
      organizationId: existing.organizationId,
      entityType:     'api_key',
      entityId:       existing.id,
      message:        `Service API key "${existing.name}" revoked`,
      metadata:       { revokedBy: auth.email },
    });

    return NextResponse.json({ key }, { status: 200 });
  } catch (err: any) {
    console.error('[admin/api-keys] PATCH failed', { error: err?.message });
    return NextResponse.json({ error: 'Failed to revoke API key' }, { status: 500 });
  }
}
