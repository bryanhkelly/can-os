# FullFlow dedicated Neon schema reconciliation — 0032–0038

**Reviewed:** 2026-10-23 · **Status: READY FOR CONTROLLED APPLICATION, NOT APPLIED**
**GitHub branch:** `FullFlow`; **Neon project:** `sweet-hall-62441909`;
**ONLY migration target:** `fullflow-e2e-20261022` (`br-proud-pine-arfju8h2`, `neondb`).
`production` and `test01` must not be written by the FullFlow workflow.

## Verified database starting state (read-only Neon queries)

- Postgres reports `neon.project_id=sweet-hall-62441909`,
  `neon.branch_id=br-proud-pine-arfju8h2`.
- Exactly **32** Drizzle migration ledger entries, last timestamp
  `1792700000000` corresponding to committed `0031_learning_activity_tracking`.
- `program_type` has neither `summer_program` nor
  `after_school_enrichment`; `activity_season_status` has no `draft`.
- `programs.credit_issuing_organization_id` is currently NOT NULL and
  all **1,038** existing programs have an issuer.
- `activity_seasons` and `activity_registrations` do not yet carry the
  pending `metadata` columns.
- `site_publications`, `program_publications` and
  `public_admissions_interests` do not exist on this branch.
- Existing branch data at inspection: 1,192 Sites, 1,038 Programs, 44
  Activity Seasons, 87 Activity Registrations. These are branch records;
  their presence is not live acceptance proof.

## Review of seven committed migrations

| Migration | Change | Preconditions and risk |
| --- | --- | --- |
| `0032_extended_program_offerings` | Add two `program_type` enum variants; **DROP NOT NULL** on credit issuer | Needed for noncredit summer programs; review every credit-bearing Program service for explicit issuer checks. This relaxes a prior DB invariant for all Program types. |
| `0033_extended_season_drafts` | Add `draft` to Activity Season status enum | Additive. Existing `registration` rows remain unchanged; publish/read filters must exclude draft. |
| `0034_enrichment_packages` | Add default-empty nonnull `metadata` JSONB to Season and Registration | Existing rows get `{}`; application code must validate meaningful package/permission content separately. |
| `0035_site_publications` | Create public hostname reservation/publication table and unique slug index | New table, no backfill. Reserved/draft must not be public. Independent of internal School readiness. |
| `0036_program_publications` | Create separately approved Program marketing table | New table, no backfill. Publishing claims must not imply active School or accreditation. |
| `0037_public_admissions_interests` | Create anonymous-interest intake with unique request key and three indexes | New table, no backfill. Contains contact PII; preserve abuse controls, privacy boundary and conversion identity checks. |
| `0038_public_interest_conversion` | Add conversion references, **DROP/REPLACE status CHECK**, add conversion integrity CHECK and unique index | Applies after 0037; new table should contain no interests before constraint replacement. Execute through checked Drizzle migrator only; verify no drifted statuses or existing constraint alteration. |

## Controlled execution protocol

1. Review this SQL and source branch at the exact approved SHA. The
   reviewer must explicitly approve applying `0032`–`0038`; no
   autonomous destructive DDL, even on the isolated Neon branch.
2. Run `npm run db:review:fullflow` with
   `CAN_TEST_DB_WRITES_ENABLED=true`, nonproduction environment,
   `TEST_DATABASE_URL` targeting the approved branch, and no application
   credentials in logs. The command uses **SELECT only** and fails closed
   if migration order, ledger, enum/column/table preconditions or branch
   identity have changed.
3. Execute `npm run db:migrate:fullflow -- --preflight` after setting a
   distinct `CAN_APPLICATION_DB_HOST`. This is also read-only; its
   wrapper first checks server-side branch identity and migration state.
4. **Only after explicit migration approval**, run
   `npm run db:migrate:fullflow`. Never replace this with direct SQL
   inserts into `drizzle.__drizzle_migrations`, raw `db:push` or a
   migration on shared testing/production.
5. Read-only postcheck: 39 ledger rows, final timestamp
   `1792728000000` and committed `0038` SQL SHA-256 hash, expected
   enums/columns/constraint/indexes. The existing FullFlow schema guard
   does this before running the service test.
6. Run `npm run test:integration:full-flow` and focused launch-staffing
   acceptance, with the verified isolated URL; collect each command's
   actual result, relevant audit/outbox rows and negative tests.
7. Run authenticated browser acceptance only once a trusted runner and
   separately issued sessions are available; it cannot be replaced by
   mocked server-command tests.

## CI caveat

Recent GitHub Actions jobs were marked failure within about two seconds
with `runner_id=0`, no assigned runner name and `steps=[]`. This is
a **runner-provisioning/Actions execution blocker**, not an observed
failed test assertion. Diagnose GitHub account/runner/Actions
availability independently. Do not label static changes as CI-green.

**No database write is made by this review document or its inspection scripts.**
