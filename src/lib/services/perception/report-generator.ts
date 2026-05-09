/**
 * @fileOverview Report Generator.
 *
 * Produces both machine-readable JSON and human-readable Markdown
 * reports from the perception scan results.
 */

import type {
  PerceptionScanResult,
  ModelResponse,
  PerceptionComparison,
  InaccuracyReport,
  OmissionReport,
  EntityUnderstanding,
  ConsistencyReport,
  PerceptionRecommendation,
} from "@/lib/types/perception-scan";

// ============================================================
// JSON REPORT
// ============================================================

/**
 * Generate a clean JSON report object from scan results.
 * This strips out raw_response data to keep the JSON compact.
 */
export function generateJSONReport(scan: PerceptionScanResult): Record<string, any> {
  return {
    meta: {
      scan_id: scan.scan_id,
      business_name: scan.business_name,
      website_url: scan.website_url,
      created_at: scan.created_at,
      completed_at: scan.completed_at,
      models_used: scan.models_requested,
      status: scan.status,
    },
    perception_summary: scan.comparison.perception_summary,
    model_summaries: scan.model_results
      .filter((r) => r.success)
      .map((r) => ({
        model_id: r.model_id,
        provider: r.provider,
        summary: r.summary,
        business_type: r.perception.business_type,
        services: r.perception.services_mentioned,
        industries: r.perception.industries_mentioned,
        locations: r.perception.locations_mentioned,
        customers: r.perception.customer_types_mentioned,
        differentiators: r.perception.differentiators_mentioned,
        latency_ms: r.latency_ms,
      })),
    comparison: scan.comparison.comparison,
    inaccuracy_report: {
      accuracy_score: scan.inaccuracy_report.accuracy_score,
      total_inaccuracies: scan.inaccuracy_report.inaccuracies.length,
      total_partial_matches: scan.inaccuracy_report.partial_matches.length,
      total_unverifiable: scan.inaccuracy_report.unverifiable_claims.length,
      details: scan.inaccuracy_report,
    },
    omission_report: {
      coverage_score: scan.omission_report.coverage_score,
      total_omissions: scan.omission_report.omissions.length,
      major_omissions: scan.omission_report.omissions.filter((o) => o.severity === "major").length,
      details: scan.omission_report,
    },
    entity_understanding: scan.entity_understanding,
    consistency: scan.consistency,
    recommendations: scan.recommendations,
  };
}

// ============================================================
// MARKDOWN REPORT
// ============================================================

/**
 * Generate a human-readable Markdown report from scan results.
 */
export function generateMarkdownReport(scan: PerceptionScanResult): string {
  const lines: string[] = [];

  // Header
  lines.push(`# AI Perception Scan Report`);
  lines.push(`## ${scan.business_name}`);
  lines.push("");
  lines.push(`**Scan ID:** ${scan.scan_id}`);
  if (scan.website_url) lines.push(`**Website:** ${scan.website_url}`);
  lines.push(`**Date:** ${scan.completed_at || scan.created_at}`);
  lines.push(`**Models Used:** ${scan.models_requested.join(", ")}`);
  lines.push("");

  // ── Section 1: AI Perception Summary ──────────────────────────
  lines.push("---");
  lines.push("## 1. AI Perception Summary");
  lines.push("");
  lines.push(scan.comparison.perception_summary);
  lines.push("");

  // ── Section 2: Side-by-Side Model Outputs ─────────────────────
  lines.push("---");
  lines.push("## 2. Side-by-Side Model Outputs");
  lines.push("");

  for (const result of scan.model_results) {
    lines.push(`### ${result.model_id} (${result.provider})`);
    if (!result.success) {
      lines.push(`> **Error:** ${result.error_message}`);
      lines.push("");
      continue;
    }
    lines.push("");
    lines.push(`**Summary:** ${result.summary}`);
    lines.push("");
    lines.push(`| Dimension | Value |`);
    lines.push(`|-----------|-------|`);
    lines.push(`| Business Type | ${result.perception.business_type || "Not specified"} |`);
    lines.push(`| Services | ${result.perception.services_mentioned.join(", ") || "None mentioned"} |`);
    lines.push(`| Industries | ${result.perception.industries_mentioned.join(", ") || "None mentioned"} |`);
    lines.push(`| Locations | ${result.perception.locations_mentioned.join(", ") || "None mentioned"} |`);
    lines.push(`| Customer Types | ${result.perception.customer_types_mentioned.join(", ") || "None mentioned"} |`);
    lines.push(`| Differentiators | ${result.perception.differentiators_mentioned.join(", ") || "None mentioned"} |`);
    lines.push(`| Response Time | ${result.latency_ms}ms |`);
    lines.push("");
  }

  // ── Section 3: Model Comparison ───────────────────────────────
  lines.push("---");
  lines.push("## 3. Model Comparison");
  lines.push("");

  const comp = scan.comparison.comparison;
  if (comp.agreements.length > 0) {
    lines.push("### Agreements");
    for (const a of comp.agreements) {
      lines.push(`- **[${a.category}]** ${a.detail}`);
    }
    lines.push("");
  }

  if (comp.differences.length > 0) {
    lines.push("### Differences");
    for (const d of comp.differences) {
      lines.push(`- **[${d.category}]** ${d.detail}`);
    }
    lines.push("");
  }

  if (comp.conflicts.length > 0) {
    lines.push("### Conflicts");
    for (const c of comp.conflicts) {
      lines.push(`- **[${c.category}]** ${c.detail}`);
    }
    lines.push("");
  }

  // ── Section 4: Inaccuracies ───────────────────────────────────
  lines.push("---");
  lines.push("## 4. Inaccuracy Report");
  lines.push("");
  lines.push(`**Accuracy Score:** ${scan.inaccuracy_report.accuracy_score}/100`);
  lines.push("");

  if (scan.inaccuracy_report.inaccuracies.length > 0) {
    lines.push("### Inaccuracies Found");
    for (const f of scan.inaccuracy_report.inaccuracies) {
      lines.push(`- **[${f.category}]** (${f.model_id}) ${f.explanation}`);
      lines.push(`  - Claim: "${f.claim.slice(0, 120)}"`);
      lines.push(`  - Expected: "${f.expected.slice(0, 120)}"`);
    }
    lines.push("");
  }

  if (scan.inaccuracy_report.partial_matches.length > 0) {
    lines.push("### Partial Matches");
    for (const f of scan.inaccuracy_report.partial_matches) {
      lines.push(`- **[${f.category}]** (${f.model_id}) ${f.explanation}`);
    }
    lines.push("");
  }

  if (scan.inaccuracy_report.unverifiable_claims.length > 0) {
    lines.push("### Unverifiable Claims");
    for (const f of scan.inaccuracy_report.unverifiable_claims) {
      lines.push(`- **[${f.category}]** (${f.model_id}) "${f.claim.slice(0, 100)}"`);
    }
    lines.push("");
  }

  // ── Section 5: Omissions ──────────────────────────────────────
  lines.push("---");
  lines.push("## 5. Missing Information / Omissions");
  lines.push("");
  lines.push(`**Coverage Score:** ${scan.omission_report.coverage_score}/100`);
  lines.push("");

  if (scan.omission_report.omissions.length > 0) {
    lines.push("| Category | Missing Item | Severity | Missing In |");
    lines.push("|----------|-------------|----------|------------|");
    for (const o of scan.omission_report.omissions) {
      lines.push(`| ${o.category} | ${o.item} | ${o.severity} | ${o.missing_in_models.join(", ")} |`);
    }
    lines.push("");
  } else {
    lines.push("No significant omissions detected.");
    lines.push("");
  }

  // ── Section 6: Entity Understanding ───────────────────────────
  lines.push("---");
  lines.push("## 6. Entity Understanding");
  lines.push("");
  lines.push(`**Overall Understanding Score:** ${scan.entity_understanding.overall_score}/100`);
  lines.push("");

  const dims = [
    { label: "Business Type", data: scan.entity_understanding.business_type },
    { label: "Services", data: scan.entity_understanding.services },
    { label: "Geography", data: scan.entity_understanding.geography },
    { label: "Customer Type", data: scan.entity_understanding.customer_type },
  ];

  lines.push("| Dimension | Status | Notes |");
  lines.push("|-----------|--------|-------|");
  for (const dim of dims) {
    const statusIcon =
      dim.data.status === "correct" ? "Correct" :
      dim.data.status === "partially_correct" ? "Partial" :
      dim.data.status === "incorrect" ? "Incorrect" :
      "Not Mentioned";
    lines.push(`| ${dim.label} | ${statusIcon} | ${dim.data.notes.slice(0, 100)} |`);
  }
  lines.push("");

  // Model-by-model breakdown
  lines.push("### Model-by-Model View");
  for (const dim of dims) {
    lines.push(`\n**${dim.label}:**`);
    for (const [modelId, value] of Object.entries(dim.data.inferred_by_models)) {
      lines.push(`- ${modelId}: ${value}`);
    }
    lines.push(`- *Expected:* ${dim.data.expected}`);
  }
  lines.push("");

  // ── Section 7: Consistency ────────────────────────────────────
  lines.push("---");
  lines.push("## 7. Model Consistency");
  lines.push("");
  lines.push(`**Divergence Score:** ${scan.consistency.consistency_score}/100 (${scan.consistency.consistency_label})`);
  lines.push("");
  for (const note of scan.consistency.consistency_notes) {
    lines.push(`- ${note}`);
  }
  lines.push("");

  // ── Section 8: Recommendations ────────────────────────────────
  lines.push("---");
  lines.push("## 8. Recommended Actions");
  lines.push("");

  if (scan.recommendations.length > 0) {
    for (let i = 0; i < scan.recommendations.length; i++) {
      const rec = scan.recommendations[i];
      const priorityLabel =
        rec.priority === "high" ? "HIGH" :
        rec.priority === "medium" ? "MEDIUM" : "LOW";

      lines.push(`### ${i + 1}. ${rec.title}`);
      lines.push(`**Priority:** ${priorityLabel} | **Category:** ${rec.category}`);
      lines.push("");
      lines.push(`**Why:** ${rec.reason}`);
      lines.push("");
      lines.push(`**Action:** ${rec.recommended_action}`);
      lines.push("");
    }
  } else {
    lines.push("No recommendations generated. Scan may have had insufficient data.");
    lines.push("");
  }

  // Footer
  lines.push("---");
  lines.push(`*Report generated by VizAI Discovery Engine*`);

  return lines.join("\n");
}
