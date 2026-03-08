
/**
 * @fileOverview BenchmarkService manages industry-specific performance averages and ranges.
 * This ensures that individual scan scores can be contextually benchmarked against sector leaders.
 */

import { IndustryBenchmark } from "../types";

const BENCHMARKS: Record<string, IndustryBenchmark> = {
  logistics: { industry: "Third Party Logistics (3PL)", averageScore: 54.2, topScore: 87.5, minScore: 22.1, totalCompanies: 450 },
  warehousing: { industry: "Industrial Warehousing", averageScore: 48.6, topScore: 82.1, minScore: 18.4, totalCompanies: 320 },
  manufacturing: { industry: "Automotive Manufacturing", averageScore: 61.4, topScore: 92.3, minScore: 34.2, totalCompanies: 280 },
  legal: { industry: "Corporate Legal Services", averageScore: 58.1, topScore: 89.4, minScore: 28.7, totalCompanies: 520 },
  consulting: { industry: "Management Consulting", averageScore: 65.2, topScore: 94.8, minScore: 42.1, totalCompanies: 390 },
  software: { industry: "Enterprise SaaS", averageScore: 72.1, topScore: 98.2, minScore: 45.6, totalCompanies: 840 },
};

export class BenchmarkService {
  /**
   * Retrieves the deterministic benchmark profile for a given industry.
   */
  static getBenchmarkForIndustry(industry: string): IndustryBenchmark {
    const key = industry.toLowerCase();
    if (key.includes('3pl') || key.includes('logistics')) return BENCHMARKS.logistics;
    if (key.includes('warehousing')) return BENCHMARKS.warehousing;
    if (key.includes('manufacturing')) return BENCHMARKS.manufacturing;
    if (key.includes('legal')) return BENCHMARKS.legal;
    if (key.includes('consulting')) return BENCHMARKS.consulting;
    if (key.includes('software') || key.includes('saas')) return BENCHMARKS.software;
    
    // Fallback to closest match or default
    return BENCHMARKS.logistics;
  }

  /**
   * Calculates a percentile position based on a score and industry benchmark distribution.
   */
  static calculatePercentile(score: number, benchmark: IndustryBenchmark): number {
    if (score >= benchmark.topScore) return 99;
    if (score <= benchmark.minScore) return 1;
    
    // Linear interpolation between min and top for mock percentile realism
    const range = benchmark.topScore - benchmark.minScore;
    const relativePos = score - benchmark.minScore;
    return Math.floor((relativePos / range) * 100);
  }
}
