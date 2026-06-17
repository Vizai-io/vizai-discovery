/**
 * WP-19D — Canon -> clean entity-profile-v1.0 mapper (TS port of the WP-19B mapper).
 *
 * Builds the public artifact STRICTLY FROM AN ALLOWLIST of public fields, so private
 * Canon data cannot leak by construction. Routes VERIFIED TruthClaims by category to
 * the public profile body; applies the evidence gate to credentials (DEC-027).
 *
 * Pure: no DB, no network, no Prisma import.
 */

import type {
  AppShapedCanon,
  CanonClaim,
  EntityProfile,
  ExcludedClaim,
} from "./types";

const CATEGORY_ENUM = new Set([
  "technology", "professional-services", "financial", "healthcare", "manufacturing",
  "retail", "construction", "hospitality", "transportation", "logistics",
  "education", "real-estate", "other",
]);

const PROFILE_SCALAR_KEYS = ["businessType", "country", "yearFounded", "ownership"] as const;
const SCALE_KEYS = ["facilityCount", "totalSquareFeet", "locationCount", "region"];
const LOCATION_KEYS = ["name", "region", "role"];
const CONTACT_KEYS = ["phone", "tollFree", "email", "website"];
const PROFILE_LINK_KEYS = ["linkedin", "facebook", "twitter", "crunchbase", "bbb"];
const CREDENTIAL_COPY_KEYS = ["credentialType", "issuingBody", "issueDate", "expiryOrRenewalDate"] as const;

function pick(value: unknown, keys: string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const obj = value as Record<string, unknown>;
    for (const k of keys) {
      if (k in obj) out[k] = obj[k];
    }
  }
  return out;
}

function routeClaim(profile: Record<string, unknown>, claim: CanonClaim): void {
  const v = claim.value;
  switch (claim.category) {
    case "identity": {
      if (v && typeof v === "object" && !Array.isArray(v)) {
        const obj = v as Record<string, unknown>;
        for (const k of PROFILE_SCALAR_KEYS) {
          if (k in obj) profile[k] = obj[k];
        }
      }
      break;
    }
    case "scale":
      profile.scale = pick(v, SCALE_KEYS);
      break;
    case "locations":
      if (Array.isArray(v)) profile.locations = v.map((loc) => pick(loc, LOCATION_KEYS));
      break;
    case "services":
      if (Array.isArray(v)) profile.services = [...(v as string[])];
      break;
    case "industries":
      if (Array.isArray(v)) profile.industriesServed = [...(v as string[])];
      break;
    case "claims":
      if (Array.isArray(v)) profile.claims = [...(v as string[])];
      break;
    case "contact":
      profile.contact = pick(v, CONTACT_KEYS);
      break;
    case "profiles":
      profile.profiles = pick(v, PROFILE_LINK_KEYS);
      break;
    default:
      // unknown category -> not in the allowlist -> not published
      break;
  }
}

export interface MapOptions {
  /** Integer public profileVersion (DEC-030 gate 4: TruthPublishRecord.version). Omitted when undefined. */
  profileVersion?: number;
}

export function mapCanonToProfile(
  canon: AppShapedCanon,
  opts: MapOptions = {},
): { artifact: EntityProfile; excluded: ExcludedClaim[] } {
  // identity
  const businessIdentifier: EntityProfile["businessIdentifier"] = {
    legalName: canon.entity.legalName,
    commonName: canon.entity.commonName,
    primaryDomain: canon.entity.primaryDomain,
  };
  if (canon.entity.aliases && canon.entity.aliases.length > 0) {
    businessIdentifier.aliases = [...canon.entity.aliases];
  }

  // category (closed enum)
  const category = CATEGORY_ENUM.has(canon.category) ? canon.category : "other";

  // verification (canonVersion required for claimed_verified; Int -> "X.0")
  const verification: EntityProfile["verification"] = {
    status: canon.verification.status,
    method: canon.verification.method,
    lastVerified: canon.verification.lastVerified,
  };
  if (canon.verification.tier) verification.tier = canon.verification.tier;
  verification.canonVersion = `${canon.version}.0`;
  if (canon.verification.customerApprovalDate) {
    verification.customerApprovalDate = canon.verification.customerApprovalDate;
  }

  // public profile body — only VERIFIED claims, routed by category (allowlist)
  const profile: Record<string, unknown> = {};
  for (const claim of canon.claims) {
    if (claim.status !== "VERIFIED") continue;
    routeClaim(profile, claim);
  }

  // credentials — EVIDENCE GATE (DEC-027): VERIFIED + >=1 STRONG evidence link crosses; else held
  const credentials: Array<Record<string, unknown>> = [];
  const excluded: ExcludedClaim[] = [];
  for (const c of canon.credentialClaims) {
    const hasStrong = c.evidence.some((e) => e.supportLevel === "STRONG");
    const publishable = c.status === "VERIFIED" && hasStrong;
    if (publishable) {
      const item: Record<string, unknown> = {
        name: c.name,
        evidenceStatus: "evidence_verified",
        publicPublishAllowed: true,
      };
      for (const k of CREDENTIAL_COPY_KEYS) {
        if (c[k]) item[k] = c[k];
      }
      credentials.push(item);
    } else {
      excluded.push({
        name: c.name,
        credentialType: c.credentialType,
        status: c.status,
        reason:
          "not VERIFIED with STRONG evidence (DEC-027) — held; excluded by absence, recorded for the private Needs-Evidence list. Not a negative claim.",
      });
    }
  }

  // assemble — omit empty optionals so the artifact matches the published shape
  const artifact: EntityProfile = {
    schemaVersion: "1.0",
    entitySlug: canon.entity.slug,
    businessIdentifier,
    category,
    verification,
    metadata: {
      dateAdded: canon.metadata.dateAdded,
      lastUpdated: canon.metadata.lastUpdated,
    },
  };
  if (Object.keys(profile).length > 0) artifact.profile = profile;
  if (credentials.length > 0) artifact.credentials = credentials;
  // profileVersion is an INTEGER (DEC-030 gate 4). Omitted unless explicitly supplied,
  // so the Wills fixture reproduces the live published profile (which carries none).
  if (typeof opts.profileVersion === "number") artifact.profileVersion = opts.profileVersion;

  return { artifact, excluded };
}
