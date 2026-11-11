/**
 * @fileOverview POST /api/scan/customer-intent
 *
 * Query-based free scan: runs the prompts a real customer would use
 * (transactional, comparative, price, troubleshooting, direct) against a
 * web-grounded model (Gemini with Google Search grounding) and returns an
 * honest Found / Recommended / Accurate score.
 *
 * This is the free-scan diagnostic. It creates NO canonical truth document.
 * The truth file is set up only after signup. Re-running this scan is the
 * drift measurement (baseline vs now).
 *
 * Public route. The website is validated (social/marketplace URLs rejected).
 * Simple per-IP rate limit (5/min) because each scan calls a paid API.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { validateBusinessWebsite } from "@/lib/validation/website";
import { runCustomerIntentScan } from "@/lib/services/perception/customer-intent-scan";

const BodySchema = z.object({
  businessName: z.string().min(2).max(200),
  website: z.string().url(),
  industry: z.string().max(100).optional(),
  services: z.array(z.string().min(1).max(100)).max(20).optional(),
  location: z.string().max(100).optional(),
});

// Simple in-memory per-IP rate limit (5 scans / minute).
const hits = new Map<string, number[]>();
function rateLimited(ip: string): boolean {
  const now = Date.now();
  const windowStart = now - 60_000;
  const list = (hits.get(ip) || []).filter((t) => t > windowStart);
  if (list.length >= 5) return true;
  list.push(now);
  hits.set(ip, list);
  return false;
}

export async function POST(request: NextRequest) {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (rateLimited(ip)) {
    return NextResponse.json(
      { error: "Too many scans. Please wait a minute and try again." },
      { status: 429 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request.", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { businessName, website, industry, services, location } = parsed.data;

  // Reject social / marketplace / directory URLs — a business website is required.
  const websiteCheck = validateBusinessWebsite(website);
  if (!websiteCheck.valid) {
    return NextResponse.json(
      { error: websiteCheck.reason ?? "Please enter your business website address." },
      { status: 422 },
    );
  }

  try {
    const result = await runCustomerIntentScan({
      businessName,
      websiteUrl: website,
      industry,
      services,
      location,
    });
    return NextResponse.json({ ok: true, scan: result });
  } catch (err: any) {
    console.error("[api/scan/customer-intent] Failed:", err);
    return NextResponse.json(
      { error: err?.message || "Scan failed." },
      { status: 500 },
    );
  }
}
