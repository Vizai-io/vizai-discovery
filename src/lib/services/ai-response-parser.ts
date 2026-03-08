/**
 * @fileOverview AI Response Parser Service.
 * Handles the normalization of real AI responses and generates comparison metrics
 * between simulated and real-world discovery data.
 */

import { RealQueryResult, CompanyMention, QueryRecord } from "@/lib/types";

export interface ValidationComparison {
  query: string;
  simulatedMentions: string[];
  realMentions: string[];
  overlapCount: number;
  alignmentScore: number; // 0-100
}

export class AIResponseParser {
  /**
   * Normalizes and compares a real query result against its simulated counterpart.
   */
  static generateComparison(
    realResult: RealQueryResult,
    simulatedRecord: QueryRecord | undefined
  ): ValidationComparison {
    const realMentions = realResult.mentions.map(m => m.companyName);
    
    // Aggregate simulated mentions across all providers for this specific query
    const simulatedMentions = Array.from(new Set(
      simulatedRecord?.results.flatMap(r => r.mentions.map(m => m.companyName)) || []
    ));

    const intersection = realMentions.filter(name => 
      simulatedMentions.some(simName => simName.toLowerCase() === name.toLowerCase())
    );

    const overlapCount = intersection.length;
    const totalUnique = new Set([...realMentions, ...simulatedMentions]).size;
    const alignmentScore = totalUnique > 0 ? (overlapCount / totalUnique) * 100 : 0;

    return {
      query: realResult.query,
      simulatedMentions,
      realMentions,
      overlapCount,
      alignmentScore
    };
  }

  /**
   * Summarizes a real AI response for quick report consumption.
   */
  static summarizeResponse(realResult: RealQueryResult): string {
    const topMention = realResult.mentions[0]?.companyName || "No entities found";
    return `AI model primarily identified ${topMention} as a relevant entity. ${realResult.mentions.length} total mentions detected.`;
  }
}
