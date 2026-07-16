import http, { type IncomingHttpHeaders } from "node:http";
import https from "node:https";
import type { LookupFunction } from "node:net";
import { sha256 } from "./canonical-json";
import {
  validateAndResolveUrl,
  type HostResolver,
  type ResolvedAddress,
  type UrlPolicy,
} from "./url-policy";

export class SafeFetchError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "SafeFetchError";
  }
}

export interface PinnedRequest {
  url: URL;
  address: ResolvedAddress;
  headers: Record<string, string>;
  timeoutMs: number;
  maxBytes: number;
}

export interface PinnedResponse {
  status: number;
  headers: IncomingHttpHeaders;
  body: Buffer;
}

export type PinnedRequester = (request: PinnedRequest) => Promise<PinnedResponse>;

export interface SafeFetchOptions {
  policy: UrlPolicy;
  userAgent: string;
  allowedMimeTypes: readonly string[];
  timeoutMs: number;
  maxBytes: number;
  maxRedirects: number;
  requestHeaders?: Record<string, string>;
  resolver?: HostResolver;
  requester?: PinnedRequester;
}

export interface SafeFetchResult {
  normalizedUrl: string;
  finalUrl: string;
  status: number;
  mimeType: string;
  body: Buffer;
  sizeBytes: number;
  contentHash: string;
  redirectChain: string[];
  resolvedAddresses: Array<{ url: string; addresses: ResolvedAddress[] }>;
  responseHeaders: Record<string, string>;
  retrievedAt: Date;
}

function headerValue(headers: IncomingHttpHeaders, name: string): string | undefined {
  const value = headers[name.toLowerCase()];
  return Array.isArray(value) ? value.join(", ") : value;
}

function normalizedHeaders(headers: IncomingHttpHeaders): Record<string, string> {
  return Object.fromEntries(
    Object.entries(headers)
      .filter((entry): entry is [string, string | string[]] => entry[1] !== undefined)
      .map(([key, value]) => [key, Array.isArray(value) ? value.join(", ") : value]),
  );
}

export const defaultPinnedRequester: PinnedRequester = (input) => new Promise((resolve, reject) => {
  const client = input.url.protocol === "https:" ? https : http;
  const lookup: LookupFunction = ((_hostname: string, _options: unknown, callback: Function) => {
    callback(null, input.address.address, input.address.family);
  }) as LookupFunction;

  const request = client.request({
    protocol: input.url.protocol,
    hostname: input.url.hostname,
    port: input.url.port || undefined,
    path: `${input.url.pathname}${input.url.search}`,
    method: "GET",
    headers: input.headers,
    lookup,
    servername: input.url.hostname,
  }, (response) => {
    const contentEncoding = headerValue(response.headers, "content-encoding");
    if (contentEncoding && contentEncoding.toLowerCase() !== "identity") {
      response.destroy();
      reject(new SafeFetchError("CONTENT_ENCODING_BLOCKED", "Compressed responses are not accepted by the bounded foundation fetcher."));
      return;
    }

    const chunks: Buffer[] = [];
    let size = 0;
    response.on("data", (chunk: Buffer | string) => {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += buffer.length;
      if (size > input.maxBytes) {
        response.destroy(new SafeFetchError("RESPONSE_TOO_LARGE", `Response exceeded ${input.maxBytes} bytes.`));
        return;
      }
      chunks.push(buffer);
    });
    response.on("end", () => resolve({
      status: response.statusCode ?? 0,
      headers: response.headers,
      body: Buffer.concat(chunks),
    }));
    response.on("error", reject);
  });

  request.setTimeout(input.timeoutMs, () => {
    request.destroy(new SafeFetchError("FETCH_TIMEOUT", `Fetch exceeded ${input.timeoutMs}ms.`));
  });
  request.on("error", reject);
  request.end();
});

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

export async function safeFetch(inputUrl: string, options: SafeFetchOptions): Promise<SafeFetchResult> {
  const requester = options.requester ?? defaultPinnedRequester;
  const redirectChain: string[] = [];
  const resolvedAddresses: SafeFetchResult["resolvedAddresses"] = [];
  let currentUrl = inputUrl;
  let initialNormalized = "";

  for (let hop = 0; hop <= options.maxRedirects; hop += 1) {
    const validated = await validateAndResolveUrl(currentUrl, options.policy, options.resolver);
    if (!initialNormalized) initialNormalized = validated.normalizedUrl;
    resolvedAddresses.push({ url: validated.normalizedUrl, addresses: validated.addresses });

    const response = await requester({
      url: validated.url,
      address: validated.addresses[0],
      timeoutMs: options.timeoutMs,
      maxBytes: options.maxBytes,
      headers: {
        "User-Agent": options.userAgent,
        Accept: options.allowedMimeTypes.join(", "),
        "Accept-Encoding": "identity",
        ...options.requestHeaders,
      },
    });

    const location = headerValue(response.headers, "location");
    if (REDIRECT_STATUSES.has(response.status) && location) {
      if (hop >= options.maxRedirects) {
        throw new SafeFetchError("REDIRECT_LIMIT", `Redirect count exceeded ${options.maxRedirects}.`);
      }
      redirectChain.push(validated.normalizedUrl);
      currentUrl = new URL(location, validated.url).toString();
      continue;
    }

    if (response.body.length > options.maxBytes) {
      throw new SafeFetchError("RESPONSE_TOO_LARGE", `Response exceeded ${options.maxBytes} bytes.`);
    }
    const mimeType = (headerValue(response.headers, "content-type") ?? "application/octet-stream")
      .split(";", 1)[0]
      .trim()
      .toLowerCase();
    if (response.status >= 200 && response.status < 300 && response.body.length > 0 && !options.allowedMimeTypes.includes(mimeType)) {
      throw new SafeFetchError("MIME_BLOCKED", `Response MIME type ${mimeType} is not permitted.`);
    }

    return {
      normalizedUrl: initialNormalized,
      finalUrl: validated.normalizedUrl,
      status: response.status,
      mimeType,
      body: response.body,
      sizeBytes: response.body.length,
      contentHash: sha256(response.body),
      redirectChain,
      resolvedAddresses,
      responseHeaders: normalizedHeaders(response.headers),
      retrievedAt: new Date(),
    };
  }

  throw new SafeFetchError("REDIRECT_LIMIT", `Redirect count exceeded ${options.maxRedirects}.`);
}
