/**
 * @fileOverview GET /api/billing/status
 *
 * Returns the authenticated organization's billing state.
 * Used by the billing settings page to render the correct UI
 * without exposing raw Stripe IDs to the client.
 *
 * Response:
 * {
 *   tier: "STARTER" | "PROFESSIONAL" | "ENTERPRISE",
 *   subscription_status: string | null,
 *   current_period_end: string | null,   // ISO
 *   has_stripe_customer: boolean,
 *   access_state: OrganizationAccessState,
 * }
 */

import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/get-auth-context";
import { OrganizationRepository } from "@/lib/repositories";
import { getOrganizationAccessState } from "@/lib/stripe";

export async function GET() {
  try {
    const auth = await getAuthContext();
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (auth.organizationId === "unassigned") {
      return NextResponse.json({ error: "No organization assigned." }, { status: 403 });
    }

    const org = await OrganizationRepository.findById(auth.organizationId);
    if (!org) {
      return NextResponse.json({ error: "Organization not found." }, { status: 404 });
    }

    const accessState = getOrganizationAccessState(org);

    return NextResponse.json({
      tier: org.tier,
      subscription_status: org.subscriptionStatus ?? null,
      current_period_end: org.currentPeriodEnd?.toISOString() ?? null,
      has_stripe_customer: !!org.stripeCustomerId,
      access_state: {
        can_scan: accessState.canScan,
        can_create_schedules: accessState.canCreateSchedules,
        read_only: accessState.readOnly,
        warning: accessState.warning,
      },
    });
  } catch (err: any) {
    console.error("Error fetching billing status:", err);
    return NextResponse.json(
      { error: err.message || "Failed to fetch billing status" },
      { status: 500 },
    );
  }
}
