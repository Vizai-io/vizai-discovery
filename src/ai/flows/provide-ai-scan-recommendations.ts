'use server';
/**
 * @fileOverview This file defines a Genkit flow for generating actionable recommendations
 * based on AI scan results for a company. It acts as a VizAI Consultant,
 * providing strategic advice to improve AI discoverability and address knowledge gaps.
 *
 * - provideAiScanRecommendations - A function that orchestrates the recommendation generation.
 * - ProvideAiScanRecommendationsInput - The input type for the recommendations.
 * - ProvideAiScanRecommendationsOutput - The return type for the recommendations.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';

const ProvideAiScanRecommendationsInputSchema = z.object({
  companyName: z.string().describe('The name of the company being scanned.'),
  industry: z.string().describe('The industry the company operates in.'),
  targetGeography: z.string().describe('The target geographical market for the company.'),
  currentScores: z.object({
    visibilityScore: z.number().min(0).max(100).describe('Overall AI visibility score (0-100).'),
    descriptionAccuracyScore: z.number().min(0).max(100).describe('Accuracy of AI descriptions matching the business profile (0-100).'),
    citationStrengthScore: z.number().min(0).max(100).describe('Strength of citations and references in AI responses (0-100).'),
    serviceCoverageScore: z.number().min(0).max(100).describe('Coverage of company services in AI responses (0-100).'),
    competitorShareOfVoiceScore: z.number().min(0).max(100).describe('Company\u0027s share of voice compared to competitors in AI responses (0-100).'),
  }).describe('Current AI scan scores for various categories.'),
  identifiedGaps: z.array(z.string()).describe('A list of identified knowledge gaps or missed opportunities from the scan.').optional(),
  competitors: z.array(z.string()).describe('A list of main competitors to compare against.').optional(),
});

export type ProvideAiScanRecommendationsInput = z.infer<typeof ProvideAiScanRecommendationsInputSchema>;

const ProvideAiScanRecommendationsOutputSchema = z.object({
  recommendations: z.array(z.object({
    title: z.string().describe('A concise title for the recommendation.'),
    description: z.string().describe('A detailed explanation and action plan for the recommendation.'),
    category: z.enum([
      'Service Taxonomy',
      'Structured Data',
      'Location Coverage',
      'Content Strategy',
      'Authoritative Citations',
      'AI-Ready Knowledge Layer',
      'Competitor Analysis',
      'General Improvement'
    ]).describe('The category this recommendation falls under.')
  })).describe('A list of actionable recommendations to improve AI discoverability.'),
});

export type ProvideAiScanRecommendationsOutput = z.infer<typeof ProvideAiScanRecommendationsOutputSchema>;

export async function provideAiScanRecommendations(input: ProvideAiScanRecommendationsInput): Promise<ProvideAiScanRecommendationsOutput> {
  return provideAiScanRecommendationsFlow(input);
}

const recommendationsPrompt = ai.definePrompt({
  name: 'recommendationsPrompt',
  input: { schema: ProvideAiScanRecommendationsInputSchema },
  output: { schema: ProvideAiScanRecommendationsOutputSchema },
  prompt: `You are an expert VizAI Consultant, specializing in improving a company's AI discoverability and presence in LLM and AI answer environments. Your task is to analyze the provided AI scan results and generate actionable, tailored recommendations for the company.

Here are the details for the company:
Company Name: {{{companyName}}}
Industry: {{{industry}}}
Target Geography: {{{targetGeography}}}

AI Scan Scores (0-100, higher is better):
- AI Visibility Score: {{{currentScores.visibilityScore}}}
- Description Accuracy Score: {{{currentScores.descriptionAccuracyScore}}}
- Citation Strength Score: {{{currentScores.citationStrengthScore}}}
- Service Coverage Score: {{{currentScores.serviceCoverageScore}}}
- Competitor Share of Voice Score: {{{currentScores.competitorShareOfVoiceScore}}}

{{#if identifiedGaps}}
Identified Gaps and Missed Opportunities:
{{#each identifiedGaps}}- {{{this}}}
{{/each}}
{{/if}}

{{#if competitors}}
Competitors: {{#each competitors}}{{{this}}}{{#unless @last}}, {{/unless}}{{/each}}
{{/if}}

Based on these results, provide a list of concrete, strategic recommendations to help '{{{companyName}}}' enhance its AI discoverability and address any weaknesses. Focus on the most impactful actions.

Consider recommendations from the following categories:
- Add clearer service taxonomy: Ensure AI can easily understand and categorize offerings.
- Improve structured business entity data: Enhance data like company name, address, phone, business hours, etc., in machine-readable formats.
- Expand location coverage data: Optimize location-specific information for AI queries.
- Publish clearer capabilities content: Make core competencies and unique selling points explicit.
- Strengthen authoritative citations: Build more credible links and references to support claims.
- Build an AI-ready knowledge layer: Create dedicated content for AI consumption (e.g., FAQs, knowledge bases).
- Competitor Analysis: Recommend actions based on competitor performance.
- General Improvement: Broader advice for overall AI presence.

Format your output as a JSON array of recommendations, where each recommendation has a 'title' (string), a 'description' (string) detailing the action, and a 'category' (enum) from the list above. Ensure the descriptions are clear, actionable, and specific to the identified scores and gaps.
`,
});

const provideAiScanRecommendationsFlow = ai.defineFlow(
  {
    name: 'provideAiScanRecommendationsFlow',
    inputSchema: ProvideAiScanRecommendationsInputSchema,
    outputSchema: ProvideAiScanRecommendationsOutputSchema,
  },
  async (input) => {
    const { output } = await recommendationsPrompt(input);
    if (!output) {
      throw new Error('Failed to generate recommendations.');
    }
    return output;
  },
);
