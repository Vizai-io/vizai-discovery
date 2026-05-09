/**
 * @fileOverview /api/company-profiles
 *
 * GET  — List all active company profiles for the authenticated org.
 *         Returns tier usage info for client-side limit rendering.
 *
 * POST — Create a new company profile.
 *         Enforces tier-based profile limits server-side.
 *
 * Authentication required. All operations are org-scoped.
 */

import { NextRequest, NextResponse } from "next/server";
import { CompanyProfileRepository, OrganizationRepository } from "@/lib/repositories";
import { getAuthContext } from "@/lib/auth/get-auth-context";

// ── Tier limits ───────────────────────────────────────────────────────────────

const TIER_PROFILE_LIMITS: Record<string, number> = {
  STARTER: 1,
  PROFESSIONAL: 5,
  ENTERPRISE: Infinity,
};

function formatProfile(p: Awaited<ReturnType<typeof CompanyProfileRepository.findByOrg>>[number]) {
  return {
    id: p.id,
    business_name: p.businessName,
    website_url: p.websiteUrl,
    official_description: p.officialDescription,
    official_business_type: p.officialBusinessType,
    official_services: p.officialServices,
    official_locations: p.officialLocations,
    official_industries: p.officialIndustries,
    official_differentiators: p.officialDifferentiators,
    official_customer_types: p.officialCustomerTypes,
    is_active: p.isActive,
    created_at: p.createdAt,
  };
}

// ── GET ───────────────────────────────────────────────────────────────────────

export async function GET() {
  try {
    const auth = await getAuthContext();
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Unassigned users have no profiles yet — return empty with defaults
    if (auth.organizationId === "unassigned") {
      return NextResponse.json({
        profiles: [],
        total: 0,
        tier: "STARTER",
        limit: 1,
        can_create: false,
      });
    }

    const [profiles, org] = await Promise.all([
      CompanyProfileRepository.findByOrg(auth.organizationId),
      OrganizationRepository.findById(auth.organizationId),
    ]);

    const tier = org?.tier ?? "STARTER";
    const limit = TIER_PROFILE_LIMITS[tier] ?? 1;
    const total = profiles.length;

    return NextResponse.json({
      profiles: profiles.map(formatProfile),
      total,
      tier,
      limit: limit === Infinity ? null : limit,
      can_create: total < limit,
    });
  } catch (err: any) {
    console.error("Error listing company profiles:", err);
    return NextResponse.json(
      { error: err.message || "Failed to list company profiles" },
      { status: 500 },
    );
  }
}

// ── POST ──────────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    // ── Auth gate ─────────────────────────────────────────────
    const auth = await getAuthContext();
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (auth.organizationId === "unassigned") {
      return NextResponse.json(
        {
          error:
            "Account not yet assigned to an organization. Complete onboarding first.",
        },
        { status: 403 },
      );
    }

    const body = await request.json();
    const {
      business_name,
      website_url,
      official_description,
      official_business_type,
      official_services,
      official_locations,
      official_industries,
      official_differentiators,
      official_customer_types,
    } = body;

    // ── Validate required fields ──────────────────────────────
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

    // ── Tier limit enforcement ────────────────────────────────
    const [org, existingCount] = await Promise.all([
      OrganizationRepository.findById(auth.organizationId),
      CompanyProfileRepository.countByOrg(auth.organizationId),
    ]);

    const tier = org?.tier ?? "STARTER";
    const limit = TIER_PROFILE_LIMITS[tier] ?? 1;

    if (existingCount >= limit) {
      return NextResponse.json(
        {
          error: `Profile limit reached. Your ${tier} plan allows ${limit} company profile(s). Contact support to upgrade.`,
          tier,
          limit,
          current: existingCount,
        },
        { status: 403 },
      );
    }

    // ── Create profile (org-scoped) ───────────────────────────
    const profile = await CompanyProfileRepository.create({
      organizationId: auth.organizationId,
      businessName: business_name.trim(),
      websiteUrl: website_url || undefined,
      officialDescription: official_description || undefined,
      officialBusinessType: official_business_type || undefined,
      officialServices: Array.isArray(official_services) ? official_services : [],
      officialLocations: Array.isArray(official_locations) ? official_locations : [],
      officialIndustries: Array.isArray(official_industries) ? official_industries : [],
      officialDifferentiators: Array.isArray(official_differentiators)
        ? official_differentiators
        : [],
      officialCustomerTypes: Array.isArray(official_customer_types)
        ? official_customer_types
        : [],
    });

    return NextResponse.json(
      {
        id: profile.id,
        business_name: profile.businessName,
        website_url: profile.websiteUrl,
        organization_id: profile.organizationId,
        created_at: profile.createdAt,
      },
      { status: 201 },
    );
  } catch (err: any) {
    console.error("Error creating company profile:", err);
    return NextResponse.json(
      { error: err.message || "Failed to create company profile" },
      { status: 500 },
    );
  }
}
