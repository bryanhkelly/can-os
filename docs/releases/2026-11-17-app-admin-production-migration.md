# Production migration: App Admin grant integrity

**Date:** 2026-11-17
**Repository:** `bryanhkelly/can-os` / `main`
**Neon project:** `sweet-hall-62441909` (`can-os`)
**Neon branch:** `br-restless-sea-ar9ooo55` (`main`)
**Source SQL:** `database/production/2026-11-17-app-admin-grant-boundary.sql`

## Verified execution

- Ran guarded scope and duplicate preflight. Both returned zero violations.
- Applied the three SQL statements (guard block, CHECK, and unique partial index)
  transactionally on isolated Neon `test01`, then on production `main`.
- Queried production `pg_constraint`: the
  `account_person_grants_app_admin_global_scope_ck` CHECK is **validated**.
- Queried production `pg_indexes`: the
  `account_person_grants_one_active_app_admin_per_account_uq` index exists
  on `account_id` where `role='app_admin'` and `active=true`.
- The production `drizzle.__drizzle_migrations` ledger remains at 87 entries.
  This explicitly tracked standalone additive SQL is not a new Drizzle migration.
- There are still **zero active App Admin grants**. No account was created or
  promoted; no approved Person/Site links were inserted.
- The existing baseline canonical staff Person-link and restricted-reader
  migrations had already been applied to production on November 17.

## Deliberately not included

This migration does not execute separate feature workstream DDL proposals,
`test01` fixtures, production staff identity approvals, native canonical
Organization/Site onboarding, or any browser/runtime deployment. Outstanding
WS3/WS5 and other domain migrations require their own reconciled ordering and
validated prerequisites. Do not automatically replay entire
`database/canonical/v3.0.1/schema.sql` against populated production.

## Release status

**Database App Admin integrity gate: PASS.**
**App Admin provisioning and live Blueprint authoring: NOT YET ACCEPTED.**
The application code remains subject to exact-SHA build, authentication,
restricted SQL role, and browser acceptance.
