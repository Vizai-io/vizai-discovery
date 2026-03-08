
import { db } from "@/lib/firebase-config";
import { collection, addDoc, serverTimestamp, Timestamp } from "firebase/firestore";
import { ScanEngine } from "./scan-engine";
import { QueryLibraryService } from "./query-library-service";
import { CompetitorService } from "./competitor-service";

/**
 * DemoSeeder provides utilities to populate the system with realistic demo data.
 * Updated to include believable scan histories and Industry Query Library seeding.
 */
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
   * Seeds the system with a demo organization and a multi-scan history.
   * Also ensures the Industry Query Library is seeded.
   */
  static async seedDemoForIndustry(industryKey: keyof typeof DEMO_PROFILES) {
    const profile = DEMO_PROFILES[industryKey];
    const orgId = `demo_org_${industryKey}`;

    // 0. Ensure Query Library and Competitor Profiles are seeded
    await Promise.all([
      QueryLibraryService.seedLibrary(),
      CompetitorService.seedCompetitors()
    ]);

    // 1. Save Company Profile
    const profileRef = await addDoc(collection(db, "companyProfiles"), {
      ...profile,
      organizationId: orgId,
      createdAt: serverTimestamp(),
      monitoringFrequency: 'weekly',
      nextScanAt: Timestamp.fromDate(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)),
      lastScanAt: serverTimestamp(),
    });

    // 2. Generate Scan History (Latest + 2 Historical)
    await this.createMockScan(profileRef.id, orgId, profile, 30, -8);
    await this.createMockScan(profileRef.id, orgId, profile, 15, -3);
    const latestScanId = await this.createMockScan(profileRef.id, orgId, profile, 0, 0);

    return { profileId: profileRef.id, scanId: latestScanId };
  }

  private static async createMockScan(profileId: string, orgId: string, profile: any, daysAgo: number, scoreOffset: number) {
    const scanResults = await ScanEngine.runScan(profile, profileId);
    
    const historicalDate = new Date();
    historicalDate.setDate(historicalDate.getDate() - daysAgo);

    const scanRef = await addDoc(collection(db, "scans"), {
      profileId,
      organizationId: orgId,
      date: Timestamp.fromDate(historicalDate),
      status: "completed",
      results: {
        ...scanResults,
        overallScore: Math.max(0, scanResults.overallScore + scoreOffset),
        categoryScores: Object.fromEntries(
          Object.entries(scanResults.categoryScores).map(([k, v]) => [k, Math.max(0, v + scoreOffset)])
        ),
      },
      queryDiscovery: scanResults.queryDiscovery,
    });

    return scanRef.id;
  }
}
