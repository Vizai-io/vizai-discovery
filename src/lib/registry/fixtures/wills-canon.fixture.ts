/**
 * WP-19D — Wills-shaped app Canon fixture (SYNTHETIC; fixtures-only, no DB read).
 *
 * Resembles an APPROVED TruthCanonVersion + its TruthClaims + credential claims
 * with evidence links. Public-safe facts mirror the already-published
 * business-registry/registry/wills-transfer/profile.json EXACTLY, so the generated
 * artifact's contentHash equals the live registry/Beacon hash
 * (sha256:e23d89ed561ee5d47502a3cb693593b4fe0e83651fe65e88caf6044f3a584124).
 *
 * Includes held credentials (excluded by absence) and a `private` block (stripped).
 * No real private evidence content.
 */

import type { AppShapedCanon } from "../types";

export const willsCanonFixture: AppShapedCanon = {
  version: 1, // -> verification.canonVersion "1.0"
  status: "APPROVED",
  approvedAt: "2026-06-13",
  approvedBy: "operator-fixture",
  entity: {
    slug: "wills-transfer",
    legalName: "Wills Transfer Limited",
    commonName: "Wills Transfer",
    primaryDomain: "willstransfer.com",
  },
  category: "logistics",
  verification: {
    status: "claimed_verified",
    method: "customer-canon-approval",
    lastVerified: "2026-06-13",
    tier: "claimed_verified",
    // customerApprovalDate intentionally omitted — the live published profile omits it
    // (it is schema-permitted; emitting it would change the contentHash). See WP-19C §12.
  },
  metadata: { dateAdded: "2026-06-13", lastUpdated: "2026-06-13" },
  claims: [
    {
      category: "identity",
      status: "VERIFIED",
      value: {
        businessType: "Third-party logistics (3PL), warehousing, fulfillment, distribution",
        country: "Canada",
        yearFounded: 1945,
        ownership: "Fourth-generation family business",
      },
    },
    {
      category: "scale",
      status: "VERIFIED",
      value: { facilityCount: 7, totalSquareFeet: "1000000+", locationCount: 5, region: "Eastern Ontario" },
    },
    {
      category: "locations",
      status: "VERIFIED",
      value: [
        { name: "Smiths Falls", region: "ON", role: "headquarters" },
        { name: "Brockville", region: "ON", role: "facility" },
        { name: "Cornwall", region: "ON", role: "facility" },
        { name: "Ottawa", region: "ON", role: "facility" },
        { name: "Perth", region: "ON", role: "facility" },
      ],
    },
    {
      category: "services",
      status: "VERIFIED",
      value: [
        "Warehousing (dry, air-conditioned, cooler, frozen)",
        "Third-party logistics",
        "Distribution",
        "Fulfillment",
        "Pick and pack",
        "Kitting",
        "Asset tagging",
        "Container de-stuffing",
        "Cross docking",
        "Inventory management",
        "Rail car siding",
        "Refrigerated storage",
        "Outsourcing solutions",
        "Shunting services",
        "Managed 3PL labour services",
        "Warehouse management system (WMS) services",
        "Fleet management",
        "Transportation solutions",
        "Integration solutions",
      ],
    },
    {
      category: "industries",
      status: "VERIFIED",
      value: [
        "Food & beverage", "Pharmaceutical", "Construction", "Industrial", "Tech",
        "Pulp & Paper", "Oil & Gas", "Manufacturing", "Retail", "Last mile",
      ],
    },
    {
      category: "claims",
      status: "VERIFIED",
      value: [
        "Serving Eastern Ontario and Western Quebec since 1945",
        "Provides innovative logistics solutions that contribute to customers' success",
      ],
    },
    {
      category: "contact",
      status: "VERIFIED",
      value: {
        phone: "+1-613-283-0225",
        tollFree: "+1-800-267-7937",
        email: "info@willstransfer.com",
        website: "https://www.willstransfer.com",
      },
    },
    {
      category: "profiles",
      status: "VERIFIED",
      value: {
        linkedin: "https://ca.linkedin.com/company/wills-transfer-limited",
        facebook: "https://www.facebook.com/WillsTransferLimited/",
      },
    },
    // A DRAFT (unverified) claim that must NOT cross even though it is non-credential.
    {
      category: "claims",
      status: "DRAFT",
      value: ["State-of-the-art facilities (pending customer confirmation)"],
    },
  ],
  credentialClaims: [
    // SQF — no evidence -> held
    {
      name: "SQF Certification",
      credentialType: "certification",
      issuingBody: "SQFI",
      status: "NEEDS_EVIDENCE",
      evidence: [],
    },
    // Canada's Best Managed — VERIFIED but only MODERATE evidence -> held (STRONG required)
    {
      name: "Canada's Best Managed Companies",
      credentialType: "award",
      status: "VERIFIED",
      evidence: [{ supportLevel: "MODERATE", sourceType: "DIRECTORY" }],
    },
    // IWLA membership — no evidence -> held
    {
      name: "IWLA Membership",
      credentialType: "membership",
      issuingBody: "International Warehouse Logistics Association",
      status: "NEEDS_EVIDENCE",
      evidence: [],
    },
  ],
  private: {
    evidenceLedger: [{ claim: "yearFounded=1945", location: "private-hub://evidence/wills/0001" }],
    verificationWorksheet: "68-item Confirm/Edit/Remove/Unsure worksheet — internal, do_not_publish",
    onboardingResponse: { contactName: "REDACTED-PERSON", internalEmail: "ops-internal@willstransfer.com" },
    internalNotes: "SQF held_from_this_publication pending certificate; do_not_publish until evidence_verified",
  },
};

/** The known published Wills contentHash (live registry profile + Truth Beacon). */
export const WILLS_PUBLISHED_CONTENT_HASH =
  "sha256:e23d89ed561ee5d47502a3cb693593b4fe0e83651fe65e88caf6044f3a584124";
