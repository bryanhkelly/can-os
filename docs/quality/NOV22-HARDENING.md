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
  appointment. Historical case readers remain independent of these writes.
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
