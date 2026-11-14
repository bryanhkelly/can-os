# CAN OS canonical learning sessions and activity evidence

**Implementation:** Merged PR #293 into GitHub `main` on November 14, 2026
(commit `eb131bddd85b93b021cc4a469ceeed14934e9035`).
**Migration:** The five new session/activity/facilitation tables are installed
on Neon `test01` and Neon `main`. Both standalone SQL patches are retained
and their definitions are included in fresh-build `schema.sql`.
**Database security:** All five tables have FORCE ROW LEVEL SECURITY, one
owner-only policy, and no PUBLIC table grants; the SQL structure was verified.
**Release:** `CAN_CANONICAL_ACTIVITY_ENABLED` and
`CAN_FACILITATED_LEARNING_ENABLED` are **off by default**. No feature activation
or end-to-end browser acceptance is claimed.
**CI:** GitHub Actions is still reporting `startup_failure`, not test success.

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
- Forced row-level security applies to all five activity/facilitation tables. The only database policy is migration-owner-only; no general learner or PUBLIC table privileges are granted. Every enabled server operation must still check current participation/host authority.
- Current read model only returns the authorized learner's own course attempt, with no survey answers or private referral data. Provider/network reporting requires separate scope policies and aggregate reads.
- Estimated active milliseconds are not official attended minutes, proof of video consumption or evidence of mastery. Browser events remain untrusted observations even when linked to a published resource.
- Privacy notices, retention and deletion/export policy for children and adults require approval before production instrumentation is scaled.

## Acceptance checks

1. The patches and `patch-learning-session-integrity.sql` are already installed
   on Neon `test01` and `main`. **Do not
   rerun those one-time migrations**. For new isolated databases, apply them
   only after a baseline v3.0.1 schema install.
2. Run `CAN_ACTIVITY_SCHEMA_VALIDATION=1 npm run db:canonical:activity-schema`
   against an explicitly selected nonproduction connection. This read-only
   verifier checks five tables, required columns, composite FKs, indexes,
   forced RLS, owner-only policies, absence of public table grants,
   10 relational/active-time constraints, 6 integrity triggers and private
   SQL guard functions.
3. Run `npm run typecheck`, `npm run lint`, `npx vitest run tests/unit/canonical-learning-activity.test.ts` and recorded-instructor UI tests.
4. Browser test: current learner, another learner, unrelated guardian, revoked login, withdrawn registration, changed course version, cross-organization attempts, two tabs, reload, browser hidden/focus, idle expiry, and retries.
5. Confirm the result read model matches real assessment and survey transactions, and cannot be forged by client events.
6. Test the same learner's noncredit and school course participation independently; external video embeds must not claim watch completion.
7. Approve retention, access/export and monitoring controls before making the telemetry mandatory.

## Not yet delivered

- Production activation of facilitated room pairing and supervised group
  participation; the implementation is present but disabled by default.
- Network-wide reporting and a formally approved provider-versus-host
  authorization policy; preliminary site-scoped participation evidence is
  available only behind the release gate.
- Native video watch-duration measurements; iframe provider analytics require supported provider APIs and consent.
- Automatic session expiry cleanup, retention jobs, and sustained write-load tests.
- Offline/supervised time attestation and intervention tracking.
- Connected learner/browser and cross-site authorization acceptance. The
  live schema and forced-RLS checks have passed, but GitHub Actions/Netlify
  execution have not passed.

The **code and schema have been merged**, not the release decision. Do not
enable either new feature flag until restricted-role, multi-learner, paired-
facilitator, session-expiry and browser flows have passed.

## Deployment integrity verification (November 14, 2026)

The canonical activity domain has 5 tables, 10 additional cross-identity/FK
constraints and 6 triggers enforcing course/participant attribution and
append-only learning evidence. Negative inserts using fabricated learner,
room and playback references failed correctly on Neon `test01`. On Neon
`main`, the 10 constraints, 6 triggers and person/attempt validation function
are installed and verified. Both databases retain forced-RLS owner-only access
and zero PUBLIC table permissions. This is schema acceptance, **not**
end-to-end learner browser acceptance.

One-time patch: `patch-learning-session-integrity.sql`. Its DDL is included in
fresh-install `schema.sql`. The noncredit baseline, enrollment-time policy,
verified-evidence and opt-in automatic-completion patches also passed
installation checks on `test01` and `main`. Run the two explicit read-only
schema acceptance commands before any feature activation:

```sh
CAN_ACTIVITY_SCHEMA_VALIDATION=1 npm run db:canonical:activity-schema
CAN_NONCREDIT_SCHEMA_VALIDATION=1 npm run db:canonical:noncredit-schema
```

Do not enable `CAN_CANONICAL_ACTIVITY_ENABLED` or
`CAN_FACILITATED_LEARNING_ENABLED` until scoped runtime DB roles,
positive/negative learner and host flows, privacy review, and CI are verified.

## Restricted production authentication and current acceptance (November 14, 2026)

**Database permissions (partial, fail-closed):** The Neon `main` database has
the `can_os_canonical_auth_app` restricted NOINHERIT login. It is allowed to
`SET ROLE` to the NOLOGIN `can_v30_canonical_auth_reader` and
`can_v301_credential_learner_reader` roles, which expose session-bound,
SECURITY DEFINER authentication and private learner wallet projections.
It has no direct grant to read Person, raw sessions, or credential issuances,
and no INSERT on the learning session, facilitated room, pairing or playback
tables. Real role-bound negative checks on Neon `main` passed. Run
`verify-learning-release-roles.sql` for repeatable owner-side verification.

**Test01 database-backed acceptance passed:** `test-learning-tenant-acceptance.sql`
creates two independent learner sessions from existing QA organization accounts,
tests organization and Person isolation, fabricated credentials, revoked and
idle sessions, unauthorized learning events, pairings and playback. A controlled
subtransaction rolls back all synthetic session and grant rows.
`test-learning-valid-room-test01.sql` builds a synthetic published course,
approved noncredit registration, active course attempt, live classroom and
successful learner pairing from test01's two named QA organizations. It rejects
wrong-person participation, a pairing after code expiry and a re-pair to an
ended room. All synthetic course, room, registration and session rows are
rolled back after the test. These are **SQL integration tests**, not live
browser execution.

**Room expiry hardening:** `patch-facilitated-pair-expiry.sql` adds the
database-layer fifteen-minute code expiry check (using the stored expiry
timestamp) and eight-hour room age cap. It passed the positive/negative
test01 transaction and is installed on Neon `main`. This is independent
of the existing application pairing expiry checks.

**Remaining production blockers:**
- The learning activity and facilitator modules use `db` through the
  general `DATABASE_URL`; their statements have not yet been migrated to
  narrowly scoped per-request database operations. The separate auth login
  is **not** a blanket replacement for that owner connection.
- The runtime needs a dedicated restricted `CAN_CANONICAL_AUTH_DATABASE_URL`
  and strong `CAN_CANONICAL_ACCESS_TOKEN_PEPPER`. An attempt to save these to
  Netlify was denied with HTTP 403, so the live site's configuration is not
  confirmed.
- The latest published `can-os-demo-new` Netlify build was deployed
  November 5, 2026 (commit `04a93612ef9ae2013695798194641882e9a33446`).
  It predates this implementation. Authenticated browser tests must target
  a new build from the approved commit with separate learner, facilitator
  and foreign-organization test users.
- GitHub Actions still reports `startup_failure`, so the unit tests, TS
  compile, build and Playwright tests are not confirmed passed.

**Keep `CAN_CANONICAL_ACTIVITY_ENABLED` and
`CAN_FACILITATED_LEARNING_ENABLED` disabled** until those blockers are
resolved. Never connect the new restricted login to `DATABASE_URL` as a
shortcut to provisioning the missing module-specific access.
