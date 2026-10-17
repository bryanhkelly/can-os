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
- New excuse submission verifies the current effective absence/tardy, program/site grant, and guardian enrollment/academic permission before invoking the existing `submitAttendanceExcuse` command. Superseded or excused records cannot receive new excuses via this screen. If a previously excused day is later marked absent again, the guardian sees the **new occurrence revision** as requiring its own excuse, not the previous approval as proof of a current excuse.
- Staff's submitted-excuse queue now checks explicit organization/site/program grants and, for teachers, actual section assignment. Staff cannot approve a case that has since been corrected; the UI marks stale cases for reconciliation rather than approving an obsolete absence. Approved/rejected state changes still go through the existing canonical service.
- The guardian route and now the canonical attendance service are the **two intentional overlaps** with Phase 1 PR #120. Reconcile these small Phase 2 behavior changes against the advancing Phase 1 branch and preserve its original child/attachment UI, verified scopes and canonical audit paths. No merge is authorized.

## Implemented — increment 5: GF4 transaction consistency

- The **canonical** `recordAttendanceRevision`, `submitAttendanceExcuse` and `reviewAttendanceExcuse` transactions now all acquire the same PostgreSQL advisory lock for the student's occurrence before making freshness decisions. Guardian submissions and staff reviews validate the latest correction **inside** that lock, not only in their page handlers. Retry of an already-submitted excuse remains idempotent after authorization; conflicting repeat decisions are rejected.
- New `attendance-transaction-guards.ts` re-checks program and site ownership, the verified staff role and organization grant, active program/section enrollment, teacher-section assignment, active school year, actual instructional calendar day and effective onsite schedule **inside the same transaction that inserts a staff revision**. Relevant existing source rows are held with SHARE locks. Calendar/section/guardian staff screens continue to share the original canonical audit/event/notification commands; no second persistence path exists.
- Legacy site-day callers are **not allowed to bypass** the final guard: `recordAttendanceRevision` derives the date from `YYYY-MM-DD:site-day` even when its caller omits the new explicit validation field. Client-side roster checks are advisory, never the only write authorization.
- Approved excuses create their correction only if the original absent/tardy event is still current. Staff corrections and approved excuses now receive strictly increasing `recordedAt` timestamps under the occurrence lock, avoiding ambiguous same-millisecond ordering in canonical projections.
- The canonical excuse service independently enforces guardian identity and authorized staff review organization/site; teachers must be assigned to the related section, even when an older server-function entry point calls the service.
- Canonical `AttendanceCorrected` is registered in the shared event contract, and GF4 event types pass through outbox subscription processing, rather than piling up as unhandled events.

## Implemented — increment 6: GF4 calendar/schedule transaction coordination

- Introduced the small, shared `domain/attendance-configuration-lock.ts` contract: a site-level PostgreSQL transaction advisory lock `attendance-config:site:<site UUID>`, used **after the attendance occurrence lock** for staff marks and **before eligibility-changing writes** in academic-time. Using a site rather than one calendar row is intentional: an active site-year can have multiple calendar versions and overlapping program-specific or site-wide schedules.
- The canonical attendance transaction guard now acquires the site configuration lock **before** reading active years, calendars, days, schedules and enrollments. This protects the previously unprotected **INSERT/DELETE phantom** case (e.g., a newly created closure or a schedule version replacing the current pattern), not just updates to existing selected rows.
- Both academic-time command services and the School-Year Studio use the same lock for calendar creation and day changes, schedule template creation and timetable replacement, instructional-day bulk population, calendar-day deletion and school-year activation. Activation status is reread under the lock to avoid duplicate state transitions after a concurrent activation.
- Retroactive calendar or schedule edits do **not** rewrite or delete existing attendance facts. The Connected Workflows projection now detects effective recorded onsite attendance outside the newly configured expected student-day set within its last 30 completed local dates, shows an exception count and limited occurrence details, and directs registrars to the existing calendar and attendance screens for reconciliation.
- No new schema or duplicate workflow command service; fixture and authentic records take the same path. This does not replace **historical as-of enrollment semantics** or authorization for administrative reversals of formerly eligible recorded attendance.
- Calendar and template **creation**, as well as subsequent schedule period edits, now publish typed `AcademicCalendarChanged` / `ScheduleTemplateChanged` events into the shared subscription-capable outbox and audit the initial creation. The worker acknowledges both lifecycle event types through the established pass-through consumer; this is propagation of facts, not a new notification or calendar sync service.

## Scope limitations and follow-ups

- This is an **integration slice**, not Phase 2 completion. Counts are read-time projections, not persisted workflow statuses.
- GF3 still requires section readiness and configured academic calendars; an active year and sections are not a proof of launch readiness.
- GF2 offer issuance, document verification and seat-pool enrollment activation remain separate transactional services. Follow-up: enforce a single cross-role path for household signature → activation → section placement. The legacy no-seat-pool path intentionally remains blocked when a seat pool is configured. Expiration reconciliation does not perform enrollment activation or document verification.
- GF1: verify deadline handling, support/escalation resolution and cross-role notifications, including grade posting and report cards.
- GF4: connected operations, staff and guardian attendance, canonical attendance write transactions and all identified academic-time calendar/schedule mutation entry points now coordinate on the same site configuration lock. **Do not mark GF4 fully accepted yet:** program delivery-model changes and enrollment or staffing reassignment mutations still require shared coordination for full cross-workflow serializability; the current transaction guard additionally SHARE-locks existing records but cannot prevent all future enrollment inserts. Historical enrollment lacks as-of membership, and an administrative reconciliation command for legitimately voided historical marks is not yet implemented. The older public handler exports remain for compatibility, and cross-role acceptance and CI are deferred.
- Pending guardian excuses count all submitted records, including old records outside the 30-day attendance window.
- Route-by-route and cross-persona acceptance remains pending; CI, typecheck, unit, integration, database and browser tests are **deferred by user instruction**, not passing or waived. Existing admission-offer unit fixture mocks assume old synthetic-only messages and incomplete site fixtures; revisit them when tests are reauthorized. Do not certify authentic-data readiness from this PR.

## Next code slices

1. GF3/23: strengthen transition gating and propagate school-calendar changes to schedule-dependent views.
2. GF22/2: consolidate offer response, approved documents, seat-pool activation and automatic section placement.
3. GF1: connect deadline/missing-work escalation, action closure, grading and family visibility.
4. GF4: coordinate program delivery/enrollment/staffing changes with the new site lock; design guarded historical reconciliation and as-of enrollment reporting; consolidate legacy attendance handlers before multi-actor acceptance.
5. Run shared-actor end-to-end journeys when CI and tests are reauthorized.
