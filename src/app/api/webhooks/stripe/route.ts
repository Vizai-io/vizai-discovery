/**
 * @fileOverview POST /api/webhooks/stripe
 *
 * Stripe webhook handler. Processes subscription lifecycle events
 * and keeps the organization billing state in sync.
 *
 * Security:
 *   - Raw body read via request.text() BEFORE any other parsing
 *   - Signature verified with stripe.webhooks.constructEvent()
 *   - Returns 401 on invalid signature — Stripe will retry
 *
 * Idempotency:
 *   - event.id is checked in ProcessedStripeEvent BEFORE processing
 *   - The org update AND the event insert happen in a single transaction
 *   - Duplicate deliveries are treated as successful no-ops (return 200)
 *
 * Handled events:
 *   checkout.session.completed      → set customerId, subscriptionId, tier, status
 *   customer.subscription.updated  → sync status, tier, currentPeriodEnd
 *   customer.subscription.deleted  → set canceled, downgrade to STARTER
 *   invoice.payment_failed         → set past_due status
 *
 * Unknown event types: ignored, return 200 immediately.
 * Tier derivation: ALWAYS from PRICE_TIER_MAP (price ID → tier).
 *                  NEVER from metadata.plan (untrustworthy).
 */

import { NextRequest, NextResponse } from "next/server";
import { getStripe, buildPriceTierMap } from "@/lib/stripe";
import { OrganizationRepository } from "@/lib/repositories";
import { NotificationService } from "@/lib/services/notification.service";
import { db } from "@/lib/db";
import type { OrgTier } from "@prisma/client";
import type Stripe from "stripe";

// Required for raw body access — disable Next.js body parsing
export const dynamic = "force-dynamic";

// ── Helpers ───────────────────────────────────────────────────────────────────

function getPriceIdFromSubscription(subscription: Stripe.Subscription): string | null {
  return subscription.items?.data?.[0]?.price?.id ?? null;
}

function getCurrentPeriodEnd(subscription: Stripe.Subscription): Date {
  // In API version 2026-04-22.dahlia, current_period_end lives on SubscriptionItem
  const periodEnd = subscription.items?.data?.[0]?.current_period_end;
  if (!periodEnd) return new Date();
  return new Date(periodEnd * 1000);
}

// ── Main handler ──────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  // ── 1. Read raw body FIRST — before any parsing ─────────────
  const rawBody = await request.text();
  const sig = request.headers.get("stripe-signature");

  if (!sig) {
    console.error("[webhook/stripe] Missing stripe-signature header");
    return NextResponse.json({ error: "Missing signature" }, { status: 401 });
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error("[webhook/stripe] STRIPE_WEBHOOK_SECRET not configured");
    return NextResponse.json({ error: "Webhook not configured" }, { status: 500 });
  }

  // ── 2. Verify signature ──────────────────────────────────────
  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(rawBody, sig, webhookSecret);
  } catch (err: any) {
    console.error(`[webhook/stripe] Signature verification failed: ${err.message}`);
    // Return 401 so Stripe retries — not 400 which stops retries
    return NextResponse.json({ error: "Signature verification failed" }, { status: 401 });
  }

  // ── 3. Filter to required event types ───────────────────────
  const HANDLED_EVENTS = [
    "checkout.session.completed",
    "customer.subscription.updated",
    "customer.subscription.deleted",
    "invoice.payment_failed",
  ] as const;

  if (!HANDLED_EVENTS.includes(event.type as (typeof HANDLED_EVENTS)[number])) {
    // Unknown event — acknowledge immediately, do nothing
    return NextResponse.json({ received: true, handled: false });
  }

  // ── 4. Process event in idempotent transaction ───────────────
  try {
    await db.$transaction(async (tx) => {
      // Check idempotency — has this exact event already been processed?
      const alreadyProcessed = await tx.processedStripeEvent.findUnique({
        where: { id: event.id },
      });
      if (alreadyProcessed) {
        // Duplicate delivery — treat as success, skip all processing
        console.log(
          `[webhook/stripe] Duplicate event ignored: ${event.id} (${event.type})`,
        );
        return;
      }

      const priceTierMap = buildPriceTierMap();

      // ── Dispatch by event type ─────────────────────────────
      switch (event.type) {
        case "checkout.session.completed": {
          const session = event.data.object as Stripe.Checkout.Session;

          const organizationId = session.metadata?.organizationId;
          if (!organizationId) {
            console.error(
              `[webhook/stripe] checkout.session.completed missing organizationId in metadata. event=${event.id}`,
            );
            break;
          }

          const customerId =
            typeof session.customer === "string"
              ? session.customer
              : (session.customer as Stripe.Customer | null)?.id ?? null;

          const subscriptionId =
            typeof session.subscription === "string"
              ? session.subscription
              : (session.subscription as Stripe.Subscription | null)?.id ?? null;

          if (!customerId) {
            console.error(
              `[webhook/stripe] checkout.session.completed missing customer. event=${event.id}`,
            );
            break;
          }

          if (session.mode === "payment" || !subscriptionId) {
            await tx.organization.update({
              where: { id: organizationId },
              data: { stripeCustomerId: customerId },
            });

            console.log(
              `[webhook/stripe] checkout.session.completed: org=${organizationId} sku=${session.metadata?.sku ?? "unknown"} mode=payment`,
            );
            break;
          }

          // Retrieve full subscription to get price ID and period data
          const subscription = await getStripe().subscriptions.retrieve(subscriptionId);
          const priceId = getPriceIdFromSubscription(subscription);
          const tier: OrgTier = (priceId ? priceTierMap[priceId] : undefined) ?? "STARTER";

          await tx.organization.update({
            where: { id: organizationId },
            data: {
              stripeCustomerId: customerId,
              stripeSubscriptionId: subscriptionId,
              subscriptionStatus: subscription.status,
              currentPeriodEnd: getCurrentPeriodEnd(subscription),
              tier,
            },
          });

          console.log(
            `[webhook/stripe] checkout.session.completed: org=${organizationId} tier=${tier} status=${subscription.status}`,
          );
          break;
        }

        case "customer.subscription.updated": {
          const subscription = event.data.object as Stripe.Subscription;
          const customerId =
            typeof subscription.customer === "string"
              ? subscription.customer
              : (subscription.customer as Stripe.Customer).id;

          const org = await tx.organization.findUnique({
            where: { stripeCustomerId: customerId },
          });
          if (!org) {
            console.error(
              `[webhook/stripe] subscription.updated: no org for customer=${customerId} event=${event.id}`,
            );
            break;
          }

          const priceId = getPriceIdFromSubscription(subscription);
          const tier: OrgTier = (priceId ? priceTierMap[priceId] : undefined) ?? "STARTER";

          await tx.organization.update({
            where: { id: org.id },
            data: {
              subscriptionStatus: subscription.status,
              currentPeriodEnd: getCurrentPeriodEnd(subscription),
              tier,
            },
          });

          console.log(
            `[webhook/stripe] subscription.updated: org=${org.id} tier=${tier} status=${subscription.status}`,
          );
          break;
        }

        case "customer.subscription.deleted": {
          const subscription = event.data.object as Stripe.Subscription;
          const customerId =
            typeof subscription.customer === "string"
              ? subscription.customer
              : (subscription.customer as Stripe.Customer).id;

          const org = await tx.organization.findUnique({
            where: { stripeCustomerId: customerId },
          });
          if (!org) {
            console.error(
              `[webhook/stripe] subscription.deleted: no org for customer=${customerId} event=${event.id}`,
            );
            break;
          }

          // Downgrade to STARTER; preserve currentPeriodEnd for grace-period access
          const periodEnd = getCurrentPeriodEnd(subscription);
          await tx.organization.update({
            where: { id: org.id },
            data: {
              subscriptionStatus: "canceled",
              tier: "STARTER",
              currentPeriodEnd: periodEnd,
            },
          });

          console.log(
            `[webhook/stripe] subscription.deleted: org=${org.id} downgraded to STARTER`,
          );

          // Billing warning — grace period access with end date
          const until = periodEnd.toLocaleDateString(undefined, {
            month: "long",
            day: "numeric",
            year: "numeric",
          });
          void NotificationService.billingWarning(
            org.id,
            `Your subscription has been canceled. Full access continues until ${until}. Reactivate anytime from Billing.`,
          ).catch(() => {});
          break;
        }

        case "invoice.payment_failed": {
          const invoice = event.data.object as Stripe.Invoice;
          const customerId =
            typeof invoice.customer === "string"
              ? invoice.customer
              : (invoice.customer as Stripe.Customer | null)?.id ?? null;

          if (!customerId) break;

          const org = await tx.organization.findUnique({
            where: { stripeCustomerId: customerId },
          });
          if (!org) {
            console.error(
              `[webhook/stripe] invoice.payment_failed: no org for customer=${customerId} event=${event.id}`,
            );
            break;
          }

          // Mark past_due — access state helper handles the warning display
          await tx.organization.update({
            where: { id: org.id },
            data: { subscriptionStatus: "past_due" },
          });

          console.log(
            `[webhook/stripe] invoice.payment_failed: org=${org.id} marked past_due`,
          );

          // Billing notification (outside tx — fire-and-forget)
          void NotificationService.billingPaymentFailed(org.id).catch(() => {});
          break;
        }
      }

      // ── 5. Record event (inside same transaction) ────────────
      await tx.processedStripeEvent.create({
        data: { id: event.id, type: event.type },
      });
    });
  } catch (err: any) {
    // Transient errors (DB connection, etc.) — return 500 so Stripe retries
    console.error(
      `[webhook/stripe] Processing failed for event=${event.id} type=${event.type}: ${err.message}`,
    );
    return NextResponse.json(
      { error: "Webhook processing failed. Will retry." },
      { status: 500 },
    );
  }

  return NextResponse.json({ received: true, handled: true });
}
