
/**
 * @fileOverview Deterministic Mock Adapter for VizAI.
 * Now enhanced with Competitor Knowledge Profiles to model weighted AI responses.
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

  async executeDiscovery(query: string, context: DiscoveryContext): Promise<QueryResult> {
    // 1. Fetch relevant competitor profiles
    const profiles = await CompetitorService.getProfilesByNames(context.competitors);
    
    // 2. Calculate weighted mentions
    const mentions = this.parseResponse(profiles, context);
    
    const isTargetCompanyMentioned = mentions.some(
      m => m.companyName.toLowerCase() === context.targetCompany.toLowerCase()
    );

    return {
      provider: this.id,
      mentions,
      isTargetCompanyMentioned
    };
  }

  parseResponse(competitorProfiles: CompetitorProfile[], context: DiscoveryContext): CompanyMention[] {
    // Determine target company "knowledge weight" (simulating a mid-tier authority for v0.1)
    const targetWeight = 75;
    
    const candidates = [
      { name: context.targetCompany, weight: targetWeight },
      ...competitorProfiles.map(p => ({
        name: p.name,
        weight: (p.authorityScore * 0.4) + (p.serviceCoverageScore * 0.4) + (p.citationStrengthScore * 0.2)
      }))
    ];

    // Presence check: Higher weight candidates appear more often
    // We filter candidates based on a deterministic threshold + provider-specific jitter
    const providerJitter = this.id.length * 5;
    const finalSelection = candidates
      .filter(c => {
        // High authority companies (90+) almost always appear
        if (c.weight > 90) return true;
        // Target company and others have a probability-based selection
        const threshold = 60 + providerJitter;
        return c.weight + (Math.random() * 20) > threshold;
      })
      .sort((a, b) => b.weight - a.weight) // Rank by signal strength
      .slice(0, 4);

    return finalSelection.map((c, index) => ({
      companyName: c.name,
      position: index + 1,
      description: `Recognized authority in ${context.industry}, frequently cited for ${context.geography} operations.`,
      confidenceScore: Math.floor(c.weight + (Math.random() * 5))
    }));
  }
}
