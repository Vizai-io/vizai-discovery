
'use server';
/**
 * @fileOverview A Genkit flow to execute a real-world discovery query against an LLM.
 *
 * - executeRealDiscoveryQuery - A function that calls Gemini to identify company mentions.
 * - ExecuteRealDiscoveryQueryInput - The input type for the flow.
 * - ExecuteRealDiscoveryQueryOutput - The return type for the flow.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';

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
  return executeRealDiscoveryQueryFlow(input);
}

const discoveryPrompt = ai.definePrompt({
  name: 'executeRealDiscoveryQueryPrompt',
  input: { schema: ExecuteRealDiscoveryQueryInputSchema },
  output: { schema: ExecuteRealDiscoveryQueryOutputSchema },
  prompt: `Act as a search engine user. Given the search query: "{{{queryText}}}"

Identify all companies mentioned in your internal knowledge base that are relevant to the {{{industry}}} sector.

For each company found:
1. Provide the official name.
2. Provide a brief 1-sentence description of their relevance to the query.
3. If they are ranked, provide their rank.

Also check specifically if the company "{{{targetCompany}}}" is mentioned or should be mentioned based on your knowledge.

Return a structured JSON report.`,
});

const executeRealDiscoveryQueryFlow = ai.defineFlow(
  {
    name: 'executeRealDiscoveryQueryFlow',
    inputSchema: ExecuteRealDiscoveryQueryInputSchema,
    outputSchema: ExecuteRealDiscoveryQueryOutputSchema,
  },
  async (input) => {
    const { output } = await discoveryPrompt(input);
    if (!output) {
      throw new Error('Failed to execute real-world discovery query.');
    }
    return output;
  }
);
