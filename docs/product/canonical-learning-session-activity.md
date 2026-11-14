# CAN OS canonical learning sessions and activity evidence

**Implementation:** Feature branch / PR #293, not merged or deployed.  
**Migration:** `database/canonical/v3.0.1/patch-learning-session-activity.sql`.  
**Live DB validation:** Blocked by Neon branch quota. Do not run DDL on main as a substitute.  
**CI:** Netlify deploy preview skipped due to account build usage; GitHub Actions had a startup failure. Neither provides code-level acceptance.

## What is implemented

- Session storage is based on `learner_course_attempts`, not an invented training enrollment or separate K–12 identity.
- Server-only canonical/legacy session resolver returns a verified session identifier without adding it to public `CommandContext`.
- Learning sessions are separate from security login sessions. A per-tab `client_instance_id` supports reload reuse, with server-side 30-minute idle and 12-hour absolute bounds.
- Server-side operations start, resume, pause and end sessions and accept typed, idempotent observations. Write operations reauthorize current course participation and sign-in.
- `learning_session_events` is append-only. Composite foreign keys keep events bound to their actual session and course attempt, including course version.
- Native video records `video_opened`, `video_played` and `video_ended`. YouTube/Vimeo embeds record launch only. Neither confirms viewing or instructional minutes.
- Resources are validated against the course unit; video assets against a canonical course lesson/presentation.
- A learner evidence panel separates recent browser observations from source-of-truth assessment attempts, finalized scores/outcomes, identified survey responses, and actual provider completion decisions.
- Survey summaries use the transactionally written canonical `LearningSurveySubmitted` domain event and matching identified response, never client-submitted completion claims.
- Official credit, attendance, assessment grading, survey answers, certificates and completion records are not written by telemetry.
- Unit tests cover timestamp skew, inactivity, bounded foreground intervals, malformed events and forged outcome labels.

## Security and privacy boundary

- No IP, raw token, device fingerprint or keystroke content is stored. The tab instance UUID is not an authentication secret.
- Non-owner roles have no public grant on activity tables; PostgreSQL row security is enabled with no general read policy. Owner connections bypass RLS, so every server operation still requires authorization.
- Current read model only returns the authorized learner's own course attempt, with no survey answers or private referral data. Provider/network reporting requires separate scope policies and aggregate reads.
- Estimated active milliseconds are not official attended minutes, proof of video consumption or evidence of mastery. Browser events remain untrusted observations even when linked to a published resource.
- Privacy notices, retention and deletion/export policy for children and adults require approval before production instrumentation is scaled.

## Acceptance checks

1. Apply `patch-learning-session-activity.sql` **only** on an explicitly approved disposable Neon branch.
2. Run `CAN_ACTIVITY_SCHEMA_VALIDATION=1 npm run db:canonical:activity-schema` against that branch's `DATABASE_URL`. This is read-only and checks required tables, columns, composite FKs, indexes and RLS.
3. Run `npm run typecheck`, `npm run lint`, `npx vitest run tests/unit/canonical-learning-activity.test.ts` and recorded-instructor UI tests.
4. Browser test: current learner, another learner, unrelated guardian, revoked login, withdrawn registration, changed course version, cross-organization attempts, two tabs, reload, browser hidden/focus, idle expiry, and retries.
5. Confirm the result read model matches real assessment and survey transactions, and cannot be forged by client events.
6. Test the same learner's noncredit and school course participation independently; external video embeds must not claim watch completion.
7. Approve retention, access/export and monitoring controls before making the telemetry mandatory.

## Not yet delivered

- Facilitator-controlled room pairing and supervised group participation.
- Program/site/network reporting with a formally approved provider-versus-host authorization policy.
- Native video watch-duration measurements; iframe provider analytics require supported provider APIs and consent.
- Automatic session expiry cleanup, retention jobs, and sustained write-load tests.
- Offline/supervised time attestation and intervention tracking.
- Connected browser and database acceptance; CI and schema validation remain blocked.

Do not merge to production or claim readiness solely on code and isolated unit tests.
