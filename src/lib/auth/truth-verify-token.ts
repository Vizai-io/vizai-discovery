/**
 * WP-21C â€” scoped per-profile customer verification tokens.
 *
 * A worksheet link carries a signed token that grants verification rights
 * for exactly ONE company profile â€” no platform login required. The token
 * is stateless (HMAC-SHA256, no DB lookup) and expires.
 *
 * Token format: base64url(JSON payload) "." base64url(HMAC-SHA256(payload))
 * Payload: { v: 1, companyProfileId, organizationId, purpose: "truth-verify",
 *   exp (epoch ms), iat (epoch ms) }
 *
 * Secret: TRUTH_VERIFY_TOKEN_SECRET in .env.local (gitignored). Never commit
 * it, never log it, never put a live token in a committed file.
 */

import crypto from "node:crypto";

export const TRUTH_VERIFY_PURPOSE = "truth-verify" as const;
export const TRUTH_VERIFY_DEFAULT_EXPIRY_DAYS = 14;
export const TRUTH_VERIFY_MAX_EXPIRY_DAYS = 30;

export interface TruthVerifyTokenPayload {
  v: 1;
  companyProfileId: string;
  organizationId: string;
  purpose: typeof TRUTH_VERIFY_PURPOSE;
  exp: number; // epoch ms
  iat: number; // epoch ms
}

function getSecret(): string {
  const secret = process.env.TRUTH_VERIFY_TOKEN_SECRET;
  if (!secret || secret.trim().length === 0) {
    throw new Error("TRUTH_VERIFY_TOKEN_SECRET is not configured");
  }
  return secret;
}

function b64urlEncode(buf: Buffer): string {
  return buf.toString("base64url");
}

function b64urlDecode(value: string): Buffer {
  return Buffer.from(value, "base64url");
}

/**
 * Mint a verification token scoped to one company profile.
 * `expiresInDays` is clamped to 1..TRUTH_VERIFY_MAX_EXPIRY_DAYS.
 */
export function createTruthVerifyToken(
  companyProfileId: string,
  organizationId: string,
  expiresInDays: number = TRUTH_VERIFY_DEFAULT_EXPIRY_DAYS,
): string {
  if (!companyProfileId || !organizationId) {
    throw new Error("companyProfileId and organizationId are required");
  }
  const days = Math.min(
    Math.max(Math.floor(expiresInDays) || TRUTH_VERIFY_DEFAULT_EXPIRY_DAYS, 1),
    TRUTH_VERIFY_MAX_EXPIRY_DAYS,
  );
  const now = Date.now();
  const payload: TruthVerifyTokenPayload = {
    v: 1,
    companyProfileId,
    organizationId,
    purpose: TRUTH_VERIFY_PURPOSE,
    exp: now + days * 24 * 60 * 60 * 1000,
    iat: now,
  };
  const payloadB64 = b64urlEncode(Buffer.from(JSON.stringify(payload), "utf8"));
  const sig = crypto.createHmac("sha256", getSecret()).update(payloadB64).digest();
  return `${payloadB64}.${b64urlEncode(sig)}`;
}

/**
 * Verify a token. Returns the payload on success, or null for ANY failure
 * (bad signature, wrong purpose, expired, malformed) â€” callers must not
 * leak which failure occurred.
 */
export function verifyTruthVerifyToken(
  token: string | null | undefined,
): TruthVerifyTokenPayload | null {
  try {
    if (!token || typeof token !== "string") return null;
    const parts = token.split(".");
    if (parts.length !== 2) return null;
    const [payloadB64, sigB64] = parts;
    if (!payloadB64 || !sigB64) return null;

    const expected = crypto.createHmac("sha256", getSecret()).update(payloadB64).digest();
    const provided = b64urlDecode(sigB64);
    if (provided.length !== expected.length) return null;
    if (!crypto.timingSafeEqual(provided, expected)) return null;

    const payload = JSON.parse(b64urlDecode(payloadB64).toString("utf8")) as TruthVerifyTokenPayload;
    if (payload.v !== 1) return null;
    if (payload.purpose !== TRUTH_VERIFY_PURPOSE) return null;
    if (typeof payload.companyProfileId !== "string" || !payload.companyProfileId) return null;
    if (typeof payload.organizationId !== "string" || !payload.organizationId) return null;
    if (typeof payload.exp !== "number" || payload.exp <= Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}
