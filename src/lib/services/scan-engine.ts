
/**
 * @fileOverview ScanEngine orchestrates the AI visibility analysis process.
 * Decoupled into a Provider Adapter architecture for easy future scaling.
 */

import { generateCompanyAIScanReport, GenerateCompanyAIScanReportInput } from "@/ai/flows/generate-company-ai-scan-report";
import { provideAiScanRecommendations, ProvideAiScanRecommendationsOutput } from "@/ai/flows/provide-ai-scan-recommendations";
import { QueryDiscoveryData, QueryRecord, ScanResults, WebsiteSignal, EntitySignal, PresenceSignal, RealQueryResult } from "../types";
import { MockAdapter } from "./adapters/mock-adapter";
import { DiscoveryContext } from "./adapters/provider-interface";
import { QueryLibraryService } from "./query-library-service";
import { BenchmarkService } from "./benchmark-service";
import { extractWebsiteSignals } from "./website-extractor";
import { enrichEntity } from "./entity-enrichment";
import { analyzePresence } from "./presence-enrichment";
import { RealQueryEngine } from "./real-query-engine";
import { DiscoveryDataService } from "./discovery-data-service";
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
  static async runScan(input: any, profileId: string = "demo_id", scanIdPlaceholder?: string): Promise<ScanResults & { queryDiscovery: QueryDiscoveryData, realQueryResults?: RealQueryResult[] }> {
    // 1. Extract Website Intelligence
    const websiteSignals = await extractWebsiteSignals(input.website, profileId);
    if (websiteSignals) {
      await setDoc(doc(db, "websiteSignals", websiteSignals.id), websiteSignals);
    }

    // 2. Business Entity Enrichment
    const entitySignal = await enrichEntity(input, websiteSignals);
    await setDoc(doc(db, "entitySignals", entitySignal.id), entitySignal);

    // 3. Local Presence Signal Analysis
    const presenceSignal = await analyzePresence(input);
    await setDoc(doc(db, "presenceSignals", presenceSignal.id), presenceSignal);

    // 4. Generate core report findings (Narrative Analysis)
    const report = await generateCompanyAIScanReport({
      ...input,
      websiteSignals: websiteSignals || undefined,
      entitySignal: entitySignal || undefined
    } as any);
    
    // Adjust report scores based on Presence Signals
    if (presenceSignal) {
      report.categoryScores.citationStrength = Math.min(100, report.categoryScores.citationStrength + (presenceSignal.citationWeight / 5));
      report.overallScore = Math.min(100, report.overallScore + (presenceSignal.authorityBoost / 10));
    }

    // 5. Execute Multi-Vector Discovery (Signal Analysis)
    const context: DiscoveryContext = {
      targetCompany: input.companyName,
      industry: input.industry,
      geography: input.targetGeography,
      serviceCategories: input.serviceCategories,
      competitors: input.competitors
    };

    const queryDiscovery = await this.performDiscovery(context);

    // 6. Calculate Industry Benchmarking
    const benchmarkData = BenchmarkService.getBenchmarkForIndustry(input.industry);
    const percentile = BenchmarkService.calculatePercentile(report.overallScore, benchmarkData);

    // 7. Optional Real Query Verification (Gemini)
    let realResults: RealQueryResult[] = [];
    if (profileId !== "demo_id" && scanIdPlaceholder) {
      realResults = await RealQueryEngine.runVerification(input as any, scanIdPlaceholder);
    }

    // 8. Record Discovery Events to Dataset
    if (scanIdPlaceholder) {
      DiscoveryDataService.recordDiscoveryEvents(
        scanIdPlaceholder,
        input.industry,
        input.targetGeography,
        queryDiscovery,
        input.competitors,
        input.companyName
      );
    }

    return {
      ...report,
      queryDiscovery,
      realQueryResults: realResults,
      entitySignal,
      presenceSignal,
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

    // Record events for the free scan as well
    DiscoveryDataService.recordDiscoveryEvents(
      "free_scan_" + Math.random().toString(36).substr(2, 5),
      input.industry,
      input.targetGeography,
      queryDiscovery,
      fullInput.competitors,
      input.companyName
    );

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
