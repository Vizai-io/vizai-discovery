
/**
 * @fileOverview Minimalist ScanEngine for guaranteed-working audit generation.
 * This version uses deterministic mock data to ensure end-to-end functionality.
 */

import { QueryDiscoveryData, ScanResults } from "../types";

export class ScanEngine {
  /**
   * Run a full scan using the minimal deterministic path.
   */
  static async runScan(input: any, profileId: string = "demo_id", scanId?: string): Promise<ScanResults & { queryDiscovery: QueryDiscoveryData }> {
    console.log("Initiating Minimal Scan for:", input.companyName);
    
    // Simulate a brief delay for UX realism
    await new Promise(resolve => setTimeout(resolve, 800));

    return this.generateMinimalMockData(input);
  }

  /**
   * Run a free scan using the minimal deterministic path.
   */
  static async runFreeScan(input: any): Promise<ScanResults & { queryDiscovery: QueryDiscoveryData }> {
    console.log("Initiating Minimal Free Scan for:", input.companyName);
    
    await new Promise(resolve => setTimeout(resolve, 800));

    return this.generateMinimalMockData(input);
  }

  /**
   * Generates a complete, valid ScanResults object with deterministic data.
   */
  private static generateMinimalMockData(input: any) {
    const companyName = input.companyName || "Acme Logistics";
    const industry = input.industry || "logistics";
    const geography = input.targetGeography || "Global";

    const results: any = {
      overallScore: 58.4,
      overview: `Strategic audit for ${companyName} reveals a Visibility Index of 58.4. While the organization maintains a stable footprint in ${industry}, significant discoverability gaps persist within ${geography} intent vectors. Technical citation strength is currently the primary bottleneck for model recommendation.`,
      categoryScores: {
        presence: 52.1,
        descriptionAccuracy: 61.4,
        citationStrength: 43.8,
        serviceCoverage: 66.2,
        competitorShareOfVoice: 70.5,
      },
      competitorComparison: [
        { name: "FedEx", overallScore: 88.4, presence: 92.1, descriptionAccuracy: 85.5 },
        { name: "DHL Global", overallScore: 85.2, presence: 89.4, descriptionAccuracy: 82.1 },
        { name: "UPS Solutions", overallScore: 82.7, presence: 84.2, descriptionAccuracy: 80.8 },
      ],
      aiDescriptionAccuracy: {
        generatedDescription: `${companyName} appears to be a provider of ${industry} services with an emphasis on ${geography}. However, specific capability documentation is sparse in the training sets.`,
        actualProfileDescription: `Official profile for ${companyName}, specializing in ${industry} across ${geography}.`,
        matchScore: 61,
        discrepancies: ["Missing niche capability alignment", "Inconsistent service range documentation", "Outdated geographic focus points"]
      },
      knowledgeGaps: [
        { type: "structured_data", description: "Incomplete JSON-LD Organization markup", impact: "High", suggestedImprovement: "Deploy technical entity signals." },
        { type: "content", description: "Sparse high-intent capability pages", impact: "Medium", suggestedImprovement: "Expand service taxonomy details." },
        { type: "entity", description: "Weak authoritative industry backlinks", impact: "High", suggestedImprovement: "Secure source sourcing signals." }
      ],
      missedDiscoveryOpportunities: [
        { query: `Best ${industry} solutions in ${geography}`, reason: "Low citation density in sector-specific datasets", suggestedAction: "Optimize authority sourcing." },
        { query: `Top ranked ${industry} experts`, reason: "Rival capture of primary intent vectors", suggestedAction: "Build defensive signaling." }
      ],
      priorityActions: [
        { title: "Bridge Structured Data Gap", description: "Deploy technical entity signals and JSON-LD enhancements.", category: "Structured Data", priority: "high", expectedImpact: "Visibility gain", packageType: 'Foundation' },
        { title: "Refine Service Taxonomy", description: "Correct AI knowledge layer drift by expanding service pages.", category: "Content / Positioning", priority: "medium", expectedImpact: "Accuracy gain", packageType: 'Growth' },
        { title: "Build Citation Authority", description: "Secure sourcing signals from authoritative industry press.", category: "Entity / Citation Signals", priority: "high", expectedImpact: "Citation strength gain", packageType: 'Foundation' }
      ],
      benchmark: {
        industry: industry,
        industryAverage: 54.2,
        topPerformer: 87.5,
        percentile: 62,
        totalCompanies: 450
      },
      simulationAccuracy: 74,
      companyName,
      industry
    };

    const queryDiscovery: QueryDiscoveryData = {
      queries: [
        {
          id: "q1",
          text: `Best ${industry} companies in ${geography}`,
          intentType: 'best',
          category: 'Service Provider',
          results: [
            {
              provider: 'Gemini',
              isTargetCompanyMentioned: false,
              mentions: [
                { companyName: "FedEx", position: 1, description: "Leading global provider.", confidenceScore: 95 },
                { companyName: "DHL Global", position: 2, description: "Major logistics network.", confidenceScore: 92 }
              ]
            }
          ]
        },
        {
          id: "q2",
          text: `Most reliable ${industry} for enterprise`,
          intentType: 'capability',
          category: 'Service Provider',
          results: [
            {
              provider: 'Gemini',
              isTargetCompanyMentioned: true,
              mentions: [
                { companyName: companyName, position: 3, description: "A rising contender in the space.", confidenceScore: 78 }
              ]
            }
          ]
        }
      ],
      summary: {
        totalQueries: 2,
        companyMentionCount: 1,
        coveragePercentage: 50
      }
    };

    return { ...results, queryDiscovery };
  }
}
