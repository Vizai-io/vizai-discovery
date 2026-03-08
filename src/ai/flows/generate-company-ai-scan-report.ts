
'use server';
/**
 * @fileOverview A Genkit flow to simulate an AI scan for a company and generate a detailed report.
 *
 * - generateCompanyAIScanReport - A function that initiates the mock AI scan process.
 * - GenerateCompanyAIScanReportInput - The input type for the generateCompanyAIScanReport function.
 * - GenerateCompanyAIScanReportOutput - The return type for the generateCompanyAIScanReport function.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';

const GenerateCompanyAIScanReportInputSchema = z.object({
  companyName: z.string().describe('The name of the company to scan.'),
  website: z.string().url().describe('The official website of the company.'),
  industry: z.string().describe('The industry the company operates in.'),
  serviceCategories: z.array(z.string()).describe('List of services or product categories offered by the company.'),
  targetGeography: z.string().describe('The primary geographic market the company targets.'),
  competitors: z.array(z.string()).describe('A list of competitor company names.'),
  websiteSignals: z.object({
    title: z.string(),
    metaDescription: z.string(),
    h1: z.array(z.string()),
    jsonLdDetected: z.boolean(),
    serviceKeywords: z.array(z.string()),
    locationReferences: z.array(z.string()),
  }).optional().describe('Technical SEO signals extracted from the company website.'),
  entitySignal: z.object({
    authorityWeight: z.number(),
    serviceCoverageWeight: z.number(),
    geographicRelevanceWeight: z.number(),
    dataConfidence: z.number(),
    enrichedAttributes: z.object({
      foundingYear: z.number().optional(),
      employeeSize: z.string().optional(),
      operatingRegions: z.array(z.string()),
      industriesServed: z.array(z.string()),
    }),
  }).optional().describe('Enriched business entity data.'),
});
export type GenerateCompanyAIScanReportInput = z.infer<typeof GenerateCompanyAIScanReportInputSchema>;

const GenerateCompanyAIScanReportOutputSchema = z.object({
  overview: z.string().describe('A general overview summary of the AI scan report findings.'),
  overallScore: z.number().min(0).max(100).describe('Overall AI visibility score from 0-100.'),
  categoryScores: z.object({
    presence: z.number().min(0).max(100).describe('Score for presence in AI responses (0-100).'),
    descriptionAccuracy: z.number().min(0).max(100).describe('Score for how accurately AI descriptions match the company profile (0-100).'),
    citationStrength: z.number().min(0).max(100).describe('Score for the strength and quality of AI citations/references (0-100).'),
    serviceCoverage: z.number().min(0).max(100).describe('Score for how well AI covers the company\u0027s service categories (0-100).'),
    competitorShareOfVoice: z.number().min(0).max(100).describe('Score representing the company\u0027s share of voice compared to competitors in AI responses (0-100).'),
  }).describe('Detailed scores for various AI visibility categories.'),
  competitorComparison: z.array(z.object({
    name: z.string().describe('Competitor name.'),
    overallScore: z.number().min(0).max(100).describe('Simulated overall AI visibility score for the competitor (0-100).'),
    presence: z.number().min(0).max(100).describe('Simulated presence score for the competitor (0-100).'),
    descriptionAccuracy: z.number().min(0).max(100).describe('Simulated description accuracy score for the competitor (0-100).'),
  })).describe('Side-by-side comparison of key scores with competitors.'),
  aiDescriptionAccuracy: z.object({
    generatedDescription: z.string().describe('A simulated AI-generated description of the company.'),
    actualProfileDescription: z.string().describe('The company\u0027s actual descriptive information provided as input.'),
    matchScore: z.number().min(0).max(100).describe('Score indicating how well the AI-generated description matches the actual profile (0-100).'),
    discrepancies: z.array(z.string()).describe('List of key discrepancies or missing details found in AI descriptions.'),
  }).describe('Analysis of AI description accuracy.'),
  knowledgeGaps: z.array(z.object({
    type: z.enum(['structured_data', 'content', 'entity']).describe('Type of knowledge gap (e.g., structured_data, content, entity).'),
    description: z.string().describe('Description of the identified knowledge gap.'),
    impact: z.string().describe('Potential negative impact of this gap on AI discoverability.'),
    suggestedImprovement: z.string().describe('Specific suggestion to address this knowledge gap.'),
  })).describe('Identified gaps in public knowledge or structured data about the company.'),
  missedDiscoveryOpportunities: z.array(z.object({
    query: z.string().describe('An example user query where the company was likely missed by AI.'),
    reason: z.string().describe('The primary reason for missing this discovery opportunity.'),
    suggestedAction: z.string().describe('Actionable step to ensure discovery for similar queries in the future.'),
  })).describe('Specific scenarios where the company was not effectively discovered by AI.'),
  priorityActions: z.array(z.object({
    category: z.enum([
      'service_taxonomy',
      'structured_entity_data',
      'location_coverage',
      'content_capabilities',
      'authoritative_citations',
      'ai_knowledge_layer'
    ]).describe('Category of the recommendation.'),
    action: z.string().describe('Specific, actionable recommendation.'),
    impact: z.string().describe('Expected positive impact of implementing this action.'),
    priority: z.enum(['high', 'medium', 'low']).describe('Priority level for this action.'),
  })).describe('Top recommended actions based on the scan findings to improve AI visibility.'),
});
export type GenerateCompanyAIScanReportOutput = z.infer<typeof GenerateCompanyAIScanReportOutputSchema>;

export async function generateCompanyAIScanReport(input: GenerateCompanyAIScanReportInput): Promise<GenerateCompanyAIScanReportOutput> {
  return generateCompanyAIScanReportFlow(input);
}

const scanReportPrompt = ai.definePrompt({
  name: 'companyAIScanReportPrompt',
  input: { schema: GenerateCompanyAIScanReportInputSchema },
  output: { schema: GenerateCompanyAIScanReportOutputSchema },
  prompt: `You are the VizAI Discovery Scanner, an expert AI visibility analyst. Your task is to generate a detailed, comprehensive AI scan report for a company.

For v0.1, simulate results based on inputs, technical website signals, and enriched entity data.

{{#if websiteSignals}}
TECHNICAL WEBSITE SIGNALS:
- Title: {{{websiteSignals.title}}}
- Meta: {{{websiteSignals.metaDescription}}}
- JSON-LD Found: {{#if websiteSignals.jsonLdDetected}}Yes{{else}}No{{/if}}
- Detected Services: {{#each websiteSignals.serviceKeywords}}{{{this}}}{{#unless @last}}, {{/unless}}{{/each}}
- Detected Geographies: {{#each websiteSignals.locationReferences}}{{{this}}}{{#unless @last}}, {{/unless}}{{/each}}
{{/if}}

{{#if entitySignal}}
ENRICHED ENTITY DATA:
- Authority Weight: {{{entitySignal.authorityWeight}}}
- Service Coverage Weight: {{{entitySignal.serviceCoverageWeight}}}
- Geographic Relevance Weight: {{{entitySignal.geographicRelevanceWeight}}}
- Data Confidence: {{{entitySignal.dataConfidence}}}
- Founding Year: {{{entitySignal.enrichedAttributes.foundingYear}}}
- Size: {{{entitySignal.enrichedAttributes.employeeSize}}}
{{/if}}

Company Details:
Name: {{{companyName}}}
Website: {{{website}}}
Industry: {{{industry}}}
Service Categories: {{#each serviceCategories}}{{{this}}}{{#unless @last}}, {{/unless}}{{/each}}
Target Geography: {{{targetGeography}}}
Competitors: {{#each competitors}}{{{this}}}{{#unless @last}}, {{/unless}}{{/each}}

If entitySignal.authorityWeight is high (> 70), increase 'presence' and 'citationStrength' scores.
If entitySignal.geographicRelevanceWeight is high (> 70), increase 'presence' in target markets.
If dataConfidence is low (< 50), decrease 'descriptionAccuracy' and identify 'entity' knowledge gaps.

Generate a detailed AI scan report in JSON format.`,
});

const generateCompanyAIScanReportFlow = ai.defineFlow(
  {
    name: 'generateCompanyAIScanReportFlow',
    inputSchema: GenerateCompanyAIScanReportInputSchema,
    outputSchema: GenerateCompanyAIScanReportOutputSchema,
  },
  async (input) => {
    const { output } = await scanReportPrompt(input);
    if (!output) {
      throw new Error('Failed to generate mock AI scan report.');
    }
    return output;
  }
);
