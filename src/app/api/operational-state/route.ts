/**
 * @fileOverview GET /api/operational-state
 *
 * Returns the org's current operational state — primary action, continuity items,
 * and summary counters — all derived from Postgres by OperationalCohesionService.
 *
 * Used by:
 *  - Dashboard primary action card
 *  - Workflow continuity strip
 *
 * No writes. No LLM. Stateless per-call.
 */

import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/get-auth-context";
import { OperationalCohesionService } from "@/lib/services/operational-cohesion.service";

export async function GET() {
  try {
    const auth = await getAuthContext();
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (auth.organizationId === "unassigned") {
      return NextResponse.json({ error: "No organization" }, { status: 403 });
    }

    const state = await OperationalCohesionService.getState(auth.organizationId, auth.role);
    return NextResponse.json(state);
  } catch (err: any) {
    console.error("[api/operational-state] Error:", err);
    return NextResponse.json(
      { error: err.message || "Failed to load operational state" },
      { status: 500 },
    );
  }
}
