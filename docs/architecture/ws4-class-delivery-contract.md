# WS4 · Class Delivery: implementation and integration contract

**Status: feature branch implementation, NOT QA-verified, NOT migration-approved, NOT release-ready.**
Base commit: `5e50d26c197330b3f01403c221f6646f8cbef823` (verified `main`).
Branch: `feature/class-delivery`. Integration target: `integration/programs-courses-classes`.

## Existing services preserved

- `education_v30.class_sessions` and `delivery_sessions` remain the only Class-to-date/time binding. Site timezone conversion and DST remain with `class-session-local-time.ts`.
- `facilitated_classroom_plans` and `facilitated_learning_sessions` remain scheduling/open/revocation authorities.
- `course_versions`, `course_lessons`, `official_course_assignment_versions` and published `assessment_versions` remain publisher-owned. A Class never edits them.
- `learner_course_attempts`, recorded-track selection, practice history, official assessment grants, attendance attestations and outcomes remain authoritative in their current modules.
- No new Class roster, enrollment, playback log, progress ledger, assessment service, or scheduling engine.

## New WS4-only contract (v1)

An append-only `class_session_agenda_revisions` row binds `class_session_id`,
`course_version_id`, positive `revision_no`, idempotency `request_id`,
`created_by_person_id` and `created_at` to an ordered `items` JSON array.
Each item is exactly `{kind, referenceId}`, with kind:
`study | watch | practice | assignment | assessment`.

Study/watch/practice reference **canonical lesson IDs**. They do not pin a
particular teacher, media URL, asset or learner. Each learner can change an
approved recorded instructor without changing Class Enrollment, assignments,
Course Attempt or progress. Assignment IDs reference official Course
assignment versions; assessment IDs reference **published** canonical
assessment versions. Showing an agenda never grants assessment access.

Only the specifically assigned Session facilitator may append revisions,
with a current canonical staff session, Class teaching assignment and exact
Organization/Site/Course authority. A Session must be scheduled and in the
future. Past revisions cannot be updated or deleted. Reused idempotency
keys with different content are rejected. The Class room opening gate
requires an agenda **only when `CAN_WS4_SESSION_AGENDAS_ENABLED=true`**.

The Session agenda GET route checks native Class Course Attempt for learners
and current Class staff authority for facilitators, and never accepts an
untrusted roster, actor ID or Site ID from the browser. Retired rights or
withdrawn participation fail closed rather than conferring new playback.
A privately paired device conveys no extra plan-read rights.

### WS1, WS2, WS3, WS6 handoffs

- **WS1:** display scheduled Session agenda as Class activity context only.
  A Session plan is not a personal completion or attendance status. No edits
  to the Participation Read Model in this branch.
- **WS2:** use canonical Class Enrollment and Course Attempt status; do not
  treat agenda creation as a participation transition or seat reservation.
  No WS2 enrollment commands changed.
- **WS3:** an agenda item marked `practice`, `assignment` or `assessment`
  is NOT proof of completion, scoring, learner submission, award or credit.
  WS3 supplies independent authorized outcome evidence when available.
- **WS6:** proposed event `ClassSessionAgendaPublished` has
  `{classId, classSessionId, courseVersionId, revisionNo, agendaRevisionId}`.
  It is planning metadata only: no participant count, attendance metric,
  learning-hours estimate or completion. Aggregate by canonical Class and
  its linked Site, not by a nullable/fabricated classroom network ID.

## Two-Site four-week acceptance (required but not yet executed)

Prepare **two distinct, independently authorized Sites**, each with an active
Class of one published Course version, assigned facilitator and four canonical
weekly Session IDs. Each Site receives *its own* four local plans: (1)
orientation, lesson + short guided practice; (2) foundational concepts,
approved recorded lesson + practice; (3) applied skills, lesson + official
assignment reference; (4) recap, practice + a published assessment reference.
Share publisher-owned material where authorized; NEVER share class enrollment,
Session, staff grants or Course Attempts across Sites.

For each of the eight scheduled Sessions, verify a real authorized operator
can publish a plan; can review the four-week outline in local Site time; can
open only within the canonical time window; can load/stop rights-checked shared
screen media; can issue temporary pairing codes; can receive individual
responses; and can end or emergency-revoke the live room. Verify the other
Site cannot publish or view that Session or roster. A learner may choose a
different authorized recorded teacher and retain the identical Course Attempt
and existing lesson/practice history. An absent/missed Session does not silently
mark attendance or academic failure. Attendance verification uses existing
authorized operators and distinct evidence records. A revoked grant, declined
enrollment, expired content rights or ended room must deny new access. Verify
published revisions remain intact and can be inspected by the authorized
audit/recovery process even after the room ends.

**Manual/automated authenticated QA is still required.** Unit tests model
the four-week/two-Site contract but do not substitute for the eight real
Classroom sessions, restricted database policies, authenticated Playwright or
a physical facilitator/pairing rehearsal.

## Database deployment and rollback

The ONLY proposed new migration is
`database/canonical/v3.0.1/patch-class-session-agendas-ws4.sql`.
It is additive, isolated and pending WS00 shared-schema ownership/migration
ordering approval. Do not apply it or enable the feature flag in production.
Preflight requires the native Class migrations and existing Course/assessment
tables. Validate restricted application-role grants and RLS on a disposable
test01 child before any staging cutover. If the server does not have access,
fail closed; never grant public table access or disable RLS.

Rollback for the staged application is **disable
`CAN_WS4_SESSION_AGENDAS_ENABLED`** and redeploy the previous version. Keep
the append-only agenda table and audit/domain events; never DROP historical
evidence on rollback. The feature flag must remain OFF until migration,
TypeScript, unit/integration, negative auth, browser and CI gates pass.
Testing blocked by GitHub Actions `startup_failure` or missing native Class
schema must be reported as NOT RUN, never as a passing test.


## Updated read-only QA inspection: November 16, 2026

Neon project `can-os`, branch `test01` (not the project default/main branch)
was inspected using read-only SQL. Unlike the November 15 readiness document,
`education_v30.classes` and `education_v30.class_sessions` now exist. The
new WS4 `class_session_agenda_revisions` relation does not yet exist, as
expected because its migration remains pending integration-owner approval.

Current QA data contains **zero Classes, zero native Class Sessions, zero native
Class Enrollments, zero published Course lessons and two published Course
versions**. Therefore test01 cannot currently demonstrate the four-week
two-Site flow, even though the native Class schema is installed. Native Class
and Session tables both have forced RLS with owner-only policies. Existing
Course lesson, official assignment and assessment tables have no forced RLS;
existing application role boundaries must be independently reviewed and cannot
be assumed from native Class RLS. No schema or data mutation was performed in
this inspection.

After explicit schema migration approval on a disposable copy, validate using:

```sh
CAN_WS4_SCHEMA_VALIDATION=1 DATABASE_URL='<isolated-qa-only>' \
  node scripts/acceptance/check-ws4-class-session-agenda.mjs
npm run typecheck
npx vitest run tests/unit/native-class-session-agenda.test.ts \
  tests/unit/native-class-session-agenda-integration-contract.test.ts
```

These commands are documented acceptance steps, **not evidence of successful
execution**. GitHub Actions on `feature/class-delivery` returns
`startup_failure` before jobs run. WS00 must supply an isolated migration,
synthetic two-Site fixtures, real authorized operators and learners, and an
operational CI/browsing environment before any release claim can be made.


## November 16 WS4 hardening: safe rollout, immutable rebooking, evidence boundaries

### Optimistic agenda editing

`publishNativeClassSessionAgenda` now requires
`expectedRevisionNo` (0 before the first publication).
The Class-scoped transaction serializes the write, checks current revision
against this value, then appends the next immutable revision. A true
identical `requestId` retry is recognized **before** the conflict check.
A stale browser cannot replace another facilitator's latest changes; the
6.1 editor offers **Reload latest plan**, deliberately discarding the stale
draft only when clicked. Publisher Course versions and learner track
selection remain unmodified.

### Safe, nonretroactive activation

`CAN_WS4_SESSION_AGENDAS_ENABLED=true` exposes optional, authorized
planning only when `CAN_UNIFIED_CLASS_COMMANDS_ENABLED=true`.
Enforcing the agenda as an opening prerequisite requires an **independent**
`CAN_WS4_AGENDA_REQUIRED_FROM=YYYY-MM-DDTHH:mm:ssZ` cutoff.
Only native Class Sessions whose immutable `class_sessions.created_at`
is on or after that UTC cutoff require an agenda before opening.
Prior scheduled Sessions continue under their original opening behavior,
avoiding a surprise denial during an existing training series.

A missing cutoff means **no mandatory gate**, even if the planning UI is
enabled. An invalid cutoff fails closed rather than silently enforcing an
unintended date. WS00 must set a cutoff **after** successful migration and
verified QA; never use today's date as an automatic default. Disabling
`CAN_WS4_SESSION_AGENDAS_ENABLED` is the rollback for all new WS4 agenda
requests and mandatory gating. The existing room emergency stop is never
hidden behind this flag.

### Visible readiness at the authoritative Class boundary

When and only when both Class and WS4 agenda flags are enabled, the
authorized native Class workspace performs a bounded read of the existing
Session IDs and their published agenda revision IDs. It returns only
`agendaRequired` and `agendaReady` per exact Class Session. The Class
interface distinguishes optional pre-activation plans from mandatory new
Session preparation, and refreshes the Class readiness after publication.
No agenda query is issued while the flag is off, and no network/affiliate
association grants cross-Site visibility. Publishing still requires the
independently verified assigned facilitator; learner/manager readiness is
read-only context.

### Cancel or replace a future Session without rewriting history

`changeNativeClassSessionSchedule` uses the existing canonical Class lock,
current facilitator grant and exact Site/Deployment/Adoption authority.
It only handles future `scheduled` plans without a room. An authorized
facilitator supplies a 15–500-character audited reason and immutable
`requestId`, choosing cancellation alone or cancellation plus a new dated
Session. Replacement uses the same `scheduleOneClassroom` writer and creates
a fresh `class_sessions` row; **the original delivery timestamp, Session ID,
publisher Course and agenda revisions are not modified**. The old plan is
marked `cancelled` in the same transaction, and its existing database guard
blocks resurrection. A matching retry returns the existing replacement;
any other attempt to alter the already-cancelled original is rejected.

The existing `ClassSessionScheduleChanged` event, scoped to the **original
class_session ID**, carries `{classId,requestId,cancelledSessionId,
replacementSessionId,reason,replacementStartsAt,replacementEndsAt,changedAt}`.
A matching `class.session.schedule.changed` audit event is also written.
Neither event touches enrollment, attendance, learner progress or completion.
**WS2 owns notification delivery** when this event must notify participating
learners and local hosts. **WS6 owns reporting reconciliation**, counting a
cancelled Session separately from its valid replacement and not double
counting scheduling as delivered instruction.

This is not a general student transfer or a replacement of the canonical
schedule authority; no new tables or migrations are required for cancellation.

### Facilitator operational recovery and accessibility

The Class workspace links back to an existing live room after browser reload
or reconnect. It does **not** create a second live room or replay the old
one-time pairing code; authorized staff can renew QR through the existing
room service. Local preparation reminders now cover captions/transcripts,
readable slides, TV/audio, joining instructions and bandwidth fallback.
They are explicitly **human checklist items, not stored compliance proof**.
The Session list reports an elapsed unopened Session as
`elapsed_unverified`, not delivered, absent, completed or failed.

### Verification added, not yet run

`tests/unit/native-class-session-agenda.test.ts` now covers revision
conflicts and the UTC rollout cutoff. Source-contract tests cover the
authorization-sensitive atomic replacement path, source event, 6.1
rescheduling UI, readiness copy and recovery affordance.

`playwright.ws4-two-site.config.ts` and
`tests/e2e/read-only/ws4-two-site.spec.ts` implement **actual signed-in
read-only browser assertions** for two independently scoped synthetic Sites:
each site's assigned facilitator and learner must see four Sessions only at
their Site, and cross-Site/anonymous requests must be refused. These are
**not fixtures or executed results**. WS00 must provide four canonical
Session rows per Site, two real synthetic Class enrollments/Course Attempts
and four native, independently authenticated principal secrets. The browser
suite intentionally sits under `read-only/` and is excluded from general
Playwright runs to avoid failing unrelated releases without seeded QA.
Run only against an already-running isolated local QA server:

```sh
CAN_WS4_QA_RUN=1 CAN_WS4_QA_BASE_URL=http://localhost:5173 \
CAN_WS4_QA_CLASS_A='<synthetic Class UUID A>' \
CAN_WS4_QA_CLASS_B='<synthetic Class UUID B>' \
CAN_WS4_QA_FACILITATOR_A_SECRET='<isolated synthetic native cookie>' \
CAN_WS4_QA_FACILITATOR_B_SECRET='<isolated synthetic native cookie>' \
CAN_WS4_QA_LEARNER_A_SECRET='<isolated synthetic native cookie>' \
CAN_WS4_QA_LEARNER_B_SECRET='<isolated synthetic native cookie>' \
npx playwright test --config playwright.ws4-two-site.config.ts
```

Do not put secrets in CI logs or commit them. This read-only suite **does
not** demonstrate Session opening, playback, pairing, actual attendance,
permission revocation, grading or room closure; WS00 still requires a
separate rollback-isolated transaction/browser pilot that exercises those
flows with fresh non-production data. CI Actions currently reports
`startup_failure` before it starts any job. No new hardening
changes are claimed typechecked, built, migrated, E2E-tested, or deployed.
