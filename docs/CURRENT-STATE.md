# CAN OS — current implementation snapshot

**Baseline reviewed:** `main` at `80f6c66` (2026-10-18), plus the academic Action and mutation-evidence follow-ups included with this snapshot. The prior academic/conference authorization follow-up was pushed in `75a83be`. Local automated results are recorded below; they are **not** a verified deployment, production acceptance, security audit, or assertion that remote CI has passed.

**Repository cleanup review:** based on `main` at `6be1a57` (2026-10-18), plus the cleanup changes on `chore/repository-stabilization-20261018`. This refresh covers unused-source tracing, the route inventory, local checks and a read-only audit of the locally configured Neon connection, not a full product acceptance review. Earlier integration results remain historical evidence.

**Latest database evidence:** production reconciliation completed at **2026-10-19 06:40:10 UTC**, against committed migration source at `f013878`. See the rollout section below; it supersedes the historical drift findings, not the outstanding product acceptance gates.

## Integrated source baseline

- The main branch includes the development changes associated with Phases 1, 2 and 3. Phase 1 PR #120 is marked merged by GitHub. The Phase 2 and Phase 3 implementation work was integrated via commits on `main`; PRs #121 and #122 were closed without GitHub reporting them as merged. Do not use those original PR states as instructions for future branching.
- `src/routes/` contains **66** TypeScript/TSX route source files, matching `docs/platform-route-contracts.json`. The registrar transcript route is owned by Learning, which supplies its canonical read and issuance commands. **Every route's verification, role journey, read boundary and write boundary remains `pending`.** Recording ownership is not acceptance. The separate fixture-coverage checker reports 59 route declarations; neither inventory is browser acceptance.
- Workspace entry uses server session grants (`src/routes/index.tsx`, `src/components/shell/WorkspaceNavigation.tsx`). Module-level authorization still requires code and negative-access tests.
- Existing student/teacher group routes now call canonical creation, consent, posting, moderation, session, RSVP and attendance commands. The old combined `study-groups.functions.ts` mutation module was retired; retained read projections in `study-group-queries.functions.ts` preserve existing page shapes. Isolated integration tests cover interest groups, consent, duplicate reports, moderation, RSVP-independent attendance, and session reschedule/cancellation.
- Admissions offer commands are present under `src/modules/enrollment/admissions-offer-service.ts` and related server functions; some paths still use `assertRecordWriteAllowed` or synthetic-prefixed compatibility names. Do not misreport them as uniformly provenance-neutral or production accepted.
- Calendar, learning, attendance, family, support, launch and Ask CAN modules exist. Presence of source modules is not proof of cross-role end-to-end completeness.
- Domain modules use shared audit/event/inbox writers, guarded by `scripts/check-mutation-hygiene.mjs`. Enrollment and learning attachments share private R2 signing and bounded object verification. Conferences, field trips and activities share source-aware calendar projection infrastructure; activity seasons still support multiple occurrences.
- Grade finalization/correction and placement prerequisites use versioned grade-scale policy, including custom passing labels and bounded extra-credit handling. Staffing status enum migration `0021` is applied to the confirmed production branch as part of the reconciled rollout below.
- Approved agent writes use the approval transaction. The Academic Domain API now shares a program-and-relationship predicate across student discovery and summary sections: missing/empty program grants deny visibility, supplied site/section lists restrict it, and teachers only see their assigned sections. Tests cover revoked relationships/assignments and approval-time loss of access.
- Conference booking/rescheduling no longer accept an optional enrollment-check switch. Both commands require explicit site/program grants, current guardian relationship, school enrollment and active section enrollment where applicable; direct-service regression tests cover denials and transactional rescheduling.
- Student-section academic Action creation, operational acceptance/assignment/status changes and direct resolution now share resource/relationship policy. Ownership alone does not grant access. Resolution locks the Action, rechecks access on retries, requires a nonblank note and rejects cancelled work; concurrent completion writes one audit and one outbox event. Site-wide operational follow-ups retain their existing path, while the direct resolver rejects other domain types.
- School-Year Studio calendar-day create/update records before/after audit evidence and scoped calendar events. Program orientation, launch site creation and teacher assignment now have transactional audit/domain-event evidence; repeated active teacher assignment is a no-op.

## Retired repository leftovers

- Removed 25 unused source files after tracing route, test and script imports: the hard-coded student dataset and local-state experience lab; unused UI scaffolding, rubric editor and academic case view; superseded attendance, enrollment, program-launch and Student Today adapters; unused fixture-health and section-planning server functions; and their orphaned query/policy/validation helpers. The active routes keep their canonical implementations.
- Removed the obsolete lab's four fixture-only tests, not the live student workflow tests. Removed four unused direct Radix dependencies and 29 installed packages with the package manager; the lockfile is updated.
- Admissions routes now import `admissions-offer.functions.ts` using product-facing names. Existing service commands, synthetic write guards and persisted idempotency-key format are unchanged. Enrollment document functions now expose their canonical names directly rather than retaining unused synthetic-named exports.
- Historical archives, committed migrations/snapshots, SQL fixtures, compatibility redirects and offline attendance queue compatibility remain intact. Tested domain services are retained even when no current route calls them. The standalone qualification-review service is also retained as an intended domain capability, not represented as a wired or accepted product flow.

## Architecture versus known code gaps

**Target architecture:** synthetic fixtures behave like ordinary records through canonical product workflows, with an isolated environment and no test-specific UI or business engine.

**Observed remaining transition:** `src/modules/_demo/` guards and synthetic-prefixed admissions exports still exist. Multiple study-group page entry points remain as adapters to canonical commands, not separate mutation engines. Never remove protective guards without validating the authorization and data-isolation consequences. These are review targets, not a mandate to bypass safeguards.

`CAN_DEMO_WRITES_ENABLED` is fail-closed in `src/modules/_demo/demo-write-gate.ts` (`=== "true"`). The flag is not an authorization policy.

## Verification and release status

- Local verification on 2026-10-18: `npm test` passed **71 files / 350 tests**; `npm run test:integration` passed **29 files / 43 tests** using the protected isolated Neon runner. These are working-tree results, including concurrent calendar/transcript work, not a claim that every change belongs to this follow-up. Coverage includes academic Action denial/concurrency, school-year calendar-day audit history, program orientation audit, launch site/teacher evidence and duplicate assignment idempotency.
- `npm run typecheck`, `npm run build`, mutation hygiene, route fixture coverage and `node scripts/check-platform-route-contracts.mjs --check` passed locally after the current evidence changes.
- Repository cleanup verification on 2026-10-18: the final full non-database unit run passed **71 files / 355 tests**, including nine new admissions server-function regressions covering registrar role/capability/program denial, synthetic write gating, guardian relationship checks, issuance idempotency and command delegation.
- Route ownership passed **66/66**, fixture coverage passed **59/59**, mutation hygiene passed, and typecheck and production build passed. `npm run db:generate` left committed migration files unchanged. These checks used the existing local Vite configuration change. Database integration and browser suites were not rerun during cleanup.
- Browser/Playwright cross-persona journeys, remote CI, live R2 configuration and application deployment remain **unverified** in this continuation. Production schema reconciliation is separately verified below; no integration fixtures were written to production.
- All 66 route acceptance entries remain **pending**. The basic source-drift checker is separate from the stricter `--acceptance` gate.
- Sensitive student, medical, safety, payment and legal data require independent privacy/security review and operational acceptance. Do not infer readiness from documentation or a passing compile.
- Refer to [release gate](./synthetic-pilot-release-gate.md) for recorded evidence and its dated limitations, [security gates](./school-operations-security-gates.md), and [Neon test isolation](./neon-development.md).

## Historical read-only Neon audit (2026-10-18; superseded by rollout below)

**Target:** the database selected by `DATABASE_URL` in local ignored configuration. Its deployment/branch classification was not independently established; these findings must not be generalized to every Neon branch. Queries ran in transactions with `transaction_read_only=on`; no migration, ledger update, fixture write or schema mutation was performed.

- The Drizzle ledger contains **9 rows, corresponding to `0000` through `0008`**. Eight hashes match the local files byte-for-byte; `0006` matches after LF normalization (the Windows checkout is CRLF), not evidence of edited migration history.
- There are no ledger entries for `0009` through `0021`. Nevertheless, later structures such as subscriptions and conversations already exist. This is **partial schema/ledger drift**, not proof that every unrecorded migration can safely be replayed. Reconcile deployed objects and migration history on an isolated copy before approving database changes.
- Canonical source defines **118 tables**; this database has **111 public tables**, including three unmodeled legacy tables. Ten canonical tables are missing:
  `delivery_arrangements`, `instructional_capacity_offerings`, `instructional_capacity_reservations`, `instructor_availability_windows`, `instructor_capabilities`, `notification_preferences`, `section_capacity_demands`, `section_prerequisites`, `section_registration_policies`, and `subscription_event_receipts`.
- Existing-table column-name checks found three missing columns: `section_teachers.assignment_source`, `subscription_deliveries.next_attempt_at`, and `subscription_deliveries.lease_until`. No extra columns were found on the modeled tables. This is a name-level comparison, not a full type/index/constraint equivalence certificate.
- The legacy tables `incident_actions`, `activity_calendar_events`, and `conference_actions` each contain **0 rows** and have no inbound foreign keys. Committed migration `0009_retire_dead_join_tables.sql` already targets their removal. They were not dropped; other dependencies and rollout safety still require review.
- The four staffing status enum types introduced by `0021` are absent. Its target capacity/delivery tables are also absent, so checking those tables' status values is not yet possible.
- Journal timestamps for `0019` and the comment-only `0020` are reversed. Migration files and journal were preserved unchanged.

## Production migration reconciliation (2026-10-19 UTC)

### Confirmed target and recovery

- Neon project `can-os` (`sweet-hall-62441909`), default branch **`production`** (`br-restless-sea-ar9ooo55`), endpoint `ep-autumn-glade-ar9r1t5q.c-4.us-west-2.aws.neon.tech`. This was confirmed with the operator after management metadata resolved an initial endpoint-role misunderstanding.
- `ep-noisy-bird-arruu0it` belongs to the separate **`test01`** branch, not production. It was not migrated or reset by this rollout. Never infer deployment identity merely from a locally assigned environment-variable name.
- The project reported a six-hour history-retention window. A separate pre-change recovery branch, **`production-pre-reconcile-20261019`** (`br-noisy-wind-ar1wkf98`), was created and verified ready at parent LSN `0/298D578`. It has no compute endpoint. Retain it until post-deployment acceptance and recovery retention are explicitly reviewed.
- With explicit operator approval, only the two obsolete branches `mcp-migration-2026-10-15T11-32-59` and `mcp-migration-2026-10-15T11-33-26` were deleted to free capacity.

### Rehearsal and execution

- Created a fresh isolated production copy, `migration-rehearsal-20261019`, and an empty `migration_reference` database on that isolated branch. All committed SQL migrations `0000` through `0021` replayed successfully into the empty reference, including PostgreSQL functions and triggers.
- Compared the production copy against that reference, including column types/defaults/nullability, constraints, indexes, enum labels, triggers and immutable-history function definitions. Function source line endings were normalized for comparison.
- Rehearsed reconciliation in one serializable transaction: required the original nine ledger entries to match committed SQL, validated the three legacy tables were empty, used restrictive drops rather than cascading dependency deletion, applied missing DDL and compared the final catalog to the reference.
- Existing objects from `0011` and `0012` were not blindly recreated. Their equivalence was checked as part of the full final catalog comparison. `0020` is comment-only. Only after schema equivalence and existing-record preservation checks passed were the 13 missing migration ledger entries appended. Existing ledger entries and committed SQL/journal files were not rewritten.
- The rehearsal preserved all **126 existing rows across 108 retained tables**, verified by per-table row counts and content fingerprints excluding newly added columns.
- Full isolated integration validation passed **29 files / 43 tests**. The initial empty-reference run passed 39 tests and failed four fixture-presence checks; after loading the required deterministic fixture dependencies into the isolated reference only, all 43 passed. No fixture or integration runner targeted production.
- Applied the same verified reconciliation plan to production in one transaction, using a five-second lock timeout, a 120-second per-statement timeout, an advisory lock, exclusive table locks and rollback-on-failure checks. The production transaction also preserved all **126 existing rows across 108 retained tables**.

### Post-commit verification

- Separate read-only checks confirmed **22 migration ledger entries**, matching the committed SQL hashes (allowing checkout line-ending variants), through **`0021_staffing_status_enums`**.
- Production has **118 public tables**, with no missing, changed or extra objects across the catalog categories checked against the clean reference.
- The three empty legacy join tables are removed: `incident_actions`, `activity_calendar_events`, `conference_actions`. The ten missing tables, three missing columns and status enum conversions are reconciled.
- The temporary rehearsal branch and its reference database were removed after verification. The independent pre-change recovery branch is retained.
- This establishes migration/schema equivalence and isolated integration evidence, not browser acceptance, remote CI status, application deployment health or a complete database security/permissions audit.

## Remaining follow-up

- CI now runs for pull requests, pushes to `main`, and manual dispatch; obsolete phase/feature push triggers were removed. Start short-lived development branches from current `main` and submit focused pull requests. Branch protection and required-check enforcement are GitHub settings and remain unverified by this cleanup.
- Admissions CI requires the `integration-test` environment secret `CAN_ADMISSIONS_TEST_DATABASE_URL` and variable `CAN_APPLICATION_DB_HOST`; their remote configuration remains unverified. Keep the isolated-database preflight mandatory before migration or test writes.
- Production is reconciled through `0021`; other Neon branches are not certified by this rollout. The historical `0019`/`0020` timestamp inversion remains unchanged; `0020` is comment-only and all entries precede the verified `0021` high-water mark. Keep future journal timestamps increasing.
- Nonacademic and section-less operational Actions still need a complete owning-domain policy review; the academic policy is deliberately not a universal Action abstraction. Historical academic follow-up after withdrawal/inactivation needs an explicit policy before broadening current fail-closed behavior.
- Remaining school-year/program-launch commands need evidence-parity review.
- Full authenticated route/deep-link and role-switch browser acceptance is pending.
- Retire the pre-change recovery branch only after post-deployment acceptance and recovery retention are reviewed. R2 malware/quarantine, retention and live bucket/CORS acceptance remain release gates.

## Updating this snapshot

Verify the current commit, confirm changes from the last baseline, inspect owning service and callers, update route contracts, then record test/CI/production evidence separately. Never carry forward a status label solely because it appeared in an archived sprint or phase report.
