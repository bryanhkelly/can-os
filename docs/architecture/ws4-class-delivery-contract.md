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
