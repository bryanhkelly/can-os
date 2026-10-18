# Admissions offers — current service boundary

This document replaces historical offer implementation notes, preserved under [archive/2026-10](./archive/2026-10/). It describes observed code boundaries, **not** complete production acceptance.

## Current owner and sequence

- Server function wrappers: `src/modules/enrollment/admissions-offer-demo.functions.ts` and related enrollment route functions (some export names remain historical).
- Domain service: `src/modules/enrollment/admissions-offer-service.ts`.
- Core sequence: authorized registrar issuance → guardian accept/decline → authorized enrollment activation, under program and household relationships, with seat-pool/idempotency protections and audit/event behavior at the service boundary.

## Unresolved verification

The service still imports `assertRecordWriteAllowed`. Some legacy or synthetic-origin records take a flagged write path, so do not conclude from a function name or architecture plan that every authentic/synthetic transition has been proven equivalent. Check the current caller graph, scope predicates and transactions before modifying these guards.

Production acceptance requires concurrent last-seat tests, repeated activation/idempotency, revoked-grant/guardian negatives, school/program crossover denials, correct downstream student/guardian visibility, event delivery and full database/browser evidence on a disposable Neon branch. See [golden flows](./golden-flows.md) GF2 and GF22; track results as `unverified` until actually executed.
