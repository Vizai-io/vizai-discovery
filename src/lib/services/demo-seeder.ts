import { db } from "@/lib/firebase-config";
import { collection, addDoc, serverTimestamp, getDocs, query, where } from "firebase/firestore";
import { ScanEngine } from "./scan-engine";

/**
 * DemoSeeder provides utilities to populate the system with realistic demo data.
 */
export const DEMO_PROFILES = {
  logistics: {
    companyName: "Acme Global Logistics",
    website: "https://acme-logistics.ai",
    industry: "Third Party Logistics (3PL)",
    targetGeography: "North America & EU",
    serviceCategories: ["Cold Chain", "Last-mile Delivery", "Freight Forwarding", "Customs Brokerage"],
    competitors: ["FedEx", "DHL", "UPS", "Maersk"],
  },
  warehousing: {
    companyName: "StorageMax Solutions",
    website: "https://storagemax.io",
    industry: "Industrial Warehousing",
    targetGeography: "Midwest USA",
    serviceCategories: ["B2B Fulfillment", "Inventory Management", "Cross-docking", "Pallet Storage"],
    competitors: ["Prologis", "Lineage Logistics", "Americold"],
  },
  manufacturing: {
    companyName: "Precision Parts Corp",
    website: "https://precisionparts.mfg",
    industry: "Automotive Manufacturing",
    targetGeography: "Global",
    serviceCategories: ["OEM Components", "Electric Drivetrains", "Precision Stamping", "Rapid Prototyping"],
    competitors: ["Bosch", "Magna International", "Denso"],
  },
  legal: {
    companyName: "Justice & Partners",
    website: "https://justice-partners.law",
    industry: "Corporate Legal Services",
    targetGeography: "United Kingdom",
    serviceCategories: ["M&A Advisory", "Intellectual Property", "Litigation Support", "Compliance Audit"],
    competitors: ["Clifford Chance", "DLA Piper", "Linklaters"],
  },
};

export class DemoSeeder {
  /**
   * Seeds the system with a demo organization and its first scan results.
   */
  static async seedDemoForIndustry(industryKey: keyof typeof DEMO_PROFILES) {
    const profile = DEMO_PROFILES[industryKey];
    const orgId = `demo_org_${industryKey}`;

    // 1. Check if demo already exists (optional, but good for clean seeding)
    // For simplicity in v0.1, we just add new ones.

    // 2. Save Company Profile
    const profileRef = await addDoc(collection(db, "companyProfiles"), {
      ...profile,
      organizationId: orgId,
      createdAt: serverTimestamp(),
    });

    // 3. Run Scan
    const scanResults = await ScanEngine.runScan(profile);

    // 4. Save Scan Record
    const scanRef = await addDoc(collection(db, "scans"), {
      profileId: profileRef.id,
      organizationId: orgId,
      date: serverTimestamp(),
      status: "completed",
      results: {
        overallScore: scanResults.overallScore,
        categoryScores: scanResults.categoryScores,
        competitorComparison: scanResults.competitorComparison,
        aiDescriptionAccuracy: scanResults.aiDescriptionAccuracy,
        knowledgeGaps: scanResults.knowledgeGaps,
        missedDiscoveryOpportunities: scanResults.missedDiscoveryOpportunities,
        priorityActions: scanResults.priorityActions,
      },
      queryDiscovery: scanResults.queryDiscovery,
    });

    return { profileId: profileRef.id, scanId: scanRef.id };
  }

  /**
   * Seeds administrative snapshots for the rankings page.
   */
  static async seedSystemRankings() {
    const industries = ["Logistics", "Manufacturing", "Legal Services", "Retail"];
    const regions = ["North America", "Western Europe", "Asia Pacific"];

    for (const industry of industries) {
      for (const region of regions) {
        // We'll rely on the RankingService.getLatestRankings fallback to simulate them for now,
        // but this could write real snapshots to Firestore if needed.
        console.log(`System ready for ${industry} in ${region}`);
      }
    }
  }
}
