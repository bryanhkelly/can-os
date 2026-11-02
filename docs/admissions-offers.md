# Admissions offers — current service boundary

This document replaces historical offer implementation notes, preserved under [archive/2026-10](./archive/2026-10/). It describes observed code boundaries, **not** complete production acceptance.

## Current owner and sequence

- Server function wrappers: `src/modules/enrollment/admissions-offer.functions.ts` exposes `getAdmissionOfferOptions`, `issueAdmissionOffer`, `respondToAdmissionOffer`, and `activateOfferedEnrollment` to the registrar and guardian routes.
- Domain service: `src/modules/enrollment/admissions-offer-service.ts`.
- Core sequence: authorized registrar issuance → guardian accept/decline → authorized enrollment activation, under program and household relationships, with seat-pool/idempotency protections and audit/event behavior at the service boundary.

## Registrar dashboard paging and detail

The admissions dashboard resolves the selected Program/Site against the
registrar's server-issued scope before reading applications. Its list is
filtered by stage before applying a stable `updatedAt`/ID ordering and a
40-application page limit. Page navigation is bounded, and stage totals,
application totals, blocking-requirement totals and active-student totals
come from the entire authorized scope rather than the visible page.

An `application` search value loads that exact application separately from the
list page, still constrained to the resolved authorized Programs. Offer-year
options are likewise queried only for that selected in-scope application; they
are not inferred from a truncated application list. This does not change the
existing offer command boundary or idempotency key namespace.

## Seat-pool configuration

The registrar capacity page lists authorized Program/SchoolYear pairs that do
not yet have a pool. A pool can be created only when the SchoolYear belongs to
the Program's Organization and Site and is either shared at that Site or
explicitly assigned to that Program. Closed years cannot receive pools.
Creation is protected by the registrar's `enrollment.decide` capability and
Program grant, rejects duplicate Program/SchoolYear pairs, and records the
creation audit in the same transaction. Draft years may be configured ahead of
activation; family application choices continue to expose only active years.

## Existing-student intake

The registrar's `/admissions/intake` form can reuse an existing StudentProfile,
Person, Household and managing GuardianRelationship. Choices require an active
enrollment (including section-only enrollment) in the selected Program, matching
organization and school scope, active student/guardian identities and shared
household membership. When neither person belongs to any household, intake
requires explicit registrar confirmation to create one and attach both existing
people. It cannot merge separate households or silently replace a household.
This is not a global person lookup or a student-transfer
workflow. Registrars select the existing student/guardian/household combination;

The registrar can open an exact application from `/admissions/intake` using
its `application` search value. The read query applies that ID alongside the
active registrar's Organization/Program/Site scope and returns at most one
record; application metadata is not included in the intake DTO. This remains
the current applicant-detail surface rather than a second route or alternate
authorization path. Registrars select the existing student/guardian/household combination;
names, grade and relationship permissions are not overwritten.

The server rechecks those relationships and synthetic write restrictions,
serializes existing-student inquiries on the StudentProfile (and the guardian
when creating a household), rejects another
open application for the same Program and makes identical request retries
idempotent. Inquiry creation writes audit and outbox evidence transactionally.
It does not grant guardian login access, activate enrollment, waive readiness,
accept an offer or change existing class enrollments. Normal registrar and
guardian sessions must complete the same application, configured Journey,
offer, consent and activation workflow.

The rollback handoff integration regression covers identity/household/class
preservation, scoped discovery and mutation denials, synthetic gating, outbox
rollback, duplicate commands, readiness blocking, guardian acceptance and
activation through the existing endpoints. This does not repair application
database fixtures or certify authenticated browser execution.

## Unresolved verification

The service still imports `assertRecordWriteAllowed` and retains historical synthetic-prefixed command names. The wrappers preserve the existing `synthetic-offer:` idempotency-key format so retries still resolve prior offers. Some legacy or synthetic-origin records take a flagged write path, so do not conclude from a function name or architecture plan that every authentic/synthetic transition has been proven equivalent. Check the current caller graph, scope predicates and transactions before modifying these guards.

Production acceptance requires concurrent last-seat tests, repeated activation/idempotency, revoked-grant/guardian negatives, school/program crossover denials, correct downstream student/guardian visibility, event delivery and full database/browser evidence on a disposable Neon branch. See [golden flows](./golden-flows.md) GF2 and GF22; track results as `unverified` until actually executed.
