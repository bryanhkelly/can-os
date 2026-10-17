# Phase 2 — Canonical workflow integration (in progress)

## Parent / dependency

- Parent branch: `phase1/platform-convergence-foundation` (draft PR #120).
- This is a stacked draft PR; merge Phase 1 and complete deferred validation before retargeting Phase 2 to `main`.
- No main-branch changes, migration, fixture-specific behavior, external side effects, or CI/test execution in this increment.

## Implemented

- `/operations/workflows` is a registrar-only, server-authorized cross-program workflow view.
- Program enumeration comes exclusively from the verified active membership's `scope.programIds`, intersected with organization authorization. Unauthorized program IDs are never client-selected.
- GF23/GF3 uses canonical program status, launch journey, blocking requirements, active site-effective year and active sections. Activation and section readiness still run through existing domain commands.
- GF22/GF2 shows applications, issued offers, active program enrollments and accepted offers awaiting activation in the offer's own school year, joining through the existing StudentProfile rather than creating shadow people. A previous-year enrollment does not close a current-year activation gap.
- The no-seat-pool GF2 enrollment activation transaction now accepts a shared **site-effective** school year or a matching program-specific one, while rejecting mismatched sites and organizations. Existing seat-pool protection, authorized program checks, idempotency and audit/event writes remain in place.
- GF1 derives missing / late queues from *latest submission attempt per student and assessment*, and surfaces unresolved canonical Actions.
- GF4 derives recent recorded attendance from a shared effective AttendanceEvent reducer keyed by student/program/occurrence. Attendance summaries and case histories use the same logic; an approved excuse or later correction supersedes the earlier absence. Pending excuses use the canonical review status.
- Every lane leads to the existing authorized write workspace. The view also invokes the existing `activateLaunch` command when a launch journey is ready, leaving full activation validation and audit/event writes to the canonical service. No parallel workflow state machine or synthetic-data switch was introduced.
- Linked from the existing program launch wizard without touching Phase 1 shell, navigation, Action, admission or attendance command functions.

## Implemented — increment 2: GF22 → GF2 lifecycle and guardian activation

- Canonical admissions offer issuance/response/activation keeps **verified registrar/guardian grants, guardian-to-student relationship checks, the site/program/year seat-pool lock, journey readiness, idempotency, notifications, domain events and audit**. The existing fixture-only write opt-in remains intact; authentic records are already eligible under the same domain rules.
- Issuance requires a school year at the program's host site (shared site year or explicit program year). Site-less virtual programs may use an explicitly program-scoped year; no unrelated site-wide year can be borrowed.
- Existing Phase 1 offer server functions are preserved unchanged to avoid an overlapping draft-PR change. A new Phase 2 server function validates UUID input and invokes the canonical pool-locked expiration service.
- Reconciliation of elapsed issued offers is now a registrar-authorized action in Connected Workflows via `admission-offer-reconciliation.functions.ts`. It processes only elapsed offers, locks each relevant pool, and writes `AdmissionOfferExpired` plus audit in the transaction. Issued offers whose expiration has elapsed no longer count as actionable.
- A real registrar intake inquiry now marks its StudentProfile as authentic, rather than contradicting the authentic Person/Application provenance. Newly provisioned guardian grants inherit truthful fixture provenance from the application rather than being unconditionally synthetic.
- Guardian login provisioning now requires the **existing independently verified guardian/student relationship** with enrollment permission; revoked grants cannot be silently reactivated. The invitation path independently checks the verification and a role grant for the correct organization and compatible site.
- Admissions intake presents verification → account provisioning → secure invitation in that order, and disables steps until the prior verified condition exists. A staff-entered email is never taken as proof of guardianship.
- All changes use the existing schema and audited domain commands. Restricted enrollment documents still require their separate R2 controls; this work does not bypass upload review or create an alternative identity path.
- The domain-event worker now acknowledges canonical GF2/GF3 lifecycle events through its established pass-through handler, including the new `AdmissionOfferExpired`. This allows ordinary subscription delivery rather than accumulating unhandled outbox events, without generating duplicate email/notification side effects.
- Phase 1 PR #120 advanced after this branch was created. The changed file `admissions-offer-demo.functions.ts` was restored to the latest Phase 1 version, and Phase 2 reconciliation moved to its own module to eliminate direct file overlap. Reconcile/advance the stacked base before eventual merge; neither PR has been merged.

## Implemented — increment 3: GF4 expected onsite attendance

- Added the pure, provenance-neutral `src/domain/expected-attendance.ts` policy projection. For an **active program enrollment in its own active school year**, an expected student-day requires an explicitly onsite delivery model, a matching site, a declared instructional or makeup calendar day, and an effective active instructional schedule. Explicit makeup days may override the usual weekly pattern; closures, holidays, zero-minute instruction and purely online programs never create onsite absences.
- Date comparisons use each school's timezone and consider the last 30 **completed local dates**. A program-specific effective schedule takes precedence over a site-wide schedule; an onsite-days-per-week mismatch is surfaced as a configuration issue rather than silently assuming a five-day schedule.
- `src/modules/attendance/expected-attendance-queries.ts` obtains the inputs in grant-bounded batches and overlays the already canonical correction-aware attendance event reducer. Identical authentic and fixture records compute identically; no new attendance facts or duplicate workflow statuses are persisted.
- Connected Workflows now shows expected student-days, unmarked expected days and the **record-completion percentage**, and warns if active calendar, schedule, enrollment or onsite pattern data is absent/incomplete. An unmarked expected day is **never automatically a recorded absence**.
- The pre-existing recorded-event counters remain visibly distinct as a rolling event-log window rather than falsely presenting them as denominator-backed attendance rates.

## Implemented — increment 4: GF4 daily staff and guardian flows

- `onsite-attendance-workflow.functions.ts` provides **one date-scoped roster/mutation boundary** using the same `expected-attendance` policy and grant-bounded school year/calendar/schedule/enrollment reads as Connected Workflows. The staff screen now calls it rather than the enrollment-only legacy roster.
- An authorized registrar sees only students expected onsite in their active program/school-year/site context. An authorized teacher sees only those students **also assigned to a currently active taught section**, with an active school year, program and matching school site. Multiple program enrollments remain distinct by program + StudentProfile, not merged into one student's display/mark.
- The attendance mark handler checks the current verified session and the requested program, student, site, actual onsite date and assignment before calling the existing `recordAttendanceRevision` audit/event/correction transaction. Future dates and unscheduled or underconfigured onsite days cannot be marked from the new staff path. This does not invent absences when there are no recorded marks.
- Staff offline marks now contain `programId` and use a v2 client queue; idempotent retries preserve source keys and previous-event concurrency checks. Existing pre-v2 queued entries are **preserved but never silently uploaded without their missing program identity**; the UI warns for manual reconciliation.
- `listGuardianEffectiveAbsences` reads the **entire occurrence correction history** for relationship-authorized students, taking the effective latest state. The guardian UI shows corrected-to-present cases rather than soliciting another excuse, while keeping the linked excuse and document review visible.
- New excuse submission verifies the current effective absence/tardy, program/site grant, and guardian enrollment/academic permission before invoking the existing `submitAttendanceExcuse` command. Superseded or excused records cannot receive new excuses via this screen.
- Staff's submitted-excuse queue now checks explicit organization/site/program grants and, for teachers, actual section assignment. Staff cannot approve a case that has since been corrected; the UI marks stale cases for reconciliation rather than approving an obsolete absence. Approved/rejected state changes still go through the existing canonical service.
- The guardian route was changed minimally to consume the new effective read/write functions. It is also touched by Phase 1 PR #120; keep that **specific overlap** visible to the Phase 1 owner and reconcile the latest parent version before integration. No other Phase 1-owned attendance module was changed.

## Scope limitations and follow-ups

- This is an **integration slice**, not Phase 2 completion. Counts are read-time projections, not persisted workflow statuses.
- GF3 still requires section readiness and configured academic calendars; an active year and sections are not a proof of launch readiness.
- GF2 offer issuance, document verification and seat-pool enrollment activation remain separate transactional services. Follow-up: enforce a single cross-role path for household signature → activation → section placement. The legacy no-seat-pool path intentionally remains blocked when a seat pool is configured. Expiration reconciliation does not perform enrollment activation or document verification.
- GF1: verify deadline handling, support/escalation resolution and cross-role notifications, including grade posting and report cards.
- GF4: connected operations, the staff roster/mark page, and the guardian attendance page now reuse the configured onsite policy or the canonical effective correction reducer. **Do not mark GF4 fully accepted yet:** the earlier Phase 1 handler exports remain for compatibility; the new authorized pre-mutation entitlement check and canonical attendance transaction are two calls, so academic-calendar/enrollment edits may race between them until a final in-transaction entitlement recheck is added. Guardian excuse reviews similarly need concurrency serialization with staff mark revisions, and historic enrollment needs as-of membership for authoritative historical rates.
- Pending guardian excuses count all submitted records, including old records outside the 30-day attendance window.
- Route-by-route and cross-persona acceptance remains pending; CI, typecheck, unit, integration, database and browser tests are **deferred by user instruction**, not passing or waived. Existing admission-offer unit fixture mocks assume old synthetic-only messages and incomplete site fixtures; revisit them when tests are reauthorized. Do not certify authentic-data readiness from this PR.

## Next code slices

1. GF3/23: strengthen transition gating and propagate school-calendar changes to schedule-dependent views.
2. GF22/2: consolidate offer response, approved documents, seat-pool activation and automatic section placement.
3. GF1: connect deadline/missing-work escalation, action closure, grading and family visibility.
4. GF4: consolidate remaining legacy attendance handler exports, serialize latest-mark checks and approved-excuse corrections in the same transaction, reconcile historical membership and multi-actor acceptance.
5. Run shared-actor end-to-end journeys when CI and tests are reauthorized.
