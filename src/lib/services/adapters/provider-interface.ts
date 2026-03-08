/**
 * @fileOverview Defines the core interfaces for AI Provider Adapters.
 * This architecture ensures that different LLMs (OpenAI, Anthropic, etc.) 
 * can be plugged into the VizAI engine using a consistent contract.
 */

import { CompanyMention, QueryResult } from "@/lib/types";

export interface DiscoveryContext {
  targetCompany: string;
  industry: string;
  geography: string;
  competitors: string[];
}

export interface AIProviderAdapter {
  /** Unique identifier for the provider (e.g., 'openai', 'anthropic') */
  id: string;
  /** Display name for the provider */
  name: string;
  
  /**
   * Generates specific discovery queries tailored for this provider's strengths.
   */
  generateQueries(context: DiscoveryContext): Promise<string[]>;

  /**
   * Executes a discovery query against the AI model and returns a standardized result.
   */
  executeDiscovery(query: string, context: DiscoveryContext): Promise<QueryResult>;

  /**
   * Normalizes raw LLM output into structured company mentions.
   */
  parseResponse(rawOutput: any, context: DiscoveryContext): CompanyMention[];
}
