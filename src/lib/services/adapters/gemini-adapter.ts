/**
 * @fileOverview Gemini AI Provider Adapter.
 * Uses the existing Genkit flow to execute real discovery queries against Google Gemini.
 */

import { AIProviderAdapter, DiscoveryContext } from "./provider-interface";
import { CompanyMention, QueryResult } from "@/lib/types";
import { executeRealDiscoveryQuery } from "@/ai/flows/execute-real-discovery-query";

export class GeminiAdapter implements AIProviderAdapter {
  id = 'Gemini' as const;
  name = 'Gemini 2.5 Flash';

  async generateQueries(context: DiscoveryContext): Promise<string[]> {
    return [
      `Best ${context.industry} companies in ${context.geography}`,
      `Top ${context.serviceCategories[0] || context.industry} providers for enterprise`,
      `Who are the leading ${context.industry} companies for ${context.serviceCategories.slice(0, 2).join(' and ') || 'business solutions'}`,
      `Compare ${context.industry} providers in ${context.geography}`,
      `Most reliable ${context.industry} solutions and services`,
    ];
  }

  async executeDiscovery(query: string, context: DiscoveryContext): Promise<QueryResult> {
    const result = await executeRealDiscoveryQuery({
      queryText: query,
      targetCompany: context.targetCompany,
      industry: context.industry,
    });

    const mentions = this.parseResponse(result, context);

    return {
      provider: 'Gemini',
      mentions,
      isTargetCompanyMentioned: result.isTargetCompanyMentioned,
    };
  }

  parseResponse(rawOutput: any, context: DiscoveryContext): CompanyMention[] {
    if (!rawOutput?.mentions || !Array.isArray(rawOutput.mentions)) {
      return [];
    }

    return rawOutput.mentions.map((mention: any, index: number) => ({
      companyName: mention.companyName || 'Unknown',
      position: mention.position || index + 1,
      description: mention.description || '',
      confidenceScore: mention.companyName?.toLowerCase() === context.targetCompany.toLowerCase() ? 85 : 70,
    }));
  }
}
