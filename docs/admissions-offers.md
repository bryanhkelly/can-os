# Admissions offers — current service boundary

This document replaces historical offer implementation notes, preserved under [archive/2026-10](./archive/2026-10/). It describes observed code boundaries, **not** complete production acceptance.

## Current owner and sequence

- Server function wrappers: `src/modules/enrollment/admissions-offer.functions.ts` exposes `getAdmissionOfferOptions`, `issueAdmissionOffer`, `respondToAdmissionOffer`, and `activateOfferedEnrollment` to the registrar and guardian routes.
- Domain service: `src/modules/enrollment/admissions-offer-service.ts`.
- Core sequence: authorized registrar issuance → guardian accept/decline → authorized enrollment activation, under program and household relationships, with seat-pool/idempotency protections and audit/event behavior at the service boundary.

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
