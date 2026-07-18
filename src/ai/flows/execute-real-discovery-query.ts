
'use server';
/**
 * @fileOverview Executes a real-world discovery query against Gemini.
 *
 * - executeRealDiscoveryQuery - A function that calls Gemini to identify company mentions.
 * - ExecuteRealDiscoveryQueryInput - The input type for the flow.
 * - ExecuteRealDiscoveryQueryOutput - The return type for the flow.
 */

import {generateStructuredOutput} from '@/ai/google-genai';
import {z} from 'zod';

const ExecuteRealDiscoveryQueryInputSchema = z.object({
  queryText: z.string().describe('The search query to simulate in an AI model.'),
  targetCompany: z.string().describe('The name of the company to look for in the response.'),
  industry: z.string().describe('The industry vertical of the query.'),
});
export type ExecuteRealDiscoveryQueryInput = z.infer<typeof ExecuteRealDiscoveryQueryInputSchema>;

const ExecuteRealDiscoveryQueryOutputSchema = z.object({
  mentions: z.array(z.object({
    companyName: z.string().describe('Name of the company mentioned.'),
    description: z.string().describe('Brief context or description of why they were mentioned.'),
    position: z.number().optional().describe('Rank or position in the list if applicable.'),
  })).describe('Structured list of companies mentioned by the AI model.'),
  responseExcerpt: z.string().describe('A brief excerpt from the AI model response.'),
  isTargetCompanyMentioned: z.boolean().describe('Whether the target company was identified in the output.'),
});
export type ExecuteRealDiscoveryQueryOutput = z.infer<typeof ExecuteRealDiscoveryQueryOutputSchema>;

export async function executeRealDiscoveryQuery(input: ExecuteRealDiscoveryQueryInput): Promise<ExecuteRealDiscoveryQueryOutput> {
  const validatedInput = ExecuteRealDiscoveryQueryInputSchema.parse(input);
  return generateStructuredOutput({
    schema: ExecuteRealDiscoveryQueryOutputSchema,
    prompt: `Act as a search-engine user and answer the following discovery query.

Input:
${JSON.stringify(validatedInput, null, 2)}

Identify companies that are relevant to the supplied industry and query.

For each company found:
1. Provide the official name.
2. Provide a brief 1-sentence description of their relevance to the query.
3. If they are ranked, provide their rank.

Check specifically whether the target company is mentioned or should be mentioned based on your knowledge.

Return only a JSON object matching this shape:
{
  "mentions": [{"companyName": "string", "description": "string", "position": 1}],
  "responseExcerpt": "string",
  "isTargetCompanyMentioned": true
}`,
  });
}
