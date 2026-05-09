/**
 * @fileOverview String comparison utilities for perception analysis.
 *
 * These are lightweight heuristic functions used across the analysis engines.
 * They handle normalization, fuzzy matching, and overlap detection without
 * requiring an external NLP library.
 */

/**
 * Normalize a string for comparison: lowercase, trim, collapse whitespace,
 * remove common punctuation.
 */
export function normalize(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[.,;:!?'"()\[\]{}\-–—\/\\]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Tokenize a string into unique lowercase words.
 */
export function tokenize(s: string): Set<string> {
  const stopWords = new Set([
    "a", "an", "the", "and", "or", "but", "in", "on", "at", "to", "for",
    "of", "with", "by", "from", "is", "are", "was", "were", "be", "been",
    "being", "have", "has", "had", "do", "does", "did", "will", "would",
    "could", "should", "may", "might", "shall", "can", "it", "its", "this",
    "that", "these", "those", "as", "such", "their", "they", "them", "we",
    "our", "us", "also", "very", "more", "most", "all", "each", "other",
  ]);

  return new Set(
    normalize(s)
      .split(" ")
      .filter((w) => w.length > 1 && !stopWords.has(w))
  );
}

/**
 * Jaccard similarity: |intersection| / |union| of token sets.
 * Returns 0-1 where 1 = identical token sets.
 */
export function jaccardSimilarity(a: string, b: string): number {
  const setA = tokenize(a);
  const setB = tokenize(b);
  if (setA.size === 0 && setB.size === 0) return 1;
  if (setA.size === 0 || setB.size === 0) return 0;

  let intersection = 0;
  for (const token of setA) {
    if (setB.has(token)) intersection++;
  }
  const union = new Set([...setA, ...setB]).size;
  return intersection / union;
}

/**
 * Check if string `haystack` contains something similar to `needle`.
 * Uses normalized substring matching + token overlap.
 * Returns a confidence score 0-1.
 */
export function fuzzyContains(haystack: string, needle: string): number {
  const normH = normalize(haystack);
  const normN = normalize(needle);

  // Exact substring match
  if (normH.includes(normN)) return 1.0;

  // Token overlap: what fraction of needle tokens appear in haystack?
  const haystackTokens = tokenize(haystack);
  const needleTokens = tokenize(needle);
  if (needleTokens.size === 0) return 0;

  let found = 0;
  for (const t of needleTokens) {
    if (haystackTokens.has(t)) found++;
  }
  return found / needleTokens.size;
}

/**
 * Find the best match for `needle` in a list of `candidates`.
 * Returns the best match and its score.
 */
export function bestMatch(
  needle: string,
  candidates: string[],
): { match: string; score: number } {
  let best = { match: "", score: 0 };
  for (const candidate of candidates) {
    const score = fuzzyContains(candidate, needle);
    if (score > best.score) {
      best = { match: candidate, score };
    }
  }
  return best;
}

/**
 * Check if any item in `items` is mentioned in `text`.
 * Returns an array of { item, score } for items with score > threshold.
 */
export function findMentioned(
  items: string[],
  text: string,
  threshold = 0.5,
): { item: string; score: number }[] {
  return items
    .map((item) => ({ item, score: fuzzyContains(text, item) }))
    .filter((r) => r.score >= threshold);
}

/**
 * Compute overlap ratio: what fraction of `expected` items are represented
 * in `actual` items? Uses fuzzy matching.
 */
export function listOverlap(
  expected: string[],
  actual: string[],
  threshold = 0.5,
): { matched: string[]; unmatched: string[]; ratio: number } {
  const matched: string[] = [];
  const unmatched: string[] = [];

  for (const exp of expected) {
    const best = bestMatch(exp, actual);
    if (best.score >= threshold) {
      matched.push(exp);
    } else {
      unmatched.push(exp);
    }
  }

  return {
    matched,
    unmatched,
    ratio: expected.length > 0 ? matched.length / expected.length : 1,
  };
}
