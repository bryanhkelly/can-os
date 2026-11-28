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
