# WS06 — Participation API migration

Integration target: `architecture/api-first-nestjs`. Feature branch: `api-first/ws06-participation`.

## Source ownership and API coverage

Existing registration, adult Class enrollment, learner session recovery and guardian Class approvals/enrollments retain their existing governed services and REST contracts. This increment extracts waitlist, noncredit withdrawal, academic admission offer commands and native Class exits into explicit Request-based services. Existing TanStack wrappers delegate to those same services during transport cutover. No schema migration, role expansion or new demo-account behavior is introduced.

| Method | Resource (under /api/v1) | Existing authority |
|---|---|---|
| POST | noncredit-waitlist-entries | Verified adult CAN identity and published terms |
| GET | me/noncredit-waitlist | Exact account and Person, bounded cursor |
| POST | noncredit-waitlist-cancellations | Exact owner; accepted entries require withdrawal |
| POST | noncredit-registration-withdrawals | Verified adult and owned unfinished registration |
| GET | admission-offer-options | Scoped registrar, application and program |
| POST | admission-offers | Registrar with enrollment.decide |
| POST | admission-offer-responses | Guardian with enrollment.apply and verified relationship |
| POST | admission-enrollment-activations | Registrar with enrollment.activate and existing readiness |
| POST | admission-offer-withdrawals | Registrar with enrollment.decide and audited reason |
| POST | class-enrollment-withdrawals | Verified adult learner and own active/pending enrollment |
| POST | class-enrollment-cancellations | Current authorized exact-Site Class manager |

A waitlist receipt is not a registration, a registration is not a Class enrollment, an admission offer acceptance is not an enrollment activation, and a withdrawal does not erase history. Existing transaction and event policies remain authoritative.

## Remaining migration / integration gates

- Inventory and migrate admissions inquiry/application/stage, guardian onboarding and relationship review, full enrollment history/catalog, operator waitlist and participation management, and other remaining legacy transport capabilities. Do not mark WS06 fully complete on the basis of this increment.
- WS01/WS02: coordinate shared workflow registration, identity service changes, ingress, CSRF and runtime configuration. The current central wiring checker requires explicit mappings; the domain-specific adapter owns the operation implementations.
- WS11: regenerate SDK from running OpenAPI, replace feature callers without design-system changes, validate same-origin ingress and SSR behavior, then retire superseded TanStack wrappers. Compile-time SDK assertions have been added but not run.
- WS12: run build, HTTP contract/security tests, repository unit suite, architecture checks, and database integration with real scoped accounts. Confirm cross-tenant, revoked guardian, expired offer, last-seat contention, duplicate registration, waitlist promotion, repeated withdrawal, completion/withdrawal race, reporting reconciliation, and both pilots through standard APIs. No production DB changes or deployment from this branch.

## Validation

Source-only inspection verified the original 11 operations each have an OpenAPI operation ID, controller invocation, workflow type, and bridge mapping. Actual HTTP tests, SDK generation, build, database/RLS validation and pilot execution are not verified by this source check.

Suggested local gates from repository root:

```sh
npm --prefix apps/api run test
npm --prefix apps/api run sdk:generate
npm --prefix apps/api run sdk:check
node scripts/architecture/check-http-api-wiring.mjs
npm run test:enrollment:unit
npm run test:integration:admissions
npm run verify:architecture
```

Run canonical bundling and isolated QA deployment using the existing API README and reviewed environment; never bypass production write restrictions to get a green test.

## Increment 2 — Native Class participation

Eight additional standard REST operations use the existing native Class services with explicit request context:

| Method | Resource (under /api/v1) |
|---|---|
| POST | class-approval-requests |
| POST | class-approval-decisions |
| GET | me/class-approvals |
| GET | class-approval-queue |
| POST | class-invitations |
| GET | me/class-invitations |
| POST | class-invitation-declines |
| POST | class-enrollment-assignments |

Approval and invitation do not create a seat reservation or Course Attempt. Assignment preserves the existing exact-Site staff check, verified affiliated adult requirement, no-credit/audit restriction, shared Class capacity and repeat-authorization transaction. Invitation and approval acceptance still use the existing class-enrollments endpoint with exact published terms and consent. Existing TanStack adapters delegate to the extracted services until the SDK migration.

Source inspection: all 19 incremental operations are mapped through controller/OpenAPI, workflow type and bridge. New contract tests and SDK compile assertions are committed; execution is still pending. No schema or production changes.
