'use server';
/**
 * @fileOverview Generates strategic recommendations
 * based on AI scan results. It provides high-impact, client-facing advice grouped by
 * specific intelligence categories.
 *
 * - provideAiScanRecommendations - A function that orchestrates the recommendation generation.
 * - ProvideAiScanRecommendationsInput - The input type for the recommendations.
 * - ProvideAiScanRecommendationsOutput - The return type for the recommendations.
 */

import {generateStructuredOutput} from '@/ai/google-genai';
import {z} from 'zod';

const ProvideAiScanRecommendationsInputSchema = z.object({
  companyName: z.string().describe('The name of the company being scanned.'),
  industry: z.string().describe('The industry the company operates in.'),
  targetGeography: z.string().describe('The target geographical market for the company.'),
  currentScores: z.object({
    visibilityScore: z.number().min(0).max(100).describe('Overall AI visibility score (0-100).'),
    descriptionAccuracyScore: z.number().min(0).max(100).describe('Accuracy of AI descriptions matching the business profile (0-100).'),
    citationStrengthScore: z.number().min(0).max(100).describe('Strength of citations and references in AI responses (0-100).'),
    serviceCoverageScore: z.number().min(0).max(100).describe('Coverage of company services in AI responses (0-100).'),
    competitorShareOfVoiceScore: z.number().min(0).max(100).describe('Company\'s share of voice compared to competitors (0-100).'),
  }).describe('Current AI scan scores for various categories.'),
  identifiedGaps: z.array(z.string()).describe('A list of identified knowledge gaps or missed opportunities.').optional(),
  competitors: z.array(z.string()).describe('A list of main competitors to compare against.').optional(),
});

export type ProvideAiScanRecommendationsInput = z.infer<typeof ProvideAiScanRecommendationsInputSchema>;

const ProvideAiScanRecommendationsOutputSchema = z.object({
  recommendations: z.array(z.object({
    title: z.string().describe('A concise title for the recommendation.'),
    description: z.string().describe('A detailed explanation and action plan.'),
    category: z.enum([
      'Structured Data',
      'Content / Positioning',
      'Entity / Citation Signals',
      'Competitive Visibility'
    ]).describe('The strategy category.'),
    priority: z.enum(['high', 'medium', 'low']).describe('Priority level for implementation.'),
    expectedImpact: z.string().describe('Primary metric gain expected (e.g., Visibility gain, Accuracy gain, Citation strength gain).')
  })).describe('A list of actionable, strategic recommendations.'),
});

export type ProvideAiScanRecommendationsOutput = z.infer<typeof ProvideAiScanRecommendationsOutputSchema>;

export async function provideAiScanRecommendations(input: ProvideAiScanRecommendationsInput): Promise<ProvideAiScanRecommendationsOutput> {
  const validatedInput = ProvideAiScanRecommendationsInputSchema.parse(input);
  return generateStructuredOutput({
    schema: ProvideAiScanRecommendationsOutputSchema,
    prompt: `You are a Senior VizAI Consultant. Provide high-impact, client-facing recommendations that improve a company's visibility in AI search environments.

Scan data:
${JSON.stringify(validatedInput, null, 2)}

Focus recommendations on the WEAKEST score areas first. 

Group recommendations into these categories:
- Structured Data: Technical schema, JSON-LD, and knowledge graph signals.
- Content / Positioning: Capability pages, whitepapers, and service taxonomy clarity.
- Entity / Citation Signals: Authority building, external mentions, and sourcing strength.
- Competitive Visibility: Countering competitor share-of-voice and owning intent vectors.

For each recommendation, provide:
1. A strategic title.
2. A clear, actionable description.
3. Priority (high/medium/low).
4. Expected impact (e.g., 'Visibility gain', 'Accuracy gain', 'Citation strength gain').

Return only a JSON object with a "recommendations" array.`,
  });
}
