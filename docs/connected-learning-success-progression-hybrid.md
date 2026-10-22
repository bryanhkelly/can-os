# CAN OS — connected learning → intervention → student success → progression → hybrid site

**Execution order (user-approved, October 22, 2026):**
1. Comprehensive learning-activity tracking.
2. Teacher intervention.
3. Student success.
4. Academic progression.
5. Hybrid-site operations.

**Release gate:** FullFlow P0 still requires one end-to-end enrolled-student school journey, real server-issued role sessions, persisted refresh evidence, and guarded disposable-DB integration. This specification and CI do not waive that gate. **No merge to main or production data migration without explicit approval.**

## 1. Comprehensive learning-activity tracking

**Current FullFlow source:**
- `0031_learning_activity_tracking.sql` (two new tables), `src/db/schema/learning-activity.ts`.
- Verified section/student/activity-session ownership; `startLearningActivitySession`, `recordLearningInteraction`, `endLearningActivitySession`, `getLearningActivityHistory`.
- `LearningActivityTracker` within the actual student class lesson, and a teacher evidence view. Timestamp limits, idempotency and bounded estimated foreground time; official `lesson_progress`, `submissions`, attendance and `domain_events` remain separate.
- Applied migration 0031 to isolated `fullflow-e2e-20261022` branch only; 32 migration ledger entries with correct unique dedupe index.

**Remaining (P0 for this feature):**
- **Connected fixture added:** the existing rollback-isolated `tests/integration/full-flow.integration.test.ts` now creates a real student access account/grant/login inside the same school journey, starts a learning session, writes an event, checks idempotent retry/conflicting reuse, reads persisted history as student/teacher/related guardian, rejects unrelated guardians/unassigned teachers/wrong session IDs, and revokes the login to verify further writes are rejected. Auth context selection is mocked at the request seam; this **does not constitute real cookie/browser acceptance**. Test execution against isolated Neon is still pending.
- Run real server-issued-cookie browser journeys on an isolated test deployment. Verify reload, revoked sessions, cross-organization boundaries, guardian/teacher access, and failed-client retries.
- **Small bite committed:** the student tracker now limits foreground interaction collection to published lesson reading/activities/resources and logs user-initiated clicks on existing published lesson resource links/download controls as `resource_opened`. This is an access attempt, not confirmed file delivery or evidence of reading. Guarded policy/SSR tests cover typed resource IDs and student-only instrumentation. **CI and connected browser behavior must still be verified.**
- Next: test authenticated resource clicks and retry behavior against the isolated database, then add document/media interaction, assignment started/submitted/feedback viewed, explicit activity session renewal/timeout, tamper/abuse tests, privacy/retention and aggregation.
- Validate telemetry when JavaScript is blocked, network is lost, different browser tabs exist, clients retry, and students work offline. Stale events must not silently count time. Never infer absence or academic success from partial telemetry.
- Connect full evidence history into Student 360 with current per-section and per-student scope.

## 2. Teacher intervention

**Existing canonical owners:** `teacher-today.functions.ts`, `teacher-missing-work.functions.ts`, `support-referrals.functions.ts`, `academic-intervention` actions, `insights`, `notifications`, and audit/event infrastructure. Do not create a competing referrals table or intervention engine.

**First new slice:** `getTeacherLearningEvidence` and Teacher Today display observed last-7-day interaction evidence only within live assigned Sections and enrolled students. It is descriptive, never an auto-generated risk diagnosis.

**Next build:** One teacher-reviewed intervention action with evidence type, specific observation, owner, due date, teacher-selected support tactic, follow-up date, and outcome. Reuse `actions` and referrals lifecycle; only authorized teacher or school support staff may create/resolve. Deduplicate repeat issue creation. Preserve guardian visibility only for allowable academic support information; private counseling/referral details stay restricted.

**Acceptance:** teacher sees verified evidence and missing work; initiates human-reviewed follow-up; student receives appropriate notification; ownership, response, and outcome persist; another teacher cannot see or act on untaught Sections.

## 3. Student success

**First new slice:** `deriveClassNextSteps` produces a nonauthoritative next published lesson, self-reported completion counts, submissions awaiting teacher feedback, and revision suggestions. Class Workspace now shows it for student/related guardian. It never claims mastery or earned credit.

**Next build:** A multi-class Student Success workspace driven by actual sections and enrollment. Include next lesson, due assignments, outstanding returned work, coach/teacher follow-ups, selected learning goals and student-visible successes, with per-program pacing plans and secure family summaries. Accommodations and private support notes must never be automatically disclosed.

**Acceptance:** same authenticated student across courses; tasks and deadlines agree with canonical submissions and schedule; refresh does not lose state; related guardian sees authorized subset; revoked guardian and wrong-school users are denied.

## 4. Academic progression

**First new slice:** `assessAcademicProgression` computes provisional subject-category credit gaps from supplied reviewed course evidence and an explicit requirements matrix. Unknown, unfinalized and unapproved transfer credit cannot be counted. It always returns `diplomaAuthorized: false`.

**Next build:** Institution- and cohort/version-specific graduation requirements; required courses/subject units, substitution/waiver policy, official awarded and transfer credit evidence, school-year/term progression, human approval, missing-credit explanations and a graduation-readiness workspace. Integrate `section_grades`, `transcript_issuances` and real authorized credit issuer; do not silently assign missing credit.

**Acceptance:** a transcript may be issued showing unknown units; graduation review blocks incomplete criteria; qualified school official explicitly approves; diploma issuance is a different audited state transition with immutable snapshot and reissuance/correction policy. The current helper is not proof of graduation readiness.

## 5. Hybrid-site operations

**Existing owners:** `site-today.functions.ts`, `onsite-attendance-workflow.functions.ts`, expected attendance, calendar/scheduled occurrences, site/program scopes, Actions, handoffs and Site workspace. Reuse these; do not treat online learning engagement as daily attendance.

**First new slice:** `summarizeHybridSiteDay` distinguishes expected onsite students, staff-recorded present/tardy/absent events, unresolved attendance, and separately observed online activity. No client event can mark a child present.

**Next build:** A minimal `site_leader` or `room_facilitator` permission model with intentionally narrow scoped rights, supervised check-in/out where legally permitted, safety/escalation workflow, roster and room schedules, daily closure and offline learning attestation. Roles must NOT inherit full registrar, teacher, health, discipline or private academic permissions. Identify student release/custody authority and emergency permissions before implementing check-out.

**Acceptance:** a local facilitator can operate one authorized site/day without accessing sibling sites; arrivals, departures, exceptions, room supervision and parent notifications are verified by real staff roles and evidence. Separate online student work remains visible only to authorized educators and never automatically changes official attendance.

## Engineering/quality gates

- Code owner for each capability owns the server boundary. Verify capability + resource + scope + relationship for every query/command.
- CI must cover build, typecheck, unit and migration-generation parity on a single commit.
- Add disposable-Neon integration and multi-role browser acceptance for each write path. Unit-only or schema-only results remain unverified.
- Keep append-only and idempotent evidence for substantive state changes, avoid recording high-frequency telemetry as security audit events.
- Limit/minimize child telemetry: strong opt-in/notice, data minimization, retention/subject access policies and robust aggregation; consult school counsel before claiming COPPA/FERPA compliance.
- Do not add speculative automatic AI risk predictions; require transparent, teacher-reviewable evidence and human control.
