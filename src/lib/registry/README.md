# `src/lib/registry/` — Publish-Boundary (WP-19D)

In-app port of the verified WP-19B prototype: project an **approved Canon** to a clean
**`entity-profile-v1.0`** public artifact, run the publication gates, and produce a
**draft publish packet** that stops at operator review.

**Smallest-safe / fixtures-only.** This is a **pure** module — no DB, no Prisma, no
network, no Supabase, no migration, no PR, no registry write, no MCP/signal write.
It introduces **no new infrastructure** (honors `Vizai-discovery/.claude/CLAUDE.md`).

## Modules
| File | Role |
|---|---|
| `entity-profile-v1.0.schema.json` | **Vendored, pinned** copy of the public schema (byte-identical to `business-registry/schema/entity-profile-v1.0.schema.json`). Single source of truth for in-app validation. |
| `types.ts` | App-shaped Canon input + clean `EntityProfile` output types (no Prisma import). |
| `content-hash.ts` | Canonical `sha256:` hash — **identical to the registry Truth Beacon** method. |
| `json-schema-mini.ts` | Dependency-free JSON-Schema (draft-07 subset) validator (no ajv). |
| `entity-profile-mapper.ts` | Pure allowlist mapper: Canon → clean artifact + held/excluded list. |
| `publish-gates.ts` | The 7 gates (evidence / clean / forbidden-terms / held-claim / schema / operator / ci). Gates 1–3 mirror the registry CI verbatim. |
| `fixtures/wills-canon.fixture.ts` | Synthetic Wills-shaped Canon (public facts mirror the live published profile; held credentials + private block). |
| `../services/registry-publish.service.ts` | Orchestrator: `buildPublishDraft(canon)` → draft publish packet. |

## Evidence gate (DEC-027, mapped to app primitives)
A credential crosses to `credentials[]` **only if** its `TruthClaim.status = VERIFIED`
**and** it has ≥1 `TruthClaimEvidence.supportLevel = STRONG`. Otherwise it is **held**
(excluded by absence) — **never** turned into a negative claim.

## profileVersion
Public-artifact `profileVersion` is an **integer** (schema type), sourced from
`TruthPublishRecord.version` (DEC-030 gate 4). Semver (e.g. `1.0.0`) stays in app/report
metadata only. In this fixtures-only build it is **omitted** to preserve hash parity with
the live published profile.

## Hash parity
The Wills fixture reproduces the live published contentHash
`sha256:e23d89ed561ee5d47502a3cb693593b4fe0e83651fe65e88caf6044f3a584124`, proving the TS
canonicalization equals the Python registry/Beacon method (for ASCII payloads).

## How it maps to production (later packets)
This pure service is what the **existing** `truth-canon/[id]/publish` flow and
`truth-publish-panel.tsx` will call to prepare a draft; the generated artifact lands in the
existing `RegistryProfile` (DRAFT→READY→PUBLISHED) and each publish is recorded in the
existing `TruthPublishRecord`. **None of that DB wiring is done here** (fixtures-only).

## Run the tests (no test framework in this app)
```powershell
npx ts-node --transpile-only --compiler-options '{"module":"commonjs","moduleResolution":"node"}' src/lib/registry/__tests__/registry-publish.test.ts
```
Registry CI (`business-registry/validate-registry.yml`, full jsonschema) remains the
authoritative backstop on the eventual human-opened PR.
