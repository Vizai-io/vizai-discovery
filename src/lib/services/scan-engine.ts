import { generateCompanyAIScanReport, GenerateCompanyAIScanReportInput, GenerateCompanyAIScanReportOutput } from "@/ai/flows/generate-company-ai-scan-report";
import { provideAiScanRecommendations, ProvideAiScanRecommendationsOutput } from "@/ai/flows/provide-ai-scan-recommendations";
import { QueryEngine } from "./query-engine";
import { QueryDiscoveryData, QueryRecord } from "../types";
import { MockAdapter } from "./adapters/mock-adapter";
import { DiscoveryContext } from "./adapters/provider-interface";

/**
 * ScanEngine orchestrates the AI visibility analysis process.
 * Decoupled into a Provider Adapter architecture for easy future scaling.
 */
export class ScanEngine {
  /**
   * List of active adapters. In future, real adapters (OpenAI, Perplexity) 
   * can be added to this array.
   */
  private static getActiveAdapters() {
    return [
      new MockAdapter('OpenAI', 'GPT-4o'),
      new MockAdapter('Anthropic', 'Claude 3.5'),
      new MockAdapter('Perplexity', 'Sonar Engine'),
      new MockAdapter('Gemini', 'Gemini 1.5 Pro'),
    ];
  }

  /**
   * Run a full scan for a company profile.
   */
  static async runScan(input: GenerateCompanyAIScanReportInput): Promise<GenerateCompanyAIScanReportOutput & { queryDiscovery: QueryDiscoveryData }> {
    // 1. Generate core report findings (Narrative Analysis)
    const report = await generateCompanyAIScanReport(input);
    
    // 2. Execute Multi-Vector Discovery (Signal Analysis)
    const context: DiscoveryContext = {
      targetCompany: input.companyName,
      industry: input.industry,
      geography: input.targetGeography,
      competitors: input.competitors
    };

    const queryDiscovery = await this.performDiscovery(context);

    return {
      ...report,
      queryDiscovery
    };
  }

  /**
   * Performs the discovery phase across all active AI providers.
   */
  private static async performDiscovery(context: DiscoveryContext): Promise<QueryDiscoveryData> {
    const adapters = this.getActiveAdapters();
    const queries = QueryEngine.generateIndustryQueries(context.industry, context.geography);
    const queryRecords: QueryRecord[] = [];
    let companyMentionCount = 0;

    for (const queryText of queries) {
      // Execute discovery across all providers for this specific query vector
      const results = await Promise.all(
        adapters.map(adapter => adapter.executeDiscovery(queryText, context))
      );

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

  /**
   * Generate strategic recommendations based on scan scores.
   */
  static async getRecommendations(report: GenerateCompanyAIScanReportOutput, input: GenerateCompanyAIScanReportInput): Promise<ProvideAiScanRecommendationsOutput> {
    return provideAiScanRecommendations({
      companyName: input.companyName,
      industry: input.industry,
      targetGeography: input.targetGeography,
      currentScores: {
        visibilityScore: report.overallScore,
        descriptionAccuracyScore: report.categoryScores.descriptionAccuracy,
        citationStrengthScore: report.categoryScores.citationStrength,
        serviceCoverageScore: report.categoryScores.serviceCoverage,
        competitorShareOfVoiceScore: report.categoryScores.competitorShareOfVoice,
      },
      identifiedGaps: report.knowledgeGaps.map(g => g.description),
      competitors: input.competitors,
    });
  }
}
