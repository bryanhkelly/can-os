# CAN OS — comprehensive learning-activity tracking

**Status:** Early implementation committed: validated events, bounded estimates, session/event tables, student lesson instrumentation, scoped timeline, and teacher evidence roster. Full browser/authenticated integration, comprehensive resource/media coverage, accessibility and retention/privacy acceptance **NOT YET VERIFIED**.  
**Priority:** P1 feature development begun alongside P0 work; FullFlow six-stage end-to-end acceptance remains the required release gate. Never claim full readiness based on schema/unit CI.  
**Branch / review:** `FullFlow` / draft PR #172. Do not merge into `main` without approval.

## Product outcome

CAN OS should make it possible for authorized students, teachers, academic coaches, guardians, and school operators to understand **what learning happened, when, in which actual course/section, with which results, and what follow-up is needed**. This must work across asynchronous, live-online, hybrid, and supervised on-site learning. It is a first-class operating capability, not a stand-alone usage-analytics dashboard.

Questions the system must eventually answer include:

- What content did a student access, start, resume, complete, or revisit?
- How much **estimated active learning time** occurred, not merely time logged in or a page left open?
- Which activities, assessments, and feedback did the student attempt, submit, revise, or revisit?
- Where is the student making progress, showing evidence of mastery, stuck, or overdue?
- Did a teacher, tutor, academic coach, site facilitator, or mentor provide an intervention? What happened next?
- What does a teacher, guardian, site leader, or CAN academic operator need to act on today?

## Preserve distinct meanings

| Evidence | Canonical domain | What it does NOT prove |
| --- | --- | --- |
| Authentication, idle refresh, sign-out, session revocation | `access_sessions` and security audit | Instructional attendance, studying, lesson engagement |
| Lesson completion state | `lesson_progress` | That the learner read every resource, spent a specific amount of time, or mastered the material |
| Submitted work, attempts, grading and feedback | `assessments`, `submissions`, gradebook | Every action before submission, or time spent learning |
| Attendance | Existing official attendance and expected-attendance services | Automatically established by browser telemetry |
| Event/audit outbox | `domain_events`, `audit_events` | A suitable high-volume learner interaction stream |
| Extracurricular/club activities | Existing `activities` service | Online or classroom learning engagement |

**Do not** repurpose `access_sessions.updated_at` as learning time or rename the existing extracurricular `activities` table into a learning telemetry system. Recorded instructional attendance must follow the configured attendance policy and evidence requirements; it must not be inferred from clicks, a heartbeat, or completion flags.

## First implementation bite: typed input policy (source only)

- `src/domain/learning-activity-policy.ts` defines strict, bounded client evidence types for `lesson_opened`, `lesson_resumed`, `resource_opened` and `engaged_interval`. It forbids unrecognized fields such as client-supplied identity, grades and attendance, and rejects out-of-window timestamps and inflated durations.
- `estimateActiveLearningMilliseconds` limits a reported active interval to elapsed **server-observed** time, rejects idle gaps or nonforeground interactions, and caps estimates to 60 seconds. It is deliberately conservative and untrusted as actual engagement.
- `tests/unit/learning-activity-policy.test.ts` covers malicious payloads, timestamp skew and interval constraints.
- `0031_learning_activity_tracking.sql` adds `learning_activity_sessions` and append-only `learning_activity_events`; applied only on the disposable `fullflow-e2e-20261022` Neon branch. Migration ledger count is 32. This is not a production deployment.
- `learning-activity.functions.ts` provides session start/end, serialized event ingestion with idempotent client event IDs and digest mismatch rejection, published-lesson/content/enrollment authorization, conservative active-time accounting, and scoped activity history.
- `LearningActivityTracker.tsx` now records student lesson openings and foreground trusted interactions, resets its estimator after hidden/unfocused browser periods, and allows an enrolled student to view recent interaction history. Resource, video, external provider, detailed assessment, and offline-activity instrumentation are not yet wired.
- `teacher-learning-evidence.functions.ts` exposes bounded teacher-section-roster evidence, shown on Teacher Today; absence of telemetry is explicitly not treated as disengagement.
- **Still missing / release-gated:** real authenticated browser and integration acceptance, resource/media coverage, retention/consent policies, central telemetry throttles, long-term scale/partition decisions, Student 360 consolidated event timeline, rich intervention outcome tracking. Do not treat a published event as official attendance, grade, credit or proof of mastery.

## Required coverage (incremental rollout)

**Bite A — first real student journey (P1, after FullFlow P0):**
1. Capture a server-authorized, section-scoped student learning session distinct from the security login. Record start, last verified active interaction, pause/resume, and end/timeout when reliably observed.
2. Record lesson opened/resumed, resource interaction, lesson-completion change, assessment started/submitted, feedback viewed, and return/revisit. Reuse canonical completion/submission/grade records and their events rather than duplicating the academic truth.
3. Record bounded, foreground-and-engaged active intervals (with explicit idle/visibility handling, plausible-duration limits, no background-time accrual, deduplication, and reconnect behavior). Report it as **estimated active time**, with uncertainty, not proof of learning or attendance.
4. Display a permissioned timeline in Student 360 and a teacher class view, linked to the original Program, Section, curriculum version, lesson, assessment, and student.

**Bite B — rich learning instrumentation:**
- Reading/resource open and progress, media started/progress/finished (playback is not proof of watching), interactive exercise/checkpoint activity, quiz retries, discussions, and meaningful learner reflection.
- Version-aware links to publisher content and supported external tools. When integration evidence is absent, mark the activity **unknown/not instrumented**, never fabricate usage.
- Late/missing work, pacing trends, revisit patterns, and student/teacher-visible progress against actual published requirements.

**Bite C — hybrid/offline and interventions:**
- Authorized teacher/coach/site facilitator attests supervised offline learning activity with method, duration/evidence, actor and timestamp. A participant cannot self-certify another student's attendance.
- Human-confirmed feedback, support referrals/interventions, follow-up outcomes, and action ownership in existing `actions`, `insights`, notifications and Student 360.
- Aggregate operational reports for staff: last genuine learning activity, assigned vs completed work, recent support actions, and missing evidence; separate site-supervision from academic instruction.

## Proposed persistence boundary (design, not implemented)

Prefer a narrow append-only `learning_activity_events` store and derived daily/lesson summaries, rather than inserting high-volume views/heartbeats into the durable domain-event outbox or authentication audit. Reuse immutable academic outcomes as canonical source records; point to them by ID.

Each accepted event should carry, as applicable:

- Server-resolved student profile identity, owning organization/program/section, and published curriculum version;
- Student-learning-session ID, content/lesson/resource/assessment reference, typed event name and schema version;
- Server received time, bounded source-reported occurred time, verified source (`can_web`, trusted tool integration, or attested offline), and evidence quality;
- Caller-bound idempotency/event ID for retries, optional bounded active-duration measurement, and constrained event-specific metadata.

The server must derive authority from the actual signed-in relationship and validate that the student is enrolled in the referenced section, the content belongs to the relevant published version, and teachers/mentors hold a real applicable grant. Explicitly reject cross-organization, cross-program, unrelated-guardian, and stale/revoked-grant access. Avoid raw secrets, credentials, unrestricted free-form event payloads, keystroke capture, or surveillance by default.

Before implementation, specify retention, data access/export/deletion rules, minors' privacy, appropriate consent/notice, abuse and write-rate limits, server-side timestamp bounds, indexing/partitioning and aggregation. Do not assert regulatory compliance based on implementation alone.

## Read models and meaning

- **Student:** personal history and progress, actionable next lesson/assignment, clear distinction between completed, in progress and not yet observed.
- **Teacher:** only their authorized sections; learning participation, gaps, feedback and actionable intervention queue without exposure to unrelated classes.
- **Guardian:** only linked student(s) and authorized academic details; avoid disclosing private referrals or other children's activity.
- **Site leader:** attendance/supervision information and operational participation within their grants, not blanket access to sensitive academic/private records.
- **School/CAN academic staff:** program-level aggregate pacing, engagement and unresolved action trends restricted to legitimate scoped authority.
- Activity estimates and engagement signals are **descriptive evidence**, not grades, mastery judgments, disability or behavioral diagnoses, or automatic diploma/credit approval.

## Definition of done

- Same school/program/section/student IDs from the real FullFlow journey; no synthetic-only implementation.
- A learner opens and revisits a lesson, creates meaningful activity, submits work, receives feedback, and reloads; the authorized timeline agrees with persisted records.
- Repeat/delayed events are idempotent; out-of-order/invalid client events cannot manufacture arbitrary learning time, future completions or a different student's activity.
- Idle tab, background browser, network disconnect and stale activity session do **not** accrue misleading learning time.
- Teacher/guardian/site roles see only their respective authorized scope; another school's user and an unrelated guardian are denied at the server, not just in the UI.
- Hybrid/offline participation is separately labeled as attested rather than automatically recorded by telemetry; no event silently updates attendance, grade or credit.
- Every new migration is applied and tested on a disposable Neon branch and included in the connected schema preflight before claiming readiness.
- Real database integration and separate browser-session acceptance pass on the same commit; build/typecheck/unit-only passes are insufficient.

## Implementation dependency / sequencing

P0: finish existing FullFlow six-stage connected database plus multi-persona browser acceptance.  
P1-A: event taxonomy, narrowly scoped ingestion, learner-session persistence and Student 360/teacher read model.  
P1-B: rich content/assessment/media instrumentation, aggregates and actionable intervention triggers.  
P1-C: hybrid/offline attestation and supervised site reporting.  
P2: trend-based personalized support and AI-enabled recommendations **only after** evidence validity, access controls and human review are demonstrated.

This is a required feature. **Its specification is not evidence of implementation.**
