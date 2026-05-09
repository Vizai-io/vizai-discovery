/**
 * @fileOverview Recommendation Engine.
 *
 * Turns scan findings (inaccuracies, omissions, entity misunderstanding,
 * model divergence) into practical, prioritized actions the business can take.
 *
 * Recommendations are generated deterministically from the analysis results —
 * no LLM call needed. This keeps them fast, predictable, and free.
 */

import type {
  PerceptionRecommendation,
  InaccuracyReport,
  OmissionReport,
  EntityUnderstanding,
  ConsistencyReport,
  PerceptionComparison,
} from "@/lib/types/perception-scan";

interface RecommendationInput {
  inaccuracy_report: InaccuracyReport;
  omission_report: OmissionReport;
  entity_understanding: EntityUnderstanding;
  consistency: ConsistencyReport;
  comparison: PerceptionComparison;
  businessName: string;
}

/**
 * Generate actionable recommendations from scan analysis results.
 */
export function generateRecommendations(input: RecommendationInput): PerceptionRecommendation[] {
  const recs: PerceptionRecommendation[] = [];

  // ── 1. Recommendations from inaccuracies ──────────────────────
  generateInaccuracyRecs(input.inaccuracy_report, recs);

  // ── 2. Recommendations from omissions ─────────────────────────
  generateOmissionRecs(input.omission_report, recs);

  // ── 3. Recommendations from entity misunderstanding ───────────
  generateEntityRecs(input.entity_understanding, input.businessName, recs);

  // ── 4. Recommendations from model divergence ──────────────────
  generateConsistencyRecs(input.consistency, input.comparison, recs);

  // Sort by priority: high > medium > low
  const priorityOrder = { high: 0, medium: 1, low: 2 };
  recs.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

  // Deduplicate similar recommendations (same category + similar title)
  return deduplicateRecs(recs);
}

// ── Inaccuracy-based recommendations ─────────────────────────────

function generateInaccuracyRecs(
  report: InaccuracyReport,
  recs: PerceptionRecommendation[],
): void {
  // Group inaccuracies by category
  const byCategory = new Map<string, number>();
  for (const finding of report.inaccuracies) {
    byCategory.set(finding.category, (byCategory.get(finding.category) || 0) + 1);
  }

  if (report.inaccuracies.length > 0) {
    // Overall accuracy recommendation
    recs.push({
      priority: "high",
      category: "accuracy",
      title: "Correct AI misconceptions about your business",
      reason: `${report.inaccuracies.length} inaccurate statement(s) found across model responses. AI models are actively misrepresenting your business.`,
      recommended_action:
        "Update your homepage, About page, and structured data (JSON-LD) to explicitly and clearly state your business description, services, and industry classification. Search engines and AI models rely heavily on these signals.",
    });
  }

  if (byCategory.has("services")) {
    recs.push({
      priority: "high",
      category: "services",
      title: "Clarify your service offerings online",
      reason: `AI models incorrectly describe your services. This means potential customers asking AI about your services get wrong information.`,
      recommended_action:
        "Create dedicated service pages with clear, structured content. Use schema markup (Service schema) to explicitly define each service. Ensure service descriptions match across your website, Google Business Profile, and directory listings.",
    });
  }

  if (byCategory.has("industries")) {
    recs.push({
      priority: "high",
      category: "positioning",
      title: "Clarify your industry classification",
      reason: "AI models associate your business with incorrect industries, which means you may not appear in industry-specific AI queries.",
      recommended_action:
        "Update homepage title, meta description, and About page to explicitly name your industry. Add Organization schema with correct industry/NAICS codes.",
    });
  }

  // Partial match recommendations
  if (report.partial_matches.length > 2) {
    recs.push({
      priority: "medium",
      category: "content",
      title: "Strengthen business description consistency",
      reason: `${report.partial_matches.length} partially accurate statement(s) found. AI models have a vague understanding but miss important details.`,
      recommended_action:
        "Review and align your business description across all channels (website, LinkedIn, directories). Use consistent language and terminology everywhere.",
    });
  }

  // Unverifiable claims
  if (report.unverifiable_claims.length > 3) {
    recs.push({
      priority: "low",
      category: "content",
      title: "Address AI-generated assumptions about your business",
      reason: `${report.unverifiable_claims.length} claim(s) made by AI models could not be verified. These may be hallucinations or outdated information.`,
      recommended_action:
        "Publish authoritative content (press releases, case studies, blog posts) that establishes factual information about your business. This gives AI models accurate source material to learn from.",
    });
  }
}

// ── Omission-based recommendations ───────────────────────────────

function generateOmissionRecs(
  report: OmissionReport,
  recs: PerceptionRecommendation[],
): void {
  // Group omissions by category
  const byCategory = new Map<string, string[]>();
  for (const omission of report.omissions) {
    if (!byCategory.has(omission.category)) {
      byCategory.set(omission.category, []);
    }
    byCategory.get(omission.category)!.push(omission.item);
  }

  if (byCategory.has("services")) {
    const missing = byCategory.get("services")!;
    recs.push({
      priority: "high",
      category: "services",
      title: "Publish content for missing services",
      reason: `${missing.length} of your official services are not mentioned by AI models: ${missing.slice(0, 3).join(", ")}${missing.length > 3 ? ` (+${missing.length - 3} more)` : ""}.`,
      recommended_action:
        `Create dedicated pages for each missing service. Include detailed descriptions, use cases, and structured data. Target services: ${missing.join(", ")}.`,
    });
  }

  if (byCategory.has("locations")) {
    const missing = byCategory.get("locations")!;
    recs.push({
      priority: "medium",
      category: "geography",
      title: "Improve geographic visibility",
      reason: `${missing.length} of your operating regions are not recognized by AI: ${missing.join(", ")}.`,
      recommended_action:
        "Add location-specific pages or sections to your website. Update Google Business Profile with all service areas. Create localized content targeting each missing region.",
    });
  }

  if (byCategory.has("differentiators")) {
    const missing = byCategory.get("differentiators")!;
    recs.push({
      priority: "medium",
      category: "positioning",
      title: "Strengthen differentiator visibility",
      reason: `AI models don't mention your key differentiators: ${missing.join(", ")}.`,
      recommended_action:
        "Feature differentiators prominently on your homepage and About page. Create case studies and testimonials that highlight each differentiator. Add structured data emphasizing unique capabilities.",
    });
  }

  if (byCategory.has("business_name")) {
    recs.push({
      priority: "high",
      category: "brand",
      title: "Improve brand recognition in AI models",
      reason: "Your official business name is not recognized by one or more AI models.",
      recommended_action:
        "Ensure consistent use of your official business name across all online properties. Pursue citations in authoritative sources (Wikipedia, industry directories, press coverage). Implement Organization schema with your exact legal name.",
    });
  }

  if (report.coverage_score < 50) {
    recs.push({
      priority: "high",
      category: "content",
      title: "Major content gap — AI has limited knowledge of your business",
      reason: `Only ${report.coverage_score}% of your business information is reflected in AI model outputs.`,
      recommended_action:
        "Conduct a comprehensive content audit and create authoritative, publicly accessible content covering all aspects of your business. Focus on structured data, press releases, and industry directory listings.",
    });
  }
}

// ── Entity understanding recommendations ─────────────────────────

function generateEntityRecs(
  entity: EntityUnderstanding,
  businessName: string,
  recs: PerceptionRecommendation[],
): void {
  if (entity.business_type.status === "incorrect") {
    recs.push({
      priority: "high",
      category: "positioning",
      title: "Correct your business classification in AI",
      reason: entity.business_type.notes,
      recommended_action:
        `Update your homepage H1, meta title, and About page to explicitly state what ${businessName} is. Use clear, unambiguous language: "We are a [your actual business type]." Add Organization schema with accurate industry classification.`,
    });
  }

  if (entity.services.status === "incorrect" || entity.services.status === "not_mentioned") {
    recs.push({
      priority: "high",
      category: "services",
      title: "Make your service taxonomy AI-discoverable",
      reason: entity.services.notes,
      recommended_action:
        "Build a comprehensive Services page with individual sub-pages per service. Use Service schema markup. Create FAQ content targeting common AI queries about your services.",
    });
  }

  if (entity.geography.status === "not_mentioned") {
    recs.push({
      priority: "medium",
      category: "geography",
      title: "Establish geographic presence in AI models",
      reason: entity.geography.notes,
      recommended_action:
        "Add geographic information to your website's footer, About page, and Contact page. Use LocalBusiness or Organization schema with explicit areaServed properties. List your business on regional directories.",
    });
  }

  if (entity.customer_type.status === "not_mentioned") {
    recs.push({
      priority: "medium",
      category: "positioning",
      title: "Define your target market for AI visibility",
      reason: "AI models don't know who your customers are, which limits referral-style AI responses.",
      recommended_action:
        "Add an 'Industries We Serve' or 'Who We Work With' section to your website. Include client testimonials and case studies that name specific industries and company types.",
    });
  }

  if (entity.overall_score < 40) {
    recs.push({
      priority: "high",
      category: "brand",
      title: "Critical: AI fundamentally misunderstands your business",
      reason: `Entity understanding score is ${entity.overall_score}/100. AI models have a poor grasp of your business identity.`,
      recommended_action:
        "This requires a comprehensive digital presence overhaul. Start with: 1) Rewrite homepage with clear positioning, 2) Implement full schema markup, 3) Pursue authoritative citations, 4) Create cornerstone content pieces.",
    });
  }
}

// ── Consistency recommendations ──────────────────────────────────

function generateConsistencyRecs(
  consistency: ConsistencyReport,
  comparison: PerceptionComparison,
  recs: PerceptionRecommendation[],
): void {
  if (consistency.consistency_score > 50) {
    recs.push({
      priority: "medium",
      category: "content",
      title: "Reduce conflicting AI perceptions",
      reason: `AI models significantly disagree about your business (divergence score: ${consistency.consistency_score}/100). ${consistency.consistency_notes[0] || ""}`,
      recommended_action:
        "Create a single authoritative 'About' narrative and ensure it is echoed across all web properties. Inconsistent information across sources causes AI models to produce conflicting outputs.",
    });
  }

  // Check for specific conflicts
  const conflicts = comparison.comparison.conflicts;
  if (conflicts.length > 0) {
    const conflictCategories = [...new Set(conflicts.map((c) => c.category))];
    recs.push({
      priority: "high",
      category: "content",
      title: "Resolve AI model conflicts",
      reason: `${conflicts.length} direct conflict(s) found between AI models in: ${conflictCategories.join(", ")}.`,
      recommended_action:
        "Identify the conflicting information sources and correct them. Focus on making your website the single source of truth with clear, unambiguous language.",
    });
  }
}

// ── Deduplication ────────────────────────────────────────────────

function deduplicateRecs(recs: PerceptionRecommendation[]): PerceptionRecommendation[] {
  const seen = new Set<string>();
  return recs.filter((rec) => {
    const key = `${rec.category}::${rec.title}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
