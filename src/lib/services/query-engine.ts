import { QueryRecord, CompanyMention, QueryDiscoveryData } from "../types";
import { ResponseParser } from "./response-parser";

/**
 * QueryEngine simulates user interactions with AI systems.
 * It generates industry-specific queries and simulates AI responses.
 */
export class QueryEngine {
  private static PROVIDERS: ('OpenAI' | 'Anthropic' | 'Perplexity' | 'Gemini')[] = [
    'OpenAI', 'Anthropic', 'Perplexity', 'Gemini'
  ];

  /**
   * Generates a set of discovery queries based on industry context.
   */
  static generateIndustryQueries(industry: string, geography: string): string[] {
    const templates = [
      `Best ${industry} companies in ${geography}`,
      `Top ${industry} providers near ${geography}`,
      `Most reliable ${industry} for small business`,
      `Affordable ${industry} solutions in ${geography}`,
      `Leading ${industry} innovations 2024`,
      `Who are the top 5 ${industry} firms?`,
      `Recommended ${industry} experts for enterprise`,
    ];
    
    // Pick 5-7 random templates
    return templates.sort(() => 0.5 - Math.random()).slice(0, 6);
  }

  /**
   * Simulates AI responses for a list of queries.
   */
  static async simulateDiscovery(
    targetCompanyName: string,
    industry: string,
    geography: string,
    competitors: string[]
  ): Promise<QueryDiscoveryData> {
    const queries = this.generateIndustryQueries(industry, geography);
    const queryRecords: QueryRecord[] = [];
    let companyMentionCount = 0;

    for (const queryText of queries) {
      const results = this.PROVIDERS.map(provider => {
        const mentions = this.generateMockMentions(targetCompanyName, competitors);
        const parsed = ResponseParser.parseProviderResponse(provider, mentions, targetCompanyName);
        return parsed;
      });

      if (results.some(r => r.isTargetCompanyMentioned)) {
        companyMentionCount++;
      }

      queryRecords.push({
        id: Math.random().toString(36).substr(2, 9),
        text: queryText,
        results
      });
    }

    return {
      queries: queryRecords,
      summary: {
        totalQueries: queries.length,
        companyMentionCount,
        coveragePercentage: (companyMentionCount / queries.length) * 100
      }
    };
  }

  private static generateMockMentions(targetCompany: string, competitors: string[]): CompanyMention[] {
    const pool = [...competitors];
    // 40% chance the target company is included in the response
    if (Math.random() > 0.6) {
      pool.push(targetCompany);
    }

    // Pick 3-5 random companies from the pool
    const selected = pool.sort(() => 0.5 - Math.random()).slice(0, 4);
    
    return selected.map((name, index) => ({
      companyName: name,
      position: index + 1,
      description: `A prominent provider of industry-leading services in the ${name} sector.`,
      confidenceScore: Math.floor(Math.random() * 20) + 75 // 75-95
    }));
  }
}
