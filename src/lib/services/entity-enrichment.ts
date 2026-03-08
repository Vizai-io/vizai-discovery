
'use server';

/**
 * @fileOverview Business Entity Enrichment Layer
 * 
 * Orchestrates the enrichment of company profiles using input data, website signals,
 * and deterministic authority weighting.
 */

import { EntitySignal, CompanyProfile, WebsiteSignal } from "@/lib/types";

export class EntityEnrichment {
  /**
   * Generates a deterministic Entity Signal based on available brand data.
   */
  static async enrich(profile: Partial<CompanyProfile>, websiteSignals: WebsiteSignal | null): Promise<EntitySignal> {
    let authorityWeight = 50; // Baseline
    let serviceWeight = 50;
    let geoWeight = 50;
    let confidence = 40;

    // 1. Authority Weighting
    if (profile.foundingYear) {
      const age = new Date().getFullYear() - profile.foundingYear;
      if (age > 50) authorityWeight += 20;
      else if (age > 20) authorityWeight += 10;
      confidence += 10;
    }

    if (profile.employeeSize) {
      const sizes = ['1-10', '11-50', '51-200', '201-500', '501-1000', '1001+'];
      const index = sizes.indexOf(profile.employeeSize);
      if (index >= 4) authorityWeight += 15;
      else if (index >= 2) authorityWeight += 5;
      confidence += 10;
    }

    // 2. Service & Geo Weighting (Input vs Website Signal Correlation)
    if (websiteSignals) {
      confidence += 20;
      
      // If website title contains industry, boost authority
      if (websiteSignals.title.toLowerCase().includes(profile.industry?.toLowerCase() || "")) {
        authorityWeight += 5;
      }

      // If JSON-LD is detected, significantly boost confidence and authority
      if (websiteSignals.jsonLdDetected) {
        authorityWeight += 10;
        confidence += 15;
      }

      // Geography overlap
      const geoOverlap = websiteSignals.locationReferences.some(loc => 
        profile.targetGeography?.toLowerCase().includes(loc.toLowerCase())
      );
      if (geoOverlap) geoWeight += 25;

      // Service overlap
      const serviceOverlap = websiteSignals.serviceKeywords.some(key => 
        profile.serviceCategories?.some(cat => cat.toLowerCase().includes(key.toLowerCase()))
      );
      if (serviceOverlap) serviceWeight += 20;
    }

    return {
      id: `ent_${Math.random().toString(36).substr(2, 9)}`,
      profileId: profile.id || "unknown",
      authorityWeight: Math.min(100, authorityWeight),
      serviceCoverageWeight: Math.min(100, serviceWeight),
      geographicRelevanceWeight: Math.min(100, geoWeight),
      dataConfidence: Math.min(100, confidence),
      enrichedAttributes: {
        foundingYear: profile.foundingYear,
        employeeSize: profile.employeeSize,
        operatingRegions: profile.operatingRegions || [profile.targetGeography || "Global"],
        industriesServed: [profile.industry || "General"],
      },
      extractedAt: new Date().toISOString()
    };
  }
}
