# Neon development and test strategy

CAN OS uses Neon PostgreSQL as the production system of record.

## Environments

## Admissions and GF1 CI acceptance (FullFlow)

Both `Admissions Neon Acceptance` and `GF1 Neon Acceptance` run against
a **separate, nonproduction** Neon branch. They share a GitHub Actions
concurrency group so migrations and synthetic fixtures cannot race each other.
The jobs require the `integration-test` GitHub Actions environment to have:

- Secret `CAN_ADMISSIONS_TEST_DATABASE_URL`: the PostgreSQL connection
  string for an isolated Neon test branch in CAN OS project
  `sweet-hall-62441909`; **never** the production branch or production URL.
- Environment variable `CAN_APPLICATION_DB_HOST`: the hostname of the
  production/application database endpoint (no protocol, credentials, port,
  or database path; pooled and direct names are normalized).
- Environment variable `CAN_ADMISSIONS_TEST_BRANCH_ID`: the test branch's
  actual Neon `br-...` ID, taken from Neon, not a human-readable name.
  Production branch `br-restless-sea-ar9ooo55` is prohibited.

Set these at **GitHub → repository Settings → Environments →
integration-test**. A repository-level variable can also be used when the
environment does not override it. Treat the connection string as a secret;
never add it to Git, docs, tests, comments, or Actions output.

Neon's project currently has a limited branch quota. If a new dedicated
admissions test branch cannot be created, obtain approval before retiring a
stale branch or increasing the quota. Do not silently repurpose production,
delete another team's branch, or force admissions acceptance onto the shared
FullFlow branch. Once an isolated branch exists, configure the settings and
manually dispatch **Admissions Neon Acceptance** on `FullFlow`, followed by
**GF1 Neon Acceptance**. Only successful migration, integration, and
authenticated browser steps constitute these acceptance results.

The workflows call `scripts/verify-admissions-neon-branch.mjs` *before*
migration. The test wrappers also verify identity before executing database
fixtures or browser tests. The check is read-only SQL using Neon-reported
`neon.project_id` and `neon.branch_id`, and refuses missing settings,
another project or branch, and the known production branch. Offline
`--preflight` is only a URL/hostname separation check, not proof of actual
Neon branch identity. Never bypass this online check to make a job green.


**FullFlow branch-specific safety (2026-10-23):** For FullFlow use the single
approved disposable branch `fullflow-e2e-20261022` (ID
`br-proud-pine-arfju8h2`, project `sweet-hall-62441909`).
Only the `full-flow` mode of `scripts/run-integration-tests.mjs` and
`scripts/verify-fullflow-schema.mjs` require a real SQL identity check
against Postgres settings `neon.project_id` and `neon.branch_id`.
Matching URL hostnames or a caller-supplied branch label are NOT sufficient.
An offline `--preflight` checks only endpoint separation; it does not verify
actual Neon branch identity. The recommended protected migration command is
`npm run db:migrate:fullflow -- --preflight` (read-only connection check), then
`npm run db:migrate:fullflow` after migration review. Both require
`TEST_DATABASE_URL`, `CAN_TEST_DB_WRITES_ENABLED=true`, a distinct
`CAN_APPLICATION_DB_HOST`, and a nonproduction Node environment. The
migration wrapper passes the database-attested URL to the existing Drizzle
`db:migrate` command. Other independent admissions/GF1/curriculum test
suites retain their existing separate test branch configurations and must not
be forced onto the FullFlow branch. Never run unrestricted `db:push` or
`db:migrate` against the application database as a way of fixing drift.


Use separate Neon branches for:

- production
- staging
- developer work when persistent data is useful
- pull-request / Golden Flow integration tests

Never point integration tests at production.

## Current isolated acceptance configuration (2026-10-31)

The `integration-test` GitHub environment needs secrets scoped to its
specific Neon branches, not production credentials:

| Workflow | Database secret | Attested branch setting |
| --- | --- | --- |
| Admissions and GF1 | `CAN_ADMISSIONS_TEST_DATABASE_URL` | `CAN_ADMISSIONS_TEST_BRANCH_ID` (environment variable) |
| Curriculum browser and curriculum journey | `CAN_CURRICULUM_TEST_DATABASE_URL` or the workflow's `CURRICULUM_TEST_DATABASE_URL` | `CAN_CURRICULUM_TEST_BRANCH_ID` (environment variable) |
| FullFlow connected release | `CAN_FULLFLOW_TEST_DATABASE_URL` | Pinned `br-proud-pine-arfju8h2` in code; no caller-provided override |

All require the `CAN_APPLICATION_DB_HOST` environment variable as an
independent application-endpoint comparison. Other integration runners require
`CAN_INTEGRATION_TEST_BRANCH_ID` or an applicable suite-specific branch ID.
Browser configurations now verify the Postgres-reported Neon branch **even
when Playwright is called directly**, not only when launched by an npm wrapper.
Offline `--preflight` checks are not database identity or migration proof.

The CAN OS Neon project reached its branch limit during acceptance setup.
Request a higher limit or explicitly authorize retirement of unused test
branches before creating a new dedicated admissions/curriculum branch. Never
delete branches, use production, or silently co-opt the FullFlow release branch
to satisfy an unrelated acceptance job. GitHub does not expose secrets through
the configured connector, so these values require environment administration.

## Scheduled delivery and safety monitoring

The Netlify scheduled functions
`netlify/functions/scheduled-jobs.ts` (every five minutes) and
`netlify/functions/school-family-alerts.ts` (every minute) **throw** when
`URL` or `CAN_JOB_SECRET` is absent, or when the authenticated app
endpoint returns a failure. Configure alerts for failed/missed scheduled
invocations in Netlify monitoring and verify recent successful invocation
timestamps against the deployment before opening a school. Application
outbox health also needs review for terminal events/notifications.
A build or a deployed schedule definition does not prove delivery.
Do not include raw family emails, student details or access tokens in logs.

## Network onboarding acceptance mode

Run `node scripts/run-integration-tests.mjs network-onboarding --preflight` to
check the disposable database endpoint guard without writing. Then run
`npm run test:integration:network-onboarding` against that same isolated,
migrated database, using `TEST_DATABASE_URL`,
`CAN_TEST_DB_WRITES_ENABLED=true`, and a distinct `CAN_APPLICATION_DB_HOST`.
This mode runs both denomination-affiliation and CAN agreement/HQ-provision
synthetic integration files. They use rollback transactions and must not be
pointed at production. CI unit tests alone do not execute these fixtures.

The synthetic signed-contract and HQ authorization evidence are fabricated
records in the disposable transaction only. A passing test cannot certify a
real contract, true signer authority, production email delivery, or deployed
browser behavior.

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

The focused watch-delivery history check is
`node scripts/run-integration-tests.mjs delivery-history` (or append `--preflight`
to check endpoint safeguards without running tests). It requires an application
endpoint for comparison and uses the same disposable-database opt-in. Its
synthetic identities, watches, events and deliveries are rolled back; it does
not migrate or seed the application database.

Use `node scripts/run-integration-tests.mjs qualification-readiness` for the
focused credential-review-to-launch-readiness check; `--preflight` is also
supported. It exercises actual review commands, immutable decisions, audit/
outbox evidence, revocation and effective dates in a rollback transaction,
with no application migration or persistent seed.

The same `qualification-readiness` check exercises effective delivery dates:
inclusive start/exclusive end, open-ended/undated windows, empty/inverted
windows, future/ended/completed alternatives, and current-arrangement selection.
It verifies readiness uses the supplied evaluation time without writing
delivery evidence or changing stored arrangements.

Use `node scripts/run-integration-tests.mjs capacity-expiry` for the focused
instructional-reservation expiry check; `--preflight` is also supported. It
uses a controlled clock and actual reservation/delivery commands to verify
expiry boundaries, availability versus coverage, failed activation, renewal
and release. It also checks activation retries, capability/scope denials on
active retries, terminal-state rejection, unchanged timestamps and one-time
audit/outbox evidence. These are single-connection rollback tests, not proof of
multi-connection race behavior. Synthetic fixtures are rolled back and no
migration is applied.

Use `node scripts/run-integration-tests.mjs launch-staffing` for the configured
staffing-to-opening check and the existing two-scenario GF3 launch regression.
It also supports `--preflight`. Both files run in rollback transactions. When the
policy-version enum lacks `published`, the fixture recreates that enum within
its transaction and exercises migration `0024_quick_scalphunter.sql` there,
so PostgreSQL permits using the new enum value without a committed migration.
Fixture DDL, policies, credentials, assignments, audit/outbox records and program
activation are rolled back. This is not approval to migrate the application
database; deploy the reviewed enum migration before deploying its consumers.
The handoff check also exercises teacher credential submission and independent
review endpoints; private R2 signing/verification is mocked at the storage
boundary. It does not upload objects, enable deployment upload switches or
establish live-bucket CORS/conditional-write acceptance.
Its shared qualification entry is created through the explicit-steward catalog
command, including missing-grant, membership/scope, malformed-input and
conflicting-retry denials. The catalog entry, steward fixture grant and its
audit/outbox evidence are rolled back, and an independent query confirms the
entry is absent. This creates no persistent catalog entries or real steward
grants.

Use `node scripts/run-integration-tests.mjs admissions-offers` for both
final-seat concurrency and the registrar/guardian/student acceptance handoff.
It uses the same isolated-database safeguards. The new handoff fixture invokes
canonical application, readiness, offer, activation and section-placement
commands inside a rollback transaction, then independently verifies its
application, profile, enrollment and withdrawal audit are absent. It covers
role/program/relationship denials, revoked offers, readiness regression,
identity continuity, one-time evidence/notifications and family/student class
visibility. The older separate-connection concurrency fixture persists its
synthetic records in the disposable database; do not describe the entire mode
as rollback-isolated. Neither test applies production migrations or grants.
The handoff fixture also exercises guardian checklist/document requests,
rejection, replacement, approval and readiness-to-activation. R2 signing and
object verification are mocked; no private bytes leave the test process.
Verification and outbox failures preserve the prior document state, changed
upload retries fail, and independent cleanup queries check the document and
outbox are absent after rollback. This does not enable live uploads.
The mode also runs the older GF2 enrollment regression, for **three files**.
The handoff fixture now exercises configured form materialization, authenticated
guardian signing, mandatory registrar review, correction/re-signing, no-waiver
denials, stale/changed retries, signer revocation, audit/outbox rollback, and
program-selected packet creation through registrar intake. No genuine
enrollment agreement is signed: all packet text and identities are synthetic.
The older offer-concurrency and GF2 fixtures persist synthetic records in the
disposable database; only the handoff fixture is fully rollback-isolated.
Admissions mode also verifies waitlist/restore identity continuity, explicit
offer withdrawal before intake closure, terminal application decisions, stale
acceptance denials and stage-outbox rollback. The separate-connection fixture
races the actual registrar waitlist command against offer issuance in both
request orders, asserting exactly one committed decision and consistent
application/offer state. These additional concurrency records are synthetic
and persist only in the guarded disposable database.

### Authenticated Admissions browser acceptance

Run `npm run test:e2e:admissions` (or
`node scripts/run-admissions-e2e.mjs --preflight` for guard checks only).
It requires `TEST_DATABASE_URL`, `CAN_TEST_DB_WRITES_ENABLED=true`, and a
different application endpoint supplied by `DATABASE_URL` or
`CAN_APPLICATION_DB_HOST`, like the integration mode. Both pooled and direct
variants of the same Neon endpoint are rejected. It does not use the
application database as a fallback.

The runner starts its own local app at `http://localhost:3187` with strict port
selection and refuses to reuse an existing server. The shared dev app and
browser sessions are not modified. It forwards the disposable database,
synthetic-only session pepper and disabled R2 upload switches to that server.
The dedicated Playwright configuration is separate from the default GF1 suite;
direct invocations must satisfy the same test-environment/database guards.

Fresh synthetic fixtures reuse the real account/session format; no login
bypass or mocked server functions are added. The browser signs/corrects a
form, completes mandatory registrar review, restores a waitlisted applicant,
accepts an offer, activates enrollment and assigns a class. It checks student
class visibility and denial of registrar access, and then queries persisted
identity, signature/review, enrollment and event evidence.

These browser transactions commit. Immutable audit history must not be deleted
or its protections disabled: synthetic records and evidence remain on the
disposable branch. Teardown revokes all fixture sessions, deactivates its
grants, disables its accounts and independently verifies none remain usable,
including on test failure. Fresh IDs make subsequent runs independent. This
is not the rollback-isolated handoff fixture. No genuine agreement, production
grant, real document upload or external notification delivery is performed.

The focused attendance check is
`node scripts/run-integration-tests.mjs attendance-handoff`; it also supports
`--preflight` and requires the application-endpoint comparison. It runs the new
cross-role attendance/calendar/schedule fixture and the earlier GF4 service
regression. The new fixture rolls back its identities, configuration,
attendance, excuses and evidence and independently checks absence afterward.
Notification email is mocked so this acceptance run sends no external email.
The earlier service regression persists synthetic records in the disposable
database; do not describe the entire mode as rollback-isolated. No schema
migration or production writes are part of the command.

The focused curriculum release check is
`node scripts/run-integration-tests.mjs curriculum-authoring`; `--preflight`
uses the same isolated-database and application-endpoint safeguards. It runs
the authoring-to-classroom fixture and the existing class-participation
regression. Both use rollback transactions and independently check cleanup.
The new fixture exercises real authoring/publication, immutable class pinning,
completion preservation and publisher denials, and applies the synthetic
studio seed twice inside its rollback transaction to verify repeatability.
The manifest declares `curriculum-authoring.sql` after `new-experiences-v1.sql`;
it is synthetic-only and has not been applied to any deployed environment.
No real publisher grants, schema migrations or production writes are authorized
by running this mode. Browser acceptance and verified private resource
publication remain separate gates.

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
The owner initially declined branch deletion and changed the request to commit
only; no production mutation occurred at that stage.

The owner subsequently approved production migration with an explicit
alternative validation plan: rehearse transactionally on the existing recovery
copy and roll back, rather than delete another branch to run a separate full
integration suite. That rehearsal passed on 2026-10-19 at 19:09 UTC. It exercised
the exact committed `0023`-`0025` SQL, data preservation, legacy-shaped inserts,
schedule/timezone/scope updates, explicit occurrence links and idempotent bridge
installation. The schema and ledger changes were rolled back and verified
absent on the recovery branch. This was not a full integration-suite run on a
fresh branch; the committed release had separately passed 484 unit tests and
nine focused integration tests on the existing isolated test database.

At 19:09 UTC, the same committed SQL was applied transactionally to confirmed
production endpoint `ep-autumn-glade-ar9r1t5q`. The migration transaction used
bounded lock/statement timeouts, checked existing ledger hashes, and validated
data preservation before committing. Production is now at `0025`; a separate
connection verified the ledger hashes, both enabled bridge triggers, validated
foreign keys, required occurrence links, indexes and the `published` enum value.
All six existing calendar events retained their original values and participant
records, with zero missing occurrences or schedule/scope mismatches. No fixture
records were inserted into production. The recovery branch remains at its
pre-migration state. This records database migration, not application deployment
or browser acceptance; no Git push or application rollout was performed.

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
