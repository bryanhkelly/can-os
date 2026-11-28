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

## Increment 3 — Admissions and family onboarding

Fourteen additional governed REST operations under /api/v1:

| Method | Resource |
|---|---|
| GET | admission-intake-programs |
| GET | admission-existing-students |
| GET | admission-stage-counts |
| GET | admission-household-search |
| GET | admission-applications |
| POST | admission-inquiries |
| POST | admission-stage-transitions |
| POST | admission-guardian-verifications |
| POST | admission-guardian-accounts |
| POST | admission-guardian-invitations |
| GET | me/family-application-workspace |
| POST | family-applications |
| POST | admission-guardian-access-revocations |
| POST | admission-guardian-access-restorations |

Existing admissions and family authorization remain authoritative: registrar scope, real verified-email guardian, independent relationship verification, approved operating services, application transaction lock, blockers, offer/seat and active enrollment guards. Grant revocation terminates sessions bound to the exact grant; restoration never resurrects revoked sessions. Existing individual-credential issuance rules remain unchanged. Sensitive results use private/no-store and no-referrer. Invitation receipt retains the existing send-request semantics; it does not prove delivery.

Three shared Request-based service modules replace business logic in the old adapters. Added strict boundary contracts, OpenAPI schemas, HTTP/SDK assertions, and adjusted the source boundary test. Static inspection finds 33 incremental operation IDs wired through controller/workflow/bridge (37 in ParticipationController including original four), with no duplicate controller routes or operation IDs. No runtime/build/SDK/database tests executed.

Remaining: public interest inbox/conversion and family-start request, guardian offer reads and enrollment requirements, noncredit catalog/history/operator queues, frontend SDK cutover, retirement of legacy RPC, authenticated lifecycle and both pilot tests. Existing business policy, migrations and production environments unchanged.

## Increment 4 — Interest inbox, guardian offer visibility and transfer destination entry

Seven additional REST operations under /api/v1:

| Method | Resource |
|---|---|
| GET | admission-interests |
| POST | admission-interest-assignments |
| POST | admission-interest-invitations |
| POST | admission-interest-status-changes |
| GET | me/admission-offers |
| GET | me/transfer-destinations |
| POST | transfer-destination-family-starts |

The registrar can read the scoped, cursor-paginated interest inbox, assign a Site-level lead to an independently authorized Program, request the existing consented-interest private family-start invitation, or record follow-up/closure. Conversion is intentionally not a status override: use admission-inquiries with the existing public-interest linkage and identity review. A verified email is not guardian verification. Neither interest assignment nor invitation creates a child, seat or Application.

Guardian offer visibility uses the existing verified relationship and Program scope; the response preserves blockers, offer progress and same-year enrollment/class placement. Transfer destination discovery is restricted to published, independently authorized academic destinations, and the family-start command requires a verified guardian's existing transfer and explicit destination confirmation. A request receipt is not delivery or enrollment confirmation.

The existing anonymous published-site submission and token redemption routes are unchanged. No new public bypass, provider or identity logic. Three shared Request-based service modules with legacy adapters; protected REST boundary, private/no-store and no-referrer, strict request/response schemas, HTTP and SDK contract assertions. Source check: all 40 incremental operations wired, 44 operation IDs in ParticipationController, unique local routes/IDs and every referenced contract export present. Runtime build, SDK generation, authenticated/negative HTTP tests, RLS and both pilot journeys remain unexecuted.

Remaining: public anonymous ingress/token redemption parity, staff family invitation batch management (coordinate WS05), enrollment requirements/checklist, participation history/catalog/operator management, frontend cutover and legacy retirement. 
