/**
 * @fileOverview Default scan prompt generator.
 *
 * If the user doesn't supply a custom prompt, this generates one optimized
 * for AI perception discovery - asking the model to describe the business
 * as it understands it, not just summarize a webpage.
 */

import type { GroundTruth } from "@/lib/types/perception-scan";

/**
 * Generate a perception scan prompt for a given business.
 *
 * The prompt is designed to elicit a natural AI response showing
 * how the model *perceives* the business — not to lead or bias it
 * with details the model should be discovering on its own.
 */
export function generateDefaultPrompt(
  businessName: string,
  websiteUrl?: string,
  groundTruth?: GroundTruth,
): string {
  // Core question — always present
  const lines: string[] = [
    `Tell me everything you know about the company "${businessName}".`,
    "",
    "Specifically, please address:",
    "1. What does this company do? What is its primary business?",
    "2. What specific services or products does it offer?",
    "3. What industry or industries does it operate in?",
    "4. Where does it operate? What locations or regions does it serve?",
    "5. Who are its typical customers or target market?",
    "6. What makes it different from competitors? What are its key differentiators?",
    "7. Any other notable facts about this company (founding year, size, partnerships, reputation, etc.)?",
  ];

  // If a website is provided, mention it as a reference anchor — but we
  // do NOT paste website content. We want the model's own knowledge.
  if (websiteUrl) {
    lines.push("");
    lines.push(`The company's website is ${websiteUrl}.`);
  }

  // We intentionally do NOT include ground truth in the prompt.
  // Ground truth is used *after* the response to evaluate accuracy.
  // Including it would bias the model.

  lines.push("");
  lines.push(
    "Please be as specific as possible. If you are uncertain about any details, " +
    "say so rather than guessing. I want to understand how AI models currently " +
    "perceive and describe this business."
  );

  return lines.join("\n");
}
