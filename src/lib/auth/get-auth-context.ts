/**
 * @fileOverview Server-side auth context resolver.
 *
 * Called at the top of every authenticated API route.
 * Verifies the Supabase session and resolves the user's
 * organizationId and role from the Postgres users table.
 *
 * Returns null if not authenticated — callers must handle this
 * by returning a 401 response.
 *
 * Usage:
 *   const auth = await getAuthContext();
 *   if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 *   // auth.uid, auth.role, auth.organizationId are now available
 */

import { createClient } from "@/lib/supabase/server";
import { db } from "@/lib/db";
import type { UserRole } from "@prisma/client";

export interface AuthContext {
  uid: string;
  email: string;
  role: UserRole;
  organizationId: string;
}

export async function getAuthContext(): Promise<AuthContext | null> {
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
