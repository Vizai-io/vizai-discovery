/**
 * @fileOverview Passive external web-security posture scanner (serverless).
 *
 * Non-intrusive: reads what a domain already exposes — security headers, cookie
 * flags, DNS email-authentication (SPF/DMARC), and a small set of well-known
 * sensitive paths. NO payloads, NO active exploitation. This is a posture
 * assessment, NOT a penetration test, and must be described that way to anyone
 * who receives the results.
 *
 * Serverless notes: uses `fetch` for HTTP checks and DNS-over-HTTPS for TXT
 * records (no raw sockets / subprocesses on Vercel). Deep TLS certificate
 * inspection is intentionally omitted here (not available on serverless) — a
 * separate check from clean infrastructure is recommended for that.
 *
 * Authorization is the caller's responsibility: only scan domains the tenant
 * owns. The API route enforces this by scanning the org's own CompanyProfile
 * website, never an arbitrary host.
 */

export type Severity = "critical" | "high" | "medium" | "low" | "info";

export interface Finding {
  severity: Severity;
  title: string;
  detail: string;
}

export interface WebScanResult {
  domain: string;
  finalUrl: string | null;
  grade: "A" | "B" | "C" | "D" | "F";
  counts: Partial<Record<Severity, number>>;
  findings: Finding[];
  scannedAt: string;
  scope: string;
  error?: string;
}

const SEV_RANK: Record<Severity, number> = {
  critical: 0, high: 1, medium: 2, low: 3, info: 4,
};

const USER_AGENT = "Mozilla/5.0 (VizAi-SecurityScan; authorized posture scan)";
const HTTP_TIMEOUT_MS = 8000;

// well-known sensitive paths (GET only) → severity if publicly readable (200)
const SENSITIVE_PATHS: Record<string, Severity> = {
  "/.git/config": "critical",
  "/.git/HEAD": "critical",
  "/.env": "critical",
  "/.env.production": "critical",
  "/backup.zip": "high",
  "/config.json": "medium",
  "/server-status": "medium",
  "/.DS_Store": "low",
};

function finding(severity: Severity, title: string, detail: string): Finding {
  return { severity, title, detail };
}

async function fetchSafe(url: string, redirect: RequestRedirect): Promise<Response | null> {
  try {
    return await fetch(url, {
      redirect,
      signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
      headers: { "user-agent": USER_AGENT },
    });
  } catch {
    return null;
  }
}

// ── Analyzers ───────────────────────────────────────────────────────────────

export function analyzeHeaders(headers: Headers): Finding[] {
  const out: Finding[] = [];
  const has = (k: string) => headers.get(k) !== null;

  if (!has("content-security-policy")) {
    out.push(finding("high", "No Content-Security-Policy",
      "The primary browser defense against script injection (XSS) and clickjacking is absent."));
  }
  if (!has("strict-transport-security")) {
    out.push(finding("high", "No HSTS",
      "Browsers can be downgraded to HTTP (man-in-the-middle risk)."));
  }
  if (!has("x-content-type-options")) {
    out.push(finding("low", "No X-Content-Type-Options: nosniff",
      "MIME-sniffing not disabled — minor content-type confusion risk."));
  }
  if (!has("referrer-policy")) {
    out.push(finding("low", "No Referrer-Policy",
      "Referrer data may leak to third parties on outbound links."));
  }
  if (!has("permissions-policy")) {
    out.push(finding("info", "No Permissions-Policy",
      "Browser features (camera, geolocation…) not explicitly restricted."));
  }
  const csp = headers.get("content-security-policy") ?? "";
  if (!has("x-frame-options") && !csp.includes("frame-ancestors")) {
    out.push(finding("medium", "No clickjacking protection",
      "Neither X-Frame-Options nor CSP frame-ancestors is set."));
  }
  const server = headers.get("server") ?? "";
  if (server && /\d/.test(server)) {
    out.push(finding("low", `Server version disclosed: ${server}`,
      "Version strings help attackers match known CVEs; suppress if possible."));
  }
  const poweredBy = headers.get("x-powered-by");
  if (poweredBy) {
    out.push(finding("low", `X-Powered-By disclosed: ${poweredBy}`,
      "Framework fingerprinting aid; remove if possible."));
  }
  return out;
}

export function analyzeCookies(headers: Headers): Finding[] {
  const out: Finding[] = [];
  // getSetCookie() is available on undici/Node 20+; guard defensively.
  const getSetCookie = (headers as unknown as { getSetCookie?: () => string[] }).getSetCookie;
  const cookies = typeof getSetCookie === "function" ? getSetCookie.call(headers) : [];
  for (const raw of cookies) {
    const lower = raw.toLowerCase();
    const name = raw.split("=", 1)[0]?.trim() || "cookie";
    const missing: string[] = [];
    if (!lower.includes("secure")) missing.push("Secure");
    if (!lower.includes("httponly")) missing.push("HttpOnly");
    if (!lower.includes("samesite")) missing.push("SameSite");
    if (missing.length) {
      out.push(finding("medium", `Cookie '${name}' missing: ${missing.join(", ")}`,
        "Cookies without these flags are exposed to theft (XSS) or CSRF."));
    }
  }
  return out;
}

/** DNS-over-HTTPS TXT lookup (Google resolver). Returns concatenated TXT records. */
async function dohTxt(name: string): Promise<string> {
  const res = await fetchSafe(
    `https://dns.google/resolve?name=${encodeURIComponent(name)}&type=TXT`, "follow");
  if (!res || !res.ok) return "";
  try {
    const data = (await res.json()) as { Answer?: Array<{ data?: string }> };
    return (data.Answer ?? [])
      .map((a) => (a.data ?? "").replace(/^"|"$/g, "").replace(/""/g, ""))
      .join(" ");
  } catch {
    return "";
  }
}

export function analyzeEmailAuth(spfTxt: string, dmarcTxt: string): Finding[] {
  const out: Finding[] = [];
  if (!spfTxt.includes("v=spf1")) {
    out.push(finding("medium", "No SPF record",
      "The domain is spoofable in email (no v=spf1 TXT record)."));
  }
  if (!dmarcTxt.includes("v=DMARC1")) {
    out.push(finding("medium", "No DMARC record",
      "No DMARC policy — email spoofing/phishing is harder to block."));
  } else if (/p\s*=\s*none/.test(dmarcTxt)) {
    out.push(finding("medium", "DMARC is monitoring-only (p=none)",
      "DMARC exists but does not enforce — spoofed mail is still delivered. " +
      "Move to p=quarantine, then p=reject."));
  }
  return out;
}

export function grade(findings: Finding[]): WebScanResult["grade"] {
  const n = (s: Severity) => findings.filter((f) => f.severity === s).length;
  if (n("critical") > 0) return "F";
  if (n("high") >= 2) return "D";
  if (n("high") === 1) return "C";
  if (n("medium") > 0) return "B";
  return "A";
}

// ── Orchestrator ──────────────────────────────────────────────────────────────

export async function scanWebsite(rawDomain: string): Promise<WebScanResult> {
  const domain = rawDomain.trim().toLowerCase()
    .replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  const scope = "passive external posture assessment — not a penetration test";
  const scannedAt = new Date().toISOString();

  const home = await fetchSafe(`https://${domain}`, "follow");
  if (!home) {
    const findings = [finding("high", "Site unreachable over HTTPS",
      "The scanner could not complete an HTTPS request to this domain.")];
    return { domain, finalUrl: null, grade: "F", counts: { high: 1 }, findings, scannedAt, scope,
      error: "unreachable over HTTPS" };
  }

  const findings: Finding[] = [
    ...analyzeHeaders(home.headers),
    ...analyzeCookies(home.headers),
  ];

  // exposed sensitive paths (parallel, GET, no redirect-following)
  const pathResults = await Promise.all(
    Object.entries(SENSITIVE_PATHS).map(async ([path, sev]) => {
      const res = await fetchSafe(`https://${domain}${path}`, "manual");
      return res && res.status === 200 ? finding(sev,
        `Exposed sensitive path: ${path} (HTTP 200)`,
        `${path} is publicly readable — potential source/secret/info disclosure.`) : null;
    }));
  for (const f of pathResults) if (f) findings.push(f);

  // email authentication (DoH)
  const [spf, dmarc] = await Promise.all([dohTxt(domain), dohTxt(`_dmarc.${domain}`)]);
  findings.push(...analyzeEmailAuth(spf, dmarc));

  findings.push(finding("info", "TLS certificate not inspected by this scan",
    "Deep certificate validation isn't available in this environment; verify hostname, " +
    "chain, and expiry separately if needed."));

  findings.sort((a, b) => SEV_RANK[a.severity] - SEV_RANK[b.severity]);
  const counts: Partial<Record<Severity, number>> = {};
  for (const f of findings) counts[f.severity] = (counts[f.severity] ?? 0) + 1;

  return { domain, finalUrl: home.url, grade: grade(findings), counts, findings, scannedAt, scope };
}
