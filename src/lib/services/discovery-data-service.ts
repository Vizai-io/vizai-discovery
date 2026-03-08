
import { db } from "@/lib/firebase-config";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { QueryDiscoveryData, DiscoveryDataEntry } from "@/lib/types";

/**
 * @fileOverview DiscoveryDataService handles the long-term archival of AI discovery events.
 * This builds the "discoveryDataset" used for trend analysis and industry reporting.
 */
export class DiscoveryDataService {
  /**
   * Records a set of discovery events from a scan into the long-term dataset.
   */
  static async recordDiscoveryEvents(
    scanId: string,
    industry: string,
    region: string,
    discoveryData: QueryDiscoveryData,
    competitorList: string[],
    targetCompanyName: string
  ) {
    const datasetRef = collection(db, "discoveryDataset");

    try {
      const entries: Omit<DiscoveryDataEntry, 'id'>[] = discoveryData.queries.map(q => {
        // Aggregate all unique company names mentioned across all providers for this query
        const allMentions = new Set<string>();
        q.results.forEach(res => {
          res.mentions.forEach(m => allMentions.add(m.companyName));
        });

        const companiesMentioned = Array.from(allMentions);
        
        // Identify which mentioned companies are known competitors
        const competitorsPresent = companiesMentioned.filter(name => 
          competitorList.some(comp => comp.toLowerCase() === name.toLowerCase())
        );

        // Check if the target company was identified
        const targetCompanyPresent = q.results.some(r => r.isTargetCompanyMentioned);

        return {
          scanId,
          industry,
          region,
          queryText: q.text,
          companiesMentioned,
          competitorsPresent,
          targetCompanyPresent,
          intentType: q.intentType,
          timestamp: serverTimestamp()
        };
      });

      // Batch save entries
      await Promise.all(entries.map(entry => addDoc(datasetRef, entry)));
      
    } catch (error) {
      console.error("Failed to record discovery data events:", error);
    }
  }
}
