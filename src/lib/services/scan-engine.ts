
/**
 * @fileOverview ScanEngine orchestrates the AI visibility analysis process.
 * Decoupled into a Provider Adapter architecture for easy future scaling.
 * 
 * Audit Update: Added robust error handling and step-by-step status fallbacks.
 */

import { generateCompanyAIScanReport, GenerateCompanyAIScanReportInput, GenerateCompanyAIScanReportOutput } from "@/ai/flows/generate-company-ai-scan-report";
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
import { doc, setDoc, updateDoc } from "firebase/firestore";

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
   * Ensures that failure in optional sub-tasks does not halt the entire process.
   */
  static async runScan(input: any, profileId: string = "demo_id", scanId?: string): Promise<ScanResults & { queryDiscovery: QueryDiscoveryData, realQueryResults?: RealQueryResult[] }> {
    const updateStatus = async (status: string, notes?: string) => {
      if (scanId) {
        await updateDoc(doc(db, "scans", scanId), { 
          status: "running",
          currentStep: status,
          internalNotes: notes || "" 
        }).catch(console.warn);
      }
    };

    // 1. Extract Website Intelligence
    await updateStatus("Extracting Website Signals");
    let websiteSignals: WebsiteSignal | null = null;
    try {
      websiteSignals = await extractWebsiteSignals(input.website, profileId);
      if (websiteSignals) {
        await setDoc(doc(db, "websiteSignals", websiteSignals.id), websiteSignals);
      }
    } catch (e) {
      console.warn("Website extraction failed, continuing with fallback.", e);
    }

    // 2. Business Entity Enrichment
    await updateStatus("Enriching Entity Data");
    let entitySignal: EntitySignal;
    try {
      entitySignal = await enrichEntity(input, websiteSignals);
      await setDoc(doc(db, "entitySignals", entitySignal.id), entitySignal);
    } catch (e) {
      console.warn("Entity enrichment failed, using default baseline.");
      entitySignal = {
        id: `ent_fallback_${Date.now()}`,
        profileId,
        authorityWeight: 50,
        serviceCoverageWeight: 50,
        geographicRelevanceWeight: 50,
        dataConfidence: 30,
        enrichedAttributes: { operatingRegions: [], industriesServed: [] },
        extractedAt: new Date().toISOString()
      };
    }

    // 3. Local Presence Signal Analysis
    await updateStatus("Analyzing Local Presence");
    let presenceSignal: PresenceSignal | null = null;
    try {
      presenceSignal = await analyzePresence(input);
      await setDoc(doc(db, "presenceSignals", presenceSignal.id), presenceSignal);
    } catch (e) {
      console.warn("Presence analysis failed.", e);
    }

    // 4. Generate core report findings (Narrative Analysis)
    await updateStatus("Generating Narrative Analysis");
    let report: GenerateCompanyAIScanReportOutput;
    try {
      report = await generateCompanyAIScanReport({
        ...input,
        websiteSignals: websiteSignals || undefined,
        entitySignal: entitySignal || undefined
      } as any);
    } catch (e) {
      console.error("AI Report Generation failed!", e);
      throw new Error("Critical Analysis Error: The AI model failed to generate the visibility narrative.");
    }
    
    // Adjust report scores based on Presence Signals
    if (presenceSignal) {
      report.categoryScores.citationStrength = Math.min(100, report.categoryScores.citationStrength + (presenceSignal.citationWeight / 5));
      report.overallScore = Math.min(100, report.overallScore + (presenceSignal.authorityBoost / 10));
    }

    // 5. Execute Multi-Vector Discovery (Signal Analysis)
    await updateStatus("Executing Multi-Vector Discovery");
    const context: DiscoveryContext = {
      targetCompany: input.companyName,
      industry: input.industry,
      geography: input.targetGeography,
      serviceCategories: input.serviceCategories,
      competitors: input.competitors
    };

    const queryDiscovery = await this.performDiscovery(context);

    // 6. Calculate Industry Benchmarking
    await updateStatus("Calculating Sector Benchmarks");
    const benchmarkData = BenchmarkService.getBenchmarkForIndustry(input.industry);
    const percentile = BenchmarkService.calculatePercentile(report.overallScore, benchmarkData);

    // 7. Optional Real Query Verification (Gemini)
    await updateStatus("Validating against Live Models");
    let realResults: RealQueryResult[] = [];
    if (profileId !== "demo_id" && scanId) {
      try {
        realResults = await RealQueryEngine.runVerification(input as any, scanId);
      } catch (e) {
        console.warn("Real query verification failed, skipping verification step.", e);
      }
    }

    // 8. Record Discovery Events to Dataset
    if (scanId) {
      try {
        DiscoveryDataService.recordDiscoveryEvents(
          scanId,
          input.industry,
          input.targetGeography,
          queryDiscovery,
          input.competitors,
          input.companyName
        );
      } catch (e) {
        console.warn("Failed to record discovery events to dataset.", e);
      }
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

    let report: GenerateCompanyAIScanReportOutput;
    try {
      report = await generateCompanyAIScanReport(fullInput);
    } catch (e) {
      throw new Error("Free scan model error.");
    }
    
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
