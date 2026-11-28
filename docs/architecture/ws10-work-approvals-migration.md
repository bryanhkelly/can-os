# WS10 — Work and Approval Management migration

Status: source implementation only, not release accepted. Base: architecture/api-first-nestjs. No database migrations, production changes or deployment performed.

## Scope delivered

Six Action operations (queue, exact detail, status, assignment, deadline, named onsite owner resolution) and six credential issuer approval operations (own status, request, active queue, pending queue, decision, revocation) are registered in the NestJS API. Existing TanStack handlers call the same extracted request-aware services. Work records and approvals remain in existing tables. No generic approval command may confer credential issuance, academic publication, enrollment, safeguarding or support authority.

Action changes preserve existing locks, audit, event and notification rules; status and assignment now explicitly check Organization ownership, and deadline changes use the academic authority check for grade-response follow-ups. Credential approval retains separate verified institutional reviewer, requester/Person independence, current grant verification in the transaction, bounded expiry and restricted writer role. Existing demo restrictions on independent review remain.

## Contracts and limits

Explicit strict request and response contracts; current cookie-based identity, default-deny guard and Origin checks. Existing Action queue is bounded at 250 records; counts reflect that returned queue, not an unlimited total. Credential review queues remain bounded at 101; deterministic pagination and complete operational backlog reporting are not yet implemented. No caller-supplied actor or role. Existing legacy adapters remain during transition. No new universal work creation or cross-domain approval engine is implied.

## Integration and acceptance

- Source inspection confirmed 12 distinct operation IDs and routes, matching bridge and typed workflow entries, and controller registration.
- HTTP negative/authentication and contract tests and SDK type-smoke checks have been added; execution is outstanding.
- Run root and API TypeScript checks, API canonical bundle boundary check, full API HTTP tests, SDK generation and typecheck. Reconcile source-contract and mock tests with extracted service paths.
- On an authorized isolated database, exercise Site Admin and registrar queue/detail, scope denial for sibling Site/Program/Organization, unauthorized assignee, owner-only resolution, deadline, same-request retry, concurrent conflicts and atomic audit/outbox. Verify RLS under the deployed roles.
- Exercise real eligible requester and distinct verified reviewer, expired or revoked grants, self-review, duplicate request, review and revocation races, independent evidence and expiry, restricted writer and denial of credential use before/after approval. Use standard authenticated API; no test bypass or direct data mutation.
- WS11 must integrate the generated SDK into browser views after generation and same-origin ingress validation, preserve V6.1, and retire legacy handlers only after parity. Existing shared registration files need coordinated integration with other workstreams.
- Remaining WS10: inventory all Action creation paths and other domain review/approval queues; design federated authorized inbox and explicit escalation policies without inventing authority; implement remaining resource-specific APIs, pagination, stale-write handling and acceptance journeys.

Do not promote or merge for release solely on these source changes.

## Second slice — manual operational work and federated inbox

Four additional protected operations: GET/POST /api/v1/work/tasks, POST /api/v1/work/tasks/{id}/escalations, GET /api/v1/work/inbox. Manual tasks are Site-scoped, optionally bound to an existing Program at that Site, and represented by canonical Actions with a fixed operational_task type. Creation uses a request-scoped deterministic ID, payload fingerprint and transaction lock. Assignment is restricted to currently verified Site operators; no caller-defined approval kind. Escalation requires a reason and current revision, raises priority to urgent, and writes audit, event and notification in one transaction. Generic status/assignment/deadline paths recheck current manual-task authority, and generic assignment cannot bypass the escalation command. Listing uses UUID keyset pages of 50.

Inbox projects existing authorized operational queues and credential requests/reviews; no copied workflow records, no caller-selected role, and explicit source bounds. Other roles and domain approvals remain outside this first projection. No automated escalation scheduler, organization-only or Offering-level manual tasks, frontend integration, or authenticated runtime acceptance yet. Added HTTP/schema and SDK contract checks; these must be executed before promotion.

## Third slice — dependency graph and additional review sources

GET and POST /api/v1/work/tasks/{id}/dependencies expose an existing canonical Action dependency graph with exact Organization/Site/Program scope, at most 100 direct prerequisites, closed-record protection, revision checks, audited changes, and idempotent same-state replay. An organization advisory transaction lock serializes graph edits, endpoint rows lock in stable ID order, and recursive SQL rejects circular dependencies. The existing manual-task status service locks the dependent row and denies start or resolution when any prerequisite is unresolved; cancelled prerequisites are not satisfied. This graph orders work only; it cannot replace a domain approval, confer authority, or issue credentials.

The inbox now includes jurisdiction verification/editorial work and independent reporting relationship decisions alongside operations and credential work. Jurisdiction reuses the extracted existing authority check; reporting delegates to the existing relationship service and its allowedActions projection. No evidence or participant Person IDs are returned. Source bounds are explicit; the relationship source only covers the first page and can be truncated even if it contains no actionable items. Approval request creation now serializes requests per grant and replays same-account/same-evidence active requests without duplicate audit.

18 unique REST operations and corresponding typed workflow bindings checked in source. Contract and SDK regression tests extended. The standard authenticated acceptance script apps/api/test/work-dependencies.acceptance.mjs exercises real creation replay, conflicting payload, opposing concurrent dependency edges, blocked progress/resolution and completion. Run only against a disposable authorized tenant with WS10_CONFIRM_DISPOSABLE_TENANT=yes, WS10_TEST_API_ORIGIN, WS10_TEST_SESSION_COOKIE (obtained by normal authentication), WS10_TEST_SITE_ID; use node apps/api/test/work-dependencies.acceptance.mjs. The script leaves normal resolved Action and audit evidence. No script execution, RLS validation, generated SDK compilation or database changes are claimed. Still required: automatic escalation scheduler, configurable approval policies, wider scope and domain inbox integration, dependency DB constraints/RLS verification, positive/negative runtime and frontend acceptance.
