/**
 * @fileOverview CompetitorService — DEV/ADMIN ONLY — in-memory only.
 *
 * STATUS: DEV/ADMIN ONLY — only called from the admin page seeder buttons.
 * Not in any production user-facing code path.
 *
 * Sprint 4: Firebase removed. All methods now operate on MASTER_COMPETITORS
 * in-memory fallback only. Firestore reads/writes have been stripped.
 *
 * seedCompetitors() is now a no-op with a log message — calling it from
 * the admin page will not fail but will not persist anything.
 *
 * MIGRATION BACKLOG (Sprint 5):
 *   Migrate seedCompetitors() to CompetitorProfile model (Postgres) when seeder
 *   is productionised. Do NOT call this from production routes.
 */

import { CompetitorProfile } from "@/lib/types";

const MASTER_COMPETITORS: CompetitorProfile[] = [
  {
    id: "fedex-logistics",
    name: "FedEx",
    industry: "Third Party Logistics (3PL)",
    services: ["Express Shipping", "Freight Forwarding", "Supply Chain Management", "Cold Chain"],
    geography: ["Global", "North America", "Europe", "Asia"],
    authorityScore: 98,
    citationStrengthScore: 96,
    serviceCoverageScore: 94
  },
  {
    id: "dhl-global",
    name: "DHL",
    industry: "Third Party Logistics (3PL)",
    services: ["Express Shipping", "E-commerce Fulfillment", "Freight Forwarding", "Warehousing"],
    geography: ["Global", "Europe", "Asia", "Americas"],
    authorityScore: 97,
    citationStrengthScore: 95,
    serviceCoverageScore: 96
  },
  {
    id: "ups-solutions",
    name: "UPS",
    industry: "Third Party Logistics (3PL)",
    services: ["Small Package", "Freight Forwarding", "Logistics Solutions", "Healthcare Logistics"],
    geography: ["Global", "North America", "Europe"],
    authorityScore: 96,
    citationStrengthScore: 94,
    serviceCoverageScore: 92
  },
  {
    id: "prologis-warehousing",
    name: "Prologis",
    industry: "Industrial Warehousing",
    services: ["Real Estate", "B2B Fulfillment", "Last-mile Delivery"],
    geography: ["Global", "USA", "Europe"],
    authorityScore: 94,
    citationStrengthScore: 92,
    serviceCoverageScore: 88
  },
  {
    id: "bosch-automotive",
    name: "Bosch",
    industry: "Automotive Manufacturing",
    services: ["Mobility Solutions", "Electric Drivetrains", "Connected Hardware"],
    geography: ["Global", "Germany", "USA", "China"],
    authorityScore: 99,
    citationStrengthScore: 98,
    serviceCoverageScore: 95
  },
  {
    id: "clifford-chance-law",
    name: "Clifford Chance",
    industry: "Corporate Legal Services",
    services: ["M&A Advisory", "Financial Markets", "Litigation"],
    geography: ["Global", "United Kingdom", "EU", "Asia"],
    authorityScore: 95,
    citationStrengthScore: 94,
    serviceCoverageScore: 90
  }
];

export class CompetitorService {
  /**
   * No-op seeder — Sprint 4.
   * Firestore writes removed. In-memory only.
   * TODO(Sprint 5): migrate to Postgres CompetitorProfile model.
   */
  static async seedCompetitors(): Promise<void> {
    console.log('[CompetitorService] seedCompetitors() called — in-memory only (Firestore removed, Sprint 5 Postgres migration pending)');
  }

  /**
   * Fetches competitor profiles for a specific industry from in-memory fallback.
   */
  static async getCompetitorsByIndustry(industry: string): Promise<CompetitorProfile[]> {
    let industryQuery = industry;
    if (industry.includes('3PL')) industryQuery = "Third Party Logistics (3PL)";
    return MASTER_COMPETITORS.filter(c => c.industry === industryQuery);
  }

  /**
   * Fetches specific competitor profiles by name from in-memory fallback.
   */
  static async getProfilesByNames(names: string[]): Promise<CompetitorProfile[]> {
    return MASTER_COMPETITORS.filter(c => names.includes(c.name));
  }
}
