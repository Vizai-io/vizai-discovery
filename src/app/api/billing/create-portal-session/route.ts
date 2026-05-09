/**
 * @fileOverview POST /api/billing/create-portal-session
 *
 * Creates a Stripe Customer Portal session for the authenticated org.
 * The portal allows customers to manage their subscription, update
 * payment methods, view invoices, and cancel.
 *
 * Requires: organization must have a stripeCustomerId.
 * Returns: { url: string } — redirect the user to this URL.
 */

import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/get-auth-context";
import { OrganizationRepository } from "@/lib/repositories";
import { getStripe } from "@/lib/stripe";

export async function POST(_request: NextRequest) {
  try {
    const auth = await getAuthContext();
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (auth.organizationId === "unassigned") {
      return NextResponse.json(
        { error: "No organization assigned." },
        { status: 403 },
      );
    }

    const org = await OrganizationRepository.findById(auth.organizationId);
    if (!org) {
      return NextResponse.json({ error: "Organization not found." }, { status: 404 });
    }
    if (!org.stripeCustomerId) {
      return NextResponse.json(
        { error: "No billing account found. Complete a checkout first." },
        { status: 409 },
      );
    }

    const stripe = getStripe();
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:9002";

    const portalSession = await stripe.billingPortal.sessions.create({
      customer: org.stripeCustomerId,
      return_url: `${appUrl}/billing`,
    });

    return NextResponse.json({ url: portalSession.url });
  } catch (err: any) {
    console.error("Error creating portal session:", err);
    return NextResponse.json(
      { error: err.message || "Failed to create billing portal session." },
      { status: 500 },
    );
  }
}
