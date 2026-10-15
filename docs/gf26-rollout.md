# GF26 rollout and verification

The first GF26 implementation is intentionally behind the synthetic write gate.
Production mutations and facilitator-private review queues remain disabled.

## Apply to a private synthetic database

1. Back up the test branch.
2. Apply `scripts/migrations/gf26-study-groups.sql` with a transaction.
3. Apply `scripts/seeds/gf26-study-groups.sql` after prerequisite identity/site fixtures.
4. Check `study_groups`, `study_group_memberships`, `study_group_posts`, and `study_group_sessions`.
5. Set `CAN_DEMO_WRITES_ENABLED=true` only in private development and never in a public deployment.
6. Run `npm run typecheck`, `npm test`, and `npm run test:integration` before merge.

## Known release blockers

- Synthetic hard-coded identities require replacement with authenticated, scoped principals.
- Enrollment/section-based eligibility and verified guardian consent must be enforced.
- Facilitator queues need session-based authorization before they can contain real records.
- RSVP, attendance, notification delivery, session updates/cancellations and calendar subscriber tests are unfinished.
- Schema and handwritten migration require Drizzle snapshot/journal reconciliation.
- Tests in this PR have been committed, but not executed or green-verified by this assistant.
- No real student data may be loaded into the demonstration.

## Current behavior

Session creation writes a group session and a canonical CalendarEvent in the same transaction.
Event sourceType is `study_group_session` with sourceId set to the new session UUID.
