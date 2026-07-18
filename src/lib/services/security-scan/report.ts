/**
 * @fileOverview Frontier-model narrative layer over the passive web posture scan.
 *
 * scanner.ts is the source of truth (deterministic, no LLM). This turns its
 * findings into a plain-English, prioritized report a business owner can act on.
 *
 * Strictly grounded: the model receives ONLY the scan's own findings and is told
 * to synthesize/prioritize/explain them — never to invent a vulnerability. The
 * report always states it is an automated PASSIVE assessment, not a pentest.
 *
 * A scan with no actionable findings short-circuits to a canned template without
 * calling the model — nothing to narrate, no tokens spent, no chance of the
 * model inventing an issue to fill space.
 */

import type { WebScanResult } from "./scanner";

export interface SecurityReport {
  report: string;
  model: string;
  provider: "openai" | "none";
  generatedAt: string;
  error?: string;
}

const REPORT_MODEL = process.env.SECURITY_REPORT_MODEL || "gpt-4o-mini";

const SYSTEM_PROMPT = `You are a senior security analyst writing a report for a small business owner who is not a security expert. You are given the JSON output of an automated PASSIVE external web-security scan (security headers, cookies, DNS email-authentication, well-known exposed paths). No active exploitation was performed.

STRICT RULES:
- Only discuss the findings given. NEVER invent, assume, or imply a vulnerability that is not in the supplied findings list.
- Do not claim the site is "secure" beyond what the absence of a finding implies. State plainly, near the top, that this is an automated passive assessment, NOT a certified penetration test.
- Lead with what is already good (if anything qualifies), then prioritize remaining findings by real-world impact — critical/high first — in plain language. Explain the "so what", not just the technical name.
- For each finding, give one concrete, minimal fix.
- Tight markdown. No filler, no marketing language, no fabricated urgency.`;

function cleanTemplate(domain: string, grade: string): string {
  return `✅ **${domain} — Grade ${grade}**\n\n` +
    `No actionable issues were found by this automated passive scan (security ` +
    `headers, cookies, DNS email-authentication, and well-known exposed paths).\n\n` +
    `**Scope & limits:** this is an automated passive assessment, not a certified ` +
    `penetration test. For deeper assurance, a manual or active security review is ` +
    `recommended.`;
}

export async function narrateScan(scan: WebScanResult): Promise<SecurityReport> {
  const generatedAt = new Date().toISOString();

  if (scan.error) {
    return { report: "", model: "", provider: "none", generatedAt,
      error: `cannot report on a failed scan: ${scan.error}` };
  }

  // Actionable = anything above informational. The scanner always appends an
  // info-level TLS note, so "no findings" is never literally empty.
  const actionable = scan.findings.filter((f) => f.severity !== "info");
  if (actionable.length === 0) {
    return { report: cleanTemplate(scan.domain, scan.grade), model: "",
      provider: "none", generatedAt };
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return { report: "", model: "", provider: "none", generatedAt,
      error: "OPENAI_API_KEY not configured — cannot generate the narrative report" };
  }

  const payload = {
    domain: scan.domain, grade: scan.grade, scope: scan.scope, findings: scan.findings,
  };

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: REPORT_MODEL,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content:
            `Write the security report for this scan:\n${JSON.stringify(payload, null, 1).slice(0, 12000)}` },
        ],
        temperature: 0.3,
      }),
      signal: AbortSignal.timeout(45000),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return { report: "", model: REPORT_MODEL, provider: "none", generatedAt,
        error: `LLM error ${response.status}: ${errorText.slice(0, 200)}` };
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const text = (data.choices?.[0]?.message?.content ?? "").trim();
    if (!text) {
      return { report: "", model: REPORT_MODEL, provider: "none", generatedAt,
        error: "LLM returned an empty report" };
    }
    return { report: text, model: REPORT_MODEL, provider: "openai", generatedAt };
  } catch (err) {
    return { report: "", model: REPORT_MODEL, provider: "none", generatedAt,
      error: `report generation failed: ${err instanceof Error ? err.message : String(err)}` };
  }
}
