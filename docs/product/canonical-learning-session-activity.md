# Canonical learning sessions and activity evidence

## Status
Implementation on feature branch. **Not deployed to a database and not end-to-end accepted.** Run migration on an explicitly approved disposable Neon branch before testing browser paths. Do not auto-apply to main.

## What is implemented
- `education_v30.learning_sessions`: course-attempt bound browser sessions, pause/resume/end, bounded timeout, per-tab instance isolation.
- `education_v30.learning_session_events`: append-only, typed, client-event-id deduplicated activity evidence.
- Server functions: start, lifecycle, validated event record, and learner-scoped history.
- Every command resolves the current canonical signed-in Person and authorizes the current Course attempt. Lesson IDs must belong to the attempt's published course version.
- Foreground estimated time uses server time, visibility checks, a 60-second cap, and idle gap rejection.
- The recorded-instructor workspace mounts a nonblocking learner tracker.
- Unit tests validate event shape, timestamp limits, idle timeout, and bounded activity.

## Deliberate boundaries
- These events are **observations**. They do not create official attendance, verified instruction minutes, video viewing proof, assessment scores, course completion, certificates, badges or academic credit.
- A client-supplied media/assessment/survey event does not establish that its underlying object exists or was finalized. Use source-of-truth academic records for reports.
- YouTube/Vimeo iframe playback has no trustworthy percentage telemetry here. Native media milestones and assessment/survey outcome integration are future work.
- Existing Section-based learning telemetry is left unchanged to avoid silently transferring evidence to unrelated canonical attempts.
- Session start/history requires active course participation. Completed-course read access needs a separately authorized history policy.
- No raw access tokens, browser fingerprints or IP addresses are stored.

## Deployment/acceptance gates
1. Review canonical DDL against v3.0.1 clean-install SQL and RLS/service role permissions. Add explicit least-privilege database permissions before production use.
2. Apply the patch to a disposable Neon branch and verify the tables, checks, indexes, grants, and out-of-scope denial.
3. Run `npm run typecheck`, `npm run lint`, `npx vitest run tests/unit/canonical-learning-activity.test.ts` and the existing recorded-instructor unit tests.
4. Browser test: login, enter attempt, open lesson, idle, background, resume, reload, two tabs, logout, expired grant, revoked/withdrawn registration, another student's attempt.
5. Test race conditions, retries, and durable timelines on a real DB. Fail deployment if lifecycle or isolation tests fail.
6. Extend capture at canonical assessment, surveys, and video components through actual finalized source records, then build provider/site/network reports.
7. Approve retention, consent, access/export/deletion policy for minors and adult participants before large-scale logging.

## Naming
`learning_sessions` is instruction-time evidence, **not** `access_sessions` and **not** facilitated group sessions or onsite attendance. Link group delivery separately by canonical participation plus attested presence.
