/**
 * @fileOverview POST /api/security-scan — Security & Trust web posture scan.
 *
 * Runs a passive external scan (security headers, cookies, DNS email-auth,
 * exposed paths) of the authenticated org's OWN registered website, then asks
 * an LLM to narrate the findings in plain English. Non-intrusive — no payloads,
 * no exploitation; a posture assessment, NOT a penetration test.
 *
 * Authorization model: a caller can only scan a CompanyProfile that belongs to
 * their own organization (looked up server-side by organizationId), so this is
 * never an open "scan any host" endpoint. All DB access is server-side Prisma
 * (ADR 0002). Nothing is persisted — results are computed on demand.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getAuthContext } from "@/lib/auth/get-auth-context";
import { scanWebsite } from "@/lib/services/security-scan/scanner";
import { narrateScan } from "@/lib/services/security-scan/report";
import {
  OperationalEventService, EVENT_TYPES, EVENT_SOURCES, SEVERITIES,
} from "@/lib/services/operational-event-service";

const BodySchema = z.object({
  companyProfileId: z.string().min(1).optional(),
});

export async function POST(req: NextRequest) {
  const traceId = crypto.randomUUID();

  // ── Auth ──────────────────────────────────────────────────────────────────
  const auth = await getAuthContext();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized", traceId }, { status: 401 });
  }
  if (auth.organizationId === "unassigned" || auth.organizationId === "free-scan") {
    return NextResponse.json(
      { error: "Complete onboarding before running a security scan.", traceId },
      { status: 403 },
    );
  }

  // ── Input (optional — defaults to the org's registered site) ───────────────
  let body: unknown = {};
  try {
    const text = await req.text();
    if (text) body = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: "Invalid JSON body", traceId }, { status: 400 });
  }
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten(), traceId },
      { status: 422 },
    );
  }

  // ── Resolve the org's own CompanyProfile (org-scoped authorization) ────────
  const profile = await db.companyProfile.findFirst({
    where: parsed.data.companyProfileId
      ? { id: parsed.data.companyProfileId, organizationId: auth.organizationId }
      : { organizationId: auth.organizationId, websiteUrl: { not: null } },
    select: { id: true, businessName: true, websiteUrl: true },
  });

  if (!profile) {
    return NextResponse.json(
      { error: "No company profile found for your organization.", traceId },
      { status: 404 },
    );
  }
  if (!profile.websiteUrl) {
    return NextResponse.json(
      { error: "Add a website to your company profile before scanning.", traceId },
      { status: 400 },
    );
  }

  void OperationalEventService.emit({
    eventType: EVENT_TYPES.SECURITY_SCAN_STARTED,
    severity: SEVERITIES.INFO,
    source: EVENT_SOURCES.SECURITY_SCAN_API,
    traceId,
    organizationId: auth.organizationId,
    userId: auth.uid,
    entityType: "companyProfile",
    entityId: profile.id,
    message: `Security scan started for ${profile.businessName} (${profile.websiteUrl})`,
  });

  // ── Scan + narrate ─────────────────────────────────────────────────────────
  try {
    const scan = await scanWebsite(profile.websiteUrl);
    const report = await narrateScan(scan);

    void OperationalEventService.emit({
      eventType: EVENT_TYPES.SECURITY_SCAN_COMPLETED,
      severity: SEVERITIES.INFO,
      source: EVENT_SOURCES.SECURITY_SCAN_API,
      traceId,
      organizationId: auth.organizationId,
      userId: auth.uid,
      entityType: "companyProfile",
      entityId: profile.id,
      message: `Security scan completed for ${profile.businessName} — grade ${scan.grade}, ${scan.findings.length} findings`,
      metadata: { grade: scan.grade, findingCount: scan.findings.length, domain: scan.domain },
    });

    return NextResponse.json({ scan, report, traceId }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[security-scan] Scan failed", { traceId, profileId: profile.id, error: message });
    void OperationalEventService.emit({
      eventType: EVENT_TYPES.SECURITY_SCAN_FAILED,
      severity: SEVERITIES.ERROR,
      source: EVENT_SOURCES.SECURITY_SCAN_API,
      traceId,
      organizationId: auth.organizationId,
      userId: auth.uid,
      entityType: "companyProfile",
      entityId: profile.id,
      message: `Security scan failed for ${profile.businessName}: ${message}`,
    });
    return NextResponse.json(
      { error: "Security scan failed. Please try again.", traceId },
      { status: 500 },
    );
  }
}
