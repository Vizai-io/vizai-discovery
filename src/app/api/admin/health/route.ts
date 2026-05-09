/**
 * @fileOverview GET /api/admin/health
 *
 * ADMIN-only operational health inspection for the authenticated user's org.
 *
 * Returns a deterministic health report covering five operational areas:
 * stuck scans, recent failures, overdue schedules, billing issues,
 * notification backlog.
 *
 * This is an inspection endpoint — it surfaces issues for human review,
 * not an automated remediation system.
 *
 * Access control: ADMIN role required. Returns 403 for CLIENT users.
 * No writes. No LLM. Stateless per-call.
 */

import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/get-auth-context";
import { OperationalHealthService } from "@/lib/services/operational-health.service";

export async function GET() {
  try {
    const auth = await getAuthContext();
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (auth.organizationId === "unassigned") {
      return NextResponse.json({ error: "No organization" }, { status: 403 });
    }
    if (auth.role !== "ADMIN") {
      return NextResponse.json(
        { error: "Admin access required" },
        { status: 403 },
      );
    }

    const report = await OperationalHealthService.getReport(auth.organizationId);
    return NextResponse.json(report);
  } catch (err: any) {
    console.error("[api/admin/health] Error:", err);
    return NextResponse.json(
      { error: err.message || "Health check failed" },
      { status: 500 },
    );
  }
}
