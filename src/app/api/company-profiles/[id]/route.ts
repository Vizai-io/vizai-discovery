/**
 * @fileOverview /api/company-profiles/:id
 *
 * PATCH  — Update a company profile.
 * DELETE — Soft-delete a company profile (sets isActive = false).
 *
 * Both operations are org-scoped. Cross-org access returns 404.
 * Authentication required.
 */

import { NextRequest, NextResponse } from "next/server";
import { CompanyProfileRepository } from "@/lib/repositories";
import { getAuthContext } from "@/lib/auth/get-auth-context";

// ── PATCH ─────────────────────────────────────────────────────────────────────

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await getAuthContext();
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
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

    // Build update payload — only include defined fields
    const updateData: Parameters<typeof CompanyProfileRepository.update>[2] = {};

    if (business_name !== undefined) {
      if (typeof business_name !== "string" || business_name.trim().length === 0) {
        return NextResponse.json(
          { error: "business_name must be a non-empty string" },
          { status: 400 },
        );
      }
      updateData.businessName = business_name.trim();
    }
    if (website_url !== undefined) updateData.websiteUrl = website_url || undefined;
    if (official_description !== undefined) updateData.officialDescription = official_description || undefined;
    if (official_business_type !== undefined) updateData.officialBusinessType = official_business_type || undefined;
    if (official_services !== undefined) updateData.officialServices = Array.isArray(official_services) ? official_services : [];
    if (official_locations !== undefined) updateData.officialLocations = Array.isArray(official_locations) ? official_locations : [];
    if (official_industries !== undefined) updateData.officialIndustries = Array.isArray(official_industries) ? official_industries : [];
    if (official_differentiators !== undefined) updateData.officialDifferentiators = Array.isArray(official_differentiators) ? official_differentiators : [];
    if (official_customer_types !== undefined) updateData.officialCustomerTypes = Array.isArray(official_customer_types) ? official_customer_types : [];

    // CompanyProfileRepository.update verifies org scope internally
    const profile = await CompanyProfileRepository.update(id, auth.organizationId, updateData);

    return NextResponse.json({
      id: profile.id,
      business_name: profile.businessName,
      website_url: profile.websiteUrl,
      official_description: profile.officialDescription,
      official_business_type: profile.officialBusinessType,
      official_services: profile.officialServices,
      official_locations: profile.officialLocations,
      official_industries: profile.officialIndustries,
      official_differentiators: profile.officialDifferentiators,
      official_customer_types: profile.officialCustomerTypes,
      updated_at: profile.updatedAt,
    });
  } catch (err: any) {
    if (err.message === "Company profile not found or access denied") {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }
    console.error("Error updating company profile:", err);
    return NextResponse.json(
      { error: err.message || "Failed to update company profile" },
      { status: 500 },
    );
  }
}

// ── DELETE ────────────────────────────────────────────────────────────────────

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await getAuthContext();
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    // setActive verifies org scope internally — throws if not found
    await CompanyProfileRepository.setActive(id, auth.organizationId, false);

    return NextResponse.json({ success: true });
  } catch (err: any) {
    if (err.message === "Company profile not found or access denied") {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }
    console.error("Error deleting company profile:", err);
    return NextResponse.json(
      { error: err.message || "Failed to delete company profile" },
      { status: 500 },
    );
  }
}
