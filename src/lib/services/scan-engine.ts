
/**
 * @fileOverview ScanEngine orchestrates the AI visibility analysis process.
 * Decoupled into a Provider Adapter architecture for easy future scaling.
 */

import { generateCompanyAIScanReport, GenerateCompanyAIScanReportInput, GenerateCompanyAIScanReportOutput } from "@/ai/flows/generate-company-ai-scan-report";
import { provideAiScanRecommendations, ProvideAiScanRecommendationsOutput } from "@/ai/flows/provide-ai-scan-recommendations";
import { QueryEngine } from "./query-engine";
import { QueryDiscoveryData, QueryRecord, IndustryQuery, ScanResults } from "../types";
import { MockAdapter } from "./adapters/mock-adapter";
import { DiscoveryContext } from "./adapters/provider-interface";
import { QueryLibraryService } from "./query-library-service";
import { BenchmarkService } from "./benchmark-service";

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
  static async runScan(input: GenerateCompanyAIScanReportInput): Promise<ScanResults & { queryDiscovery: QueryDiscoveryData }> {
    // 1. Generate core report findings (Narrative Analysis)
    const report = await generateCompanyAIScanReport(input);
    
    // 2. Execute Multi-Vector Discovery (Signal Analysis) using Industry Query Library
    const context: DiscoveryContext = {
      targetCompany: input.companyName,
      industry: input.industry,
      geography: input.targetGeography,
      serviceCategories: input.serviceCategories,
      competitors: input.competitors
    };

    const queryDiscovery = await this.performDiscovery(context);

    // 3. Calculate Industry Benchmarking
    const benchmarkData = BenchmarkService.getBenchmarkForIndustry(input.industry);
    const percentile = BenchmarkService.calculatePercentile(report.overallScore, benchmarkData);

    return {
      ...report,
      queryDiscovery,
      benchmark: {
        industry: benchmarkData.industry,
        industryAverage: benchmarkData.averageScore,
        topPerformer: benchmarkData.topScore,
        percentile: percentile,
        totalCompanies: benchmarkData.totalCompanies
      }
    };
  }

  /**
   * Run a limited free scan for a company profile.
   */
  static async runFreeScan(input: {
    companyName: string;
    website: string;
    industry: string;
    targetGeography: string;
  }): Promise<ScanResults & { queryDiscovery: QueryDiscoveryData }> {
    // 1. Mock minimal inputs for the report flow
    const fullInput: GenerateCompanyAIScanReportInput = {
      ...input,
      serviceCategories: ["General Service"], // Placeholder
      competitors: ["Industry Leader A", "Industry Leader B"], // Placeholder
    };

    // 2. Generate core report findings
    const report = await generateCompanyAIScanReport(fullInput);
    
    // 3. Execute Limited Multi-Vector Discovery (Signal Analysis)
    const context: DiscoveryContext = {
      targetCompany: input.companyName,
      industry: input.industry,
      geography: input.targetGeography,
      serviceCategories: fullInput.serviceCategories,
      competitors: fullInput.competitors
    };

    // Only 3 queries for free scan
    const libraryQueries = await QueryLibraryService.getQueriesForIndustry(context.industry, 3);
    const adapters = this.getActiveAdapters();
    const queryRecords: QueryRecord[] = [];
    let companyMentionCount = 0;

    for (const libQuery of libraryQueries) {
      const results = await Promise.all(
        adapters.map(adapter => adapter.executeDiscovery(libQuery.text, context))
      );
      if (results.some(r => r.isTargetCompanyMentioned)) {
        companyMentionCount++;
      }
      queryRecords.push({
        id: Math.random().toString(36).substr(2, 9),
        text: libQuery.text,
        results,
        intentType: libQuery.intentType,
        category: libQuery.category
      });
    }

    const queryDiscovery = {
      queries: queryRecords,
      summary: {
        totalQueries: libraryQueries.length,
        companyMentionCount,
        coveragePercentage: (companyMentionCount / libraryQueries.length) * 100
      }
    };

    // 4. Calculate Industry Benchmarking
    const benchmarkData = BenchmarkService.getBenchmarkForIndustry(input.industry);
    const percentile = BenchmarkService.calculatePercentile(report.overallScore, benchmarkData);

    return {
      ...report,
      queryDiscovery,
      benchmark: {
        industry: benchmarkData.industry,
        industryAverage: benchmarkData.averageScore,
        topPerformer: benchmarkData.topScore,
        percentile: percentile,
        totalCompanies: benchmarkData.totalCompanies
      }
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
        results,
        intentType: libQuery.intentType,
        category: libQuery.category
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
