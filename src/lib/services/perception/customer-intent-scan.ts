/**
 * @fileOverview Customer-intent scan (query-based free scan).
 *
 * Two views, matching how a customer actually uses AI:
 *
 * 1. BLIND SEARCH (discovery) — generic industry questions with NO business
 *    name ("I need a 3PL in Ontario", "best 3PL", "cheapest warehousing").
 *    This is the perspective of an AI user looking for a company/service in
 *    that industry. Shown as a SCORE: was the business found, and was it
 *    recommended? If not, who was recommended instead?
 *
 * 2. DIRECT SEARCH (by name) — "Tell me about {Business}", "What services
 *    does {Business} offer?" Shown as a SUMMARY + a SHORT LIST of details
 *    (services, contact info, locations) — NOT a full report. At this stage
 *    there is no truth file, so we do not score accuracy; the business owner
 *    judges what is true vs inaccurate.
 *
 * The scan runs against a web-grounded model (Gemini with Google Search
 * grounding; Perplexity when its key is configured), so it reflects what a
 * real user gets today.
 *
 * This scan creates NO canonical truth document. The truth file is set up
 * only after signup, when the score is low and the service is the fix.
 * Re-running this scan over time is the drift measurement (baseline vs now).
 */

import { GeminiPerceptionAdapter } from "@/lib/services/perception/adapters/gemini-perception-adapter";
import { PerplexityPerceptionAdapter } from "@/lib/services/perception/adapters/perplexity-perception-adapter";
import type {
  CustomerIntentDirect,
  CustomerIntentDiscovery,
  CustomerIntentQuery,
  CustomerIntentQueryResult,
  CustomerIntentScanResult,
  GroundedAnswer,
} from "@/lib/types/perception-scan";

export interface CustomerIntentScanInput {
  businessName: string;
  websiteUrl?: string;
  industry?: string;
  /** The business's main services (used to build queries and check the direct view) */
  services?: string[];
  /** e.g. "Ontario, Canada" or "Smiths Falls, Ontario" */
  location?: string;
  /** Short / distinctive name for matching, e.g. "Wills Transfer" */
  shortName?: string;
}

const RECOMMENDATION_CUES = [
  "recommend",
  "best",
  "top pick",
  "top choice",
  "consider",
  "suggest",
  "leading",
  "highly regarded",
  "stand out",
];

/** Words that mark a bold segment as a section heading, not a company name */
const HEADING_WORDS = new Set([
  "required", "storage", "duration", "shipment", "distance", "routes",
  "cargo", "volume", "handling", "complexity", "product", "industry",
  "regulations", "regulation", "food", "beverage", "pharmaceutical",
  "healthcare", "compliance", "knowledge", "type", "cost", "pricing",
  "price", "factor", "consideration", "benefit", "advantage", "risk",
  "requirement", "option", "step", "guide", "factors", "types",
]);

/** Words that are not company names when we extract "recommended instead" */
const GENERIC_BOLD_WORDS = new Set([
  "best",
  "top",
  "leading",
  "key",
  "services",
  "features",
  "summary",
  "overview",
  "conclusion",
  "note",
  "important",
  "answer",
  "result",
  "results",
]);

function normalize(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function domainFromWebsite(websiteUrl?: string): string {
  if (!websiteUrl) return "";
  try {
    const host = new URL(websiteUrl).hostname.replace(/^www\./, "");
    return host.replace(/\.(com|ca|org|net|io)$/i, "");
  } catch {
    return "";
  }
}

function aOrAn(word: string): string {
  return /^[aeiou]/i.test(word.trim()) ? "an" : "a";
}

/**
 * Build the customer-intent query set for a business.
 * Four discovery (blind) queries + two direct (by-name) queries.
 */
export function buildCustomerIntentQueries(input: CustomerIntentScanInput): CustomerIntentQuery[] {
  const service = input.services?.[0] || input.industry || "services";
  const location = input.location || "";
  const loc = location ? ` in ${location}` : "";
  const name = input.businessName;

  return [
    {
      id: "transactional",
      kind: "transactional",
      question: `I need ${aOrAn(service)} ${service} provider${loc}. Who should I use?`,
    },
    {
      id: "comparative",
      kind: "comparative",
      question: `What are the best ${service} companies${loc}?`,
    },
    {
      id: "price",
      kind: "price",
      question: `What is the cheapest ${service} provider${loc}?`,
    },
    {
      id: "troubleshooting",
      kind: "troubleshooting",
      question: `How do I find a reliable ${service} provider${loc} for my business?`,
    },
    {
      id: "direct-name",
      kind: "direct",
      question: `Tell me about ${name}. What do they do?`,
    },
    {
      id: "direct-services",
      kind: "direct",
      question: `What services does ${name} offer${location ? ` in ${location}` : ""}?`,
    },
  ];
}

/**
 * Extract the company names the AI presented as recommendations.
 * Heuristic: Gemini list answers bold company names (**Name**). We take
 * bold segments that look like names and are not the business itself.
 */
function extractRecommendedInstead(answerText: string, businessName: string): string[] {
  const names: string[] = [];
  const bold = answerText.match(/\*\*([^*]{2,60})\*\*/g) || [];
  const businessNorm = normalize(businessName);
  for (const segment of bold) {
    const name = segment.replace(/\*/g, "").trim();
    const words = name.split(/\s+/);
    if (words.length < 1 || words.length > 5) continue;
    if (GENERIC_BOLD_WORDS.has(words[0].toLowerCase())) continue;
    // Skip section headings (e.g. "Product Type:", "Storage Duration").
    if (name.endsWith(":")) continue;
    if (words.some((w) => HEADING_WORDS.has(w.toLowerCase().replace(/[^a-z]/g, "")))) continue;
    if (normalize(name) === businessNorm) continue;
    // Must look like a name: starts with a capital letter
    if (!/^[A-Z]/.test(name)) continue;
    if (!names.includes(name)) names.push(name);
    if (names.length >= 5) break;
  }
  return names;
}

/**
 * Score one grounded answer.
 *
 * - mentioned: the business name (or its website domain) appears in the answer.
 * - recommended: mentioned AND the mention sits in a recommendation context
 *   (early in the answer, or near a recommendation cue word). Heuristic.
 */
function scoreQuery(
  query: CustomerIntentQuery,
  answer: GroundedAnswer,
  input: CustomerIntentScanInput,
): Omit<CustomerIntentQueryResult, "query"> {
  const text = answer.answer_text || "";
  const normText = normalize(text);
  const nameNorm = normalize(input.businessName);
  const shortNorm = input.shortName ? normalize(input.shortName) : "";
  const domainNorm = domainFromWebsite(input.websiteUrl);

  const mentioned =
    (nameNorm.length > 0 && normText.includes(nameNorm)) ||
    (shortNorm.length > 0 && normText.includes(shortNorm)) ||
    (domainNorm.length > 0 && normText.includes(domainNorm));

  let recommended = false;
  let excerpt = "";
  if (mentioned) {
    // Find where the business is first mentioned.
    const idx = Math.min(
      ...[nameNorm, shortNorm, domainNorm]
        .filter((s) => s.length > 0 && normText.includes(s))
        .map((s) => normText.indexOf(s)),
    );
    const firstHalf = idx < normText.length * 0.6;
    const window = normText.slice(Math.max(0, idx - 200), idx + 200);
    const nearCue = RECOMMENDATION_CUES.some((cue) => window.includes(cue));
    recommended = firstHalf || nearCue;
    // Excerpt: ~200 chars around the first mention.
    const rawIdx = text.toLowerCase().indexOf(input.businessName.toLowerCase());
    const start = Math.max(0, (rawIdx >= 0 ? rawIdx : 0) - 80);
    excerpt = text.slice(start, start + 280).replace(/\s+/g, " ").trim();
    if (excerpt.length === 0) excerpt = text.slice(0, 280).replace(/\s+/g, " ").trim();
  } else {
    excerpt = "Not mentioned.";
  }

  const recommendedInstead = mentioned ? [] : extractRecommendedInstead(text, input.businessName);

  return {
    mentioned,
    recommended,
    excerpt,
    recommended_instead: recommendedInstead,
    sources: answer.sources,
    raw_answer: text,
    success: answer.success,
    error_message: answer.error_message,
  };
}

/**
 * Build the direct (by-name) view: a short summary + a short details list.
 * Not a full report, and not scored — the business owner judges what is
 * true vs inaccurate, since there is no truth file yet at this stage.
 */
function buildDirectView(
  directResults: CustomerIntentQueryResult[],
  input: CustomerIntentScanInput,
): CustomerIntentDirect {
  const nameAnswer =
    directResults.find((r) => r.query.id === "direct-name")?.raw_answer || "";
  const servicesAnswer =
    directResults.find((r) => r.query.id === "direct-services")?.raw_answer || "";
  const combined = [nameAnswer, servicesAnswer].filter(Boolean).join("\n");

  // Summary: first 2-3 sentences of the direct-name answer.
  const sourceText = nameAnswer || servicesAnswer || "";
  const sentences = sourceText.split(/(?<=[.!?])\s+/).filter((s) => s.trim().length > 0);
  let summary = sentences.slice(0, 3).join(" ").trim();
  if (summary.length > 500) summary = summary.slice(0, 500).replace(/\s+\S*$/, "") + "…";
  if (!summary) summary = "The AI did not return a description of this business.";

  // Services: the business's known services that the AI mentioned.
  const combinedNorm = normalize(combined);
  const services = (input.services || []).filter(
    (s) => s.length > 2 && combinedNorm.includes(normalize(s)),
  );

  // Contact: phone / email the AI stated (regex), website from the scan input.
  const phoneMatch = combined.match(/\+?1?[-.\s]?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/);
  const emailMatch = combined.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/);
  const contact: CustomerIntentDirect["contact"] = {
    website: input.websiteUrl,
    phone: phoneMatch ? phoneMatch[0].trim() : undefined,
    email: emailMatch ? emailMatch[0].trim() : undefined,
  };

  // Locations: the location parts the AI associated with the business.
  const locationParts = (input.location || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const locations = locationParts.filter((part) =>
    combinedNorm.includes(normalize(part)),
  );

  return { summary, services, contact, locations, queries: directResults };
}

/**
 * Run the customer-intent scan for a business.
 * Uses the Gemini adapter with Google Search grounding (the web-grounded
 * model available without a Perplexity key). Perplexity can be added as an
 * additional grounded provider when its key is configured.
 */
/**
 * Ask a grounded question, trying Perplexity first (when its key is
 * configured) and falling back to Gemini grounding. Returns the first
 * successful answer, or the Perplexity failure if both fail.
 */
async function queryGroundedWithFallback(
  question: string,
  perplexity: PerplexityPerceptionAdapter,
  gemini: GeminiPerceptionAdapter,
): Promise<GroundedAnswer> {
  const p = await perplexity.queryGrounded(question);
  if (p.success) return p;
  const g = await gemini.queryGrounded(question);
  if (g.success) return g;
  return p;
}

export async function runCustomerIntentScan(
  input: CustomerIntentScanInput,
): Promise<CustomerIntentScanResult> {
  const perplexity = new PerplexityPerceptionAdapter();
  const gemini = new GeminiPerceptionAdapter();
  // The model_id reported is the provider that answered the first query.
  let modelId = gemini.model_id;
  const queries = buildCustomerIntentQueries(input);

  const results: CustomerIntentQueryResult[] = [];
  for (let i = 0; i < queries.length; i++) {
    const query = queries[i];
    // Spread the queries out (6s apart) so the grounded model's per-minute
    // quota is not hit by the burst of 6 back-to-back calls.
    if (i > 0) await new Promise((r) => setTimeout(r, 6000));
    const answer = await queryGroundedWithFallback(query.question, perplexity, gemini);
    if (i === 0) modelId = answer.model_id;
    const scored = scoreQuery(query, answer, input);
    results.push({ query, ...scored });
  }

  // Blind search (discovery): the 4 generic queries. Shown as a score.
  const discoveryResults = results.filter((r) => r.query.kind !== "direct");
  const discTotal = discoveryResults.length;
  const discMentioned = discoveryResults.filter((r) => r.mentioned).length;
  const discRecommended = discoveryResults.filter((r) => r.recommended).length;
  const foundScore = discTotal > 0 ? Math.round((discMentioned / discTotal) * 100) : 0;
  const recommendedScore =
    discTotal > 0 ? Math.round((discRecommended / discTotal) * 100) : 0;
  const discoveryScore = Math.round((foundScore + recommendedScore) / 2);
  const recommendedInstead = [
    ...new Set(discoveryResults.flatMap((r) => r.recommended_instead)),
  ].slice(0, 8);

  const discovery: CustomerIntentDiscovery = {
    score: discoveryScore,
    found_score: foundScore,
    recommended_score: recommendedScore,
    recommended_instead: recommendedInstead,
    queries: discoveryResults,
  };

  // Direct search (by name): summary + short details list, not a score.
  const directResults = results.filter((r) => r.query.kind === "direct");
  const direct = buildDirectView(directResults, input);

  // Top gaps: discovery queries where the business was not found.
  const topGaps: string[] = [];
  for (const r of discoveryResults) {
    if (topGaps.length >= 4) break;
    if (!r.mentioned) {
      const instead =
        r.recommended_instead.length > 0
          ? ` — AI recommended ${r.recommended_instead.slice(0, 3).join(", ")} instead`
          : "";
      topGaps.push(`Not mentioned when customers ask "${r.query.question}"${instead}.`);
    } else if (!r.recommended) {
      topGaps.push(`Mentioned but not recommended for "${r.query.question}".`);
    }
  }

  const serviceLabel = input.services?.[0] || input.industry || "this service";
  const summary =
    discMentioned === 0
      ? `Blind search: when customers ask an AI for ${serviceLabel}${input.location ? ` in ${input.location}` : ""}, it did not mention ${input.businessName} in any of the ${discTotal} generic questions. Direct search: ${direct.summary}`
      : `Blind search: ${input.businessName} appeared in ${discMentioned} of ${discTotal} generic questions (score ${discoveryScore}/100). Direct search: ${direct.summary}`;

  return {
    business_name: input.businessName,
    website_url: input.websiteUrl,
    discovery,
    direct,
    overall_score: discoveryScore,
    top_gaps: topGaps,
    summary,
    model_id: modelId,
    scanned_at: new Date().toISOString(),
  };
}
