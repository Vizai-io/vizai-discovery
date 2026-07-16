import {
  DEFAULT_ALLOWED_MIME_TYPES,
  REGISTRY_CRAWLER_USER_AGENT,
  type CrawlBudget,
} from "./contracts";
import { evaluateRobotsResponse, robotsUrlFor, type RobotsEvaluation } from "./robots-policy";
import { safeFetch, type PinnedRequester, type SafeFetchResult } from "./safe-fetch";
import type { HostResolver } from "./url-policy";

export interface AcquisitionOptions {
  canonicalDomain: string;
  budget: CrawlBudget;
  resolver?: HostResolver;
  requester?: PinnedRequester;
  userAgent?: string;
  signal?: AbortSignal;
}

export interface AcquisitionResult {
  robots: RobotsEvaluation;
  robotsFetch?: SafeFetchResult;
  page?: SafeFetchResult;
}

export async function acquireFoundationPage(
  targetUrl: string,
  options: AcquisitionOptions,
): Promise<AcquisitionResult> {
  const userAgent = options.userAgent ?? REGISTRY_CRAWLER_USER_AGENT;
  const baseOptions = {
    policy: { allowedDomains: [options.canonicalDomain] },
    userAgent,
    timeoutMs: options.budget.timeoutMs,
    maxRedirects: options.budget.maxRedirects,
    resolver: options.resolver,
    requester: options.requester,
    signal: options.signal,
  };

  let robotsFetch: SafeFetchResult | undefined;
  let robots: RobotsEvaluation;
  try {
    robotsFetch = await safeFetch(robotsUrlFor(targetUrl), {
      ...baseOptions,
      allowedMimeTypes: ["text/plain", "text/html"],
      maxBytes: Math.min(options.budget.maxBytesPerPage, 512_000),
    });
    robots = evaluateRobotsResponse(
      robotsFetch.status,
      robotsFetch.body.toString("utf8"),
      targetUrl,
      userAgent,
    );
  } catch (error) {
    robots = {
      decision: "UNREACHABLE",
      permitted: false,
      reason: `robots.txt could not be evaluated safely: ${error instanceof Error ? error.message : "unknown error"}`,
    };
  }

  if (!robots.permitted) return { robots, robotsFetch };

  const page = await safeFetch(targetUrl, {
    ...baseOptions,
    allowedMimeTypes: DEFAULT_ALLOWED_MIME_TYPES,
    maxBytes: options.budget.maxBytesPerPage,
  });
  return { robots, robotsFetch, page };
}
