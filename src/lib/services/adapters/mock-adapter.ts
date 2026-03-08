/**
 * @fileOverview Deterministic Mock Adapter for VizAI.
 * Preserves the current demo experience while adhering to the new Provider interface.
 */

import { AIProviderAdapter, DiscoveryContext } from "./provider-interface";
import { CompanyMention, QueryResult } from "@/lib/types";

export class MockAdapter implements AIProviderAdapter {
  constructor(
    public id: 'OpenAI' | 'Anthropic' | 'Perplexity' | 'Gemini',
    public name: string
  ) {}

  async generateQueries(context: DiscoveryContext): Promise<string[]> {
    return [
      `Best ${context.industry} companies in ${context.geography}`,
      `Top ${context.industry} providers for enterprise`,
      `Reliable ${context.industry} solutions near me`,
    ];
  }

  async executeDiscovery(query: string, context: DiscoveryContext): Promise<QueryResult> {
    const mentions = this.parseResponse(null, context);
    const isTargetCompanyMentioned = mentions.some(
      m => m.companyName.toLowerCase() === context.targetCompany.toLowerCase()
    );

    return {
      provider: this.id,
      mentions,
      isTargetCompanyMentioned
    };
  }

  parseResponse(_rawOutput: any, context: DiscoveryContext): CompanyMention[] {
    const pool = [...context.competitors];
    // Deterministic simulation based on query/company name for stable demos
    if (Math.random() > 0.4) {
      pool.push(context.targetCompany);
    }

    return pool
      .sort(() => 0.5 - Math.random())
      .slice(0, 4)
      .map((name, index) => ({
        companyName: name,
        position: index + 1,
        description: `Leading provider of ${context.industry} specialized in ${context.geography} markets.`,
        confidenceScore: 85 + (index * 2)
      }));
  }
}
