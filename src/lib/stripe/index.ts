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

export type CheckoutSku =
  | "TIER0_SNAPSHOT"
  | "TIER1_FOUNDATION"
  | "TIER2_REINFORCEMENT"
  | "TIER3_GOVERNANCE"
  | "ADDON_COMPETITOR_COMPARISON"
  | "ADDON_EXTENDED_QUERY_PACK"
  | "ADDON_QUARTERLY_DEEP_AUDIT"
  | "ADDON_CONTENT_OPTIMIZATION_PAGE"
  | "ADDON_MULTI_LANGUAGE_TESTING"
  | "ADDON_PRIORITY_SUPPORT";

export type CheckoutCatalogItem = {
  sku: CheckoutSku;
  name: string;
  mode: "payment" | "subscription";
  priceEnv: string;
  setupPriceEnv?: string;
  mappedTier?: OrgTier;
};

export const CHECKOUT_CATALOG: Record<CheckoutSku, CheckoutCatalogItem> = {
  TIER0_SNAPSHOT: {
    sku: "TIER0_SNAPSHOT",
    name: "Tier 0: AI Snapshot + Registry Entry",
    mode: "payment",
    priceEnv: "STRIPE_TIER0_SNAPSHOT_PRICE_ID",
  },
  TIER1_FOUNDATION: {
    sku: "TIER1_FOUNDATION",
    name: "Tier 1: Foundation + Verified Registry Entry",
    mode: "subscription",
    priceEnv: "STRIPE_TIER1_FOUNDATION_MONTHLY_PRICE_ID",
    setupPriceEnv: "STRIPE_TIER1_FOUNDATION_SETUP_PRICE_ID",
    mappedTier: "PROFESSIONAL",
  },
  TIER2_REINFORCEMENT: {
    sku: "TIER2_REINFORCEMENT",
    name: "Tier 2: AI Signal Reinforcement",
    mode: "subscription",
    priceEnv: "STRIPE_TIER2_REINFORCEMENT_MONTHLY_PRICE_ID",
    setupPriceEnv: "STRIPE_TIER2_REINFORCEMENT_SETUP_PRICE_ID",
    mappedTier: "ENTERPRISE",
  },
  TIER3_GOVERNANCE: {
    sku: "TIER3_GOVERNANCE",
    name: "Tier 3: Managed AI Accuracy Governance",
    mode: "subscription",
    priceEnv: "STRIPE_TIER3_GOVERNANCE_MONTHLY_PRICE_ID",
    setupPriceEnv: "STRIPE_TIER3_GOVERNANCE_SETUP_PRICE_ID",
    mappedTier: "ENTERPRISE",
  },
  ADDON_COMPETITOR_COMPARISON: {
    sku: "ADDON_COMPETITOR_COMPARISON",
    name: "Competitor Comparison Report",
    mode: "payment",
    priceEnv: "STRIPE_ADDON_COMPETITOR_COMPARISON_PRICE_ID",
  },
  ADDON_EXTENDED_QUERY_PACK: {
    sku: "ADDON_EXTENDED_QUERY_PACK",
    name: "Extended Query Pack",
    mode: "payment",
    priceEnv: "STRIPE_ADDON_EXTENDED_QUERY_PACK_PRICE_ID",
  },
  ADDON_QUARTERLY_DEEP_AUDIT: {
    sku: "ADDON_QUARTERLY_DEEP_AUDIT",
    name: "Quarterly Deep Audit",
    mode: "subscription",
    priceEnv: "STRIPE_ADDON_QUARTERLY_DEEP_AUDIT_PRICE_ID",
  },
  ADDON_CONTENT_OPTIMIZATION_PAGE: {
    sku: "ADDON_CONTENT_OPTIMIZATION_PAGE",
    name: "Content Optimization",
    mode: "payment",
    priceEnv: "STRIPE_ADDON_CONTENT_OPTIMIZATION_PAGE_PRICE_ID",
  },
  ADDON_MULTI_LANGUAGE_TESTING: {
    sku: "ADDON_MULTI_LANGUAGE_TESTING",
    name: "Multi-Language Testing",
    mode: "payment",
    priceEnv: "STRIPE_ADDON_MULTI_LANGUAGE_TESTING_PRICE_ID",
  },
  ADDON_PRIORITY_SUPPORT: {
    sku: "ADDON_PRIORITY_SUPPORT",
    name: "Priority Support",
    mode: "subscription",
    priceEnv: "STRIPE_ADDON_PRIORITY_SUPPORT_MONTHLY_PRICE_ID",
  },
};

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
  const professionalPriceId =
    process.env.STRIPE_PROFESSIONAL_PRICE_ID || process.env.STRIPE_PRICE_PROFESSIONAL;
  const enterprisePriceId =
    process.env.STRIPE_ENTERPRISE_PRICE_ID || process.env.STRIPE_PRICE_ENTERPRISE;

  if (professionalPriceId) {
    map[professionalPriceId] = "PROFESSIONAL";
  }
  if (enterprisePriceId) {
    map[enterprisePriceId] = "ENTERPRISE";
  }
  for (const item of Object.values(CHECKOUT_CATALOG)) {
    const priceId = process.env[item.priceEnv];
    if (priceId && item.mappedTier) {
      map[priceId] = item.mappedTier;
    }
  }
  return map;
}

// ── Plan → Price ID lookup ────────────────────────────────────────────────────

export type BillablePlan = "PROFESSIONAL" | "ENTERPRISE";

export function getPriceId(plan: BillablePlan): string {
  const envKeys =
    plan === "PROFESSIONAL"
      ? ["STRIPE_PROFESSIONAL_PRICE_ID", "STRIPE_PRICE_PROFESSIONAL"]
      : ["STRIPE_ENTERPRISE_PRICE_ID", "STRIPE_PRICE_ENTERPRISE"];
  const priceId = envKeys.map((envKey) => process.env[envKey]).find(Boolean);
  if (!priceId) {
    throw new Error(
      `${envKeys.join(" or ")} is not set. Configure Stripe Price IDs in .env.local before offering ${plan} upgrades.`,
    );
  }
  return priceId;
}

export function getCheckoutCatalogItem(sku: string): CheckoutCatalogItem {
  const item = CHECKOUT_CATALOG[sku as CheckoutSku];
  if (!item) {
    throw new Error(`Unknown checkout item "${sku}".`);
  }
  return item;
}

export function getCheckoutLineItems(
  item: CheckoutCatalogItem,
): { price: string; quantity: number }[] {
  const primaryPriceId = process.env[item.priceEnv];
  if (!primaryPriceId) {
    throw new Error(
      `${item.priceEnv} is not set. Configure the Stripe test price before offering ${item.name}.`,
    );
  }

  const lineItems = [{ price: primaryPriceId, quantity: 1 }];
  if (item.setupPriceEnv) {
    const setupPriceId = process.env[item.setupPriceEnv];
    if (!setupPriceId) {
      throw new Error(
        `${item.setupPriceEnv} is not set. Configure the Stripe setup price before offering ${item.name}.`,
      );
    }
    lineItems.unshift({ price: setupPriceId, quantity: 1 });
  }
  return lineItems;
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
