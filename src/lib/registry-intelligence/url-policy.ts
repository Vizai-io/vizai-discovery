import { lookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";
import { sha256 } from "./canonical-json";

export type IpFamily = 4 | 6;
export interface ResolvedAddress { address: string; family: IpFamily }
export type HostResolver = (hostname: string) => Promise<ResolvedAddress[]>;

export class UrlPolicyError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "UrlPolicyError";
  }
}

const blockedIpv4 = new BlockList();
const blockedIpv6 = new BlockList();
const blockedV4: Array<[string, number]> = [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10],
  ["127.0.0.0", 8], ["169.254.0.0", 16], ["172.16.0.0", 12],
  ["192.0.0.0", 24], ["192.0.2.0", 24], ["192.168.0.0", 16],
  ["198.18.0.0", 15], ["198.51.100.0", 24], ["203.0.113.0", 24],
  ["224.0.0.0", 4], ["240.0.0.0", 4],
];
const blockedV6: Array<[string, number]> = [
  ["::", 128], ["::1", 128], ["::", 96], ["::ffff:0:0", 96],
  ["fc00::", 7], ["fe80::", 10], ["ff00::", 8], ["2001:db8::", 32],
];
for (const [network, prefix] of blockedV4) blockedIpv4.addSubnet(network, prefix, "ipv4");
for (const [network, prefix] of blockedV6) blockedIpv6.addSubnet(network, prefix, "ipv6");

const RESERVED_HOST_SUFFIXES = [
  ".localhost", ".local", ".internal", ".home", ".lan", ".test", ".invalid",
];

function stripIpv6Brackets(hostname: string): string {
  return hostname.startsWith("[") && hostname.endsWith("]")
    ? hostname.slice(1, -1)
    : hostname;
}

export function isPublicAddress(address: string, family?: IpFamily): boolean {
  const detected = isIP(address);
  const actualFamily = family ?? (detected === 4 ? 4 : detected === 6 ? 6 : undefined);
  if (!actualFamily) return false;
  return actualFamily === 4
    ? !blockedIpv4.check(address, "ipv4")
    : !blockedIpv6.check(address, "ipv6");
}

export function normalizeHostname(hostname: string): string {
  return stripIpv6Brackets(hostname).toLowerCase().replace(/\.$/, "");
}

export function normalizeUrl(input: string): string {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new UrlPolicyError("INVALID_URL", "URL is not syntactically valid.");
  }

  url.hash = "";
  url.hostname = normalizeHostname(url.hostname);
  if ((url.protocol === "https:" && url.port === "443") || (url.protocol === "http:" && url.port === "80")) {
    url.port = "";
  }
  if (!url.pathname) url.pathname = "/";
  return url.toString();
}

export interface UrlPolicy {
  allowedDomains: string[];
  allowHttp?: boolean;
  allowSubdomains?: boolean;
  allowedPorts?: number[];
}

export interface ValidatedUrl {
  url: URL;
  normalizedUrl: string;
  urlHash: string;
  hostname: string;
}

export function validateUrlStructure(input: string, policy: UrlPolicy): ValidatedUrl {
  const normalizedUrl = normalizeUrl(input);
  const url = new URL(normalizedUrl);

  if (url.protocol !== "https:" && !(policy.allowHttp && url.protocol === "http:")) {
    throw new UrlPolicyError("SCHEME_BLOCKED", "Only HTTPS URLs are permitted by this crawl policy.");
  }
  if (url.username || url.password) {
    throw new UrlPolicyError("CREDENTIALS_BLOCKED", "URLs containing embedded credentials are not permitted.");
  }

  const hostname = normalizeHostname(url.hostname);
  if (!hostname || hostname.length > 253) {
    throw new UrlPolicyError("HOST_BLOCKED", "URL hostname is missing or invalid.");
  }
  if (hostname === "localhost" || RESERVED_HOST_SUFFIXES.some((suffix) => hostname.endsWith(suffix))) {
    throw new UrlPolicyError("RESERVED_HOST", "Reserved and local hostnames are not permitted.");
  }
  if (!isIP(hostname) && !hostname.includes(".")) {
    throw new UrlPolicyError("SINGLE_LABEL_HOST", "Single-label hostnames are not permitted.");
  }

  const allowedDomains = policy.allowedDomains.map(normalizeHostname);
  const inScope = allowedDomains.some((allowed) =>
    hostname === allowed || (policy.allowSubdomains === true && hostname.endsWith(`.${allowed}`)),
  );
  if (!inScope) {
    throw new UrlPolicyError("DOMAIN_OUT_OF_SCOPE", `Hostname ${hostname} is outside the approved crawl scope.`);
  }

  const port = Number(url.port || (url.protocol === "https:" ? 443 : 80));
  const allowedPorts = policy.allowedPorts ?? (policy.allowHttp ? [80, 443] : [443]);
  if (!allowedPorts.includes(port)) {
    throw new UrlPolicyError("PORT_BLOCKED", `Port ${port} is not permitted by this crawl policy.`);
  }

  if (isIP(hostname) && !isPublicAddress(hostname)) {
    throw new UrlPolicyError("PRIVATE_ADDRESS", "Private, reserved, and non-routable addresses are not permitted.");
  }

  return { url, normalizedUrl, urlHash: sha256(normalizedUrl), hostname };
}

export const defaultHostResolver: HostResolver = async (hostname) => {
  const rows = await lookup(hostname, { all: true, verbatim: true });
  return rows.map((row) => ({ address: row.address, family: row.family as IpFamily }));
};

export async function validateAndResolveUrl(
  input: string,
  policy: UrlPolicy,
  resolver: HostResolver = defaultHostResolver,
): Promise<ValidatedUrl & { addresses: ResolvedAddress[] }> {
  const validated = validateUrlStructure(input, policy);
  if (isIP(validated.hostname)) {
    const family = isIP(validated.hostname) as IpFamily;
    return { ...validated, addresses: [{ address: validated.hostname, family }] };
  }

  const addresses = await resolver(validated.hostname);
  if (addresses.length === 0) {
    throw new UrlPolicyError("DNS_EMPTY", "Hostname did not resolve to an address.");
  }
  const unsafe = addresses.find((row) => !isPublicAddress(row.address, row.family));
  if (unsafe) {
    throw new UrlPolicyError("DNS_PRIVATE_ADDRESS", "Hostname resolves to a private, reserved, or non-routable address.");
  }

  return { ...validated, addresses };
}
