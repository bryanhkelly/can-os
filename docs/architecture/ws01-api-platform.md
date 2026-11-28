# WS01 — API Platform

Integration target: `architecture/api-first-nestjs`. WS01 owns framework/bootstrap, shared transport contracts, SDK tooling and deploy packaging. It does not own domain authorization decisions, identity schema, feature migration or production cutover.

## Implementation and evidence

- NestJS/Fastify remain the single target business API runtime. The existing /api/v1 prefix, default-deny guard and exact-origin writes are preserved.
- Shared error normalization recognizes known Fastify parser errors without leaking payloads, credentials or exception messages. Unknown errors and internal/output validation faults remain 500.
- Every generated operation documents correlation and cache policy; body-bearing methods document malformed input, oversized body and unsupported media type. Existing operation-specific error and security declarations remain intact.
- The generated browser SDK remains a projection of the canonical executable OpenAPI document, not a second API. Artifact verification regenerates the document and types, then compares SHA-256 fingerprints.
- A multi-stage container builds from locked root and API packages, runs as an unprivileged user, and retains disabled business reads/writes and Swagger when network-facing. The smoke harness checks ordinary HTTP, disabled writes, protected reads and non-root execution. Liveness is not database readiness.
- No production database, credentials, provider sends, traffic routing or deployment configuration changed.

## Developer acceptance (Node 24)

From repository root:

```sh
npm ci
npm ci --prefix apps/api
node scripts/architecture/check-http-api-wiring.mjs
npm run --prefix apps/api verify:platform
npm run --prefix apps/api sdk:verify
docker build -f apps/api/Dockerfile -t becomuna-api:ws01 .
node apps/api/scripts/smoke-container.mjs becomuna-api:ws01
```

The API lockfile is currently absent on the architecture baseline. Resolve the exact dependencies using the registry, review the resulting lock and advisory report, then commit it before building the deploy candidate. Do not silently resolve dependencies during a release build. The existing spike workflow can supply a candidate lock; its passing run does not replace review. The image uses a Node 24 tag for local packaging; pin a reviewed image digest for release.

## Production admission gates (not waived)

1. Commit the reviewed API lock and run all platform tests on Node 24; verify actual HTTP error behavior, OpenAPI generation, SDK compilation and deterministic generation.
2. Validate business readiness using restricted DB roles, migrations, dependency checks and authenticated pilot journeys. Define a readiness probe that verifies those dependencies without mutating state; do not route production based solely on /health/live.
3. Choose a container host and private ingress. Route same-origin /api/v1 to NestJS while retaining UI/edge rendering, and test ordinary cookie issuance/revocation and origin checks. Do not trust arbitrary forwarding headers or enable broad CORS.
4. Agree and validate route-specific limits and distributed throttling at trusted ingress (including login/verification). Existing access throttles remain authoritative; no process-local proxy-IP limiter is introduced.
5. Establish redacted request tracing, metrics, alerts, secret injection, R2 bindings, scheduled jobs and shutdown/rollback behavior. No raw request bodies, cookies, tokens or sensitive identifiers in logs.
6. Review contract compatibility against a published, versioned baseline before promotion; deterministic generation is not a breaking-change detector.
7. Enable production business traffic only after the security and integration gates pass. The current bootstrap explicitly rejects enabling those operations in production; this is intentional until reviewed.

WS01 source changes are candidates pending successful runtime execution, dependency lock review and deployment validation. The existing architecture standard remains authoritative.
