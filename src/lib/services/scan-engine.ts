
/**
 * @fileOverview ScanEngine orchestrates the AI visibility analysis process.
 * Decoupled into a Provider Adapter architecture for easy future scaling.
 */

import { generateCompanyAIScanReport, GenerateCompanyAIScanReportInput } from "@/ai/flows/generate-company-ai-scan-report";
import { provideAiScanRecommendations, ProvideAiScanRecommendationsOutput } from "@/ai/flows/provide-ai-scan-recommendations";
import { QueryDiscoveryData, QueryRecord, ScanResults, WebsiteSignal } from "../types";
import { MockAdapter } from "./adapters/mock-adapter";
import { DiscoveryContext } from "./adapters/provider-interface";
import { QueryLibraryService } from "./query-library-service";
import { BenchmarkService } from "./benchmark-service";
import { WebsiteExtractor } from "./website-extractor";
import { db } from "@/lib/firebase-config";
import { doc, setDoc } from "firebase/firestore";

export class ScanEngine {
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
  static async runScan(input: GenerateCompanyAIScanReportInput, profileId: string): Promise<ScanResults & { queryDiscovery: QueryDiscoveryData }> {
    // 1. Extract Website Intelligence
    const websiteSignals = await WebsiteExtractor.extractSignals(input.website, profileId);
    if (websiteSignals) {
      await setDoc(doc(db, "websiteSignals", websiteSignals.id), websiteSignals);
    }

    // 2. Generate core report findings (Narrative Analysis)
    // Pass signals to the AI flow to influence scores
    const report = await generateCompanyAIScanReport({
      ...input,
      websiteSignals: websiteSignals || undefined
    });
    
    // 3. Execute Multi-Vector Discovery (Signal Analysis)
    const context: DiscoveryContext = {
      targetCompany: input.companyName,
      industry: input.industry,
      geography: input.targetGeography,
      serviceCategories: input.serviceCategories,
      competitors: input.competitors
    };

    const queryDiscovery = await this.performDiscovery(context);

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
   * Run a limited free scan for a company profile.
   */
  static async runFreeScan(input: {
    companyName: string;
    website: string;
    industry: string;
    targetGeography: string;
  }): Promise<ScanResults & { queryDiscovery: QueryDiscoveryData }> {
    const fullInput: GenerateCompanyAIScanReportInput = {
      ...input,
      serviceCategories: ["General Service"],
      competitors: ["Industry Leader A", "Industry Leader B"],
    };

    const report = await generateCompanyAIScanReport(fullInput);
    
    const context: DiscoveryContext = {
      targetCompany: input.companyName,
      industry: input.industry,
      geography: input.targetGeography,
      serviceCategories: fullInput.serviceCategories,
      competitors: fullInput.competitors
    };

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

  private static async performDiscovery(context: DiscoveryContext): Promise<QueryDiscoveryData> {
    const adapters = this.getActiveAdapters();
    const libraryQueries = await QueryLibraryService.getQueriesForIndustry(context.industry, 8);
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

    return {
      queries: queryRecords,
      summary: {
        totalQueries: libraryQueries.length,
        companyMentionCount,
        coveragePercentage: (companyMentionCount / libraryQueries.length) * 100
      }
    };
  }
}
