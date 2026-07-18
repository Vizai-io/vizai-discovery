# VizAI Business Registry Review

Date: 2026-07-16

Repository: `Vizai-io/business-registry`

Review mode: read-only

## Executive assessment

The registry has a useful architectural boundary: Command Center owns private
truth, evidence, consent, and workflow state; the public registry owns only a
small publication artifact. The canonical `entity-profile-v1.0` schema,
clean-artifact scan, evidence gate, duplicate detector, generated indexes, and
GitHub Pages distribution are a good foundation.

The repository is not yet ready for autonomous publication. It currently has
four indexed records but only two canonical entity profiles. Two example
records are included in the production indexes, including an example marked
`verified` with a quality score of 95. The repository also maintains two
incompatible storage models, three overlapping schemas, multiple generators,
and validators that disagree about which records are valid.

## Checks completed

- Both canonical profiles passed schema, clean-artifact, and credential gates.
- Whole-repository duplicate-domain detection passed: four unique domains.
- All six generated `index/` artifacts match `tools/build_indexes.py`.
- The legacy whole-registry validator failed both canonical profiles because it
  expects the older geo-based registry-entry shape.
- The live repository is public and GitHub Pages is serving the repository.
- Recent entity-profile and discovery-profile Actions runs completed
  successfully.
- GitHub reports the license as `NOASSERTION`.
- No repository ruleset was visible through the public API. Branch-protection
  settings could not be verified without authenticated administration access.
- `hub.vizai.io`, referenced throughout the documentation and legacy profiles,
  did not resolve during the review.

## Findings

### P0 — Remove example businesses from the production registry

`registry/us/ca/san-francisco/acme-corp.json` and
`registry/ca/on/perth/example-co.json` are indexed as real public businesses.
The latter is presented as verified with a quality score of 95. Example data in
a trust registry is indistinguishable from a false assertion to downstream
consumers.

Move examples to `schema/examples/`, exclude that directory from all indexes,
and rebuild the production indexes. Only consented, attributable businesses
should exist below `registry/`.

### P0 — Stop collecting private submission data in public issues

The public business, correction, and verification issue templates request
contact emails, phone numbers, authorization details, verification methods, and
order/reference numbers. GitHub issues in this repository are public.

Use the authenticated VizAI intake flow for all identifying or commercial
information. Public issues should accept only non-sensitive corrections and
links to public evidence, with an explicit warning not to post personal data,
tokens, DNS verification values, or purchase references.

### P1 — Converge on one public profile model

The repository currently contains:

- canonical `registry/<slug>/profile.json` entity profiles;
- legacy geo-based `registry/<country>/<region>/<city>/<id>.json` entries;
- empty `data/{verified,community,enterprise}` tier indexes;
- `entity-profile-v1.0`, `registry-entry`, `discovery-profile-v1.0`, and a full
  private-style business profile schema;
- two index generators and several validators.

This makes a green workflow ambiguous. `tools/validate_registry.py` fails the
canonical profiles, while the current entity validator intentionally ignores
legacy records.

Adopt `registry/<entitySlug>/profile.json` plus
`schema/entity-profile-v1.0.schema.json` as the only production contract.
Migrate or remove legacy records, archive superseded schemas and generators,
and delete the empty `data/` tier architecture after redirects/documentation
are in place.

### P1 — Replace fragmented CI with one authoritative verification command

The discovery workflow scans the empty `data/` tree, the older duplicate
workflow scans only `data/`, and no workflow proves that committed indexes are
current. Python dependencies are broadly ranged, `jsonschema` format checking
is not enabled, and Actions are referenced by mutable major tags.

Create a single command, for example `python -m registry_verify`, that:

1. validates every canonical profile with `Draft7Validator` and
   `FormatChecker`;
2. enforces semantic rules such as folder-slug parity, normalized domains,
   status/method compatibility, valid chronology, and non-empty bounded fields;
3. applies clean-artifact, credential, consent-receipt, and privacy gates;
4. checks unique entity slugs and domains;
5. generates indexes in memory or a temporary directory and fails on drift;
6. emits a machine-readable verification report;
7. is covered by unit tests containing positive and negative fixtures.

Run that command on every pull request and push to `main`. Pin third-party
Actions to full commit SHAs and set explicit least-privilege workflow
permissions. GitHub recommends immutable action references and least-privilege
tokens in its secure-use guidance:
https://docs.github.com/en/actions/reference/security/secure-use

### P1 — Align documentation with the live contract

The README reports three entries while indexes contain four. Most guides still
direct contributors to `data/verified` and `data/community`, describe legacy
verification statuses, and reference a Data Hub hostname that did not resolve.
The GitHub Pages site republishes the same stale guidance.

Generate registry statistics from the canonical index, make documentation
checks part of CI, remove pricing from technical governance documents, and
publish a migration note defining the one supported path, schema, status model,
and deprecation dates.

### P1 — Add publication provenance without exposing private evidence

Git history alone does not prove that a profile passed the private truth,
consent, and publication gates. Add a public-safe publication receipt to each
artifact or a companion manifest containing:

- artifact SHA-256;
- entity slug and profile version;
- source Canon version identifier;
- publication-gate policy version;
- consent receipt identifier or non-sensitive consent assertion;
- prepared and approved timestamps;
- approving workflow identity;
- source commit SHA.

Do not publish evidence documents, private notes, contact identities, or raw
consent records. Produce signed release manifests and attest generated
snapshots. GitHub supports artifact attestations for build provenance:
https://docs.github.com/en/actions/how-tos/secure-your-work/use-artifact-attestations/use-artifact-attestations

### P1 — Complete repository governance

Add:

- `CODEOWNERS`;
- a pull-request template with consent, evidence, privacy, hash, and index
  checklists;
- `SECURITY.md`;
- privacy, correction, dispute, removal, and emergency-unpublish policies;
- a canonical CC BY 4.0 license text for data and a clearly stated license for
  tooling;
- an enforced `main` ruleset requiring pull requests, approval, verification
  checks, conversation resolution, and no force pushes.

GitHub rulesets can combine branch controls and required checks:
https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/about-rulesets

### P2 — Strengthen the entity schema and semantic layer

The canonical schema correctly uses `additionalProperties: false`, but it still
allows empty strings, duplicate array items, unconstrained text sizes, and URI
schemes that are not necessarily suitable for a public registry. JSON Schema
alone also cannot enforce directory-name parity, temporal ordering, version
monotonicity, or cross-record uniqueness.

Add conservative bounds and patterns to the schema, then keep cross-field and
cross-record rules in the authoritative verifier. Treat public contact fields
as opt-in and consent-gated.

### P2 — Publish a stable distribution surface

GitHub Pages and raw GitHub files work today, but the current site is a rendered
README rather than a registry product. Add:

- a custom `registry.vizai.io` domain;
- search by name/domain/service/location;
- canonical per-entity HTML and JSON URLs;
- versioned bulk snapshots;
- ETags/cache guidance and a changelog feed;
- schema discovery and a machine-readable manifest;
- JSON-LD on human-readable entity pages.

Keep Git as the transparent publication ledger and review surface. Use
PostgreSQL/object storage plus an edge API for large-scale querying. Do not use
Git LFS for the canonical JSON catalog; it makes raw consumption and diffs less
useful.

## Recommended implementation sequence

1. **BR-01 — Containment:** freeze automated publishing, remove production
   examples, rebuild indexes, and move private intake out of GitHub issues.
2. **BR-02 — Model convergence:** make entity-profile v1 the sole production
   contract and retire legacy paths, schemas, validators, and tier indexes.
3. **BR-03 — Authoritative verifier:** implement format, semantic, privacy,
   consent, duplicate, and index-parity checks with negative tests.
4. **BR-04 — Supply-chain integrity:** deterministic manifests, artifact
   hashes, signed releases, and build attestations.
5. **BR-05 — Governance:** owners, PR/security/privacy templates, canonical
   licensing, and an enforced `main` ruleset.
6. **BR-06 — Command Center bridge:** Command Center prepares an idempotent PR
   containing the artifact, receipt, hash, and generated indexes. It never
   pushes directly to `main`.
7. **BR-07 — Distribution:** custom registry site, searchable entity pages,
   versioned JSON endpoints, snapshots, and change feeds.
8. **BR-08 — Controlled autonomy:** allow the agent to prepare, validate,
   monitor, retry, and revert PRs. Keep first publication, verified-status
   changes, consent changes, removals, and high-impact claims behind human
   approval.

## Autonomy boundary

The crawler and publishing agent can be highly autonomous in collection,
deduplication, scheduling, evidence gathering, change detection, confidence
scoring, draft preparation, and verification. It should not autonomously turn
unverified observations into public verified claims.

The safe publishing path is:

`crawl -> snapshot -> extract claims -> attach evidence -> resolve conflicts ->
record consent -> prepare artifact -> deterministic verification -> PR -> human
approval where required -> merge -> signed release -> monitor/revert`
