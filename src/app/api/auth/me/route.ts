/**
 * @fileOverview GET /api/auth/me — Fetch the authenticated user's profile.
 *
 * Called by the client-side auth context after Supabase login to resolve
 * the user's role and organizationId from Postgres.
 *
 * If the user exists in Supabase Auth but not yet in Postgres (first login),
 * they are auto-provisioned in the "unassigned" org with CLIENT role.
 * An admin must move them to the correct org afterward.
 *
 * Refinement 1: All log statements include a traceId (crypto.randomUUID())
 * so provisioning failures can be correlated across log aggregators.
 *
 * Returns:
 * {
 *   uid: string,
 *   email: string,
 *   displayName: string | null,
 *   role: "admin" | "client",
 *   organizationId: string,
 * }
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { UserRepository } from "@/lib/repositories";
import { OperationalEventService, EVENT_TYPES, EVENT_SOURCES, SEVERITIES } from "@/lib/services/operational-event-service";

export async function GET() {
  // ── Correlation ID — included in every log line for this request ────────────
  const traceId = crypto.randomUUID();

  try {
    const supabase = await createClient();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (error || !user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    // ── Attempt to find existing Postgres user ────────────────────────────────
    let dbUser = await UserRepository.findById(user.id);

    if (!dbUser) {
      // ── First login — auto-provision in "unassigned" org ───────────────────
      // The "unassigned" org was seeded by migration 20260508000007.
      // An admin must move the user to a real org before they can run scans
      // (enforced in /api/scan with 403).
      try {
        dbUser = await UserRepository.upsertOnLogin({
          id: user.id,
          email: user.email!,
          displayName: user.user_metadata?.full_name ?? null,
          role: "CLIENT",
          organizationId: "unassigned",
        });

        console.log("[auth/me] User provisioned on first login", {
          traceId,
          supabaseId: user.id,
          email: user.email,
          organizationId: "unassigned",
          phase: "first_login_provision",
        });

        // USER_PROVISIONED — first login auto-provisioning event
        void OperationalEventService.emit({
          eventType:      EVENT_TYPES.USER_PROVISIONED,
          severity:       SEVERITIES.INFO,
          source:         EVENT_SOURCES.AUTH_API,
          traceId,
          userId:         user.id,
          organizationId: 'unassigned',
          entityType:     'user',
          entityId:       user.id,
          message:        `New user auto-provisioned on first login (org: unassigned)`,
          metadata: {
            email:      user.email,
            phase:      'first_login_provision',
          },
        });
      } catch (provisionErr: any) {
        // ── Provisioning failure — NEVER swallow silently ─────────────────────
        // Logged with full context so the failure is observable in all environments.
        console.error("[auth/me] PROVISIONING FAILURE — user not written to Postgres", {
          traceId,
          supabaseId: user.id,
          email: user.email,
          phase: "upsertOnLogin",
          prismaCode: provisionErr?.code ?? "unknown",
          prismaMessage: provisionErr?.message ?? "unknown",
          meta: provisionErr?.meta ?? null,
        });

        return NextResponse.json(
          {
            error:
              "Failed to provision user account. If this persists, contact support and provide trace ID.",
            traceId,
          },
          { status: 500 },
        );
      }
    } else {
      // ── Returning user — update last login time ───────────────────────────
      await UserRepository.update(user.id, { lastLoginAt: new Date() });
    }

    if (!dbUser.isActive) {
      return NextResponse.json({ error: "Account deactivated" }, { status: 403 });
    }

    return NextResponse.json({
      uid: dbUser.id,
      email: dbUser.email,
      displayName: dbUser.displayName ?? null,
      // Normalize to lowercase to match existing UserProfile type
      role: dbUser.role === "ADMIN" ? "admin" : "client",
      organizationId: dbUser.organizationId,
    });
  } catch (err: any) {
    // ── Unexpected error — logged with traceId ────────────────────────────────
    console.error("[auth/me] Unexpected error in profile resolution", {
      traceId,
      error: err?.message ?? "unknown",
      code: err?.code ?? null,
      stack: err?.stack ?? null,
    });

    return NextResponse.json(
      { error: "Failed to fetch user profile" },
      { status: 500 },
    );
  }
}
