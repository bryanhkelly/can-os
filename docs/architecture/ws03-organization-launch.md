# WS03 — Organization & Launch Studio

This increment moves 39 existing governed workflow adapters and nine controllers (including Site creation) into domain-owned registration, adds a read-only Site geography operation backed by existing exact-Site reporting authorization, and adds HTTP and SDK compile-time regression coverage. It does not change the database schema, authorization semantics, existing REST paths or V6.1 components. Geography returns source/version and market facts, not claims of authority or ACS profiles.

## Release gates still outstanding

- Execute API build, canonical bundle, HTTP tests, OpenAPI export, SDK generation and SDK check in a real checkout.
- Verify authenticated tenant isolation, revisions, replay, concurrent writes and RLS against isolated QA database. Exercise cross-Site denials and absence of geography without fabricating a market.
- Inventory organization lifecycle/provisioning and remaining Launch Studio server functions (including UI loaders, asset/media operations, public preview resolution, facilities and generation); migrate missing APIs and browser/SSR transport with WS01/WS11. Existing TanStack routes are retained until same-origin ingress and runtime parity are proven.
- Coordinate shared identity module/provider and composition seam with WS02. No second identity provider or bypass.
- Execute both pilot journeys via standard authenticated REST and complete V6.1 regression testing before integration/production approval.

## Directory increment

Extracts existing registrar Site directory and denomination HQ directly operated Site read/create operations into transport-independent services. Both legacy wrappers and REST call the same implementation. New routes: GET /me/sites, GET /me/network-sites, POST /me/network-sites. Existing exact scope, independently verified current agreement, Site replay, event and audit rules remain in place. The directory is not an affiliate reporting API. The underlying list operations retain existing unpaginated behavior; pagination and network-create error normalization need follow-up.

## Facilities increment

Five REST operations for Site room inventory, room creation, room revisions, Class facilities and Class physical-plan revisions. Legacy wrappers delegate to the same request-aware services; existing row locks, exact replay, capacity safeguards, approved facilitator assignment and in-transaction staff authority checks remain. CAN Site setup and canonical Class authorization remain separate. Existing source-based regression tests follow the extracted implementation. New contract/HTTP and generated SDK checks are added, not executed here.

## Website content channels increment

Three protected REST operations distinguish private layout reads, revision writes, and publication of the saved layout. The existing content-channel service accepts an explicit authenticated Request; both transports reuse it. Existing source-bound layout, independent publish authorization, transaction locks, source snapshots, and audit records are unchanged. Stale or unsaved publication is explicitly classified as conflict. Canonical editorial policy remains enforced by the domain parser (including protected institutional claims). No website or enrollment activation is implied.

## Media increment

Five protected media management routes reuse the canonical Document and private R2 upload services. Finalization now parses the extended strict upload schema including the key, correcting an existing defect where the strict base schema rejected the required key. Signed URL is issued only for a short-lived authorized upload; inventory excludes object keys and signed URLs. Review explicitly requires copyright and subject-release coverage; revocation remains governed. Public image proxy and browser cutover are unchanged. Tests added, not run.

## Site Intelligence increment

Three governed REST operations for stored consumer-specific content, exact provider-input preview and explicit generation. The original services remain authoritative for consent, digest, lease, retry, reauthorization and output integrity; client cannot supply replacement provider input. The existing Website & Brand-only generation restriction is reflected in the REST write schema. Administrative diagnostics, raw private brief and provider runtime validation remain outstanding. No external provider call was made.

## Network affiliation lifecycle

Six authenticated routes reuse existing local Site and denomination HQ authority, current network agreement checks, scoped rows, transaction locking, audit and events. No affiliation creates a reporting grant, changes Site ownership or replaces the accepted-tag relationship model. Invalid state transitions are explicit conflicts. Existing TanStack handlers delegate to the same service. Existing directory bounds and transaction-time authority revalidation still need runtime review.

## Organization stewardship increment

Twelve protected REST operations reuse existing network agreement, independent officer evidence, verified church provisioning, application verification/approval, evidence follow-up, cancellation and invitation resend services. Scope is the existing real CAN steward; no caller-selected role or bypass. Church invitation remains distinct from accepted identity and opening authority. Reviewer-only application records stay behind existing steward checks. No outbound email or provisioning executed in this session. Legacy steward RPCs still delegate directly to the same domain services. Runtime checks and cross-workstream access provisioning review remain required.
