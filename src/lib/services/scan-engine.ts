
import { generateCompanyAIScanReport, GenerateCompanyAIScanReportInput, GenerateCompanyAIScanReportOutput } from "@/ai/flows/generate-company-ai-scan-report";
import { provideAiScanRecommendations, ProvideAiScanRecommendationsOutput } from "@/ai/flows/provide-ai-scan-recommendations";
import { QueryEngine } from "./query-engine";
import { QueryDiscoveryData, QueryRecord, IndustryQuery } from "../types";
import { MockAdapter } from "./adapters/mock-adapter";
import { DiscoveryContext } from "./adapters/provider-interface";
import { QueryLibraryService } from "./query-library-service";

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
    
    // 2. Execute Multi-Vector Discovery (Signal Analysis) using Industry Query Library
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
   * Now utilizes the Industry Query Library for realistic intent vectors.
   */
  private static async performDiscovery(context: DiscoveryContext): Promise<QueryDiscoveryData> {
    const adapters = this.getActiveAdapters();
    
    // Fetch realistic queries from the industry library
    const libraryQueries = await QueryLibraryService.getQueriesForIndustry(context.industry, 8);
    
    const queryRecords: QueryRecord[] = [];
    let companyMentionCount = 0;

    for (const libQuery of libraryQueries) {
      // Execute discovery across all providers for this specific query vector
      const results = await Promise.all(
        adapters.map(adapter => adapter.executeDiscovery(libQuery.text, context))
      );

      if (results.some(r => r.isTargetCompanyMentioned)) {
        companyMentionCount++;
      }

      queryRecords.push({
        id: Math.random().toString(36).substr(2, 9),
        text: libQuery.text,
        results
      });
    }

    return {
      queries: queryRecords,
      summary: {
        totalQueries: libraryQueries.length,
        companyMentionCount,
        coveragePercentage: (companyMentionCount / libraryQueries.length) * 100
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
