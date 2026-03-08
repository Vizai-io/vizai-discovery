
/**
 * @fileOverview RealQueryEngine orchestrates live validation queries against AI models.
 * This service complements the simulation engine by providing "ground truth" verification.
 */

import { executeRealDiscoveryQuery } from "@/ai/flows/execute-real-discovery-query";
import { RealQueryResult, CompanyProfile, IndustryQuery } from "@/lib/types";
import { QueryLibraryService } from "./query-library-service";
import { db } from "@/lib/firebase-config";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";

export class RealQueryEngine {
  /**
   * Executes a small batch of real-world queries to verify simulated results.
   */
  static async runVerification(profile: CompanyProfile, scanId: string): Promise<RealQueryResult[]> {
    const results: RealQueryResult[] = [];
    
    try {
      // 1. Fetch 3 high-intent queries from the library
      const queries = await QueryLibraryService.getQueriesForIndustry(profile.industry, 3);

      for (const q of queries) {
        // 2. Execute the Genkit Flow
        const output = await executeRealDiscoveryQuery({
          queryText: q.text,
          targetCompany: profile.name,
          industry: profile.industry
        });

        const realResult: RealQueryResult = {
          id: `real_${Math.random().toString(36).substr(2, 9)}`,
          scanId,
          query: q.text,
          model: "Gemini 1.5 Flash",
          mentions: output.mentions,
          responseExcerpt: output.responseExcerpt,
          timestamp: new Date()
        };

        // 3. Store in Firestore
        await addDoc(collection(db, "realQueryResults"), {
          ...realResult,
          timestamp: serverTimestamp()
        });

        results.push(realResult);
      }
    } catch (error) {
      console.warn("Real query verification failed:", error);
    }

    return results;
  }
}
