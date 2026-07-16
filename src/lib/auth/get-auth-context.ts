/**
 * @fileOverview Server-side auth context resolver.
 *
 * Called at the top of every authenticated API route.
 * Supports two auth modes:
 *   1. Supabase session auth (browser users) — cookie-based
 *   2. Service API key auth (lmo-backend, agents, MCP server) — Bearer token
 *
 * Service keys (DEC-038): issued per consumer from /admin/api-keys, format
 * `vizai_sk_<random>`. Only the SHA-256 hash is stored (service_api_keys
 * table); a bearer token with the vizai_sk_ prefix is hashed and looked up,
 * and authenticates as the key's role for the key's org with a per-key
 * identity (`service:<keyId>`) so logs attribute calls to the consumer.
 *
 * LEGACY (deprecated): the shared VIZAI_SERVICE_API_KEY + VIZAI_SERVICE_ORG_ID
 * env vars still authenticate as before. Remove both vars — and
 * tryLegacyEnvKeyAuth below — once every consumer holds an issued key.
 *
 * Returns null if not authenticated — callers must handle this
 * by returning a 401 response.
 *
 * Usage:
 *   const auth = await getAuthContext();
 *   if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 *   // auth.uid, auth.role, auth.organizationId are now available
 */

import crypto from "node:crypto";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/lib/db";
import type { UserRole } from "@prisma/client";

/** Issued service keys start with this prefix; anything else is legacy. */
export const SERVICE_KEY_PREFIX = "vizai_sk_";

/** lastUsedAt is touched at most once per interval to avoid write amplification. */
const LAST_USED_THROTTLE_MS = 60_000;

/** Warn about the deprecated env-var key once per process, not per request. */
let legacyKeyWarned = false;

export interface AuthContext {
  uid: string;
  email: string;
  role: UserRole;
  organizationId: string;
  authMode: "session" | "service";
  scopes: string[];
  serviceKeyId?: string;
}

/**
 * Try service API key auth first, then fall back to Supabase session.
 */
export async function getAuthContext(): Promise<AuthContext | null> {
  // ── Service API key auth (for agents, MCP server) ─────────────
  const serviceAuth = await tryServiceAuth();
  if (serviceAuth) return serviceAuth;

  // ── Supabase session auth (for browser users) ─────────────────
  return trySupabaseAuth();
}

async function tryServiceAuth(): Promise<AuthContext | null> {
  const token = await readBearerToken();
  if (!token) return null;

  if (token.startsWith(SERVICE_KEY_PREFIX)) {
    return tryDbKeyAuth(token);
  }
  return tryLegacyEnvKeyAuth(token);
}

async function readBearerToken(): Promise<string | null> {
  try {
    const headerStore = await headers();
    const authHeader = headerStore.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) return null;
    const token = authHeader.slice(7).trim();
    return token.length > 0 ? token : null;
  } catch {
    return null;
  }
}

/** Issued key auth: SHA-256 lookup in service_api_keys (DEC-038). */
async function tryDbKeyAuth(token: string): Promise<AuthContext | null> {
  try {
    const keyHash = crypto.createHash("sha256").update(token).digest("hex");

    const key = await db.serviceApiKey.findUnique({
      where: { keyHash },
      select: {
        id:             true,
        role:           true,
        organizationId: true,
        scopes:         true,
        isActive:       true,
        expiresAt:      true,
        lastUsedAt:     true,
      },
    });

    if (!key || !key.isActive) return null;
    if (key.expiresAt && key.expiresAt.getTime() < Date.now()) return null;

    // Throttled usage stamp — fire-and-forget, never blocks the request.
    if (!key.lastUsedAt || Date.now() - key.lastUsedAt.getTime() > LAST_USED_THROTTLE_MS) {
      void db.serviceApiKey
        .update({ where: { id: key.id }, data: { lastUsedAt: new Date() } })
        .catch(() => {});
    }

    return {
      uid: `service:${key.id}`,
      email: `service+${key.id}@vizai.io`,
      role: key.role,
      organizationId: key.organizationId,
      authMode: "service",
      scopes: key.scopes,
      serviceKeyId: key.id,
    };
  } catch {
    return null;
  }
}

/**
 * DEPRECATED: shared env-var key (pre-DEC-038). Delete this path — and the
 * VIZAI_SERVICE_API_KEY / VIZAI_SERVICE_ORG_ID env vars — once lmo-backend
 * and the NeuroOS hub hold issued vizai_sk_ keys.
 */
function tryLegacyEnvKeyAuth(token: string): AuthContext | null {
  const serviceKey = process.env.VIZAI_SERVICE_API_KEY;
  const serviceOrgId = process.env.VIZAI_SERVICE_ORG_ID;

  if (!serviceKey || !serviceOrgId) return null;

  const tokenBuf = Buffer.from(token);
  const keyBuf = Buffer.from(serviceKey);
  if (tokenBuf.length !== keyBuf.length || !crypto.timingSafeEqual(tokenBuf, keyBuf)) {
    return null;
  }

  if (!legacyKeyWarned) {
    legacyKeyWarned = true;
    console.warn(
      "[auth] DEPRECATED shared VIZAI_SERVICE_API_KEY used — issue per-consumer keys at /admin/api-keys and remove the env vars.",
    );
  }

  return {
    uid: "service:legacy-env-key",
    email: "neuroos@vizai.io",
    role: "ADMIN" as UserRole,
    organizationId: serviceOrgId,
    authMode: "service",
    scopes: (process.env.VIZAI_SERVICE_SCOPES ?? "registry:read,registry:run")
      .split(",")
      .map((scope) => scope.trim())
      .filter(Boolean),
  };
}

async function trySupabaseAuth(): Promise<AuthContext | null> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (error || !user) {
      return null;
    }

    // Resolve role and organizationId from the Postgres users table.
    // Role is NEVER read from Supabase user_metadata (user-modifiable).
    const dbUser = await db.user.findUnique({
      where: { id: user.id },
      select: {
        id: true,
        email: true,
        role: true,
        organizationId: true,
        isActive: true,
      },
    });

    if (!dbUser || !dbUser.isActive) {
      return null;
    }

    return {
      uid: dbUser.id,
      email: dbUser.email,
      role: dbUser.role,
      organizationId: dbUser.organizationId,
      authMode: "session",
      scopes: [],
    };
  } catch {
    return null;
  }
}

/**
 * Require admin role. Returns null if user is not an ADMIN.
 * Use in admin-only API routes.
 */
export async function requireAdmin(): Promise<AuthContext | null> {
  const auth = await getAuthContext();
  if (!auth || auth.role !== "ADMIN") return null;
  return auth;
}
