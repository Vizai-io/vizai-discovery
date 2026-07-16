
'use server';
/**
 * @fileOverview Generates an AI visibility scan report for a company.
 *
 * - generateCompanyAIScanReport - A function that initiates the mock AI scan process.
 * - GenerateCompanyAIScanReportInput - The input type for the generateCompanyAIScanReport function.
 * - GenerateCompanyAIScanReportOutput - The return type for the generateCompanyAIScanReport function.
 */

import {generateStructuredOutput} from '@/ai/google-genai';
import {z} from 'zod';

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
  const validatedInput = GenerateCompanyAIScanReportInputSchema.parse(input);
  return generateStructuredOutput({
    schema: GenerateCompanyAIScanReportOutputSchema,
    prompt: `You are the VizAI Discovery Scanner, an expert AI visibility analyst. Generate a detailed AI scan report for a company.

For this version, infer results from the supplied company details, technical website signals, and enriched entity data:
${JSON.stringify(validatedInput, null, 2)}

Apply these scoring rules when entitySignal exists:
- If authorityWeight is above 70, increase presence and citationStrength.
- If geographicRelevanceWeight is above 70, increase presence in target markets.
- If dataConfidence is below 50, decrease descriptionAccuracy and identify entity knowledge gaps.

Return only the complete JSON report. Keep every numeric score between 0 and 100.`,
  });
}
