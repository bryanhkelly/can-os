# Native video observations in CAN OS

## Scope
The Class Workspace and canonical recorded-instructor player reuse `ClassVideoPlayer`
and `ClassroomMediaSurface`. Native MP4/WebM media supports:
- Explicit player open, HTML5 play/pause/end observations;
- Foreground, advancing playback intervals bounded by server policy;
- Opt-in resume position and merged observed-position ranges in the learner's
  local browser (30-day validation window), keyed by course attempt or
  authorized Section/person/course version and resource;
- Teacher-scoped 7-day counts of observed native video events and starts;
- Existing, approved caption tracks. Video events do not grant marks or credit.

`LearningActivityTracker` reuses `learning_activity_sessions` and append-only
`learning_activity_events`. No additional Section telemetry table is introduced.
The Section command checks live student enrollment, active security session,
published course rights, resource membership, and current publisher entitlement.
Teacher-supplement events are checked against active Section overlays, and
publisher-pack video events against active adoption and entitlement.

Canonical recorded instruction continues using its established course-attempt
session, event outbox, and RLS-owned canonical evidence service. Connection
failures now appear to students, and Section interactions use bounded
idempotent retries with a stable client event UUID.

## Deliberate limits
- **YouTube and Vimeo iframe playback are not instrumented.** Launching an
  external embedded player is not proof of watch time.
- Browser bookmarks and observed media ranges are **device-local**, not
  synchronized between devices or validated by the server. A timestamp from
  `video_ended` does not imply that all video content was watched.
- A shared projector/room player must never auto-credit individual viewers.
- No new parallel assignment, grade, lesson completion or checkpoint workflow.
  Existing lesson assessments remain the source of truth for teacher questions.
- The API reports conservative interaction observations, not attendance,
  mastery, verified duration, or official course completion.
- Retention/consent policy and learner browser tests remain required before
  scaling child telemetry. Never persist signed playback URLs or raw tokens.

## Release verification still required
1. Run `npm run typecheck`, `npm run lint`, and the relevant Vitest and
   Storybook suites. GitHub Actions startup failures must not count as passes.
2. Deploy a known exact feature-branch commit to an isolated preview with
   authenticated QA students, an assigned teacher and another Site.
3. Load a published native lesson, play/pause/seek/replay, inspect
   `learning_activity_events` and student history after refresh.
4. Repeat with an active teacher-owned video overlay and an entitled
   publisher-pack video. Deny an unrelated learner, retired resource,
   revoked login, wrong pinned version and expired session.
5. Verify observed coverage never increases from seeking or background
   playback; verify browser resume key isolation across students.
6. Verify teacher view reports native player observations separately from
   submitted homework/assessments and does not treat missing telemetry as
   evidence of student disengagement.
7. Verify the *actual* Cloudflare Workers deployment and its selected Neon
   branch. A code commit alone does not prove the live URL is running it.

## P0 remediation checkpoint (November 20, 2026)
The Section lesson tracker now serializes requests and retains the same UUID for
each bounded retry. After a failed write it stops accepting new observations,
waits for the serialized writer to settle, and best-effort closes the old session
before a new tracker generation starts. Unmount during an in-flight start also
best-effort closes the resulting session. Recording status is shown only after
the initial `lesson_opened` event is acknowledged.

Pointer engagement is suppressed during native playback. Native heartbeats
are accepted only from the shared player's visible, focused, genuinely advancing
media check. The canonical recorded-instructor tracker applies the same
anti-overlap rule. Player-control interactions never count as reading activity.

Native bookmarks now flush on pause, seek, pagehide, visibility loss, and
component cleanup. Shared-device mode keeps bookmarks in sessionStorage rather
than durable localStorage. Enabling shared-device mode removes existing durable
bookmarks. The existing CAN sign-out/account-handoff cleanup broadcasts an event
to mounted players before erasing storage, preventing late pagehide from restoring
private bookmarks.

**Read-only database inspection:** Neon project `can-os`, database `neondb`.
`main` contained 4 Section learning sessions and 2 Section learning events;
the newest event was on November 5, 2026. Neon `test01` had both Section
tables and zero rows. The November 19 Launch validation branch had the same
four/two record snapshot as main. The canonical session and event tables were
present on main, but absent on test01. No application writes or schema mutations
were performed during this inspection.

**Verification boundary:** these database queries establish table existence and
existing row counts only. They do not establish which Neon branch a currently
deployed Cloudflare Worker uses, demonstrate live learner request success, or
validate the feature-branch code. Browser and CI acceptance are still pending.
Do not merge or claim release readiness until a known deployed commit, its
runtime database connection, authorized student events, cross-site denial,
logout cleanup, and refreshed event history have been independently confirmed.
