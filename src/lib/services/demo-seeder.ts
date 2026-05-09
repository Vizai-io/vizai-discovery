/**
 * @fileOverview DemoSeeder — DEV/ADMIN ONLY — in-memory only.
 *
 * STATUS: DEV/ADMIN ONLY — only called from the admin page "Seed Demo Data" button.
 * Not in any production user-facing code path.
 *
 * Sprint 4: Firebase removed. Firestore writes (addDoc to 'scans' collection)
 * have been stripped. seedDemoForIndustry() now runs ScanEngine in memory only
 * and returns the results without persisting anywhere.
 *
 * MIGRATION BACKLOG (Sprint 5):
 *   Migrate to Postgres (CompanyProfileRepository + PerceptionScanRepository)
 *   when the seeder is needed for demo environments. Remove no-op log.
 *   Do NOT call this from production routes.
 */

import { ScanEngine } from "./scan-engine";
import { QueryLibraryService } from "./query-library-service";
import { CompetitorService } from "./competitor-service";

export const DEMO_PROFILES = {
  logistics: {
    companyName: "Acme Global Logistics",
    website: "https://acme-logistics.ai",
    industry: "Third Party Logistics (3PL)",
    targetGeography: "North America & EU",
    serviceCategories: ["Cold Chain", "Last-mile Delivery", "Freight Forwarding", "Customs Brokerage"],
    competitors: ["FedEx", "DHL", "UPS", "Maersk"],
    googleBusinessProfileUrl: "https://maps.google.com/acme-logistics",
    linkedInPageUrl: "https://linkedin.com/company/acme-logistics",
    directoryListings: ["Clutch", "LogisticsWorld"],
  },
  warehousing: {
    companyName: "StorageMax Solutions",
    website: "https://storagemax.io",
    industry: "Industrial Warehousing",
    targetGeography: "Midwest USA",
    serviceCategories: ["B2B Fulfillment", "Inventory Management", "Cross-docking", "Pallet Storage"],
    competitors: ["Prologis", "Lineage Logistics", "Americold"],
    googleBusinessProfileUrl: "https://maps.google.com/storagemax",
    linkedInPageUrl: "https://linkedin.com/company/storagemax",
  },
  manufacturing: {
    companyName: "Precision Parts Corp",
    website: "https://precisionparts.mfg",
    industry: "Automotive Manufacturing",
    targetGeography: "Global",
    serviceCategories: ["OEM Components", "Electric Drivetrains", "Precision Stamping", "Rapid Prototyping"],
    competitors: ["Bosch", "Magna International", "Denso"],
    linkedInPageUrl: "https://linkedin.com/company/precision-parts",
    directoryListings: ["Thomasnet", "MFG.com"],
  },
  legal: {
    companyName: "Justice & Partners",
    website: "https://justice-partners.law",
    industry: "Corporate Legal Services",
    targetGeography: "United Kingdom",
    serviceCategories: ["M&A Advisory", "Intellectual Property", "Litigation Support", "Compliance Audit"],
    competitors: ["Clifford Chance", "DLA Piper", "Linklaters"],
    googleBusinessProfileUrl: "https://maps.google.com/justice-law",
    linkedInPageUrl: "https://linkedin.com/company/justice-law",
    directoryListings: ["Chambers", "Legal500"],
  },
};

export class DemoSeeder {
  /**
   * Runs demo scan engine in memory — Sprint 4 no-op seeder.
   * Firestore writes removed. Results are returned but not persisted.
   * TODO(Sprint 5): persist to Postgres (CompanyProfile + PerceptionScan).
   */
  static async seedDemoForIndustry(industryKey: keyof typeof DEMO_PROFILES) {
    const profile = DEMO_PROFILES[industryKey];
    const orgId   = `demo_org_${industryKey}`;

    console.log(`[DemoSeeder] seedDemoForIndustry(${industryKey}) — in-memory only (Firestore removed, Sprint 5 Postgres migration pending)`);

    // In-memory only: run engine but do not persist
    await Promise.all([
      QueryLibraryService.seedLibrary(),
      CompetitorService.seedCompetitors(),
    ]);

    const scanResults = await ScanEngine.runScan(profile, orgId);

    return { profileId: orgId, scanId: `mock-${industryKey}-${Date.now()}`, scanResults };
  }
}
