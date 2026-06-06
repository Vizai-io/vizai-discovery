/**
 * @fileOverview Server-side auth context resolver.
 *
 * Called at the top of every authenticated API route.
 * Supports two auth modes:
 *   1. Supabase session auth (browser users) — cookie-based
 *   2. Service API key auth (agents, MCP server) — Bearer token
 *
 * Service auth uses VIZAI_SERVICE_API_KEY + VIZAI_SERVICE_ORG_ID env vars.
 * When a request includes `Authorization: Bearer <key>` matching the service key,
 * it is authenticated as an ADMIN for the configured org. This enables NeuroOS
 * agents and the MCP server to call platform APIs without a browser session.
 *
 * Returns null if not authenticated — callers must handle this
 * by returning a 401 response.
 *
 * Usage:
 *   const auth = await getAuthContext();
 *   if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 *   // auth.uid, auth.role, auth.organizationId are now available
 */

import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/lib/db";
import type { UserRole } from "@prisma/client";

export interface AuthContext {
  uid: string;
  email: string;
  role: UserRole;
  organizationId: string;
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
  const serviceKey = process.env.VIZAI_SERVICE_API_KEY;
  const serviceOrgId = process.env.VIZAI_SERVICE_ORG_ID;

  if (!serviceKey || !serviceOrgId) return null;

  try {
    const headerStore = await headers();
    const authHeader = headerStore.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) return null;

    const token = authHeader.slice(7);
    if (token !== serviceKey) return null;

    // Service auth is valid — return admin context for the configured org
    return {
      uid: "service:neuroos",
      email: "neuroos@vizai.io",
      role: "ADMIN" as UserRole,
      organizationId: serviceOrgId,
    };
  } catch {
    return null;
  }
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
