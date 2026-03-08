
'use server';

/**
 * @fileOverview Local Presence Enrichment Layer
 * 
 * Analyzes professional and local business signals (GBP, LinkedIn, Directories)
 * to boost authority and citation strength in the AI visibility model.
 */

import { PresenceSignal, CompanyProfile } from "@/lib/types";

export class PresenceEnrichment {
  /**
   * Generates a deterministic Presence Signal based on provided external profiles.
   */
  static async analyzePresence(profile: Partial<CompanyProfile>): Promise<PresenceSignal> {
    let citationWeight = 30; // Baseline
    let authorityBoost = 0;
    
    const hasGoogleBusiness = !!profile.googleBusinessProfileUrl;
    const hasLinkedIn = !!profile.linkedInPageUrl;
    const directoryCount = profile.directoryListings?.length || 0;

    // 1. Local Signal (GBP)
    if (hasGoogleBusiness) {
      citationWeight += 25;
      authorityBoost += 10;
    }

    // 2. Professional Signal (LinkedIn)
    if (hasLinkedIn) {
      citationWeight += 15;
      authorityBoost += 15;
    }

    // 3. Directory Authority
    if (directoryCount > 0) {
      const dirBonus = Math.min(30, directoryCount * 10);
      citationWeight += dirBonus;
      authorityBoost += (directoryCount * 2);
    }

    return {
      id: `pres_${Math.random().toString(36).substr(2, 9)}`,
      profileId: profile.id || "unknown",
      hasGoogleBusiness,
      hasLinkedIn,
      directoryCount,
      citationWeight: Math.min(100, citationWeight),
      authorityBoost: Math.min(40, authorityBoost),
      lastVerifiedAt: new Date().toISOString()
    };
  }
}
