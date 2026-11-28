# Becomuna Platform Engineering Standard v1.0 — proposed for adoption

Status: accepted direction; runtime and security migration gates pending. Baseline release-11252026 at e7038863edc70c9cfc2dc55fe058f512c64f3f74.

## Architecture decision

NestJS with Fastify on supported Node LTS is the target business API runtime, as a modular monolith. Keep React, existing TanStack frontend routing/query, V6.1, Drizzle, Neon and R2. Keep Cloudflare edge/website rendering where appropriate. Use portable containers after runtime proof, secret/configuration review and a cost/availability decision. Do not introduce Hono or microservices as a transitional step. Existing branch is not a deployment target.

## Mandatory contract-first workflow

1. Identify domain owner, existing service and authoritative data model. Specify capability, inputs and outputs, state transitions, errors, resource-level authorization, transaction, idempotency and audit evidence before coding.
2. Review an OpenAPI contract with stable operation IDs, versioned resource URLs, schema constraints, explicit auth, documented error statuses, bounded pagination and response data minimization. Runtime schemas and documentation must agree. Generated docs alone are not contract-first.
3. Implement shared domain services without Nest, TanStack, React or HTTP dependencies. Controllers adapt requests; guards establish trusted identity; services enforce capabilities and scope, including transactional revalidation where required. No privilege by client-supplied IDs. Database restrictions remain independent defense.
4. Independent HTTP tests must exercise the actual listener with ordinary credentials: success, input failures, unauthenticated, unauthorized, cross-tenant, replay, concurrency, rollback and dependency failure as applicable. Reuse existing tests; do not create production test-only operations.
5. First-party UI uses generated SDK/TanStack Query. UI cannot own authoritative business logic, call DB, or bypass authorization. SSR is an API consumer too.
6. Remove superseded RPC and duplicate logic only after verified parity, deployment rollback strategy and consumer cutover. No indefinite dual implementations.
7. CI blocks new undocumented operations, breaking contract changes, forbidden dependency edges, missing tests and unsafe release artifacts. Track metrics: API inventory/migration coverage, contract parity, duplicate logic, independent journey pass rate, authorization denial coverage and regressions.

## Security and operations

Default deny, canonical Person and existing session/grant policy, distinct authentication/authorization/impersonation with attribution. No new privileged service accounts, synthetic exceptions, tokens or cookies without review. Preserve cookie security, CSRF/origin enforcement and trusted ingress handling; explicit delegated scope and revocation. Never expose docs for privileged operations without a dedicated authorization boundary (Swagger routes bypass Nest guards). RFC 9457 safe errors, server-generated correlation IDs, bounded input, rate limits, redact sensitive logs, OpenTelemetry traces, durable jobs and transactional outbox where appropriate. Signed, replay-safe webhooks. Database transactions and RLS must be proven with the existing restricted roles; do not migrate schema merely to change runtime.

## Sequence and acceptance

P0 runtime: lock dependencies; verify build, ordinary HTTP and docs tests; validate exact dependency versions and audit; pin CI; create portable image only after lock; choose hosting and same-origin ingress; validate Cloudflare-specific bindings and scheduled jobs.
P0 identity: extract transport-independent ordinary request/session adapter, preserve canonical Person and grant projection, restricted database reader, CSRF and owner delegation. Independent denial tests before any protected business operation. No direct SQL writes from QA.
P0 pilot vertical slices: Organizations/Sites, Launch Studio, Offering publication/approval, registration distinct from enrollment, four-session delivery, attendance and correction, relationship grants/revocation and reporting disclosure. Each slice has independently authorized actors, standard HTTP, UI parity and explicit evidence.
P1 participant/admin experiences: student, teacher, parent, facilitator, administrator, campaigns, approvals, integrations. Migrate by domain, not page.
P1 CI: API inventory and schema generation/diff, OpenAPI lint, contract tests, SDK drift, dependency rules, security and resilience, UI regression; require successful CI on exact commit.
Exit: both pilots independently run against deployed target through documented APIs; no source import, special auth or direct SQL orchestration; frontend parity and old transport retirement; no loss of features or authorization.

## Known runtime boundaries

Existing src/db/client.ts already supports a Node pool and Worker request-scoped pools. Existing readWorkspaceSession(request) uses Web Request; canonical context has a separate restricted reader and explicit cookie policy. These are reuse candidates, not proof of parity. Audit their transitive dependencies, existing Worker environment bindings and canonical transaction scope before integrating. Do not wrap TanStack server functions as the new business API.
