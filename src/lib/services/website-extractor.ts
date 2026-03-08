
'use server';

/**
 * @fileOverview WebsiteIntelligenceExtractor
 * 
 * Extracts SEO and structured data signals from a company's website.
 * This simulates the intelligence that AI systems gather from brand web presences.
 */

import { WebsiteSignal } from "@/lib/types";

export class WebsiteExtractor {
  /**
   * Fetches and analyzes the homepage of a website.
   * Uses server-side fetch to avoid CORS and extract signals.
   */
  static async extractSignals(websiteUrl: string, profileId: string): Promise<WebsiteSignal | null> {
    try {
      const response = await fetch(websiteUrl, {
        headers: { 'User-Agent': 'VizAI-Discovery-Scanner/1.0' },
        next: { revalidate: 3600 }
      });

      if (!response.ok) throw new Error("Could not fetch website");

      const html = await response.text();

      // Simple regex-based extraction for MVP (no DOM needed)
      const title = html.match(/<title>(.*?)<\/title>/i)?.[1] || "No Title Found";
      const metaDescription = html.match(/<meta name="description" content="(.*?)"/i)?.[1] || "";
      const h1Tags = Array.from(html.matchAll(/<h1.*?>(.*?)<\/h1>/gi)).map(m => m[1]);
      const jsonLdDetected = html.includes('application/ld+json');

      // Mocked keyword detection based on typical industry terms
      const serviceKeywords = this.detectKeywords(html, [
        'logistics', 'shipping', 'supply chain', 'warehouse', 'software', 'legal', 'consulting',
        'manufacturing', 'inventory', 'delivery', 'compliance', 'enterprise', 'SaaS'
      ]);

      const locationReferences = this.detectKeywords(html, [
        'North America', 'USA', 'Europe', 'Germany', 'United Kingdom', 'London', 'Global', 'New York'
      ]);

      return {
        id: `sig_${Math.random().toString(36).substr(2, 9)}`,
        profileId,
        title,
        metaDescription,
        h1: h1Tags.slice(0, 3),
        jsonLdDetected,
        serviceKeywords,
        locationReferences,
        extractedAt: new Date().toISOString()
      };
    } catch (error) {
      console.warn(`Extraction failed for ${websiteUrl}:`, error);
      return null;
    }
  }

  private static detectKeywords(text: string, list: string[]): string[] {
    return list.filter(keyword => 
      text.toLowerCase().includes(keyword.toLowerCase())
    );
  }
}
