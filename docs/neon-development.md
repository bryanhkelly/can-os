# Neon development and test strategy

CAN OS uses Neon PostgreSQL as the production system of record.

## Environments

Use separate Neon branches for:

- production
- staging
- developer work when persistent data is useful
- pull-request / Golden Flow integration tests

Never point integration tests at production.

## Golden Flow integration tests

Golden Flow tests intentionally create realistic records across multiple domains. Prefer an isolated Neon branch over complicated fixture teardown.

A CI job should:

1. create or select an isolated Neon branch;
2. set `DATABASE_URL` to that branch;
3. run migrations;
4. run `npm run test:integration`;
5. delete the temporary Neon branch.

`npm test` excludes database integration and browser test files; run the explicit
integration command below for database-backed acceptance.
When a database is supplied directly, the test setup requires `APP_ENV=test`,
`CAN_TEST_DB_WRITES_ENABLED=true`, and non-production mode.

For explicit integration validation, put the disposable branch connection in
`TEST_DATABASE_URL` in ignored `.env.local` and set
`CAN_TEST_DB_WRITES_ENABLED=true`, then run `npm run test:integration`.
This command refuses to run without the isolated connection and opt-in; it
never falls back to the application `DATABASE_URL`. If both connections are
present, their endpoints must differ, including pooled/direct variants.
The integration command loads `.env.local` for the child test process only.
Skipped tests do not count as database-backed acceptance verification.

## Migrations

The Drizzle schema is canonical in source control. Generate SQL migrations with:

```bash
npm run db:generate
```

Review generated SQL before applying it.

`db:generate` compares source schema with committed snapshots; it does not
inspect Neon or prove that a deployed database is current.

Apply committed migrations with:

```bash
npm run db:migrate
```

Do not use `db:push` against production.

If an existing database has tables but no Drizzle migration-history table,
do not replay the initial migrations against it. Compare the deployed schema
with committed snapshots and establish a reviewed baseline first. Production
migrations require explicit approval and successful isolated validation.

If the migration ledger stops before schema objects that already exist,
treat the database as drifted rather than assuming every unrecorded migration
is safe to replay. Compare `drizzle.__drizzle_migrations` with committed SQL and
the deployed catalog on an isolated copy. On Windows, a hash mismatch may be
caused by CRLF versus LF; compare the committed file representation before
concluding that an applied migration was changed. Do not rewrite migration
history, stamp missing ledger entries or use `db:push` as a shortcut.

The historical drift audit and subsequent approved production reconciliation
are recorded in [CURRENT-STATE.md](./CURRENT-STATE.md). That rollout used a fresh
production copy, a clean replay of committed migrations as the reference,
catalog equivalence and existing-record preservation checks, isolated integration
tests, and an independent pre-change recovery branch. Missing ledger entries
were appended only after the reconciled schema passed those checks in the same
transaction; existing ledger entries were not rewritten. This is not permission
to stamp unverified histories on other branches.

Confirm the Neon project, branch and endpoint with management metadata before
any rollout. The reconciled target is branch `production` at endpoint
`ep-autumn-glade-ar9r1t5q`; endpoint `ep-noisy-bird-arruu0it` belongs to `test01`.
Neither connection variable names nor a passing `db:generate` establish target
identity or migration status.

### Calendar scheduled-occurrence rollout

Migration `0023_panoramic_slapstick` is an **expand** migration, not a cleanup
migration. It adds and backfills `scheduled_occurrences` and links each existing
calendar event. Migration `0025_calendar_occurrence_compatibility` installs
database triggers that bridge inserts and schedule/scope updates from older
application versions. The compatibility columns on `calendar_events` remain
required for now. Do not edit a migration after it is recorded on a target
branch or use this step to remove columns.

Before a production rollout:

1. Inventory every deployed application revision, background job, seed/import
   script, scheduled task, and direct SQL integration that reads or writes
   `calendar_events`. Repository search is necessary but cannot establish
   whether external consumers exist.
2. Restore a fresh isolated branch from the production schema/data state and
   validate this exact migration there. Confirm existing calendar events keep
   their IDs and values, every event has a valid linked occurrence, and
   legacy-shaped inserts/reschedules stay synchronized. Run the full
   integration suite on that branch.
3. Obtain explicit production migration approval, verify project/branch/
   endpoint independently, confirm a recovery branch, and apply migration
   `0023` and `0025` before deploying code that reads `scheduled_occurrences`.
4. Deploy the canonical-reader application. The migration bridge allows an
   older application instance to continue writing during a rolling deployment.
   Verify all instances and jobs have moved to the new revision and run
   authorized calendar create, reschedule, cancellation, and role-visibility
   smoke checks. Do not roll back the schema while the new application is
   running; an application rollback may retain the additive schema and bridge.

Migration `0023` was replayed transactionally on the current opted-in isolated
test branch, which had 488 calendar rows at the time. Existing rows were
backfilled and matched, legacy-shaped insert/update checks passed, and the
transaction was rolled back. The database migration ledger's recorded hash
for `0023` does not match the current workspace file, however. The exact
previously applied file has not been recovered; do not describe this branch as
a clean migration replay. Recover and reconcile the migration source/checksum
before any production rollout. This validation does not replace the fresh
production-copy rehearsal or authorize applying any migration to production.

On 2026-10-19, read-only Neon management and database checks confirmed the
production branch `br-restless-sea-ar9ooo55` is at `0022`; every recorded
migration hash matches source (allowing LF normalization). Production has not
applied `0023`, so the checksum mismatch above belongs to the older isolated
test branch, not production. Recovery branch
`calendar-pre-rollout-2026-10-19T18-20-23-197Z`
(`br-shiny-tooth-ar9dc51o`) was created before any production mutation.
The project branch quota blocked creation of the fresh rehearsal branch.
The owner declined branch deletion and changed the request to commit only;
production remains unchanged and production-copy validation is still required.

A later **contract** change is a separate approved release. It may remove the
compatibility columns only after deployment records show no old application
instances/jobs, external consumers are affirmatively cleared by their owners,
and the agreed observation window contains no legacy-writer use. The bridge
emits the value-free PostgreSQL log markers
`calendar_occurrence_compat_legacy_insert` and
`calendar_occurrence_compat_legacy_update` only when it has to create or
reconcile canonical schedule data. Confirm database log retention and query
these markers for the full observation window; deployments alone cannot
exclude direct SQL integrations.

Before contracting, all application writes must work with nullable/absent
compatibility fields and all reads must use the occurrence relation. Validate
value consistency and data preservation on an isolated production copy. The
following read-only check should return zero before and after the rollout:

```sql
SELECT count(*) AS mismatched_calendar_schedules
FROM calendar_events AS e
JOIN scheduled_occurrences AS o ON o.id = e.scheduled_occurrence_id
WHERE e.starts_at IS DISTINCT FROM o.starts_at
   OR e.ends_at IS DISTINCT FROM o.ends_at
   OR e.timezone IS DISTINCT FROM o.timezone
   OR e.organization_id IS DISTINCT FROM o.organization_id
   OR e.site_id IS DISTINCT FROM o.site_id
   OR e.program_id IS DISTINCT FROM o.program_id
   OR e.section_id IS DISTINCT FROM o.section_id;
```

Then remove the triggers, functions, legacy indexes/constraints, and columns
in a reviewed migration. If any consumer remains unknown, retain the bridge
and columns. Existing synthetic seed scripts still insert the legacy
`calendar_events` schedule columns; update only supported non-demo seeds as part
of a future contract release, and keep demo/fixture work out of scope unless
that scope is explicitly reopened.

## Connection handling

The application uses Neon's serverless PostgreSQL driver through Drizzle. Domain code should depend on application services/repositories rather than Neon-specific APIs so the relational model remains ordinary PostgreSQL.
