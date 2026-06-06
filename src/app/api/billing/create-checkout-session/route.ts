/**
 * @fileOverview POST /api/billing/create-checkout-session
 *
 * Creates a Stripe Checkout session for upgrading to PROFESSIONAL or ENTERPRISE.
 * Returns the checkout URL for the client to redirect to.
 *
 * Request body:
 * {
 *   plan: "PROFESSIONAL" | "ENTERPRISE",
 * }
 *
 * Response:
 * {
 *   url: string,   // Stripe Checkout URL
 * }
 *
 * After checkout completes, the checkout.session.completed webhook fires
 * and updates organization.tier + billing fields via the webhook handler.
 */

import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/get-auth-context";
import { OrganizationRepository } from "@/lib/repositories";
import {
  getCheckoutCatalogItem,
  getCheckoutLineItems,
  getStripe,
  type BillablePlan,
} from "@/lib/stripe";

const LEGACY_PLAN_TO_SKU: Record<BillablePlan, string> = {
  PROFESSIONAL: "TIER1_FOUNDATION",
  ENTERPRISE: "TIER2_REINFORCEMENT",
};

export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthContext();
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (auth.organizationId === "unassigned") {
      return NextResponse.json(
        { error: "Complete onboarding before upgrading your plan." },
        { status: 403 },
      );
    }

    const body = await request.json();
    const { plan, sku } = body;
    const checkoutSku = sku || (plan ? LEGACY_PLAN_TO_SKU[plan as BillablePlan] : null);

    if (!checkoutSku) {
      return NextResponse.json(
        { error: "Invalid checkout item." },
        { status: 400 },
      );
    }

    const org = await OrganizationRepository.findById(auth.organizationId);
    if (!org) {
      return NextResponse.json({ error: "Organization not found." }, { status: 404 });
    }

    const stripe = getStripe();
    const item = getCheckoutCatalogItem(checkoutSku);
    const lineItems = getCheckoutLineItems(item);
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:9002";

    // Build session params — reuse existing Stripe customer if available
    const sessionParams: Parameters<typeof stripe.checkout.sessions.create>[0] = {
      mode: item.mode,
      line_items: lineItems,
      // Pass organizationId in metadata so the webhook can identify the org
      metadata: {
        organizationId: auth.organizationId,
        sku: item.sku,
        itemName: item.name,
        mappedTier: item.mappedTier ?? "",
      },
      success_url: `${appUrl}/billing?success=1`,
      cancel_url: `${appUrl}/billing`,
      // Allow promotion codes
      allow_promotion_codes: true,
    };

    if (org.stripeCustomerId) {
      // Existing Stripe customer — reuse to keep billing history consolidated
      sessionParams.customer = org.stripeCustomerId;
    } else {
      // New customer — pre-fill email for a smoother checkout experience
      sessionParams.customer_email = auth.email;
    }

    const session = await stripe.checkout.sessions.create(sessionParams);

    if (!session.url) {
      throw new Error("Stripe did not return a checkout URL.");
    }

    return NextResponse.json({ url: session.url });
  } catch (err: any) {
    console.error("Error creating checkout session:", err);
    return NextResponse.json(
      { error: err.message || "Failed to create checkout session." },
      { status: 500 },
    );
  }
}
