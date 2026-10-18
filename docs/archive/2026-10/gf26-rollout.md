# GF26 rollout and verification

GF26 is enabled for this first development release, including the public demo.
Reads, mutations, and facilitator review queues use declared synthetic identities
and stay available unless `CAN_DEMO_WRITES_ENABLED=false`. The explicit unavailable
state is only that operator kill switch; it does not query group data.
Query failures surface as errors, not empty successful results.

## Apply to a private synthetic database

1. Back up the test branch.
2. On a fresh isolated database, apply the committed Drizzle migration chain with
   `npm run db:migrate`. GF26 is recorded in `drizzle/0005_nervous_patch.sql` and
   its snapshot/journal; do not apply a second handwritten GF26 migration.
   Existing databases without Drizzle history require schema reconciliation and
   a reviewed baseline before running the migration chain.
3. Apply `scripts/seeds/gf26-study-groups.sql` after prerequisite identity/site fixtures.
4. Check `study_groups`, `study_group_memberships`, `study_group_posts`, and `study_group_sessions`.
   The fixture supplies two groups, approved and pending membership, visible and
   hidden content, an open moderation report, an upcoming RSVP, completed
   attendance, and two canonical calendar entries with fixed dates and IDs.
5. Leave `CAN_DEMO_WRITES_ENABLED` unset or set it to `true`. Set it to `false` only to turn the workflow off.
6. Run `npm ci`, `npm run typecheck`, and `npm test`.
7. Configure a disposable `TEST_DATABASE_URL` and
   `CAN_TEST_DB_WRITES_ENABLED=true` in ignored `.env.local`, then run
   `npm run test:integration`. Never use the deployed application's database.

## Reset and reseed

Use a disposable synthetic Neon branch. To reset, recreate that branch, apply
the committed migrations and prerequisite synthetic identity/site fixtures, then
reapply `scripts/seeds/gf26-study-groups.sql`. Reapplying the seed preserves
existing rows; it is not a destructive reset and does not remove user mutations.
Never reset the deployed database as part of a test run.

## Known release blockers

- Synthetic hard-coded identities require replacement with authenticated, scoped principals.
- Enrollment/section-based eligibility and verified guardian consent must be enforced.
- Facilitator queues need session-based authorization before they can contain real records.
- RSVP, attendance, notification delivery, session updates/cancellations and calendar subscriber tests are unfinished.
- Drizzle generation, build/typecheck, and unit tests can be verified locally;
  real isolated-Neon migration, concurrency, and calendar propagation tests remain
  required before activating the feature.
- No real student data may be loaded into the demonstration.

## Current behavior

Session creation writes a group session and a canonical CalendarEvent in the same transaction.
Event sourceType is `study_group_session` with sourceId set to the new session UUID.
Membership decisions lock the group row before counting approved members so
concurrent decisions cannot overfill capacity.
Repeated join requests preserve approved/pending membership instead of demoting
approved members. Rejoining after leaving clears the old approval metadata.

## Isolated Neon validation (2026-10-16)

A fresh disposable Neon branch `gf26-integrity-20261016` was cloned from production. Read-only SQL verified two synthetic groups, one approved membership, two synthetic sessions, two calendar events, and **zero sessions missing a canonical calendar event**. No production rows were changed. To repeat the fixture integrity test, set `TEST_DATABASE_URL` to this disposable branch, `CAN_TEST_DB_WRITES_ENABLED=true` and run `npm run test:integration:study-groups`; the test itself performs only reads. The full `test:integration` suite runs mutating GF2 workflows and requires separate fresh GF2 fixtures.

This is **fixture preflight, not session creation/cancellation or UI end-to-end acceptance**. Real cross-role execution and notification emission must still be validated against a disposable branch.
