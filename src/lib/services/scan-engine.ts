import { generateCompanyAIScanReport, GenerateCompanyAIScanReportInput, GenerateCompanyAIScanReportOutput } from "@/ai/flows/generate-company-ai-scan-report";
import { provideAiScanRecommendations, ProvideAiScanRecommendationsOutput } from "@/ai/flows/provide-ai-scan-recommendations";
import { QueryEngine } from "./query-engine";
import { QueryDiscoveryData } from "../types";

/**
 * ScanEngine orchestrates the AI visibility analysis process.
 * In v0.1, it uses deterministic mock data generators.
 * Future versions will plug in real LLM provider adapters.
 */
export class ScanEngine {
  /**
   * Run a full scan for a company profile.
   */
  static async runScan(input: GenerateCompanyAIScanReportInput): Promise<GenerateCompanyAIScanReportOutput & { queryDiscovery: QueryDiscoveryData }> {
    // In v0.1, we call our AI flow directly which generates realistic mock data.
    const report = await generateCompanyAIScanReport(input);
    
    // New Query Discovery simulation
    const queryDiscovery = await QueryEngine.simulateDiscovery(
      input.companyName,
      input.industry,
      input.targetGeography,
      input.competitors
    );

    return {
      ...report,
      queryDiscovery
    };
  }

  /**
   * Generate strategic recommendations based on scan scores.
   */
  static async getRecommendations(report: GenerateCompanyAIScanReportOutput, input: GenerateCompanyAIScanReportInput): Promise<ProvideAiScanRecommendationsOutput> {
    const recommendations = await provideAiScanRecommendations({
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

    return recommendations;
  }
}
