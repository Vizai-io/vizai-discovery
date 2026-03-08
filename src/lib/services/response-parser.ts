import { CompanyMention, QueryResult } from "../types";

/**
 * ResponseParser handles the normalization of LLM outputs into structured data.
 * In v0.1, it provides helper methods to structure mock responses.
 */
export class ResponseParser {
  /**
   * Parses raw provider output into a standardized QueryResult format.
   * Currently used to format simulated responses.
   */
  static parseProviderResponse(
    provider: QueryResult['provider'],
    mentions: CompanyMention[],
    targetCompanyName: string
  ): QueryResult {
    const isTargetCompanyMentioned = mentions.some(
      m => m.companyName.toLowerCase() === targetCompanyName.toLowerCase()
    );

    return {
      provider,
      mentions,
      isTargetCompanyMentioned
    };
  }
}
