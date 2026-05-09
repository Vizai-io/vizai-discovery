/**
 * @fileOverview Admin User Management API.
 *
 * GET  /api/admin/users          — List all users with org context
 * PATCH /api/admin/users         — Assign user to org OR replay provisioning
 *
 * Admin only. Requires admin role via requireAdmin().
 *
 * Refinement 4: Replay Provisioning action —
 *   Reruns UserRepository.upsertOnLogin() for a selected user.
 *   Accelerates stabilization workflows and reduces manual DB intervention.
 *   Useful for users whose provisioning failed or whose org assignment needs repair.
 *
 * Refinement A: traceId on all logs.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/get-auth-context";
import { UserRepository } from "@/lib/repositories";
import { db } from "@/lib/db";
import { OperationalEventService, EVENT_TYPES, EVENT_SOURCES, SEVERITIES } from "@/lib/services/operational-event-service";

// ── GET /api/admin/users ──────────────────────────────────────────────────────

export async function GET(_req: NextRequest) {
  const traceId = crypto.randomUUID();

  const auth = await requireAdmin();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const users = await db.user.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id:             true,
        email:          true,
        displayName:    true,
        role:           true,
        organizationId: true,
        isActive:       true,
        lastLoginAt:    true,
        createdAt:      true,
        organization: {
          select: {
            name:     true,
            slug:     true,
            isActive: true,
          },
        },
      },
    });

    // Classify provisioning state for each user
    const enriched = users.map((u) => ({
      ...u,
      provisioningState:
        u.organizationId === "unassigned"
          ? "PENDING_ORG_ASSIGNMENT"
          : "COMPLETE",
      lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
      createdAt:   u.createdAt.toISOString(),
    }));

    // Surface unassigned users first for operational visibility
    enriched.sort((a, b) => {
      if (a.provisioningState === "PENDING_ORG_ASSIGNMENT" && b.provisioningState !== "PENDING_ORG_ASSIGNMENT") return -1;
      if (a.provisioningState !== "PENDING_ORG_ASSIGNMENT" && b.provisioningState === "PENDING_ORG_ASSIGNMENT") return 1;
      return 0;
    });

    console.log("[admin/users] List fetched", {
      traceId,
      count:             users.length,
      unassignedCount:   enriched.filter((u) => u.organizationId === "unassigned").length,
    });

    return NextResponse.json({ users: enriched });

  } catch (err: any) {
    console.error("[admin/users] GET failed", { traceId, error: err?.message });
    return NextResponse.json({ error: "Failed to load users" }, { status: 500 });
  }
}

// ── PATCH /api/admin/users ────────────────────────────────────────────────────

const AssignOrgSchema = z.object({
  userId:         z.string().min(1),
  organizationId: z.string().min(1),
  action:         z.literal("assign_org").optional().default("assign_org"),
});

const ReplayProvisioningSchema = z.object({
  userId: z.string().min(1),
  action: z.literal("replay_provisioning"),
});

const PatchSchema = z.discriminatedUnion("action", [
  AssignOrgSchema,
  ReplayProvisioningSchema,
]);

export async function PATCH(req: NextRequest) {
  const traceId = crypto.randomUUID();

  const auth = await requireAdmin();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 422 },
    );
  }

  const data = parsed.data;

  // ── Action: assign_org ────────────────────────────────────────────────────
  if (data.action === "assign_org") {
    const { userId, organizationId } = data;

    // Validate target org exists
    const org = await db.organization.findUnique({ where: { id: organizationId }, select: { id: true, name: true } });
    if (!org) {
      return NextResponse.json({ error: `Organization '${organizationId}' not found` }, { status: 404 });
    }

    try {
      await db.user.update({
        where: { id: userId },
        data:  { organizationId },
      });

      console.log("[admin/users] Org assigned", {
        traceId,
        userId,
        organizationId,
        orgName: org.name,
        phase: "assign_org",
      });

      void OperationalEventService.emit({
        eventType:      EVENT_TYPES.ADMIN_ACTION,
        severity:       SEVERITIES.INFO,
        source:         EVENT_SOURCES.ADMIN_USERS_API,
        traceId,
        userId:         auth.uid,
        organizationId: organizationId,
        entityType:     'user',
        entityId:       userId,
        message:        `Admin assigned user to org "${org.name}"`,
        metadata: {
          action:         'assign_org',
          targetUserId:   userId,
          organizationId,
          orgName:        org.name,
        },
      });

      return NextResponse.json({ ok: true, userId, organizationId });

    } catch (err: any) {
      console.error("[admin/users] Org assignment failed", {
        traceId,
        userId,
        organizationId,
        error: err?.message,
      });
      return NextResponse.json({ error: "Failed to assign organization" }, { status: 500 });
    }
  }

  // ── Action: replay_provisioning (Refinement 4) ────────────────────────────
  if (data.action === "replay_provisioning") {
    const { userId } = data;

    const existingUser = await db.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, displayName: true, organizationId: true },
    });

    if (!existingUser) {
      // User not found in Postgres — cannot replay without Supabase admin access
      // to retrieve their metadata. Return a clear error for the admin.
      return NextResponse.json(
        {
          error: "User not found in Postgres. They must log in at least once to be auto-provisioned, or contact support to manually provision them.",
          userId,
        },
        { status: 404 },
      );
    }

    try {
      // Re-run upsertOnLogin — ensures the row is valid, resets lastLoginAt,
      // and re-establishes FK constraints if the org row was recreated.
      const updated = await UserRepository.upsertOnLogin({
        id:             existingUser.id,
        email:          existingUser.email,
        displayName:    existingUser.displayName ?? undefined,
        role:           "CLIENT",
        organizationId: existingUser.organizationId,
      });

      console.log("[admin/users] Provisioning replayed", {
        traceId,
        userId,
        email:          updated.email,
        organizationId: updated.organizationId,
        phase: "replay_provisioning",
      });

      void OperationalEventService.emit({
        eventType:      EVENT_TYPES.PROVISIONING_REPLAY,
        severity:       SEVERITIES.INFO,
        source:         EVENT_SOURCES.ADMIN_USERS_API,
        traceId,
        userId:         auth.uid,
        organizationId: updated.organizationId,
        entityType:     'user',
        entityId:       userId,
        message:        `Admin replayed provisioning for user ${updated.email}`,
        metadata: {
          action:         'replay_provisioning',
          targetUserId:   userId,
          targetEmail:    updated.email,
          organizationId: updated.organizationId,
        },
      });

      return NextResponse.json({
        ok:             true,
        userId,
        email:          updated.email,
        organizationId: updated.organizationId,
        message:        "Provisioning replayed successfully.",
      });

    } catch (err: any) {
      console.error("[admin/users] Replay provisioning failed", {
        traceId,
        userId,
        error:     err?.message,
        prismaCode: err?.code,
      });
      return NextResponse.json(
        { error: "Failed to replay provisioning", detail: err?.message },
        { status: 500 },
      );
    }
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
