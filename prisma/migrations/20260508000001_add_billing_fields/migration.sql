-- Phase 1.6: Add billing fields to organizations + webhook idempotency table
-- All organization columns are nullable — zero impact on existing rows.

-- AddColumn: Stripe billing fields on organizations
ALTER TABLE "organizations" ADD COLUMN "stripeCustomerId" TEXT;
ALTER TABLE "organizations" ADD COLUMN "stripeSubscriptionId" TEXT;
ALTER TABLE "organizations" ADD COLUMN "subscriptionStatus" TEXT;
ALTER TABLE "organizations" ADD COLUMN "currentPeriodEnd" TIMESTAMP(3);

-- CreateIndex: unique constraints for Stripe IDs
CREATE UNIQUE INDEX "organizations_stripeCustomerId_key" ON "organizations"("stripeCustomerId");
CREATE UNIQUE INDEX "organizations_stripeSubscriptionId_key" ON "organizations"("stripeSubscriptionId");

-- CreateTable: webhook idempotency tracking
CREATE TABLE "processed_stripe_events" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "processed_stripe_events_pkey" PRIMARY KEY ("id")
);
