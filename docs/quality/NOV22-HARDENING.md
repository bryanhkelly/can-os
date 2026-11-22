# November 22 code-quality hardening, branch release-11212026

These changes are implementation work, not executed acceptance evidence.

## Restricted safeguarding commands

- Mutating Case operations acquire the canonical Incident row lock, the
  currently active Person membership lock, and the named assignment lock
  **inside the transaction containing writes, events and audit**.
- Evidence and outside-report idempotency replay is checked inside the same
  authorization transaction; even unique-constraint race recovery rechecks
  current permission and the original payload.
- Overdue takeover additionally locks the current named fallback roster
  appointment. Policy saves and concern intake also lock the active actor
  membership through their transactions. The two obsolete pre-transaction
  authorization helpers are retired to prevent unsafe future reuse.
  Historical case readers remain independent of these writes.
- Unit tests exercise lock order, withdrawn assignment, inactive Person
  grant and sibling-Site rejection. Real two-connection concurrent PostgreSQL
  verification remains necessary before declaring the race fully certified.

## Identity scope and performance

- Program filtering now happens in PostgreSQL with the original, verified
  Organization and Site grant. A deliberate Organization-wide grant uses no
  additional Site predicate. The second in-memory scope projection remains
  as defense in depth.
- The pure SQL predicate is covered with query-compilation unit tests.
  Load testing with representative large Organizations remains outstanding.

## Database migration controls

- `npm run db:migrate` now executes a fail-closed, read-only preflight.
- Only `CAN_MIGRATION_ENV=disposable` on an explicitly approved non-main
  Neon branch is supported; the verified Neon project/branch/database must
  match the caller-provided expected identifiers and journal-tip approval.
- Source SQL and contiguous journal integrity are checked before connecting.
  A mismatched or unverifiable branch fails closed. A production target always
  fails; production migration requires a separately reviewed procedure.
- To test against a disposable Neon branch, provide `DATABASE_URL`,
  `CAN_MIGRATION_EXPECTED_PROJECT_ID`,
  `CAN_MIGRATION_EXPECTED_BRANCH_ID`,
  `CAN_MIGRATION_EXPECTED_DATABASE`,
  `CAN_MIGRATION_EXPECTED_JOURNAL_TIP`, and
  `CAN_MIGRATION_APPROVAL=DISPOSABLE_ONLY:<branch-id>:<journal-index>`.
  Never use this alias for the production main branch. Setting environment
  variables is not equivalent to authorization for production writes.
- Direct invocation of a third-party CLI bypasses npm aliases; secret and
  database permissions must independently enforce the production boundary.

## Marketing Package

- One effect owns the current Site Brand and clears its state while reloading.
- Release-history loading fetches only the immutable Brand version attached
  to a selected package. The previous redundant current-Brand request and
  stale cross-package selected revision were removed.
- Async cancellation is enforced through effect cleanup. The resource-loader
  effects now live in a reusable Site-scoped React hook, separate from the
  working editor's command orchestration and presentation.
- Immutable ZIP manifests and output lists are assembled by a pure, tested
  helper before invoking the browser download. No materials are regenerated.
- A stale editor-session test expected the retired implicit `promote` mode;
  it now checks the canonical `create-outreach` default while retaining the
  explicit module-switch tests. Larger command-controller extraction remains
  a follow-up.

## Independent CI

`.github/workflows/quality-independent.yml` contains five unrelated jobs:
source integrity, authorization regression, application build/full TypeScript,
lint/design warnings and Cloudflare bundling. These do not depend on each
other and operate without production database credentials. Existing CI remains
in place.

**Important:** Earlier GitHub Actions jobs all reported `steps:null`
and failed within seconds. That suggests a runner/provisioning issue, but no
exact cause is verified. Adding independent jobs cannot fix an account/runner
failure. A job is a passing gate only after it has actually executed its
steps and recorded a successful conclusion for the exact commit.

Do not merge, migrate a live database or claim production acceptance until
TypeScript, lint, tests, browser and disposable-database checks have run.

## Release follow-up: 0102 reporting access, correction integrity and Worker isolation

- Added immutable SQL-only migration `0102_reporting_source_service_access`, including
  a `NOLOGIN` `can_reporting_service` capability, explicit SELECT/INSERT
  policies on private reporting tables, and restricted retry UPDATE on receipts.
  No migration grants this role to an application login. Anonymous,
  authenticated and PUBLIC retain no reporting table privileges.
- `FORCE ROW LEVEL SECURITY` remains enabled. The service role has broad
  internal reporting visibility, **not per-Site SQL tenant isolation**.
  Site and Organization authorization must continue to be enforced by
  the reporting service layer for every user request. Do not expose the
  service capability to a client-facing database session.
- Deployment prerequisite: on an isolated Neon branch, review the login
  identity returned by `current_user`, verify that it cannot bypass RLS,
  and explicitly approve its inherited `can_reporting_service` membership.
  A DBA must make that grant outside the SQL migration. Do not grant the
  role to `neondb_owner` reflexively, and do not enable reporting flags
  until the exact runtime login passes both read-only schema preflights.
  Production migration and role grants require a separate approved plan.
- The migration ledger includes the Git blob checksum for 0102. The
  disposable Postgres acceptance now checks the seven policies, minimal
  privileges, no publicly accessible tables, and service-role SELECT
  queries under actual RLS. A successful disposable run does not certify
  Neon ownership, permissions, or business-row isolation.
- Reporting corrections now verify normalized prior source identity and
  both envelope-level and outbox-level Organization/Site/Program scope.
  A legacy predecessor without normalized evidence is rejected rather
  than silently reattributed. Unit tests cover cross-Site injection,
  invalid Program claims, missing history and time conflicts.
- Cloudflare WebSocket pools must remain inside the request-scoped database
  lifecycle. Missing Worker rate-limit bindings now fail HTTP 503 rather
  than falling through the Node ingress; direct unscoped Worker database
  access throws. Node/Netlify still uses its intentional lazy pool.
- Generated website CSS includes a regression assertion against the
  literal `/n` typo; it also checks for actual line breaks. This is
  separate from the full source syntax, route and import/export gates.

### Remaining verification gates

**No build/test success is implied by these commits.** Run application and
Cloudflare builds, full TypeScript, lint, unit tests, disposable Postgres
migration acceptance, and real Neon role/tenant authorization checks on
the exact release commit before promoting PR #359. CI runners previously
returned zero executed steps; that infrastructure failure is independent
of source correctness.
