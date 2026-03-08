
import { db } from "@/lib/firebase-config";
import { collection, getDocs, doc, setDoc, query, where } from "firebase/firestore";
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
   * Seeds the competitor profiles into Firestore.
   */
  static async seedCompetitors() {
    const colRef = collection(db, "competitorProfiles");
    for (const comp of MASTER_COMPETITORS) {
      await setDoc(doc(colRef, comp.id), comp);
    }
  }

  /**
   * Fetches competitor profiles for a specific industry.
   */
  static async getCompetitorsByIndustry(industry: string): Promise<CompetitorProfile[]> {
    try {
      // Basic normalization
      let industryQuery = industry;
      if (industry.includes('3PL')) industryQuery = "Third Party Logistics (3PL)";
      
      const colRef = collection(db, "competitorProfiles");
      const q = query(colRef, where("industry", "==", industryQuery));
      const snapshot = await getDocs(q);
      
      if (snapshot.empty) {
        // Fallback to filtering the master list if firestore isn't seeded
        return MASTER_COMPETITORS.filter(c => c.industry === industryQuery);
      }
      
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as CompetitorProfile));
    } catch (error) {
      console.error("Error fetching competitor profiles:", error);
      return [];
    }
  }

  /**
   * Fetches specific competitor profiles by name.
   */
  static async getProfilesByNames(names: string[]): Promise<CompetitorProfile[]> {
    try {
      const colRef = collection(db, "competitorProfiles");
      const q = query(colRef, where("name", "in", names));
      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as CompetitorProfile));
    } catch (e) {
      // Fallback
      return MASTER_COMPETITORS.filter(c => names.includes(c.name));
    }
  }
}
