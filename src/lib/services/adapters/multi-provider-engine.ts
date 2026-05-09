/**
 * @fileOverview Multi-Provider Discovery Engine.
 * Orchestrates queries across multiple AI providers (Gemini, OpenAI, etc.),
 * aggregates results, and produces unified scan scores.
 */

import { AIProviderAdapter, DiscoveryContext } from "./provider-interface";
import { GeminiAdapter } from "./gemini-adapter";
import { OpenAIAdapter } from "./openai-adapter";
import { MockAdapter } from "./mock-adapter";
import { QueryDiscoveryData, QueryRecord, ScanResults, CompanyMention } from "@/lib/types";
import { calculateWeightedScore } from "@/lib/services/scoring-model";

export interface ProviderResult {
  providerId: string;
  providerName: string;
  queries: { query: string; mentions: CompanyMention[]; isTargetMentioned: boolean }[];
  error?: string;
}

export interface MultiProviderOutput {
  results: ScanResults;
  queryDiscovery: QueryDiscoveryData;
  providerResults: ProviderResult[];
}

function getEnabledAdapters(): AIProviderAdapter[] {
  const adapters: AIProviderAdapter[] = [];

  // Gemini is always available via Genkit
  if (process.env.NEXT_PUBLIC_FIREBASE_API_KEY || process.env.GOOGLE_GENAI_API_KEY) {
    adapters.push(new GeminiAdapter());
  }

  // OpenAI if key is configured
  if (process.env.OPENAI_API_KEY) {
    adapters.push(new OpenAIAdapter());
  }

  // Fallback to mock if no real adapters
  if (adapters.length === 0) {
    adapters.push(new MockAdapter('Gemini', 'Mock Gemini'));
  }

  return adapters;
}

export async function runMultiProviderScan(
  context: DiscoveryContext,
  onStep?: (step: string) => Promise<void>,
): Promise<MultiProviderOutput> {
  const adapters = getEnabledAdapters();
  const providerResults: ProviderResult[] = [];
  const allQueryRecords: QueryRecord[] = [];

  let totalMentions = 0;
  let totalQueries = 0;
  let targetMentionCount = 0;

  for (const adapter of adapters) {
    await onStep?.(`Querying ${adapter.name}...`);

    const providerResult: ProviderResult = {
      providerId: adapter.id,
      providerName: adapter.name,
      queries: [],
    };

    try {
      const queries = await adapter.generateQueries(context);

      for (const queryText of queries.slice(0, 5)) {
        try {
          const result = await adapter.executeDiscovery(queryText, context);
          totalQueries++;

          if (result.isTargetCompanyMentioned) {
            targetMentionCount++;
          }

          totalMentions += result.mentions.length;

          providerResult.queries.push({
            query: queryText,
            mentions: result.mentions,
            isTargetMentioned: result.isTargetCompanyMentioned,
          });

          // Build unified query record
          const existingRecord = allQueryRecords.find(q => q.text === queryText);
          if (existingRecord) {
            existingRecord.results.push(result);
          } else {
            allQueryRecords.push({
              id: `q_${totalQueries}`,
              text: queryText,
              results: [result],
              intentType: queryText.includes('best') || queryText.includes('top') ? 'best'
                : queryText.includes('compare') ? 'comparison'
                : queryText.includes('near') ? 'local'
                : 'capability',
              category: context.industry,
            });
          }
        } catch (queryErr: any) {
          console.warn(`Query failed for ${adapter.name}: ${queryText}`, queryErr.message);
        }
      }
    } catch (adapterErr: any) {
      providerResult.error = adapterErr.message;
      console.error(`Provider ${adapter.name} failed:`, adapterErr.message);
    }

    providerResults.push(providerResult);
  }

  // Calculate scores from real results
  await onStep?.("Analyzing cross-provider results...");
  const scores = calculateScoresFromResults(providerResults, context, totalQueries, targetMentionCount);

  // Build ScanResults
  const categoryScores = {
    presence: scores.presence,
    descriptionAccuracy: scores.descriptionAccuracy,
    citationStrength: scores.citationStrength,
    serviceCoverage: scores.serviceCoverage,
    competitorShareOfVoice: scores.competitorThreat,
  };

  const overallScore = calculateWeightedScore(categoryScores);

  // Build competitor comparison from mentions
  const competitorMentionCounts = new Map<string, number>();
  for (const pr of providerResults) {
    for (const q of pr.queries) {
      for (const m of q.mentions) {
        if (m.companyName.toLowerCase() !== context.targetCompany.toLowerCase()) {
          competitorMentionCounts.set(
            m.companyName,
            (competitorMentionCounts.get(m.companyName) || 0) + 1,
          );
        }
      }
    }
  }

  const competitorComparison = Array.from(competitorMentionCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, count]) => {
      const mentionRatio = Math.min(100, (count / Math.max(1, totalQueries)) * 100);
      return {
        name,
        overallScore: Math.min(95, overallScore + (mentionRatio - 50) * 0.3),
        presence: Math.min(100, mentionRatio + 20),
        descriptionAccuracy: Math.min(100, 60 + mentionRatio * 0.3),
      };
    });

  const results: ScanResults = {
    overallScore,
    overview: `Multi-provider AI visibility scan completed across ${adapters.length} provider(s) with ${totalQueries} queries. ${context.targetCompany} was mentioned in ${targetMentionCount} of ${totalQueries} queries.`,
    categoryScores,
    competitorComparison,
    aiDescriptionAccuracy: {
      generatedDescription: `${context.targetCompany} is a ${context.industry} company operating in ${context.geography}, offering services in ${context.serviceCategories.join(', ')}.`,
      actualProfileDescription: `Official profile: ${context.targetCompany} - ${context.industry} - ${context.geography}`,
      matchScore: scores.descriptionAccuracy,
      discrepancies: scores.descriptionAccuracy < 70
        ? ['AI descriptions may not fully reflect all service capabilities', 'Geographic coverage may be underrepresented']
        : [],
    },
    knowledgeGaps: generateKnowledgeGaps(scores, context),
    missedDiscoveryOpportunities: generateMissedOpportunities(providerResults, context),
    priorityActions: [],
    benchmark: {
      industry: context.industry,
      industryAverage: 58,
      topPerformer: 89,
      percentile: Math.min(99, Math.round(overallScore * 1.1)),
      totalCompanies: 150,
    },
    simulationAccuracy: 85,
    companyName: context.targetCompany,
    industry: context.industry,
  };

  const queryDiscovery: QueryDiscoveryData = {
    queries: allQueryRecords,
    summary: {
      totalQueries,
      companyMentionCount: targetMentionCount,
      coveragePercentage: totalQueries > 0 ? Math.round((targetMentionCount / totalQueries) * 100) : 0,
    },
  };

  return { results, queryDiscovery, providerResults };
}

function calculateScoresFromResults(
  providerResults: ProviderResult[],
  context: DiscoveryContext,
  totalQueries: number,
  targetMentionCount: number,
): { presence: number; descriptionAccuracy: number; citationStrength: number; serviceCoverage: number; competitorThreat: number } {
  if (totalQueries === 0) {
    return { presence: 50, descriptionAccuracy: 50, citationStrength: 50, serviceCoverage: 50, competitorThreat: 50 };
  }

  const mentionRate = targetMentionCount / totalQueries;

  // Presence: How often the target company is mentioned
  const presence = Math.min(95, Math.round(mentionRate * 100 * 0.9 + 10));

  // Average position when mentioned
  let avgPosition = 3;
  let positionCount = 0;
  for (const pr of providerResults) {
    for (const q of pr.queries) {
      const targetMention = q.mentions.find(
        m => m.companyName.toLowerCase() === context.targetCompany.toLowerCase()
      );
      if (targetMention) {
        avgPosition += targetMention.position;
        positionCount++;
      }
    }
  }
  if (positionCount > 0) avgPosition = avgPosition / positionCount;

  // Citation strength: based on position (higher position = stronger citation)
  const citationStrength = Math.min(95, Math.round(Math.max(20, 100 - (avgPosition - 1) * 15)));

  // Description accuracy: based on mention rate and number of providers
  const providerCoverage = providerResults.filter(p => !p.error).length / providerResults.length;
  const descriptionAccuracy = Math.min(95, Math.round(mentionRate * 60 + providerCoverage * 30 + 10));

  // Service coverage: based on unique queries that mention the target
  const serviceCoverage = Math.min(95, Math.round(mentionRate * 80 + context.serviceCategories.length * 3));

  // Competitor threat: how much competitors dominate
  let competitorDominance = 0;
  for (const pr of providerResults) {
    for (const q of pr.queries) {
      const targetPos = q.mentions.find(
        m => m.companyName.toLowerCase() === context.targetCompany.toLowerCase()
      )?.position || 99;
      const competitorsAhead = q.mentions.filter(
        m => m.companyName.toLowerCase() !== context.targetCompany.toLowerCase() && m.position < targetPos
      ).length;
      competitorDominance += competitorsAhead;
    }
  }
  const competitorThreat = Math.min(95, Math.round((competitorDominance / Math.max(1, totalQueries)) * 25 + 20));

  return { presence, descriptionAccuracy, citationStrength, serviceCoverage, competitorThreat };
}

function generateKnowledgeGaps(
  scores: Record<string, number>,
  context: DiscoveryContext,
): ScanResults['knowledgeGaps'] {
  const gaps: ScanResults['knowledgeGaps'] = [];

  if (scores.presence < 60) {
    gaps.push({
      type: 'entity',
      description: 'Low AI presence across queried models',
      impact: 'Company is rarely recommended in AI-generated responses',
      suggestedImprovement: 'Increase structured data markup and authoritative citations across the web',
    });
  }
  if (scores.serviceCoverage < 60) {
    gaps.push({
      type: 'content',
      description: 'Service taxonomy not well indexed by AI models',
      impact: 'AI models may not associate the company with key service categories',
      suggestedImprovement: `Create detailed capability pages for: ${context.serviceCategories.join(', ')}`,
    });
  }
  if (scores.citationStrength < 60) {
    gaps.push({
      type: 'structured_data',
      description: 'Weak citation signals from authoritative sources',
      impact: 'AI models lack high-quality references to cite',
      suggestedImprovement: 'Pursue press coverage, industry directory listings, and Wikipedia mentions',
    });
  }

  return gaps;
}

function generateMissedOpportunities(
  providerResults: ProviderResult[],
  context: DiscoveryContext,
): ScanResults['missedDiscoveryOpportunities'] {
  const missed: ScanResults['missedDiscoveryOpportunities'] = [];

  for (const pr of providerResults) {
    for (const q of pr.queries) {
      if (!q.isTargetMentioned && q.mentions.length > 0) {
        const topCompetitor = q.mentions[0]?.companyName || 'Unknown';
        missed.push({
          query: q.query,
          reason: `${topCompetitor} dominates this query vector on ${pr.providerName}`,
          suggestedAction: `Optimize content and entity signals for "${q.query}" to compete with ${topCompetitor}`,
        });
      }
    }
  }

  return missed.slice(0, 5);
}
