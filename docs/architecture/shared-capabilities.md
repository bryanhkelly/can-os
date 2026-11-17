# CAN OS shared application capability boundaries (v1)

**Status:** Adopted target architecture; incremental enforcement. **Deployment model:** modular monolith.
This policy consolidates existing code. It does not authorize replacing domain-owned tables or changing production data.

## Layering

1. **Product experiences:** Schools, Community Learning, Networks, Courses & Classes, Launch Studio, Administration. Experience routes and UI compose capabilities; they do not own cross-product business mutations.
2. **Application capabilities:** Identity & Authorization, Enrollment, Scheduling, Participation & Progress, Notifications, Evidence & Approval, Catalog & Discovery, Reporting.
3. **Canonical data and infrastructure:** Neon PostgreSQL, row-level security, Cloudflare R2, audit, domain events, transactional outbox, scheduled workers.

**Dependency direction:** product experiences -> public application capability entry points -> canonical data/platform primitives. Callers do not write another capability's authoritative records. Capability implementation may depend on lower-level primitives and explicitly documented domain contracts, not routes or UI. Cross-capability operations use typed commands/queries/events rather than internal service imports where a public API exists.

## Ownership and current implementation anchors

| Capability | Contract owner / existing anchor | Domain distinctions to preserve |
| --- | --- | --- |
| Identity and Authorization | `src/modules/identity/`, `src/domain/command-context.ts` | One account/Person; active exact Site/Organization/role grants; guardian relationships |
| Enrollment and Admissions | `src/modules/enrollment/` and `docs/contracts/WS2-ENROLLMENT-LIFECYCLE-V1.md` | School `enrollments`; native `class_enrollments`; noncredit `noncredit_registrations` |
| Scheduling | Existing classroom, course/session and school schedule owners | School terms vs noncredit sessions; no global session table imposed by this policy |
| Participation | `src/domain/canonical-learning-activity.ts`, canonical participation readers | School Section, Class, Course Attempt, attendance and historical access remain distinct |
| Notifications | Existing notification modules, `src/workers/scheduled-jobs.ts`, `src/platform/mutation.ts` | Business eligibility and recipient scope remain with event producer |
| Evidence and Approval | Existing evidence/blueprint workflows and `src/components/evidence/` | Separate approval powers and immutable review history |
| Catalog and Discovery | Existing published school, course and Class discovery readers | Publication eligibility and source ownership remain domain-specific |
| Reporting | Existing reporting/network attribution implementations | Actual delivery Site and credited Organization must not be conflated |

These anchors are **current integration points**, not a claim that all consumers have been migrated.

## Stable capability contract

Every public capability entry point defines:

- **Commands:** authenticated actor, current scope/relationship, idempotency behavior, transactional mutation boundary, audit/event emission, structured domain error.
- **Queries:** scoped authorization, keyset pagination when appropriate, source identity, visibility including revoked-access behavior.
- **Events:** versioned event name and schema, aggregate ID, actor attribution, tenant/site scope, durable publication; asynchronous processing may retry and deduplicate.
- **Ownership:** one module is responsible for writes and invariants. Adapters may specialize eligibility, but must not create parallel user identity, transaction, or delivery runtimes.
- **Tests:** contract tests for each adapter and end-to-end cross-experience journeys.

In particular, school Enrollment and noncredit Class Enrollment are separate authoritative records. Shared command infrastructure must not silently create a second registration or collapse their eligibility rules. A Person's learning history is a read model, never a new participation authority.

## Enforcement rollout

- **Gate A (initial):** guard the foundational mutation primitive and domain command context against imports from routes, components and feature modules, and guard enrollment's primary command service against reimplementing audit/event writes outside the shared platform primitive. This is the smallest safe, measurable ownership boundary.
- **Gate B:** migrate other module commands to stable public interfaces, then extend the governed-file manifest after their contract and tests are established.
- **Gate C:** remove duplicate experience implementations through shared page composition; do not use redirect chains as a substitute.
- **Gate D:** cross-product acceptance for single-login identity, School Section, native Class, noncredit Course, notification delivery, and network aggregation.

Avoid universal tables, new infrastructure services and unrelated migrations solely for architectural symmetry.

## Implemented shared foundations (main)

- `src/platform/mutation.ts`: canonical audit, domain-event, and in-app notification writers.
- `src/domain/command-context.ts`: `assertExplicitProgramScope` requires a present, current Program grant for enrollment mutations. This is deliberately stricter than legacy optional-scope read helpers; school applications and their retries use it.
- `src/modules/identity/unambiguous-adult-account.server.ts`: raw active-grant adult identity check, called by noncredit self-enrollment. Filtered session grants are not identity evidence.
- `src/modules/communication/outbound-dispatcher.server.ts`: transport retry, leasing, fencing, and dispatch orchestration. Noncredit waitlist and school-family alerts are feature-specific adapters that independently recheck eligibility.
- `scripts/acceptance/check-shared-capability-boundaries.mjs`: initial dependency ownership guard, now covering eight existing owners/adapters, run by CI.

These are incremental boundaries, **not** proof that all product experiences have been migrated. New implementations should adopt the existing shared primitives instead of duplicating identity or outbound delivery logic.

## Shared enrollment command adoption

School application creation, acceptance, and legacy activation now use `assertProgramCommandAccess` for current capability + exact Program authorization. Application creation also rechecks Program scope inside its transaction. Admission state, seat reservations, guarded transfers and the distinct noncredit/native Class enrollment rules remain owned by their existing services.

Application acceptance, journey activation and enrollment activation now call `writeAudit(tx, context, change)` so audit attribution derives from the trusted command context rather than hand-assembled actor rows. The architectural CI guard rejects a return to raw `writeAudit(tx, { ... })` in this enrollment service. These code-only changes require no database migration.

Other command services still need incremental adoption, with regression testing before replacing any source-specific transaction or idempotency behavior.

## Canonical mutation evidence adoption

Native Class enrollment, noncredit self-enrollment and noncredit self-withdrawal now share `src/platform/canonical-mutation.server.ts`, which writes canonical `education_v30.audit_events` and `education_v30.domain_events` through each caller's existing transaction. This is **not** the same table contract as the legacy public-schema `src/platform/mutation.ts`; maintaining two schema-specific writers avoids unsafe table substitutions while reusing the mutation responsibility.

The three adapted enrollment paths preserve their existing event types, eligibility rechecks, lock order, idempotency behavior and immutable source records. CI guards these paths against adding new direct canonical audit/event inserts. Additional canonical service consumers should migrate incrementally only after verifying their transaction and event contracts.

## Additional canonical enrollment adapters

The common canonical mutation writers are also used by noncredit Course resume, noncredit release publication, adult native Class assignment, Class invitations, Class exit/withdrawal, and noncredit waitlist operations. These adapters continue to own permission validation, current publication eligibility, recipient checks, seat semantics and transactional locks. CI governs direct canonical evidence writes in these files.

This consolidation standardizes *how evidence is recorded*, not whether each business command is eligible. Event schemas and authoritative enrollment tables remain unchanged. Database parity, builds and integration tests must still be verified independently.

## Classroom and enrollment evidence consolidation

Native Class approval decisions, repeat approvals, guardian-linked Class enrollment and session scheduling now use the canonical audit and domain-event writers. The same is true of noncredit cohort scheduling. Each command retains its own row locks, scope/consent decisions and source-of-truth records, with evidence appended in the same SQL transaction.

The canonical writer migration now covers 14 explicitly governed canonical mutation adapters. Existing routes and products do not gain alternative enrollment authority; the refactor is code reuse over the existing `education_v30` schema. CI must still pass before treating this work as production-verified.

## Review standard

Any new capability must identify its authoritative write owner, public interface, authorization model, audit/event behavior, source-to-display status mapping and contract tests. Any proposal for a duplicate capability must explain why an adapter cannot satisfy the requirement. Shared UI follows CAN OS design system v6.1.
