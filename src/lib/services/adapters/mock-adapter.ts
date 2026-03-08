/**
 * @fileOverview Deterministic Mock Adapter for VizAI.
 * Enhanced with weighted discovery logic that simulates service/geography matching
 * and provider-specific model biases.
 */

import { AIProviderAdapter, DiscoveryContext } from "./provider-interface";
import { CompanyMention, QueryResult, CompetitorProfile } from "@/lib/types";
import { CompetitorService } from "../competitor-service";

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

  async executeDiscovery(queryText: string, context: DiscoveryContext): Promise<QueryResult> {
    // 1. Fetch relevant competitor profiles
    const competitorProfiles = await CompetitorService.getProfilesByNames(context.competitors);
    
    // 2. Calculate weighted mentions based on query relevance and knowledge profiles
    const mentions = this.parseResponse(competitorProfiles, context, queryText);
    
    const isTargetCompanyMentioned = mentions.some(
      m => m.companyName.toLowerCase() === context.targetCompany.toLowerCase()
    );

    return {
      provider: this.id,
      mentions,
      isTargetCompanyMentioned
    };
  }

  /**
   * Simulates AI response generation with weighted logic.
   * This is a "private" implementation detail for the MockAdapter.
   */
  parseResponse(competitorProfiles: CompetitorProfile[], context: DiscoveryContext, queryText: string = ''): CompanyMention[] {
    const query = queryText.toLowerCase();
    
    // Create a mock knowledge profile for the target company based on input context
    const targetProfile: Omit<CompetitorProfile, 'id'> = {
      name: context.targetCompany,
      industry: context.industry,
      services: context.serviceCategories,
      geography: [context.geography],
      authorityScore: 75, // Mid-tier baseline for target company in demo
      citationStrengthScore: 70,
      serviceCoverageScore: 80
    };

    const candidates = [targetProfile, ...competitorProfiles];

    // Score each candidate based on query relevance and their knowledge profile
    const scoredCandidates = candidates.map(c => {
      let score = (c.authorityScore * 0.4) + (c.serviceCoverageScore * 0.3) + (c.citationStrengthScore * 0.3);
      
      // 1. Service Matching: Boost if query contains keywords from the company's services
      const serviceMatch = c.services.some(s => query.includes(s.toLowerCase()));
      if (serviceMatch) score += 15;

      // 2. Geographic Matching: Boost if query contains keywords from the company's geography
      const geoMatch = c.geography.some(g => query.includes(g.toLowerCase()) || g.toLowerCase() === 'global');
      if (geoMatch) score += 10;

      // 3. Provider Bias (Deterministic Jitter): 
      // Simulates how different models (OpenAI vs Gemini) might favor different sources
      const nameHash = c.name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
      const providerHash = this.id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
      const jitter = ( (nameHash + providerHash) % 20 ) - 10; // -10 to +10
      score += jitter;

      // 4. Intent Type Boosting:
      if (query.includes('best') || query.includes('top')) {
        score += (c.authorityScore / 10);
      }
      if (query.includes('compare')) {
        // Increase diversity for comparison queries by adding a "positional" jitter
        score += Math.random() * 5;
      }

      return { ...c, finalScore: score };
    });

    // Sort by final relevance score and take top 4
    const finalSelection = scoredCandidates
      .sort((a, b) => b.finalScore - a.finalScore)
      .slice(0, 4);

    return finalSelection.map((c, index) => {
      // Generate a realistic AI snippet
      const matchedService = c.services.find(s => query.includes(s.toLowerCase())) || c.services[0];
      const description = `${c.name} is a leading entity in the ${c.industry} sector, frequently recognized for its ${matchedService} solutions across ${c.geography[0]} markets.`;
      
      return {
        companyName: c.name,
        position: index + 1,
        description,
        confidenceScore: Math.min(99, Math.floor(c.finalScore))
      };
    });
  }
}
