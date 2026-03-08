
import { RankingSnapshot, RankingEntry } from "../types";
import { collection, query, where, getDocs, orderBy, limit, Timestamp } from "firebase/firestore";
import { db } from "../firebase-config";

/**
 * RankingService manages the retrieval and simulation of industry leaderboards.
 */
export class RankingService {
  /**
   * Fetches the latest ranking snapshot for a specific industry and region.
   * If no snapshot exists in Firestore, it returns a mock one for demo purposes.
   */
  static async getLatestRankings(industry: string, region: string): Promise<RankingSnapshot> {
    try {
      const rankingsRef = collection(db, "rankings");
      const q = query(
        rankingsRef,
        where("industry", "==", industry),
        where("region", "==", region),
        orderBy("date", "desc"),
        limit(1)
      );

      const querySnapshot = await getDocs(q);
      
      if (!querySnapshot.empty) {
        const doc = querySnapshot.docs[0];
        return { id: doc.id, ...doc.data() } as RankingSnapshot;
      }

      // Fallback to simulated data if none found in DB
      return this.simulateRankings(industry, region);
    } catch (error) {
      console.error("Error fetching rankings:", error);
      return this.simulateRankings(industry, region);
    }
  }

  /**
   * Generates deterministic mock ranking data for a given context.
   */
  private static simulateRankings(industry: string, region: string): RankingSnapshot {
    const companies = [
      "Acme Logistics",
      "Global Freight Systems",
      "Nexus Supply Chain",
      "Pioneer 3PL",
      "Velocity Warehousing",
      "EcoTrans Solutions",
      "Summit Distribution",
      "BlueChip Logistics",
      "Horizon Cargo",
      "Streamline Partners"
    ];

    // Create stable but distinct scores based on company name hash-like logic
    const entries: RankingEntry[] = companies
      .map((name) => {
        const baseScore = 60 + (name.length % 35);
        const change = (name.length % 7) - 3; // Mock change between -3 and +3
        return {
          companyName: name,
          score: baseScore,
          rank: 0, // Will be set after sorting
          change,
          industry,
          region
        };
      })
      .sort((a, b) => b.score - a.score)
      .map((entry, index) => ({
        ...entry,
        rank: index + 1
      }));

    return {
      id: `mock-snapshot-${industry}-${region}`,
      date: Timestamp.now(),
      industry,
      region,
      entries
    };
  }
}
