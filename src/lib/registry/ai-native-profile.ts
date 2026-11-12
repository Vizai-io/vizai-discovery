/**
 * WP-21C-GH — AI-native profile generator (pure rendering).
 *
 * Renders the AI-native publication files for a company from its VERIFIED
 * Canon facts — `index.html` (with embedded schema.org JSON-LD) and
 * `llms.txt` — in the format of the hand-built Wills profile, but with
 * Canon-only content.
 *
 * SOURCE RULE (GR13/GR15): the input is a `CanonicalBusiness` built from
 * VERIFIED TruthClaim rows only (truthType=VERIFIED, verificationState
 * CONFIRMED|EDITED, status=VERIFIED, passing the GR15 evidence gate) via
 * `buildCanonicalBusinessFromClaims`. Nothing else enters these files:
 *   - No credential/certification appears unless it is a VERIFIED claim
 *     with verified evidence — the 3 OBSERVED Wills cert facts (SQF /
 *     Controlled Goods / Security Level B) are held by absence, never
 *     negated: there is no Certifications section at all when none verify.
 *   - No street address, postal code, or geo coordinates: no VERIFIED
 *     claim carries them, so they are omitted (the hand-built profile's
 *     HQ street address + geo are NOT reproduced).
 *   - No social profiles: no VERIFIED claim carries them, so they are
 *     omitted (LinkedIn/Facebook are NOT in the Canon claims).
 *
 * DERIVED FIELDS (from VERIFIED prose, never invented): the claim model has
 * no structured contact / founded-year / scale fields, so three values are
 * extracted from the VERIFIED description + differentiator text with strict
 * patterns, and omitted when the pattern does not match:
 *   - contact phone / toll-free / email — from the description's
 *     "Contact: <phone> (toll-free <phone>), <email>" tail;
 *   - founding year — from "founded in YYYY" (description) or
 *     "since YYYY" (differentiator);
 *   - HQ locality / region / role — from location strings of the form
 *     "<City>, <Province> (headquarters)".
 * Every extraction is reported in `meta.extractionNotes` so a reviewer can
 * see exactly what was derived and from where.
 *
 * PURE: no DB, no network, no Prisma import. Deterministic output for the
 * same input (lists are alphabetically sorted upstream; `generatedAt` is
 * caller-supplied).
 */

import type { CanonicalBusiness } from "../services/truth-export.service";

// ── slug / naming ────────────────────────────────────────────────────────────

/** Legal-name suffixes stripped to derive the trading (common) name. */
const LEGAL_SUFFIXES = [
  "limited",
  "ltd.",
  "ltd",
  "inc.",
  "inc",
  "corp.",
  "corp",
  "corporation",
  "llc",
  "l.l.c.",
  "llp",
  "co.",
  "co",
];

/**
 * Derive the trading/common name from a legal name by stripping a trailing
 * legal suffix ("Wills Transfer Limited" -> "Wills Transfer"). Returns the
 * input unchanged when there is no recognised suffix.
 */
export function deriveCommonName(legalName: string): string {
  const trimmed = legalName.trim();
  for (const suffix of LEGAL_SUFFIXES) {
    const re = new RegExp(`\\s+${suffix.replace(".", "\\.")}$`, "i");
    if (re.test(trimmed)) return trimmed.replace(re, "").trim();
  }
  return trimmed;
}

export function slugifyName(value: string): string {
  return (
    value
      .toLowerCase()
      .trim()
      .replace(/^https?:\/\//, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "item"
  );
}

// ── extraction from VERIFIED prose ───────────────────────────────────────────

const PROVINCE_CODES: Record<string, string> = {
  ontario: "ON",
  quebec: "QC",
  "british columbia": "BC",
  alberta: "AB",
  manitoba: "MB",
  saskatchewan: "SK",
  "nova scotia": "NS",
  "new brunswick": "NB",
  "prince edward island": "PE",
  "newfoundland and labrador": "NL",
  yukon: "YT",
  "northwest territories": "NT",
  nunavut: "NU",
};

export interface ParsedLocation {
  name: string;
  regionName: string | null;
  regionCode: string | null;
  role: "headquarters" | "facility" | null;
}

/**
 * Parse a Canon location string "<City>, <Province> [(headquarters)]".
 * Unparseable strings keep their raw text as the name (never dropped).
 */
export function parseLocation(raw: string): ParsedLocation {
  const text = raw.trim();
  const m = text.match(/^(.+?),\s*([A-Za-z][A-Za-z .'-]*?)(?:\s*\((headquarters)\))?$/);
  if (!m) return { name: text, regionName: null, regionCode: null, role: null };
  const regionName = m[2].trim();
  return {
    name: m[1].trim(),
    regionName,
    regionCode: PROVINCE_CODES[regionName.toLowerCase()] ?? null,
    role: m[3] ? "headquarters" : "facility",
  };
}

export interface ExtractedContact {
  phone: string | null;
  tollFree: string | null;
  email: string | null;
}

/**
 * Extract contact details from the VERIFIED description's "Contact:" tail.
 * Strict shape only — anything else yields nulls (omitted, never guessed).
 */
export function extractContact(description: string | null): ExtractedContact {
  const none = { phone: null, tollFree: null, email: null };
  if (!description) return none;
  const tail = description.match(/Contact:\s*(.+?)\s*$/i);
  if (!tail) return none;
  const segment = tail[1];
  const emailMatch = segment.match(/([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/);
  const email = emailMatch ? emailMatch[1] : null;
  const phoneMatch = segment.match(/(\+?1?[-.\s]?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4})/);
  const tollFreeMatch = segment.match(/toll-free\s+(\+?1?[-.\s]?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4})/i);
  const digits = (s: string | null): number => (s ?? "").replace(/\D/g, "").length;
  const phone = phoneMatch && digits(phoneMatch[1]) >= 10 ? phoneMatch[1].trim() : null;
  const tollFree =
    tollFreeMatch && digits(tollFreeMatch[1]) >= 10 ? tollFreeMatch[1].trim() : null;
  return { phone, tollFree, email };
}

/**
 * Extract the founding year from VERIFIED text: "founded in YYYY" in the
 * description, else "since YYYY" in a differentiator. Null when absent.
 */
export function extractFoundedYear(
  description: string | null,
  differentiators: string[],
): number | null {
  const fromDescription = description?.match(/founded in\s+((?:19|20)\d{2})/i);
  if (fromDescription) return Number(fromDescription[1]);
  for (const d of differentiators) {
    const since = d.match(/since\s+((?:19|20)\d{2})/i);
    if (since) return Number(since[1]);
  }
  return null;
}

// ── types ────────────────────────────────────────────────────────────────────

export interface AiNativeHeldClaim {
  name: string;
  reason: string;
}

export interface AiNativeProfileMeta {
  entitySlug: string;
  slugSource: "registry-profile" | "legal-suffix-strip" | "business-name" | "operator-override";
  legalName: string;
  commonName: string;
  canonVersion: number;
  canonVersionLabel: string;
  canonStatus: string;
  verificationStatus: string;
  verificationMethod: string;
  lastVerified: string | null;
  lastVerifiedSource: string | null;
  verifiedClaimCount: number;
  /** VERIFIED rows passing the GR15 evidence gate (set by the service). */
  usableClaimCount?: number;
  heldClaims: AiNativeHeldClaim[];
  registryConsentRecorded: boolean;
  generatedAt: string;
  extractionNotes: string[];
  omitted: string[];
}

export interface AiNativeProfileInput {
  business: CanonicalBusiness;
  entitySlug: string;
  slugSource: AiNativeProfileMeta["slugSource"];
  commonName: string;
  canonVersion: number;
  canonStatus: string;
  verificationStatus: string;
  verificationMethod: string;
  lastVerified: string | null;
  lastVerifiedSource: string | null;
  verifiedClaimCount: number;
  heldClaims: AiNativeHeldClaim[];
  registryConsentRecorded: boolean;
  generatedAt: string;
}

export interface AiNativeProfileResult {
  entitySlug: string;
  suggestedPaths: { indexHtml: string; llmsTxt: string };
  jsonLd: Record<string, unknown>;
  indexHtml: string;
  llmsTxt: string;
  meta: AiNativeProfileMeta;
}

// ── helpers ──────────────────────────────────────────────────────────────────

function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function metaDescription(description: string | null, businessType: string | null): string {
  const text = (description ?? businessType ?? "").trim();
  if (text.length <= 155) return text;
  const cut = text.slice(0, 155);
  const lastSpace = cut.lastIndexOf(" ");
  return `${cut.slice(0, lastSpace > 100 ? lastSpace : 155).trim()}…`;
}

function scaleDifferentiator(differentiators: string[]): string | null {
  return differentiators.find((d) => /facilit/i.test(d)) ?? null;
}

// ── JSON-LD ──────────────────────────────────────────────────────────────────

export function buildJsonLd(
  business: CanonicalBusiness,
  input: AiNativeProfileInput,
  contact: ExtractedContact,
  foundedYear: number | null,
  parsedLocations: ParsedLocation[],
): Record<string, unknown> {
  const website = business.website ?? undefined;
  const hq = parsedLocations.find((l) => l.role === "headquarters") ?? null;
  const scale = scaleDifferentiator(business.differentiators);

  const jsonLd: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    "@id": website ? `${website.replace(/\/$/, "")}/#business` : undefined,
    name: business.name,
    legalName: business.name,
    url: website,
    description: business.description ?? business.business_type ?? undefined,
  };
  if (contact.phone) jsonLd.telephone = contact.phone;
  if (contact.email) jsonLd.email = contact.email;
  if (foundedYear !== null) jsonLd.foundingDate = String(foundedYear);
  if (hq) {
    jsonLd.address = {
      "@type": "PostalAddress",
      addressLocality: hq.name,
      ...(hq.regionCode ? { addressRegion: hq.regionCode } : {}),
      addressCountry: "CA",
    };
  }
  if (parsedLocations.length > 0) {
    jsonLd.areaServed = parsedLocations.map((l) => ({ "@type": "Place", name: l.name }));
  }
  if (business.services.length > 0) {
    jsonLd.hasOfferCatalog = {
      "@type": "OfferCatalog",
      name: "Services",
      itemListElement: business.services.map((s) => ({
        "@type": "Offer",
        itemOffered: { "@type": "Service", name: s },
      })),
    };
  }
  const additional: Array<Record<string, unknown>> = [];
  if (scale) {
    additional.push({ "@type": "PropertyValue", name: "Facilities", value: scale });
  }
  if (additional.length > 0) jsonLd.additionalProperty = additional;

  // Drop undefined keys so the block contains only present facts.
  for (const key of Object.keys(jsonLd)) {
    if (jsonLd[key] === undefined) delete jsonLd[key];
  }
  return jsonLd;
}

// ── index.html ───────────────────────────────────────────────────────────────

export function renderIndexHtml(
  business: CanonicalBusiness,
  input: AiNativeProfileInput,
  jsonLd: Record<string, unknown>,
  contact: ExtractedContact,
  foundedYear: number | null,
  parsedLocations: ParsedLocation[],
): string {
  const website = business.website ?? "";
  const websiteHref = website.startsWith("http") ? website : `https://${website}`;
  const title = `${business.name} — AI-native business profile (VizAI verified)`;
  const desc = metaDescription(business.description, business.business_type);
  const hq = parsedLocations.find((l) => l.role === "headquarters") ?? null;
  const scale = scaleDifferentiator(business.differentiators);
  const jsonLdText = JSON.stringify(jsonLd, null, 2).replace(/</g, "\\u003c");
  const verificationLine =
    `Verified by VizAI. Canonical truth record: ${business.name} ` +
    `(Canon v${input.canonVersion}.0, ${input.verificationStatus}` +
    `${input.lastVerified ? `, last verified ${input.lastVerified}` : ""}). ` +
    `Registry entry: ${input.entitySlug}. ` +
    `Canon status: ${input.canonStatus}; registry listing consent: ` +
    `${input.registryConsentRecorded ? "recorded" : "not recorded"}. ` +
    `This page is a DRAFT for review — generated ${input.generatedAt}, not published. ` +
    `If any fact on this page differs from the business's own website, the website is authoritative — please report the discrepancy to VizAI so the record can be corrected.`;

  const identityRows: Array<[string, string]> = [["Legal name", business.name]];
  if (website) identityRows.push(["Website", website]);
  if (contact.phone) identityRows.push(["Phone", contact.phone]);
  if (contact.tollFree) identityRows.push(["Toll-free", contact.tollFree]);
  if (contact.email) identityRows.push(["Email", contact.email]);
  if (foundedYear !== null) identityRows.push(["Founded", String(foundedYear)]);
  if (business.business_type) identityRows.push(["Business type", business.business_type]);

  const lines: string[] = [
    "<!DOCTYPE html>",
    '<html lang="en">',
    "<head>",
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${esc(title)}</title>`,
    `<meta name="description" content="${esc(desc)}">`,
    ...(website ? [`<link rel="canonical" href="${esc(websiteHref)}">`] : []),
    '<script type="application/ld+json">',
    jsonLdText,
    "</script>",
    "</head>",
    "<body>",
    "<main>",
    `<h1>${esc(business.name)}</h1>`,
    ...(business.business_type ? [`<p><strong>${esc(business.business_type)}</strong></p>`] : []),
    ...(business.description
      ? [
          `<p>${esc(business.description)}</p>`,
          ...(website
            ? [
                `<p>Human-readable website: <a href="${esc(websiteHref)}">${esc(website.replace(/^https?:\/\//, ""))}</a>.</p>`,
              ]
            : []),
        ]
      : []),
    "",
    "<h2>Identity</h2>",
    "<dl>",
    ...identityRows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`),
    "</dl>",
    "",
  ];

  if (hq) {
    lines.push(
      "<h2>Head office</h2>",
      `<p>${esc([hq.name, hq.regionName, "Canada"].filter(Boolean).join(", "))}.</p>`,
      "",
    );
  }

  if (business.services.length > 0) {
    lines.push(
      "<h2>Services</h2>",
      "<ul>",
      ...business.services.map((s) => `<li>${esc(s)}</li>`),
      "</ul>",
      "",
    );
  }

  if (parsedLocations.length > 0 || scale) {
    lines.push("<h2>Coverage</h2>");
    if (scale) lines.push(`<p>${esc(scale)}.</p>`);
    if (parsedLocations.length > 0) {
      lines.push(
        "<ul>",
        ...parsedLocations.map(
          (l) =>
            `<li>${esc(l.name)}${l.regionName ? `, ${esc(l.regionName)}` : ""}${l.role === "headquarters" ? " (headquarters)" : ""}</li>`,
        ),
        "</ul>",
      );
    }
    lines.push("");
  }

  if (business.industries.length > 0) {
    lines.push(
      "<h2>Industries served</h2>",
      "<ul>",
      ...business.industries.map((i) => `<li>${esc(i)}</li>`),
      "</ul>",
      "",
    );
  }

  if (business.differentiators.length > 0) {
    lines.push(
      "<h2>What sets this business apart</h2>",
      "<ul>",
      ...business.differentiators.map((d) => `<li>${esc(d)}</li>`),
      "</ul>",
      "",
    );
  }

  if (business.customer_types.length > 0) {
    lines.push(
      "<h2>Customer types</h2>",
      "<ul>",
      ...business.customer_types.map((c) => `<li>${esc(c)}</li>`),
      "</ul>",
      "",
    );
  }

  // NOTE: no Certifications section — held claims are excluded by absence,
  // never turned into a negative claim (GR15 / DEC-027).
  lines.push("<h2>Verification</h2>", `<p>${esc(verificationLine)}</p>`, "</main>", "</body>", "</html>", "");
  return lines.join("\n");
}

// ── llms.txt ─────────────────────────────────────────────────────────────────

export function renderLlmsTxt(
  business: CanonicalBusiness,
  input: AiNativeProfileInput,
  contact: ExtractedContact,
  foundedYear: number | null,
  parsedLocations: ParsedLocation[],
): string {
  const website = business.website ?? "";
  const hq = parsedLocations.find((l) => l.role === "headquarters") ?? null;
  const scale = scaleDifferentiator(business.differentiators);
  const taglineParts: string[] = [];
  if (business.business_type) taglineParts.push(business.business_type);
  if (foundedYear !== null) taglineParts.push(`Founded ${foundedYear}`);
  const tagline = taglineParts.join(". ") + ".";

  const lines: string[] = [`# ${business.name}`, "", `> ${tagline}`, ""];
  lines.push("## Identity");
  lines.push(`- Legal name: ${business.name}`);
  if (website) lines.push(`- Website: ${website}`);
  if (contact.phone) lines.push(`- Phone: ${contact.phone}`);
  if (contact.tollFree) lines.push(`- Toll-free: ${contact.tollFree}`);
  if (contact.email) lines.push(`- Email: ${contact.email}`);
  if (hq) {
    lines.push(`- Head office: ${[hq.name, hq.regionName, "Canada"].filter(Boolean).join(", ")}`);
  }
  if (foundedYear !== null) lines.push(`- Founded: ${foundedYear}`);
  if (business.business_type) lines.push(`- Business type: ${business.business_type}`);
  lines.push("");

  if (business.services.length > 0) {
    lines.push("## Services", ...business.services.map((s) => `- ${s}`), "");
  }
  if (parsedLocations.length > 0 || scale) {
    lines.push("## Coverage");
    if (scale) lines.push(`- ${scale}`);
    for (const l of parsedLocations) {
      lines.push(
        `- ${l.name}${l.regionName ? `, ${l.regionName}` : ""}${l.role === "headquarters" ? " (headquarters)" : ""}`,
      );
    }
    lines.push("");
  }
  if (business.industries.length > 0) {
    lines.push("## Industries served", ...business.industries.map((i) => `- ${i}`), "");
  }
  if (business.differentiators.length > 0) {
    lines.push(
      "## What sets this business apart",
      ...business.differentiators.map((d) => `- ${d}`),
      "",
    );
  }
  if (business.customer_types.length > 0) {
    lines.push("## Customer types", ...business.customer_types.map((c) => `- ${c}`), "");
  }

  // NOTE: no Certifications section — held claims are excluded by absence.
  lines.push(
    "## Verification",
    `- Verified by VizAI. Canonical truth record: ${business.name} (Canon v${input.canonVersion}.0, ${input.verificationStatus}${input.lastVerified ? `, last verified ${input.lastVerified}` : ""}). Registry entry: ${input.entitySlug}.`,
    `- Canon status: ${input.canonStatus}; registry listing consent: ${input.registryConsentRecorded ? "recorded" : "not recorded"}.`,
    `- Source of truth: ${website || business.name}`,
    `- Generated ${input.generatedAt} — DRAFT for review, not published.`,
    "",
  );
  return lines.join("\n");
}

// ── entry point ──────────────────────────────────────────────────────────────

export function buildAiNativeProfile(input: AiNativeProfileInput): AiNativeProfileResult {
  const { business } = input;
  const contact = extractContact(business.description);
  const foundedYear = extractFoundedYear(business.description, business.differentiators);
  const parsedLocations = business.locations.map(parseLocation);

  const jsonLd = buildJsonLd(business, input, contact, foundedYear, parsedLocations);
  const indexHtml = renderIndexHtml(business, input, jsonLd, contact, foundedYear, parsedLocations);
  const llmsTxt = renderLlmsTxt(business, input, contact, foundedYear, parsedLocations);

  const extractionNotes: string[] = [];
  if (contact.phone || contact.tollFree || contact.email) {
    extractionNotes.push(
      "Contact phone/toll-free/email extracted from the VERIFIED description claim's 'Contact:' tail (no structured contact claim exists).",
    );
  }
  if (foundedYear !== null) {
    extractionNotes.push(
      `Founding year ${foundedYear} extracted from VERIFIED text ("founded in ${foundedYear}" in the description or "since ${foundedYear}" in a differentiator).`,
    );
  }
  if (parsedLocations.some((l) => l.role === "headquarters")) {
    extractionNotes.push(
      "Head-office locality/region/role parsed from the VERIFIED location string '<City>, <Province> (headquarters)'. No street address, postal code, or geo coordinates exist in the Canon — all omitted.",
    );
  }

  const omitted = [
    "Certifications / credentials (SQF, Controlled Goods, Security Level B): OBSERVED facts only, no verified evidence — held from public output (GR15). No Certifications section is rendered.",
    "Social profiles (LinkedIn, Facebook): no VERIFIED claim carries them — omitted.",
    "HQ street address, postal code, geo coordinates: no VERIFIED claim carries them — omitted.",
    "Square-footage specifics beyond the Canon scale differentiator (7 facilities / 1,000,000+ sq ft): omitted.",
    "Service-area claims beyond the Canon locations (Toronto / Montreal / North America / U.S. Eastern Seaboard): omitted.",
  ];

  return {
    entitySlug: input.entitySlug,
    suggestedPaths: {
      indexHtml: `docs/profiles/${input.entitySlug}/index.html`,
      llmsTxt: `docs/profiles/${input.entitySlug}/llms.txt`,
    },
    jsonLd,
    indexHtml,
    llmsTxt,
    meta: {
      entitySlug: input.entitySlug,
      slugSource: input.slugSource,
      legalName: business.name,
      commonName: input.commonName,
      canonVersion: input.canonVersion,
      canonVersionLabel: `${input.canonVersion}.0`,
      canonStatus: input.canonStatus,
      verificationStatus: input.verificationStatus,
      verificationMethod: input.verificationMethod,
      lastVerified: input.lastVerified,
      lastVerifiedSource: input.lastVerifiedSource,
      verifiedClaimCount: input.verifiedClaimCount,
      heldClaims: input.heldClaims,
      registryConsentRecorded: input.registryConsentRecorded,
      generatedAt: input.generatedAt,
      extractionNotes,
      omitted,
    },
  };
}
