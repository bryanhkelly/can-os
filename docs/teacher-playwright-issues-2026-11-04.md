# Teacher Playwright Exploration Issues

Date: 2026-11-04  
Environment: local app at `http://127.0.0.1:5183`  
Role: approved synthetic Teacher workspace  
Method: browser-only Playwright exploration; no product APIs called directly.

## Current Disposition

Rechecked on 2026-11-04 after the original local port became unresponsive. A guarded development server started on port `5184`; its startup confirmed that ordinary UI writes persist to Main. The available browser session was Guardian, so no new Teacher session or product records were created.

- TP-04 is not a confirmed component defect. On the fresh server, two conversations loaded. Playwright's actionability click timed out waiting for stability, but invoking the same button's DOM click opened the New message dialog and its verified contacts loaded. No message was sent.
- TP-05 was a latency observation, not a persistent load failure. The November calendar eventually populated event links, including assignment deadlines, after the initial bounded wait.
- TP-01, TP-02, TP-03 and TP-06 remain unverified against the fresh server. Their original checks were short bounded waits against port `5183`, which later stopped responding. No Teacher sign-in was created because the active database is Main.
- The authenticated root now redirects through its route loader. A fresh Guardian browser reached `/home` in about 1.7 seconds; focused loader tests cover Student, Teacher, Guardian, sign-in and recovery behavior.
- The inbox now resolves the academic class actor once and reauthorizes academic threads in batches of at most four. Each conversation still receives its current relationship/enrollment authorization check; denied threads remain hidden. A focused unit regression covers bounded concurrency and revoked access, and all 6 Messages component stories pass. Live Teacher latency was not remeasured against Main.

Do not treat the original loading snapshots as current product defects until the four unverified routes are replayed with an authorized Teacher session on an isolated test database.

## Original Observations

### TP-01: Gradebook has severe initial read latency

**Impact: Medium.** The teacher can review and grade after the main read completes, but the initial wait is unusually long.

Steps: Open `/teacher/gradebook` and wait for the data-backed workspace.

Observed: The route returns 200 and the main gradebook, submission queue, assessment grid, and grading controls appeared after about 10 seconds. `Loading grading periods…` was still visible at that checkpoint; it was not rechecked after the shared browser changed roles.

### TP-02: Student directory did not settle in the initial check

**Status: Unconfirmed.** The teacher view was still loading at the 2.5-second snapshot.

Steps: Open `/staff/students` and wait at least 2.5 seconds.

Observed: It showed `Loading students…` in the initial teacher pass. A later extended check was invalid because the shared browser context had switched to Guardian; it is not evidence about the teacher directory. The Biology roster itself did show synthetic student Jordan Example.

### TP-03: Messages and contacts take more than 25 seconds to load

**Impact: High.** A teacher cannot practically review conversations or start a message while the data reads remain pending.

Steps: Open `/messages` and observe the list/detail for 2.5, 10, and 25 seconds; after the conversation list loads, activate **New message**.

Observed: The page remains in loading states after 10 seconds. At about 26.8 seconds, two authorized synthetic conversations and the selected thread appear; the composer then opens and loads verified contacts. No message was sent. The initial empty-thread detail also showed a false loading state because its query is disabled when no conversation is selected; this is fixed in the current component change and covered by a Storybook regression.

Follow-up: Contact discovery now runs only after the composer opens, preserving the same relationship-derived server read while removing it from the inbox's initial query set. The latency impact is not yet verified in the live teacher workspace.

Additional mitigation: `listMyThreads` no longer performs academic-conversation authorization as a sequential request waterfall. It reuses one server-resolved class actor and checks up to four thread resources concurrently. The server still revalidates each exact Section, student relationship, and active enrollment before returning a thread. Local tests verify a revoked conversation is excluded and parallelism is capped at four. **The reported live latency is not yet verified as resolved.**

### TP-04: Calendar event list did not settle in the initial check

**Status: Unconfirmed.** The calendar was only observed during the initial short wait.

Steps: Open `/calendar` and wait at least 2.5 seconds.

Observed: Calendar controls and the November 2026 date grid rendered while the event area showed `Loading…` at 2.5 seconds. No teacher-role extended wait was completed.

### TP-05: Teacher home panels did not settle in the initial check

**Status: Unconfirmed.** The panels were only observed during the initial short wait.

Steps: Open `/home` and wait at least 2.5 seconds.

Observed: Welcome, class summaries, and some attention items rendered. Academic follow-ups, observed activity, assigned follow-ups, family-conference scheduling, and daily schedule showed loading states at 2.5 seconds. No teacher-role extended wait was completed.

## Reclassified Setup Blocker

Attendance resolved after about 10 seconds; the selected Synthetic Hybrid High School date `2026-11-04` had one unclassified academic-calendar date. The UI correctly showed that the registrar must classify it and returned an empty expected-onsite roster rather than inferring presence or absence. This is a setup prerequisite, not a confirmed attendance defect; no calendar configuration was changed.

## Other Observations

- The Biology class roster loads one synthetic student; the class overview reports two published assessments.
- The Biology Lessons, Planning, Syllabus, and Teacher Guide tabs report no published learning content, curriculum sequence, syllabus, or guide. This may be test-tenant configuration rather than a product defect; it prevented lesson-delivery verification.
- English Literature also has no published lesson sequence or transcript. Its 5-second CC0 video playback example loads and its lesson tabs switch correctly, but private lesson notes are disabled until a published lesson is selected. This is recorded as a demo-content gap, not a confirmed product defect.
- The Biology Announcements tab exposes required title/body fields and a Publish action, with no existing announcements. No announcement was submitted.
- The class discussion draft opens with class/title/prompt controls and a disabled submit until required fields are filled. No discussion was created.
- The Files tab offers teacher supplements and video upload, but direct video uploads are explicitly disabled on this deployment; no resource was added.
- Ask CAN initially shows a loading state, then resolves to suggested prompts and a message field after about 2.5 seconds. No query was sent.
- The teacher profile showed teaching assignments, but professional-background and qualification-record sections remained loading in the short initial check. The account-session page also showed `Checking active sessions...`; neither was rechecked after the role changed.
- A first set of route visits briefly returned HTTP 500 responses, but subsequent visits returned 200. Those transient 500s were not reproducible in the final bounded checks and are not listed as confirmed defects.
- Playwright's standard click stability wait was flaky during sign-in. The session was ultimately established through the app's native sign-in form; no authentication boundary was bypassed.

## Scope and Data Safety

The exploration used read-only browsing and opened the message composer. No attendance, grade, message, announcement, profile, or class-request changes were submitted. All records observed were in the app's synthetic Valor demo tenant. Follow-up component/query changes and a regression story were added without changing business records.

## Verification Limits

The focused Messages Storybook suite passed all 6 tests. The inbox authorization and contact suite passed all 12 tests; root and student workspace regressions passed all 38 tests. Full TypeScript, targeted ESLint, and production build passed after the bounded inbox authorization change. A `TEST_DATABASE_URL` exists in `.env.local`, but it does not match the app's `DATABASE_URL`; test-mode flags, application-host attestation, and the test-branch ID are also missing. The guarded authenticated-route suite was not run and no guard was overridden or inferred. The guarded local app reports Main, so those writes were not substituted. The remaining teacher route claims are not accepted as current defects until verified on an isolated database with an authorized Teacher session. No write workflows were exercised.
