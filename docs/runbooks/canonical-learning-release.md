# Canonical learning activity and facilitated rooms: release gate

Release target: CAN OS GitHub `main` and Neon `sweet-hall-62441909` production
branch `br-restless-sea-ar9ooo55`. Acceptance branch: `test01`,
`br-bitter-feather-ar0u63x7`.

## Deployment prerequisites

1. Ensure a current **successful build of GitHub main** exists. A skipped Netlify
   build does not validate the application or deploy the latest code. As of
   2026-11-14 Netlify reports **account builds usage exceeded** for
   `can-os-demo-new`. Do not claim release validation while builds are skipped.
2. In the Netlify **production** environment, use approved secret-management
   permissions to set:
   - `CAN_CANONICAL_AUTH_DATABASE_URL`: Neon production `neondb` connection
     string for role **`can_os_canonical_auth_app`**. Never use the schema
     owner or the general `DATABASE_URL`.
   - `CAN_CANONICAL_ACCESS_TOKEN_PEPPER`: distinct random secret at least
     32 characters. Coordinate with canonical token issuance; changing a
     previously used pepper invalidates existing native session cookies.
   - `CAN_FACILITATED_PAIRING_PEPPER`: separate random secret at least
     32 characters.
3. Leave `CAN_CANONICAL_ACTIVITY_ENABLED` and
   `CAN_FACILITATED_LEARNING_ENABLED` **off** until the tests below pass.
   Do not copy secrets into GitHub, commit them, or paste them into tickets.

## Database permission expectations

- `can_os_canonical_auth_app`: LOGIN, NOINHERIT, no BYPASSRLS or broad
  schema-owner membership.
- `can_v30_canonical_auth_reader`: NOLOGIN, NOINHERIT; permitted to EXECUTE
  only the `education_v30.v301_canonical_session_context(text)` projection.
- The app role may `SET LOCAL ROLE can_v30_canonical_auth_reader` in a
  read-only transaction. Neither role may directly SELECT canonical account,
  grant, session or learning evidence tables.
- Learning evidence tables have forced RLS. The trusted evidence command
  implementation still performs person, Course attempt and Site checks.
- `room_facilitator` grants are explicitly Site scoped and are not automatically
  issued by the migration.
- `can_auth_gateway` is the empty gateway schema used to provision the
  dedicated restricted login. It must not contain readable PII tables.

## Required checks before turning on either flag

From a secure build or test runner with the appropriate environment:

```sh
npm run db:canonical:auth-reader
npm run typecheck
npm run test -- tests/unit/canonical-learning-activity.test.ts \
  tests/unit/canonical-learning-outbox.test.ts \
  tests/unit/facilitated-learning.test.ts \
  tests/unit/canonical-access.test.ts \
  tests/unit/canonical-learning-release-readiness.test.ts
npm run build
```

Use a synthetic **test01** canonical facilitator and learner session to verify
valid grants, revoked/expired sessions, Site isolation, cross-deployment
pairing denial, pairing rate limiting, video-rights denial, native video
heartbeat, event retry/dedupe and real survey/knowledge-check outcomes.
No academic grade or attendance may be awarded from client observations.

Record and resolve all failed tests. Confirm the live deployment commit equals
the intended GitHub `main` SHA before activating either flag, and then repeat
the smoke tests on the actual deployed build. Avoid production synthetic
learner writes unless separately approved.

## Current operational blockers (2026-11-14)

The connected Netlify management API returned **HTTP 403** when attempting to
set `CAN_CANONICAL_AUTH_DATABASE_URL`. The project currently has no canonical
reader URL or canonical token pepper in its listed production variables.
Netlify is also skipping builds because the account exceeded its build
allowance. These must be addressed by an authorized Netlify operator before
application/browser acceptance and rollout.

These blockers do **not** invalidate completed test01 or production Neon
database role checks. They do mean the feature remains unlaunched.

## Verified database acceptance (2026-11-14)

Production Neon `main` has the existing restricted login `can_os_canonical_auth_app`
(LONG-LIVED login, NOINHERIT and no BYPASSRLS or schema-owner membership).
It has explicit SET-role memberships in two NOLOGIN purpose roles:
`can_v30_canonical_auth_reader` and
`can_v301_credential_learner_reader`. Tested **while logged in as the
restricted application role**, not as the owner:

- Native auth can invoke only the approved session projection. It cannot
  directly SELECT sessions, grants or people, and fabricated session hashes
  resolve to no account.
- The learner wallet can invoke only the approved list/download projections.
  It cannot SELECT people, sessions, awards or probe arbitrary credential
  status. Fabricated session hashes return no awards.
- The server now rejects a privileged, shared or malformed
  `CAN_CANONICAL_AUTH_DATABASE_URL`. It must identify the exact restricted
  `can_os_canonical_auth_app` login and not equal `DATABASE_URL`.
  Unit tests are committed but CI still needs repair.

On Neon `test01`, the following **committed and repeatable rollback-only SQL
acceptance files** passed, leaving zero synthetic sessions, grants, attempts
or rooms behind:

```sh
psql "$TEST01_SCHEMA_OWNER_URL" -v ON_ERROR_STOP=1 \
  -f database/canonical/v3.0.1/acceptance-test-native-learner-isolation.sql

psql "$TEST01_SCHEMA_OWNER_URL" -v ON_ERROR_STOP=1 \
  -f database/canonical/v3.0.1/acceptance-test-facilitated-pairing.sql
```

The session fixture creates two Organization-scoped learner grants, tests both
valid sessions, wrong-Organization access, forged hashes, revoked/idle sessions
and private wallet read isolation. The classroom fixture creates a valid
temporary course, published Offering, Deployment, learner attempt and room,
then verifies positive pairing, unrelated learner denial, expired re-pair
denial, closed-room denial and rollback cleanup. These are real PostgreSQL
tests, but **not** browser or production-credential sign-in tests.

From the restricted **production auth login**, verify both permitted role
projections before enabling a flag. The committed
`verify-production-credential-reader.sql` checks one of the role boundaries.

**Operational limitations:** Netlify returned HTTP 403 when attempting to set
the production canonical reader URL/pepper, and its most recently published
`can-os-demo-new` build is from 2026-11-05, not the current `main`.
The live browser service was also unavailable for the requested run.
Do not turn on either learning release flag or claim current-build
end-to-end acceptance until secret configuration, a matching deploy SHA
and authenticated learner/facilitator Playwright tests have passed.
