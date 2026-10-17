# Phase 2 — Canonical workflow integration (increment 1)

## Parent / dependency

- Parent branch: `phase1/platform-convergence-foundation` (draft PR #120).
- This is a stacked draft PR; merge Phase 1 and complete deferred validation before retargeting Phase 2 to `main`.
- No main-branch changes, migration, fixture-specific behavior, external side effects, or CI/test execution in this increment.

## Implemented

- `/operations/workflows` is a registrar-only, server-authorized cross-program workflow view.
- Program enumeration comes exclusively from the verified active membership's `scope.programIds`, intersected with organization authorization. Unauthorized program IDs are never client-selected.
- GF23/GF3 uses canonical program status, launch journey, blocking requirements, active site-effective year and active sections. Activation and section readiness still run through existing domain commands.
- GF22/GF2 shows applications, issued offers, active program enrollments and accepted students not yet active, joining through the existing StudentProfile rather than creating shadow people.
- GF1 derives missing / late queues from *latest submission attempt per student and assessment*, and surfaces unresolved canonical Actions.
- GF4 derives recent recorded attendance from the latest AttendanceEvent per student/program/occurrence, so an approved excuse correction replaces the earlier absence. Pending excuses use the canonical review status.
- Every lane leads to the existing authorized write workspace; no parallel workflow state machine or synthetic-data switch was introduced.
- Linked from the existing program launch wizard without touching Phase 1 shell, navigation, Action, admission or attendance functions.

## Scope limitations and follow-ups

- This is an **integration slice**, not Phase 2 completion. Counts are read-time projections, not persisted workflow statuses.
- GF3 still requires section readiness and configured academic calendars; an active year and sections are not a proof of launch readiness.
- GF2 offer issuance, document verification and enrollment activation remain separate transactional services. Follow-up: enforce a single cross-role path for household signature → activation → section placement.
- GF1: verify deadline handling, support/escalation resolution and cross-role notifications, including grade posting and report cards.
- GF4: attendance metrics here cover **recorded occurrences in the last rolling 30 days**, not unmarked expected days. Follow-up: schedule-derived expected-day denominator, and staff/guardian/teacher read reconciliation.
- Pending guardian excuses count all submitted records, including old records outside the 30-day attendance window.
- Route-by-route and cross-persona acceptance remains pending; CI, typecheck, unit, integration, database and browser tests are **deferred by user instruction**, not passing or waived. Do not certify authentic-data readiness from this PR.

## Next code slices

1. GF3/23: strengthen transition gating and propagate school-calendar changes to schedule-dependent views.
2. GF22/2: consolidate offer response, approved documents, seat-pool activation and automatic section placement.
3. GF1: connect deadline/missing-work escalation, action closure, grading and family visibility.
4. GF4: expected-day reconciliation and correction-aware daily metrics.
5. Run shared-actor end-to-end journeys when CI and tests are reauthorized.
