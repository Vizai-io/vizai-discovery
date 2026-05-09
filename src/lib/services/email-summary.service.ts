/**
 * @fileOverview EmailSummaryService — deterministic operational email payloads.
 *
 * Generates structured summary payloads for daily and weekly email digests.
 * NO email sending in this file — no Resend, no SMTP.
 * All strings are template-driven. No LLM usage.
 *
 * Wire up delivery when Resend is integrated:
 *   import { resend } from "@/lib/resend";
 *   await resend.emails.send({ to: adminEmail, html: renderPayload(payload) });
 */

import { db } from "@/lib/db";
import { RecommendationRepository } from "@/lib/repositories";

// ── Types ─────────────────────────────────────────────────────────────────────

export type EmailSummaryPayload = {
  organizationId: string;
  orgName: string;
  adminEmail: string | null;
  period: "daily" | "weekly";
  generatedAt: Date;
  sections: EmailSection[];
};

export type EmailSection = {
  heading: string;
  body: string;
  severity: "info" | "success" | "warning" | "critical";
};

// ── Builder ───────────────────────────────────────────────────────────────────

async function buildSummary(
  organizationId: string,
  period: "daily" | "weekly",
): Promise<EmailSummaryPayload | null> {
  const org = await db.organization.findUnique({
    where: { id: organizationId },
    select: { id: true, name: true, adminEmail: true },
  });
  if (!org) return null;

  const since = new Date(
    Date.now() - (period === "daily" ? 24 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000),
  );

  // ── Gather data ───────────────────────────────────────────────
  const recentScans = await db.perceptionScan.findMany({
    where: { organizationId, status: "COMPLETE", createdAt: { gte: since } },
    orderBy: { createdAt: "desc" },
    include: {
      scanReport: {
        select: {
          accuracyScore: true,
          coverageScore: true,
          entityUnderstandingScore: true,
          consistencyScore: true,
        },
      },
      companyProfile: { select: { businessName: true } },
    },
    take: 10,
  });

  const openCount = await RecommendationRepository.countOpenByOrg(organizationId);

  const completedRecs = await db.recommendation.count({
    where: {
      status: "COMPLETED",
      completedAt: { gte: since },
      perceptionScan: { organizationId },
    },
  });

  const failedScans = await db.perceptionScan.count({
    where: { organizationId, status: "FAILED", createdAt: { gte: since } },
  });

  // ── Build sections ────────────────────────────────────────────
  const sections: EmailSection[] = [];
  const periodLabel = period === "daily" ? "today" : "this week";

  // Scans section
  if (recentScans.length > 0) {
    const names = recentScans.map((s) => s.companyProfile.businessName).join(", ");
    sections.push({
      heading: `${recentScans.length} scan${recentScans.length > 1 ? "s" : ""} completed ${periodLabel}`,
      body: `Visibility scans completed for: ${names}. Review the latest results to see operational changes.`,
      severity: "success",
    });
  } else {
    sections.push({
      heading: `No scans completed ${periodLabel}`,
      body:
        period === "weekly"
          ? "No visibility scans ran this week. Check your monitoring schedules to ensure automated scanning is active."
          : "No scans ran today.",
      severity: "info",
    });
  }

  // Failed scans
  if (failedScans > 0) {
    sections.push({
      heading: `${failedScans} scan${failedScans > 1 ? "s" : ""} failed ${periodLabel}`,
      body: "One or more scheduled scans failed to complete. Check your scan history for details. The scheduler will retry on the next cycle.",
      severity: "critical",
    });
  }

  // Recommendations section
  if (completedRecs > 0) {
    sections.push({
      heading: `${completedRecs} recommendation${completedRecs > 1 ? "s" : ""} resolved ${periodLabel}`,
      body: `Good progress — ${completedRecs} recommendation${completedRecs > 1 ? "s were" : " was"} marked complete. Keep actioning open items to improve your AI visibility score.`,
      severity: "success",
    });
  }

  if (openCount > 0) {
    sections.push({
      heading: `${openCount} open recommendation${openCount > 1 ? "s" : ""} require attention`,
      body: `You have ${openCount} unresolved recommendation${openCount > 1 ? "s" : ""}. Addressing high-priority items will improve your AI perception score.`,
      severity: openCount >= 5 ? "warning" : "info",
    });
  }

  // No activity at all
  if (sections.length === 1 && recentScans.length === 0 && openCount === 0) {
    sections.push({
      heading: "No operational activity",
      body: `No scans or recommendation changes ${periodLabel}. Run a visibility scan to refresh your AI perception data.`,
      severity: "info",
    });
  }

  return {
    organizationId,
    orgName: org.name,
    adminEmail: org.adminEmail,
    period,
    generatedAt: new Date(),
    sections,
  };
}

export const EmailSummaryService = {
  /**
   * Build a daily operational summary payload for an org.
   * Returns null if org not found.
   * Does NOT send email — wire up Resend when ready.
   */
  async buildDaily(organizationId: string): Promise<EmailSummaryPayload | null> {
    return buildSummary(organizationId, "daily");
  },

  /**
   * Build a weekly operational summary payload for an org.
   * Returns null if org not found.
   * Does NOT send email — wire up Resend when ready.
   */
  async buildWeekly(organizationId: string): Promise<EmailSummaryPayload | null> {
    return buildSummary(organizationId, "weekly");
  },
};
