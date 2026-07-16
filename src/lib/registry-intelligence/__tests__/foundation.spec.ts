import assert from "node:assert/strict";
import type { AuthContext } from "../../auth/get-auth-context";
import { hasRegistryScope } from "../../auth/registry-scope";
import { acquireFoundationPage } from "../acquisition";
import { evaluateRobotsResponse, evaluateRobotsText } from "../robots-policy";
import { safeFetch, SafeFetchError, type PinnedRequester } from "../safe-fetch";
import { snapshotObjectKey } from "../snapshot-store";
import { assertRunTransition, canTransitionRun } from "../run-state-machine";
import {
  UrlPolicyError,
  validateAndResolveUrl,
  validateUrlStructure,
  type HostResolver,
} from "../url-policy";

let passed = 0;
let failed = 0;

async function test(name: string, run: () => void | Promise<void>): Promise<void> {
  try {
    await run();
    passed += 1;
    console.log(`  PASS  ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`  FAIL  ${name}`);
    console.error(error);
  }
}

function expectUrlPolicyError(run: () => unknown, code: string): void {
  assert.throws(run, (error) => error instanceof UrlPolicyError && error.code === code);
}

const publicResolver: HostResolver = async () => [{ address: "93.184.216.34", family: 4 }];

async function main(): Promise<void> {
  console.log("== URL and SSRF policy ==");
  await test("rejects HTTP by default", () => {
    expectUrlPolicyError(
      () => validateUrlStructure("http://example.com/", { allowedDomains: ["example.com"] }),
      "SCHEME_BLOCKED",
    );
  });
  await test("rejects embedded URL credentials", () => {
    expectUrlPolicyError(
      () => validateUrlStructure("https://user:pass@example.com/", { allowedDomains: ["example.com"] }),
      "CREDENTIALS_BLOCKED",
    );
  });
  await test("rejects out-of-scope redirects and targets", () => {
    expectUrlPolicyError(
      () => validateUrlStructure("https://outside.example/", { allowedDomains: ["example.com"] }),
      "DOMAIN_OUT_OF_SCOPE",
    );
  });
  await test("rejects private literal addresses", () => {
    expectUrlPolicyError(
      () => validateUrlStructure("https://127.0.0.1/", { allowedDomains: ["127.0.0.1"] }),
      "PRIVATE_ADDRESS",
    );
  });
  await test("rejects a DNS answer set containing any private address", async () => {
    await assert.rejects(
      validateAndResolveUrl(
        "https://example.com/",
        { allowedDomains: ["example.com"] },
        async () => [
          { address: "93.184.216.34", family: 4 },
          { address: "127.0.0.1", family: 4 },
        ],
      ),
      (error) => error instanceof UrlPolicyError && error.code === "DNS_PRIVATE_ADDRESS",
    );
  });

  console.log("== robots policy ==");
  await test("prefers an exact user-agent group over wildcard", () => {
    const result = evaluateRobotsText(
      "User-agent: *\nAllow: /\n\nUser-agent: VizAI-RegistryBot\nDisallow: /private",
      "https://example.com/private",
      "VizAI-RegistryBot/1.0",
    );
    assert.equal(result.permitted, false);
  });
  await test("supports wildcard paths and allow wins equal specificity", () => {
    const wildcard = evaluateRobotsText(
      "User-agent: *\nDisallow: /files/*.pdf$",
      "https://example.com/files/report.pdf",
      "VizAI-RegistryBot/1.0",
    );
    assert.equal(wildcard.permitted, false);
    const tie = evaluateRobotsText(
      "User-agent: *\nDisallow: /same\nAllow: /same",
      "https://example.com/same",
      "VizAI-RegistryBot/1.0",
    );
    assert.equal(tie.permitted, true);
  });
  await test("treats robots 4xx as unavailable and permitted", () => {
    assert.equal(evaluateRobotsResponse(404, "", "https://example.com/", "VizAI-RegistryBot/1.0").permitted, true);
  });
  await test("fails closed on robots 5xx", () => {
    assert.equal(evaluateRobotsResponse(503, "", "https://example.com/", "VizAI-RegistryBot/1.0").permitted, false);
  });

  console.log("== bounded acquisition ==");
  await test("revalidates each redirect before making the next request", async () => {
    let calls = 0;
    const requester: PinnedRequester = async () => {
      calls += 1;
      return {
        status: 302,
        headers: { location: "https://evil.example/" },
        body: Buffer.alloc(0),
      };
    };
    await assert.rejects(
      safeFetch("https://example.com/", {
        policy: { allowedDomains: ["example.com"] },
        userAgent: "test",
        allowedMimeTypes: ["text/html"],
        timeoutMs: 1_000,
        maxBytes: 1_024,
        maxRedirects: 2,
        resolver: publicResolver,
        requester,
      }),
      (error) => error instanceof UrlPolicyError && error.code === "DOMAIN_OUT_OF_SCOPE",
    );
    assert.equal(calls, 1);
  });
  await test("enforces byte limits even for an injected transport", async () => {
    await assert.rejects(
      safeFetch("https://example.com/", {
        policy: { allowedDomains: ["example.com"] },
        userAgent: "test",
        allowedMimeTypes: ["text/plain"],
        timeoutMs: 1_000,
        maxBytes: 4,
        maxRedirects: 0,
        resolver: publicResolver,
        requester: async () => ({ status: 200, headers: { "content-type": "text/plain" }, body: Buffer.from("12345") }),
      }),
      (error) => error instanceof SafeFetchError && error.code === "RESPONSE_TOO_LARGE",
    );
  });
  await test("does not fetch a page when robots disallows it", async () => {
    let calls = 0;
    const result = await acquireFoundationPage("https://example.com/private", {
      canonicalDomain: "example.com",
      budget: { maxPages: 1, maxBrowserPages: 0, maxBytesPerPage: 1024, maxRedirects: 1, timeoutMs: 1000, maxDurationMs: 1000, maxModelTokens: 0, maxCostMicros: 0 },
      resolver: publicResolver,
      requester: async () => {
        calls += 1;
        return { status: 200, headers: { "content-type": "text/plain" }, body: Buffer.from("User-agent: *\nDisallow: /") };
      },
    });
    assert.equal(result.robots.permitted, false);
    assert.equal(result.page, undefined);
    assert.equal(calls, 1);
  });
  await test("allows a 404 robots response, then fetches the page", async () => {
    let calls = 0;
    const result = await acquireFoundationPage("https://example.com/", {
      canonicalDomain: "example.com",
      budget: { maxPages: 1, maxBrowserPages: 0, maxBytesPerPage: 1024, maxRedirects: 1, timeoutMs: 1000, maxDurationMs: 1000, maxModelTokens: 0, maxCostMicros: 0 },
      resolver: publicResolver,
      requester: async () => {
        calls += 1;
        return calls === 1
          ? { status: 404, headers: {}, body: Buffer.from("not found") }
          : { status: 200, headers: { "content-type": "text/html" }, body: Buffer.from("<html></html>") };
      },
    });
    assert.equal(result.robots.permitted, true);
    assert.equal(result.page?.status, 200);
    assert.equal(calls, 2);
  });

  console.log("== deterministic controls ==");
  await test("permits valid state transitions and rejects invalid ones", () => {
    assert.equal(canTransitionRun("QUEUED", "PLANNING"), true);
    assert.equal(canTransitionRun("COMPLETE", "QUEUED"), false);
    assert.throws(() => assertRunTransition("COMPLETE", "QUEUED"));
  });
  await test("uses deterministic content-addressed object keys", () => {
    const urlHash = "a".repeat(64);
    const contentHash = "b".repeat(64);
    const input = { organizationId: "org", targetId: "target", urlHash, contentHash, extension: "html" };
    assert.equal(snapshotObjectKey(input), snapshotObjectKey(input));
    assert.equal(snapshotObjectKey(input), `org/target/${urlHash}/${contentHash}.html`);
  });
  await test("rejects traversal-capable snapshot key segments", () => {
    assert.throws(() => snapshotObjectKey({
      organizationId: "../outside", targetId: "target", urlHash: "a".repeat(64), contentHash: "b".repeat(64),
    }), /unsafe for a snapshot object key/);
  });
  await test("requires explicit registry scopes for service keys", () => {
    const service = { uid: "service:key", email: "service@local", role: "ADMIN", organizationId: "org", authMode: "service", scopes: ["registry:read"] } as AuthContext;
    assert.equal(hasRegistryScope(service, "registry:read"), true);
    assert.equal(hasRegistryScope(service, "registry:run"), false);
    const adminSession = { ...service, uid: "user", authMode: "session", scopes: [] } as AuthContext;
    assert.equal(hasRegistryScope(adminSession, "registry:policy"), true);
  });

  console.log("-".repeat(60));
  console.log(`WP-VIZ-CRAWL-01 foundation: ${passed} passed, ${failed} failed`);
  process.exitCode = failed === 0 ? 0 : 1;
}

void main();
