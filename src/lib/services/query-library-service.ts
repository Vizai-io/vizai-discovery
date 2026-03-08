
import { db } from "@/lib/firebase-config";
import { collection, getDocs, doc, setDoc, query, limit } from "firebase/firestore";
import { IndustryQuery } from "@/lib/types";

const MASTER_QUERY_LIBRARY: Record<string, Omit<IndustryQuery, 'id'>[]> = {
  logistics: [
    { text: "Best 3PL providers for e-commerce fulfillment", category: "Service Provider", intentType: "best" },
    { text: "Top cold chain logistics companies in Europe", category: "Service Provider", geoModifier: "Europe", intentType: "best" },
    { text: "Compare FedEx vs DHL for international shipping", category: "Benchmarking", intentType: "comparison" },
    { text: "Logistics companies with custom clearance capabilities", category: "Capability", intentType: "capability" },
    { text: "Best last-mile delivery services in London", category: "Service Provider", geoModifier: "London", intentType: "local" },
    { text: "Reliable freight forwarding for pharmaceutical goods", category: "Industry Vertical", intentType: "best" },
    { text: "Which logistics firm has the best tracking tech?", category: "Capability", intentType: "comparison" },
    { text: "Affordable air freight solutions for SMEs", category: "Cost Analysis", intentType: "best" },
    { text: "Most sustainable shipping providers 2024", category: "Sustainability", intentType: "best" },
    { text: "How does Maersk compare to MSC for ocean freight?", category: "Benchmarking", intentType: "comparison" },
  ],
  warehousing: [
    { text: "Top industrial warehousing providers in the Midwest", category: "Service Provider", geoModifier: "Midwest", intentType: "best" },
    { text: "Best B2B fulfillment centers near Chicago", category: "Service Provider", geoModifier: "Chicago", intentType: "local" },
    { text: "Prologis vs Lineage Logistics comparison", category: "Benchmarking", intentType: "comparison" },
    { text: "Warehousing companies with automated sorting", category: "Capability", intentType: "capability" },
    { text: "Temperature controlled storage experts for food", category: "Specialization", intentType: "best" },
    { text: "Bonded warehouse facilities in New Jersey", category: "Regulatory", geoModifier: "New Jersey", intentType: "local" },
    { text: "Best cross-docking services for retail", category: "Capability", intentType: "best" },
    { text: "Leading automated warehouse solutions for 2024", category: "Technology", intentType: "best" },
  ],
  manufacturing: [
    { text: "Best OEM component manufacturers in Germany", category: "Manufacturing", geoModifier: "Germany", intentType: "best" },
    { text: "Top electric drivetrain suppliers for automotive", category: "Supply Chain", intentType: "best" },
    { text: "Precision stamping companies with rapid prototyping", category: "Capability", intentType: "capability" },
    { text: "Compare Bosch vs Magna for car parts", category: "Benchmarking", intentType: "comparison" },
    { text: "Leading additive manufacturing firms for aerospace", category: "Technology", intentType: "best" },
    { text: "Contract manufacturers for consumer electronics in USA", category: "Service Provider", geoModifier: "USA", intentType: "best" },
    { text: "ISO certified metal fabrication near me", category: "Compliance", intentType: "local" },
  ],
  legal: [
    { text: "Top corporate M&A law firms in London", category: "Legal Service", geoModifier: "London", intentType: "best" },
    { text: "Best intellectual property lawyers for tech startups", category: "Specialization", intentType: "best" },
    { text: "Compare Clifford Chance vs DLA Piper for litigation", category: "Benchmarking", intentType: "comparison" },
    { text: "Law firms with strong compliance audit track record", category: "Capability", intentType: "capability" },
    { text: "Leading white-collar crime defense attorneys", category: "Specialization", intentType: "best" },
    { text: "Employment law experts for HR disputes", category: "Specialization", intentType: "local" },
    { text: "Top ranked commercial real estate lawyers 2024", category: "Legal Service", intentType: "best" },
  ],
  consulting: [
    { text: "Top management consulting firms for digital transformation", category: "Strategy", intentType: "best" },
    { text: "Best boutique consultants for supply chain optimization", category: "Specialization", intentType: "best" },
    { text: "McKinsey vs BCG for energy sector strategy", category: "Benchmarking", intentType: "comparison" },
    { text: "Consultants specializing in ESG reporting compliance", category: "Compliance", intentType: "capability" },
    { text: "Top rated data analytics consultancies for finance", category: "Specialization", intentType: "best" },
  ],
  software: [
    { text: "Best enterprise ERP software for manufacturing", category: "Enterprise Software", intentType: "best" },
    { text: "Top CRM solutions for real estate agents", category: "SaaS", intentType: "best" },
    { text: "Salesforce vs HubSpot comparison for small business", category: "Benchmarking", intentType: "comparison" },
    { text: "Cloud storage providers with end-to-end encryption", category: "Security", intentType: "capability" },
    { text: "Most reliable HR management software 2024", category: "HR Tech", intentType: "best" },
    { text: "Top ranked cybersecurity platforms for remote work", category: "Security", intentType: "best" },
  ]
};

export class QueryLibraryService {
  /**
   * Seeds the industry query library into Firestore.
   */
  static async seedLibrary() {
    for (const [industry, queries] of Object.entries(MASTER_QUERY_LIBRARY)) {
      const libRef = collection(db, "industryQueryLibraries", industry, "queries");
      for (const q of queries) {
        const queryId = q.text.toLowerCase().replace(/\s+/g, '-').slice(0, 32);
        await setDoc(doc(libRef, queryId), q);
      }
    }
  }

  /**
   * Fetches a randomized subset of queries for a specific industry from the library.
   */
  static async getQueriesForIndustry(industry: string, count: number = 6): Promise<IndustryQuery[]> {
    try {
      // Normalize industry string for matching (e.g. "Third Party Logistics (3PL)" -> "logistics")
      let industryId = industry.toLowerCase();
      if (industryId.includes('logistics')) industryId = 'logistics';
      else if (industryId.includes('warehousing')) industryId = 'warehousing';
      else if (industryId.includes('manufacturing')) industryId = 'manufacturing';
      else if (industryId.includes('legal')) industryId = 'legal';
      else if (industryId.includes('consulting')) industryId = 'consulting';
      else if (industryId.includes('software')) industryId = 'software';
      else industryId = 'logistics'; // Fallback

      const libRef = collection(db, "industryQueryLibraries", industryId, "queries");
      const q = query(libRef, limit(20)); // Fetch up to 20 candidates
      const snapshot = await getDocs(q);
      
      if (snapshot.empty) {
        // Fallback to static if firestore not yet seeded
        return (MASTER_QUERY_LIBRARY[industryId] || MASTER_QUERY_LIBRARY['logistics'])
          .sort(() => 0.5 - Math.random())
          .slice(0, count) as IndustryQuery[];
      }

      const allQueries = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as IndustryQuery));
      return allQueries.sort(() => 0.5 - Math.random()).slice(0, count);
    } catch (error) {
      console.error("Error fetching query library:", error);
      return [];
    }
  }
}
