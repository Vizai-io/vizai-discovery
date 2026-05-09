/**
 * @fileOverview Stripe integration layer.
 *
 * Single point of access for all Stripe logic.
 * DO NOT import stripe or call Stripe APIs from anywhere else.
 *
 * Contains:
 *  - Singleton Stripe client (getStripe)
 *  - Price ID → tier mapping (buildPriceTierMap)
 *  - Plan → Price ID resolution (getPriceId)
 *  - Centralized access state helper (getOrganizationAccessState)
 *
 * CRITICAL: Stripe is NOT the entitlement system.
 * All access decisions read from the database.
 * getOrganizationAccessState() makes NO Stripe API calls.
 */

import Stripe from "stripe";
import type { OrgTier } from "@prisma/client";

// ── Stripe client singleton ───────────────────────────────────────────────────

let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (!_stripe) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) {
      throw new Error(
        "STRIPE_SECRET_KEY is not set. Configure it in .env.local before using billing features.",
      );
    }
    _stripe = new Stripe(key, {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      apiVersion: "2026-04-22.dahlia" as any,
      typescript: true,
    });
  }
  return _stripe;
}

// ── Price ID → Tier mapping ───────────────────────────────────────────────────
// Built lazily so missing env vars in non-billing environments don't error.
// REQUIRED: derived from Stripe Price IDs — never from arbitrary metadata strings.

export function buildPriceTierMap(): Record<string, OrgTier> {
  const map: Record<string, OrgTier> = {};
  if (process.env.STRIPE_PRICE_PROFESSIONAL) {
    map[process.env.STRIPE_PRICE_PROFESSIONAL] = "PROFESSIONAL";
  }
  if (process.env.STRIPE_PRICE_ENTERPRISE) {
    map[process.env.STRIPE_PRICE_ENTERPRISE] = "ENTERPRISE";
  }
  return map;
}

// ── Plan → Price ID lookup ────────────────────────────────────────────────────

export type BillablePlan = "PROFESSIONAL" | "ENTERPRISE";

export function getPriceId(plan: BillablePlan): string {
  const envKey =
    plan === "PROFESSIONAL" ? "STRIPE_PRICE_PROFESSIONAL" : "STRIPE_PRICE_ENTERPRISE";
  const priceId = process.env[envKey];
  if (!priceId) {
    throw new Error(
      `${envKey} is not set. Configure Stripe Price IDs in .env.local before offering ${plan} upgrades.`,
    );
  }
  return priceId;
}

// ── Access State ──────────────────────────────────────────────────────────────

export type OrganizationAccessState = {
  canScan: boolean;
  canCreateSchedules: boolean;
  readOnly: boolean;
  warning: string | null;
};

/**
 * Determine the access state for an organization from its database billing fields.
 *
 * This is the ONLY entitlement interpretation layer.
 * All enforcement must call this function — never duplicate this logic.
 * Makes NO Stripe API calls — reads from DB state only.
 *
 * Access rules:
 *  - No subscription (STARTER free) → full access within STARTER limits
 *  - active / trialing              → full access
 *  - canceled + period not yet ended → grace period, full access with warning
 *  - past_due                        → access maintained, payment warning shown
 *  - canceled past period / unpaid / incomplete → read-only, downgraded to STARTER
 */
export function getOrganizationAccessState(org: {
  subscriptionStatus: string | null;
  currentPeriodEnd: Date | null;
}): OrganizationAccessState {
  const { subscriptionStatus: status, currentPeriodEnd } = org;

  // STARTER free tier — no subscription, full functional access
  if (!status) {
    return { canScan: true, canCreateSchedules: true, readOnly: false, warning: null };
  }

  // Active or trialing — full access, no warning
  if (status === "active" || status === "trialing") {
    return { canScan: true, canCreateSchedules: true, readOnly: false, warning: null };
  }

  // Canceled but still within the paid period — grace access with warning
  if (status === "canceled" && currentPeriodEnd && currentPeriodEnd > new Date()) {
    const until = currentPeriodEnd.toLocaleDateString(undefined, {
      month: "long",
      day: "numeric",
      year: "numeric",
    });
    return {
      canScan: true,
      canCreateSchedules: true,
      readOnly: false,
      warning: `Subscription canceled. Full access continues until ${until}.`,
    };
  }

  // Past due — keep access, escalated payment warning
  if (status === "past_due") {
    return {
      canScan: true,
      canCreateSchedules: true,
      readOnly: false,
      warning:
        "Payment failed. Update your payment method to avoid service interruption.",
    };
  }

  // Anything else (expired cancel, unpaid, incomplete) → read-only, STARTER limits
  return {
    canScan: false,
    canCreateSchedules: false,
    readOnly: true,
    warning: "Your subscription is inactive. Upgrade to resume full access.",
  };
}
