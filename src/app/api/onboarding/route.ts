/**
 * @fileOverview POST /api/onboarding — Self-serve organization setup.
 *
 * Called once per user during first-login onboarding.
 * Only available to users in the "unassigned" organization.
 *
 * Atomically:
 *   1. Creates the Organization
 *   2. Assigns the authenticated user to the new org
 *   3. Creates the first CompanyProfile under the new org
 *   4. Claims the originating free scan, if one was handed off — the
 *      PerceptionScan moves from the 'free-scan' sentinel org into the new
 *      org and attaches to the new profile, so the customer's scan history
 *      starts with the scan that brought them here. Invalid or already
 *      claimed scan ids are ignored (never fail onboarding over a claim).
 *
 * Request body:
 * {
 *   org_name: string,       // required — organization display name
 *   business_name: string,  // required — first company profile name
 *   website_url?: string,   // optional
 *   free_scan_id?: string,  // optional — PerceptionScan id from the free-scan funnel
 * }
 *
 * Response (201):
 * {
 *   org_id: string,
 *   profile_id: string,
 *   claimed_scan_id: string | null,
 * }
 */

import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/get-auth-context";
import { db } from "@/lib/db";
import { NotificationService } from "@/lib/services/notification.service";
import { OperationalEventService, EVENT_TYPES, EVENT_SOURCES, SEVERITIES } from "@/lib/services/operational-event-service";

function generateSlug(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  const suffix = Math.random().toString(36).slice(2, 7);
  return `${base}-${suffix}`;
}

export async function POST(request: NextRequest) {
  try {
    // ── Auth gate ─────────────────────────────────────────────
    const auth = await getAuthContext();
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Only unassigned users can use this endpoint
    if (auth.organizationId !== "unassigned") {
      return NextResponse.json(
        { error: "Organization already assigned. Onboarding is complete." },
        { status: 409 },
      );
    }

    const body = await request.json();
    const { org_name, business_name, website_url, free_scan_id } = body;

    // ── Validate required fields ──────────────────────────────
    if (!org_name || typeof org_name !== "string" || org_name.trim().length === 0) {
      return NextResponse.json(
        { error: "Missing required field: org_name" },
        { status: 400 },
      );
    }
    if (
      !business_name ||
      typeof business_name !== "string" ||
      business_name.trim().length === 0
    ) {
      return NextResponse.json(
        { error: "Missing required field: business_name" },
        { status: 400 },
      );
    }

    // ── Atomic setup ──────────────────────────────────────────
    const { organization, profile, claimedScanId } = await db.$transaction(async (tx) => {
      // 1. Create organization (STARTER tier by default)
      const organization = await tx.organization.create({
        data: {
          name: org_name.trim(),
          slug: generateSlug(org_name.trim()),
          tier: "STARTER",
          adminEmail: auth.email,
        },
      });

      // 2. Move user from "unassigned" to the new org
      await tx.user.update({
        where: { id: auth.uid },
        data: { organizationId: organization.id },
      });

      // 3. Create first company profile under the new org
      const profile = await tx.companyProfile.create({
        data: {
          organizationId: organization.id,
          businessName: business_name.trim(),
          websiteUrl: website_url?.trim() || null,
        },
      });

      // 4. Claim the originating free scan into the new org (best-effort).
      //    Only scans still under the 'free-scan' sentinel org are claimable —
      //    a scan already claimed elsewhere is silently skipped.
      let claimedScanId: string | null = null;
      if (typeof free_scan_id === "string" && free_scan_id.trim().length > 0) {
        const freeScan = await tx.perceptionScan.findFirst({
          where: { id: free_scan_id.trim(), organizationId: "free-scan" },
          select: { id: true, companyProfileId: true },
        });

        if (freeScan) {
          await tx.perceptionScan.update({
            where: { id: freeScan.id },
            data: {
              organizationId: organization.id,
              companyProfileId: profile.id,
            },
          });
          claimedScanId = freeScan.id;

          // The free-scan funnel creates one sentinel CompanyProfile per scan.
          // Once its only scan moves out, remove the now-orphaned lead profile.
          if (freeScan.companyProfileId) {
            const remaining = await tx.perceptionScan.count({
              where: { companyProfileId: freeScan.companyProfileId },
            });
            if (remaining === 0) {
              await tx.companyProfile.delete({
                where: { id: freeScan.companyProfileId },
              });
            }
          }
        }
      }

      return { organization, profile, claimedScanId };
    });

    // Onboarding milestone notification (fire-and-forget, one-time ever)
    void NotificationService.onboardingComplete(organization.id, organization.name).catch(
      () => {},
    );

    // ONBOARDING_COMPLETED — self-serve org setup instrumented
    void OperationalEventService.emit({
      eventType:      EVENT_TYPES.ONBOARDING_COMPLETED,
      severity:       SEVERITIES.INFO,
      source:         EVENT_SOURCES.ONBOARDING_API,
      traceId:        crypto.randomUUID(),
      organizationId: organization.id,
      userId:         auth.uid,
      entityType:     'org',
      entityId:       organization.id,
      message:        `Onboarding completed for org "${organization.name}"`,
      metadata: {
        orgName:        organization.name,
        orgSlug:        organization.slug,
        profileId:      profile.id,
        businessName:   profile.businessName,
        claimedScanId:  claimedScanId,
        cameFromFreeScan: claimedScanId !== null,
      },
    });

    return NextResponse.json(
      {
        org_id: organization.id,
        org_name: organization.name,
        profile_id: profile.id,
        business_name: profile.businessName,
        claimed_scan_id: claimedScanId,
      },
      { status: 201 },
    );
  } catch (err: any) {
    console.error("Onboarding error:", err);
    return NextResponse.json(
      { error: err.message || "Onboarding setup failed" },
      { status: 500 },
    );
  }
}
