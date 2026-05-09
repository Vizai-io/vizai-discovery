/**
 * @fileOverview OpenAI Provider Adapter.
 * Queries GPT-4o-mini to identify company mentions in AI-generated responses.
 */

import { AIProviderAdapter, DiscoveryContext } from "./provider-interface";
import { CompanyMention, QueryResult } from "@/lib/types";

export class OpenAIAdapter implements AIProviderAdapter {
  id = 'OpenAI' as const;
  name = 'GPT-4o-mini';

  async generateQueries(context: DiscoveryContext): Promise<string[]> {
    return [
      `Best ${context.industry} companies in ${context.geography}`,
      `Top ${context.serviceCategories[0] || context.industry} providers for enterprise`,
      `Who are the leading ${context.industry} companies for ${context.serviceCategories.slice(0, 2).join(' and ') || 'business solutions'}`,
      `Compare ${context.industry} providers in ${context.geography}`,
      `Most reliable ${context.industry} solutions and services`,
    ];
  }

  async executeDiscovery(query: string, context: DiscoveryContext): Promise<QueryResult> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY not configured");
    }

    const systemPrompt = `You are a search engine. Given a user query, identify all relevant companies in the ${context.industry} sector.
For each company, provide:
1. Company name
2. A brief 1-sentence description of their relevance
3. Their rank/position in your recommendation

Also check if "${context.targetCompany}" should be mentioned based on your knowledge.

Respond in JSON format:
{
  "mentions": [{ "companyName": "...", "description": "...", "position": 1 }],
  "isTargetMentioned": true/false
}`;

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: query },
        ],
        response_format: { type: "json_object" },
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error("Empty response from OpenAI");
    }

    const parsed = JSON.parse(content);
    const mentions = this.parseResponse(parsed, context);

    return {
      provider: 'OpenAI',
      mentions,
      isTargetCompanyMentioned: parsed.isTargetMentioned ?? mentions.some(
        (m) => m.companyName.toLowerCase() === context.targetCompany.toLowerCase()
      ),
    };
  }

  parseResponse(rawOutput: any, context: DiscoveryContext): CompanyMention[] {
    if (!rawOutput?.mentions || !Array.isArray(rawOutput.mentions)) {
      return [];
    }

    return rawOutput.mentions.map((mention: any, index: number) => ({
      companyName: mention.companyName || 'Unknown',
      position: mention.position || index + 1,
      description: mention.description || '',
      confidenceScore: mention.companyName?.toLowerCase() === context.targetCompany.toLowerCase() ? 85 : 70,
    }));
  }
}
