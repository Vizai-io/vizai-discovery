/**
 * @fileOverview Deterministic ScanEngine for stable audit generation.
 * Results remain repeatable, but now vary by scan input instead of returning a single global mock.
 */

import { QueryDiscoveryData, ScanInput, ScanResults } from "../types";
import { calculateWeightedScore } from "./scoring-model";

type ScanOutput = ScanResults & { queryDiscovery: QueryDiscoveryData };

const FALLBACK_COMPETITORS: Record<string, string[]> = {
  logistics: ["FedEx", "DHL", "UPS", "Maersk"],
  warehousing: ["Prologis", "Lineage Logistics", "Americold", "STG Logistics"],
  manufacturing: ["Bosch", "Magna International", "Denso", "Continental"],
  legal: ["Clifford Chance", "DLA Piper", "Linklaters", "Freshfields"],
  consulting: ["McKinsey", "BCG", "Bain & Company", "Accenture"],
  software: ["Salesforce", "HubSpot", "SAP", "Oracle"],
};

export class ScanEngine {
  /**
   * Run a full scan using a deterministic input-shaped path.
   */
  static async runScan(input: ScanInput, _profileId: string = "demo_id", _scanId?: string): Promise<ScanOutput> {
    console.log("Initiating Deterministic Scan for:", input.companyName);
    await new Promise(resolve => setTimeout(resolve, 800));
    return this.generateDeterministicData(input);
  }

  /**
   * Run a free scan using the deterministic path.
   */
  static async runFreeScan(input: ScanInput): Promise<ScanOutput> {
    console.log("Initiating Deterministic Free Scan for:", input.companyName);
    await new Promise(resolve => setTimeout(resolve, 800));
    return this.generateDeterministicData(input);
  }

  private static generateDeterministicData(input: ScanInput): ScanOutput {
    const normalized = this.normalizeInput(input);
    const seed = this.hashString([
      normalized.companyName,
      normalized.industry,
      normalized.targetGeography,
      normalized.serviceCategories.join("|"),
      normalized.competitors.join("|"),
    ].join("::"));

    const categoryScores = {
      presence: this.computeScore(seed, 0, 42, 78, normalized),
      descriptionAccuracy: this.computeScore(seed, 1, 48, 82, normalized),
      citationStrength: this.computeScore(seed, 2, 35, 74, normalized),
      serviceCoverage: this.computeScore(seed, 3, 44, 85, normalized),
      competitorShareOfVoice: this.computeThreatScore(seed, normalized),
    };

    const overallScore = Number(calculateWeightedScore(categoryScores).toFixed(1));
    const benchmark = this.buildBenchmark(seed, normalized.industry, overallScore);
    const competitorComparison = this.buildCompetitorComparison(seed, normalized, overallScore);
    const queryDiscovery = this.buildQueryDiscovery(seed, normalized, competitorComparison);

    const results: ScanResults = {
      overallScore,
      overview: `Strategic audit for ${normalized.companyName} indicates an AI Visibility Score of ${overallScore}. ${normalized.companyName} shows the strongest traction in ${normalized.industry} discovery patterns tied to ${normalized.targetGeography}, with the biggest upside coming from stronger citations and clearer service proof points.`,
      categoryScores,
      competitorComparison,
      aiDescriptionAccuracy: {
        generatedDescription: `${normalized.companyName} appears in AI summaries as a ${normalized.industry} provider focused on ${normalized.targetGeography}, with emphasis on ${this.joinForSentence(normalized.serviceCategories)}.`,
        actualProfileDescription: `Official positioning suggests ${normalized.companyName} serves ${normalized.targetGeography} through ${this.joinForSentence(normalized.serviceCategories)} offerings.`,
        matchScore: this.computeScore(seed, 4, 56, 88, normalized),
        discrepancies: this.buildDiscrepancies(seed, normalized),
      },
      knowledgeGaps: [
        {
          type: "structured_data",
          description: input.googleBusinessProfileUrl ? "Local entity signals exist but structured business markup remains thin." : "Business entity markup is incomplete across key discovery surfaces.",
          impact: "High",
          suggestedImprovement: "Add organization/service schema, location entities, and offer-level markup.",
        },
        {
          type: "content",
          description: `Service proof for ${this.pickOne(normalized.serviceCategories, seed + 31)} is underrepresented in crawlable pages.`,
          impact: "Medium",
          suggestedImprovement: "Publish capability pages with clear outcomes, proof, and market qualifiers.",
        },
        {
          type: "entity",
          description: `${normalized.industry} authority mentions lag the benchmark cohort.`,
          impact: normalized.competitors.length > 3 ? "High" : "Medium",
          suggestedImprovement: "Strengthen third-party citations, analyst references, and directory consistency.",
        },
      ],
      missedDiscoveryOpportunities: [
        {
          query: `Best ${normalized.industry} providers in ${normalized.targetGeography}`,
          reason: `Competitors currently dominate broad commercial-intent phrasing in ${normalized.targetGeography}.`,
          suggestedAction: "Create comparison-ready landing pages and proof-oriented category summaries.",
        },
        {
          query: `${this.pickOne(normalized.serviceCategories, seed + 13)} experts for enterprise`,
          reason: "AI summaries do not consistently connect the brand to its strongest capability cluster.",
          suggestedAction: "Tighten service taxonomy and reinforce capability pages with entity-rich copy.",
        },
      ],
      priorityActions: [
        {
          title: "Upgrade Structured Entity Signals",
          description: `Expand schema coverage for ${normalized.companyName} and map services to ${normalized.targetGeography} intent pages.`,
          category: "Structured Data",
          priority: "high",
          expectedImpact: "Improves indexing confidence and brand/entity matching.",
          packageType: "Foundation",
        },
        {
          title: "Clarify Core Service Positioning",
          description: `Build or refresh pages around ${this.pickOne(normalized.serviceCategories, seed + 7)} and adjacent capabilities to reduce AI summary drift.`,
          category: "Content / Positioning",
          priority: "medium",
          expectedImpact: "Improves description accuracy and service coverage.",
          packageType: "Growth",
        },
        {
          title: "Earn Defensible Citations",
          description: `Increase mention quality on industry-relevant third-party sources where ${this.pickOne(normalized.competitors, seed + 19)} currently has an edge.`,
          category: "Entity / Citation Signals",
          priority: "high",
          expectedImpact: "Improves citation strength and reduces competitor displacement.",
          packageType: "Foundation",
        },
      ],
      benchmark,
      simulationAccuracy: this.computeScore(seed, 5, 68, 91, normalized),
      companyName: normalized.companyName,
      industry: normalized.industry,
    };

    return { ...results, queryDiscovery };
  }

  private static normalizeInput(input: ScanInput): Required<Pick<ScanInput, "companyName" | "website" | "industry" | "targetGeography">> & Pick<ScanInput, "serviceCategories" | "competitors"> & {
    serviceCategories: string[];
    competitors: string[];
  } {
    const companyName = input.companyName?.trim() || "Acme Logistics";
    const industry = input.industry?.trim() || "logistics";
    const targetGeography = input.targetGeography?.trim() || "Global";
    const website = input.website?.trim() || "https://example.com";
    const industryKey = this.normalizeIndustryKey(industry);

    const serviceCategories = input.serviceCategories?.filter(Boolean).map(value => value.trim()).filter(Boolean) || [
      `${industry} strategy`,
      `${targetGeography} delivery`,
      "Customer support",
    ];

    const competitors = input.competitors?.filter(Boolean).map(value => value.trim()).filter(Boolean) || FALLBACK_COMPETITORS[industryKey] || FALLBACK_COMPETITORS.logistics;

    return {
      companyName,
      website,
      industry,
      targetGeography,
      serviceCategories,
      competitors: competitors.filter(name => name.toLowerCase() !== companyName.toLowerCase()).slice(0, 4),
    };
  }

  private static normalizeIndustryKey(industry: string): string {
    const normalized = industry.toLowerCase();
    if (normalized.includes("warehouse")) return "warehousing";
    if (normalized.includes("manufact")) return "manufacturing";
    if (normalized.includes("legal") || normalized.includes("law")) return "legal";
    if (normalized.includes("consult")) return "consulting";
    if (normalized.includes("software") || normalized.includes("saas") || normalized.includes("tech")) return "software";
    if (normalized.includes("logistics") || normalized.includes("3pl") || normalized.includes("supply chain")) return "logistics";
    return "logistics";
  }

  private static computeScore(
    seed: number,
    offset: number,
    min: number,
    max: number,
    input: { serviceCategories: string[]; competitors: string[]; website: string }
  ): number {
    const range = max - min;
    const entropy = this.seededValue(seed + offset) * range;
    const serviceBoost = Math.min(8, input.serviceCategories.length * 1.7);
    const competitorPenalty = Math.min(6, input.competitors.length * 1.2);
    const websiteBoost = input.website.startsWith("https://") ? 3 : 0;
    return Number(this.clamp(min + entropy + serviceBoost + websiteBoost - competitorPenalty, min, 92).toFixed(1));
  }

  private static computeThreatScore(seed: number, input: { competitors: string[]; serviceCategories: string[] }): number {
    const baseThreat = 28 + this.seededValue(seed + 101) * 42;
    const competitorPressure = input.competitors.length * 5.5;
    const serviceRelief = Math.min(10, input.serviceCategories.length * 1.8);
    return Number(this.clamp(baseThreat + competitorPressure - serviceRelief, 18, 86).toFixed(1));
  }

  private static buildBenchmark(seed: number, industry: string, overallScore: number) {
    const industryAverage = Number(this.clamp(overallScore - 6 + this.seededValue(seed + 211) * 8, 42, 79).toFixed(1));
    const topPerformer = Number(this.clamp(industryAverage + 18 + this.seededValue(seed + 223) * 10, 72, 96).toFixed(1));
    const percentile = Math.round(this.clamp(50 + (overallScore - industryAverage) * 3.2, 12, 96));
    return {
      industry,
      industryAverage,
      topPerformer,
      percentile,
      totalCompanies: 180 + (seed % 620),
    };
  }

  private static buildCompetitorComparison(seed: number, input: { competitors: string[] }, overallScore: number) {
    return input.competitors.slice(0, 3).map((name, index) => {
      const delta = 4 + this.seededValue(seed + index + 301) * 16;
      return {
        name,
        overallScore: Number(this.clamp(overallScore + delta, 52, 96).toFixed(1)),
        presence: Number(this.clamp(overallScore + 8 + this.seededValue(seed + index + 311) * 14, 48, 97).toFixed(1)),
        descriptionAccuracy: Number(this.clamp(overallScore + 3 + this.seededValue(seed + index + 321) * 12, 50, 95).toFixed(1)),
      };
    });
  }

  private static buildQueryDiscovery(
    seed: number,
    input: { companyName: string; industry: string; targetGeography: string; serviceCategories: string[]; competitors: string[] },
    competitorComparison: { name: string }[]
  ): QueryDiscoveryData {
    const queries = [
      {
        id: "q1",
        text: `Best ${input.industry} companies in ${input.targetGeography}`,
        intentType: "best" as const,
        category: "Service Provider",
        results: [
          {
            provider: "Gemini" as const,
            isTargetCompanyMentioned: this.seededValue(seed + 401) > 0.45,
            mentions: this.buildMentions(seed + 411, input.companyName, competitorComparison.map(item => item.name), true),
          },
        ],
      },
      {
        id: "q2",
        text: `${this.pickOne(input.serviceCategories, seed + 421)} providers for enterprise`,
        intentType: "capability" as const,
        category: "Capability",
        results: [
          {
            provider: "Gemini" as const,
            isTargetCompanyMentioned: this.seededValue(seed + 431) > 0.25,
            mentions: this.buildMentions(seed + 441, input.companyName, input.competitors, false),
          },
        ],
      },
    ];

    const companyMentionCount = queries.filter((query) => query.results.some((result) => result.isTargetCompanyMentioned)).length;
    return {
      queries,
      summary: {
        totalQueries: queries.length,
        companyMentionCount,
        coveragePercentage: Number(((companyMentionCount / queries.length) * 100).toFixed(1)),
      },
    };
  }

  private static buildMentions(seed: number, companyName: string, competitors: string[], broadIntent: boolean) {
    const includeTarget = this.seededValue(seed) > (broadIntent ? 0.48 : 0.2);
    const pool = competitors.slice(0, 3);
    const orderedPool = [...pool].sort((left, right) => this.hashString(`${left}:${seed}`) - this.hashString(`${right}:${seed}`));
    const mentions = orderedPool.slice(0, 2).map((name, index) => ({
      companyName: name,
      position: index + 1,
      description: `${name} is frequently associated with ${broadIntent ? "broad market leadership" : "specialized capability strength"} in this category.`,
      confidenceScore: Math.round(this.clamp(76 + this.seededValue(seed + index + 1) * 18, 76, 96)),
    }));

    if (includeTarget) {
      mentions.splice(Math.min(mentions.length, broadIntent ? 2 : 1), 0, {
        companyName,
        position: broadIntent ? 3 : 2,
        description: `${companyName} appears as a credible option for ${broadIntent ? "broad discovery" : "capability-led"} queries but lacks consistent top-slot reinforcement.`,
        confidenceScore: Math.round(this.clamp(74 + this.seededValue(seed + 9) * 16, 74, 94)),
      });
    }

    return mentions.map((mention, index) => ({ ...mention, position: index + 1 }));
  }

  private static buildDiscrepancies(seed: number, input: { serviceCategories: string[]; targetGeography: string; industry: string }) {
    const options = [
      `AI summaries underplay ${this.pickOne(input.serviceCategories, seed + 501)} specialization.`,
      `Geographic emphasis is inconsistent for ${input.targetGeography}.`,
      `${input.industry} positioning appears broader than the actual service mix.`,
      "Third-party citations reference competitors more confidently than the brand.",
    ];

    return options
      .sort((left, right) => this.hashString(`${left}:${seed}`) - this.hashString(`${right}:${seed}`))
      .slice(0, 3);
  }

  private static joinForSentence(values: string[]): string {
    if (values.length === 1) return values[0];
    if (values.length === 2) return `${values[0]} and ${values[1]}`;
    return `${values.slice(0, -1).join(", ")}, and ${values[values.length - 1]}`;
  }

  private static pickOne(values: string[], seed: number): string {
    return values[Math.abs(seed) % values.length];
  }

  private static seededValue(seed: number): number {
    return (Math.abs(Math.sin(seed)) * 10000) % 1;
  }

  private static hashString(value: string): number {
    let hash = 0;
    for (let index = 0; index < value.length; index++) {
      hash = ((hash << 5) - hash) + value.charCodeAt(index);
      hash |= 0;
    }
    return Math.abs(hash);
  }

  private static clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  }
}
