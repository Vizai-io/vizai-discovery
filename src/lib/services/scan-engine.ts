
/**
 * @fileOverview ScanEngine orchestrates the AI visibility analysis process.
 * Decoupled into a Provider Adapter architecture for easy future scaling.
 * 
 * Audit Update: Added robust error handling and step-by-step status fallbacks.
 */

import { generateCompanyAIScanReport, GenerateCompanyAIScanReportOutput } from "@/ai/flows/generate-company-ai-scan-report";
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
    const updateStatus = async (status: string, step: string) => {
      if (scanId) {
        await updateDoc(doc(db, "scans", scanId), { 
          status,
          currentStep: step,
        }).catch(console.warn);
      }
    };

    try {
      // 1. Extract Website Intelligence
      await updateStatus("running", "Extracting Website Signals");
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
      await updateStatus("running", "Enriching Entity Data");
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
      await updateStatus("running", "Analyzing Local Presence");
      let presenceSignal: PresenceSignal | null = null;
      try {
        presenceSignal = await analyzePresence(input);
        if (presenceSignal) {
          await setDoc(doc(db, "presenceSignals", presenceSignal.id), presenceSignal);
        }
      } catch (e) {
        console.warn("Presence analysis failed.", e);
      }

      // 4. Generate core report findings (Narrative Analysis)
      await updateStatus("running", "Generating Narrative Analysis");
      let report: GenerateCompanyAIScanReportOutput;
      try {
        // Attempt AI generation
        report = await generateCompanyAIScanReport({
          companyName: input.companyName,
          website: input.website,
          industry: input.industry,
          serviceCategories: input.serviceCategories || ["General Service"],
          targetGeography: input.targetGeography,
          competitors: input.competitors || ["Competitor A", "Competitor B"],
          websiteSignals: websiteSignals || undefined,
          entitySignal: entitySignal || undefined
        });
      } catch (e) {
        console.warn("AI Report Generation failed, using deterministic fallback.", e);
        // Deterministic fallback report
        report = this.generateDeterministicReport(input, websiteSignals, entitySignal);
      }
      
      // Adjust report scores based on Presence Signals
      if (presenceSignal) {
        report.categoryScores.citationStrength = Math.min(100, report.categoryScores.citationStrength + (presenceSignal.citationWeight / 5));
        report.overallScore = Math.min(100, report.overallScore + (presenceSignal.authorityBoost / 10));
      }

      // 5. Execute Multi-Vector Discovery (Signal Analysis)
      await updateStatus("running", "Executing Multi-Vector Discovery");
      const context: DiscoveryContext = {
        targetCompany: input.companyName,
        industry: input.industry,
        geography: input.targetGeography,
        serviceCategories: input.serviceCategories || ["General Service"],
        competitors: input.competitors || ["Competitor A", "Competitor B"]
      };

      const queryDiscovery = await this.performDiscovery(context);

      // 6. Calculate Industry Benchmarking
      await updateStatus("running", "Calculating Sector Benchmarks");
      const benchmarkData = BenchmarkService.getBenchmarkForIndustry(input.industry);
      const percentile = BenchmarkService.calculatePercentile(report.overallScore, benchmarkData);

      // 7. Optional Real Query Verification (Gemini)
      await updateStatus("running", "Validating against Live Models");
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
            input.competitors || [],
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
        companyName: input.companyName,
        industry: input.industry,
        benchmark: {
          industry: benchmarkData.industry,
          industryAverage: benchmarkData.averageScore,
          topPerformer: benchmarkData.topScore,
          percentile: percentile,
          totalCompanies: benchmarkData.totalCompanies
        }
      };
    } catch (error: any) {
      console.error("Critical Scan Engine Error:", error);
      throw error;
    }
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
    const fullInput = {
      ...input,
      serviceCategories: ["General Service"],
      competitors: ["Industry Leader A", "Industry Leader B"],
    };

    let report: GenerateCompanyAIScanReportOutput;
    try {
      report = await generateCompanyAIScanReport(fullInput);
    } catch (e) {
      console.warn("Free scan AI error, using deterministic fallback.");
      report = this.generateDeterministicReport(fullInput, null, null);
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
      companyName: input.companyName,
      industry: input.industry,
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

  private static generateDeterministicReport(input: any, websiteSignals: any, entitySignal: any): GenerateCompanyAIScanReportOutput {
    const baseScore = entitySignal?.authorityWeight || 65;
    return {
      overview: `${input.companyName} demonstrates a standard visibility footprint within the ${input.industry} sector. While technical signals are present, there is a clear opportunity to optimize discovery vectors for ${input.targetGeography} markets.`,
      overallScore: baseScore,
      categoryScores: {
        presence: baseScore + 5,
        descriptionAccuracy: 82,
        citationStrength: 68,
        serviceCoverage: 74,
        competitorShareOfVoice: 42,
      },
      competitorComparison: (input.competitors || ["Competitor X", "Competitor Y"]).map((name: string) => ({
        name,
        overallScore: baseScore + (Math.random() * 10 - 5),
        presence: baseScore + (Math.random() * 10 - 5),
        descriptionAccuracy: 80,
      })),
      aiDescriptionAccuracy: {
        generatedDescription: `${input.companyName} is a provider of ${input.industry} services, focusing on ${input.targetGeography}.`,
        actualProfileDescription: `A specialized firm in ${input.industry} serving ${input.targetGeography}.`,
        matchScore: 85,
        discrepancies: ["Niche capability alignment missing"],
      },
      knowledgeGaps: [
        { type: "structured_data", description: "Incomplete JSON-LD markup", impact: "Reduced authority", suggestedImprovement: "Implement Organization schema" }
      ],
      missedDiscoveryOpportunities: [
        { query: `Best ${input.industry} solutions in ${input.targetGeography}`, reason: "Low citation density", suggestedAction: "Build authoritative backlinks" }
      ],
      priorityActions: [
        { category: "structured_entity_data", action: "Deploy Entity Schema", impact: "Increase visibility", priority: "high" }
      ]
    } as any;
  }
}
