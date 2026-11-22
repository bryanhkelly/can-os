# CAN OS Acceptance Standards

**Status:** Canonical verification expectations, not a completed release certificate.

## Evidence hierarchy

1. Current source, migrations, and executed tests establish implemented behavior.
2. Product specifications establish desired behavior and are not evidence of completion.
3. CI, deployment, and successful rendering are necessary signals where applicable, but not sufficient proof of connected workflows.
4. Historical FullFlow acceptance contracts and progress journals are reference evidence only.

## Capability acceptance

Every exposed capability needs evidence for authorized entry, invalid and valid paths, canonical persistence, refresh consistency, cross-role visibility, downstream effects, audit evidence, and multi-actor interactions as applicable. Verify accessibility, keyboard use, mobile layout, and failure recovery for user-facing experiences.

## Connected journeys

Validate complete school journeys across signup, school profile, Launch Hub, website and team setup, family inquiry, admissions, enrollment, asynchronous learning, academic support, supervised site day, attendance, communications, and Run operations. Not every release must exercise every journey, but acceptance scope and exclusions must be explicit.

Extended/noncredit Programs retain independent [Extended Learning](../product/EXTENDED-LEARNING.md) safety, guardian consent and real session coverage gates. School-day and enrollment operations follow [Site Operations](../product/SITE-OPERATIONS.md).

For physical school opening, custody/pickup and child protection, [Church-Hosted Safety Gates](CHURCH-HOSTED-SAFETY-GATES.md) require independent evidence. A published website or completed Launch Hub is never school-opening approval.

## Release controls

Use isolated test data and disposable database branches for mutation tests. Check current environment identity before any write. Verify migrations, server authorization, privacy, safeguarding, and operational recovery where relevant. Do not treat synthetic fixtures as permission to bypass ordinary domain behavior.

[Safety Test Traceability](SAFETY-TEST-TRACEABILITY.md) tracks which child-safety policies have executable test source and what remains unverified. Focused policy unit tests do not replace legal, physical or end-to-end acceptance.

## Reporting

For each acceptance claim, record exact commit, environment, test command, observed result, failures, exclusions, and date. Mark missing evidence **unverified**. Do not copy prior branch's passing counts forward as current results.

For public website and family-entry exposure, also enforce [Public Site Release Gates](PUBLIC-SITE-RELEASE-GATES.md).

## Executable code-quality gates

The production build checks application source and canonical migration history.
Release CI also checks test modules, which are not included in the default
application-only TypeScript project:

- `npm run check:test-source-syntax`: parse JavaScript and TypeScript test
  files and reject missing relative or aliased imports before Vitest starts.
- `npm run check:test-import-exports`: resolve named/default imports from
  project modules across the full source and test TypeScript configuration.
- `npm run typecheck:full`: enforce types for source, tests and supporting
  TypeScript code after generated TanStack route types exist.
- `npm run lint` and `npm run check:lint-regressions`: enforce existing
  error-level policies and reject warning-level violations added on changed
  lines. The ratchet compares with the PR base, or the preceding main commit.
  Existing warnings outside changed lines remain visible until remediated.
- `npm run db:check:journal` and `npm run test:migration-safety`: verify
  the generated snapshot boundary, exact SQL-only migration Git blob hashes,
  and generation/schema-push safety guards.

Drizzle's generated snapshots currently end at 0086. Entries 0087 through
0101 are explicitly reviewed SQL-only migrations. The committed
`drizzle/meta/sql-only-migrations.json` ledger pins their source bytes, but
**does not establish schema/model parity or prove migration execution**.
`npm run db:generate` and `npm run db:push` intentionally fail closed.
To reconcile the generated model, use a disposable PostgreSQL branch,
execute the reviewed migrations, compare the resulting schema to the current
Drizzle model, review differences, then update the modeled baseline under
a separately authorized migration change. Never synthesize snapshots.

Do not call these gates passing unless a workflow or local run records the
exact commit SHA, command and result. GitHub workflow failures without
executed steps are infrastructure evidence, not compiler diagnostics.

## Historical artifacts

The historical [FullFlow acceptance contract](../archive/2026-11-fullflow/retired-plans/full-flow-acceptance-contract.md) and [progress journal](../archive/2026-11-fullflow/retired-plans/full-flow-progress.md) remain preserved records. They do not supersede this standard.
