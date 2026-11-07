# FullFlow isolated Neon migration reconciliation (read-only evidence)

## November 1, 2026 authorized 0060 follow-up

The owner explicitly authorized applying the new tenant-identity migration to
the FullFlow database branch and aligning the database/Git branch names.
Neon branch `br-proud-pine-arfju8h2` in project `sweet-hall-62441909` is now named
`FullFlow`, formerly `fullflow-e2e-20261022`; its ID and endpoint are unchanged.
The production branch remains the default and was not migrated.

- Source: FullFlow HEAD `8f3aca2efbef879c5b29bb488d5a238269e8b7f3` plus reviewed
  local tenant-identity changes; no commit, push or merge.
- Read-only preflight verified 60 existing migration entries and hashes, with
  only `0060_tenant_demo_access` pending.
- An initial check falsely reported the 0056 self-FK missing because PostgreSQL
  truncates its ASCII identifier to 63 bytes. Catalog inspection confirmed the
  validated self-FK and correct definition. The checker and SQL acceptance
  assertions now use PostgreSQL identifier semantics; no constraint was changed.
- The first migration launch stopped before SQL because Windows cannot directly
  spawn `npm.cmd`. The wrapper now invokes its fixed npm command through
  `cmd.exe`, retaining all identity, endpoint, drift and exact-SHA guards.
- The guarded Drizzle command applied 0060 successfully, dropping only
  `account_person_grants.is_synthetic`.
- Postflight verified the same database identity, absence of that column,
  **61 ledger rows**, latest timestamp `1793572899262`, matching SQL hashes,
  **0 issues / 0 pending migrations / UP_TO_DATE**.
- Executed **27 targeted unit tests**, all passed; affected-script lint passed.

This authorization supersedes the earlier instruction to keep this branch
unchanged only for this rename and migration. It does **not** establish
historical 0053-0055 DDL provenance, provision legacy demo identities, authorize
production deployment, or certify connected/browser release acceptance.

## November 1, 2026 reinspection — current retained E2E branch

- **Reviewed FullFlow source SHA:** `1da7f875acf11983c2e8c31f190e9d4aee40d7b0`
- **Neon identity:** `sweet-hall-62441909` / `br-proud-pine-arfju8h2`, named `fullflow-e2e-20261022`
- **Read-only database checks:** Postgres-reported branch identity, committed SQL byte-level SHA-256 versus actual Drizzle ledger, table/column/index/FK/PK catalog inspection, church status constraint
- **Database migration ledger:** 60 rows, through `0059_church_evidence_statuses` at `1793527200000`
- **Changes to database:** none; no objects, data, ledger, branch settings, migrations or credentials changed
- **Decision:** **HOLD** until historical 0053–0055 DDL provenance is signed off and clean reproducible connected acceptance passes.

### Per-migration provenance matrix

The hash comparison used the **exact UTF-8 bytes** of the committed SQL file and PostgreSQL's SHA-256, joined to `drizzle.__drizzle_migrations` on the committed journal timestamp. All eight SQL hashes agree with the current ledger. This **does not attest that the SQL was executed originally**; ledger contents could have been recovered after DDL existed.

| Journal idx | Migration | Current ledger matches committed bytes? | Observed objects / outstanding provenance |
| --- | --- | --- | --- |
| 0052 | family_recruitment_relationship | **Yes** | Recorded; detailed column/index parity is still part of replay acceptance |
| 0053 | institutional_graduation_closeout | **Yes** | Graduation requirement sets, decisions and diplomas exist. **Previously present with no matching ledger row**; creator/time/original operation unverified |
| 0054 | academic_credential_delivery | **Yes** | Credential deliveries, FKs and indexes exist. **Previously present unjournaled** |
| 0055 | academic_credential_release_authorizations | **Yes** | Recipient-release authorizations, consent constraints, FKs and indexes exist. **Previously present unjournaled** |
| 0056 | steep_lenny_balinger | **Yes** | Cohort applicability fields, indexes and constraints present; previously absent at old 0051 checkpoint |
| 0057 | curriculum_annual_adoptions | **Yes** | All 13 columns, nine RESTRICT FKs, two named indexes and PK checked against committed SQL; no mismatches |
| 0058 | finance_invoices | **Yes** | Four tables; 49 columns, nine RESTRICT FKs, 11 named indexes and four PKs checked against SQL; no mismatches |
| 0059 | church_evidence_statuses | **Yes** | Current constraint includes precisely `submitted`, `needs_evidence`, `verified`, `approved`, `declined`, `canceled` |

The specific 0057–0059 catalog checks found **zero discrepancies** across five tables, 62 columns, 18 foreign keys, 13 named secondary indexes, five primary keys and the church-status predicate. PostgreSQL also lists five auto-generated primary-key indexes. This is structural evidence, **not** clean Drizzle replay evidence. The 0053–0055 historical DDL execution remains unaudited even though current objects and ledger hashes are present.

### Why HOLD remains necessary

The earlier SELECT-only checkpoint (preserved below) observed graduation/credential objects **before** their migrations were recorded in the Drizzle ledger. The present matching hashes do not explain who created those objects, when, whether side effects occurred, or how their ledger entries were later inserted. Neither matching tables nor zero record counts can authorize rewriting `drizzle.__drizzle_migrations`.

### Recovery / replay plan — pending explicit owner/DBA approval

1. **Retain the original branch unchanged.** Preserve the prior 52-row checkpoint evidence, today's 60-row evidence, source SHAs, audit logs and original branch history. No resets, drops, ledger edits or deletion.
2. **Establish provenance of 0053–0055.** Inspect authorized migration/deployment logs, query audit history and original migration attempts to identify the DDL author and ledger-recovery mechanism. Compare named constraints, indexes, FK targets, dependent triggers, functions, and object definitions with committed 0053–0055 SQL. Document every exception.
3. **Request approval for a separate isolated test target,** with its identity and restore point reviewed before any write. A clone of the already-drifted schema does not itself prove clean replay. Do not silently repoint the pinned E2E identity or protected secrets.
4. **Replay the reviewed migration chain on a proven clean base** in disposable PostgreSQL, then in an explicitly approved Neon isolated environment. Require raw committed SQL hash parity, staged schema/catalog parity, no synthetic catch-up migrations, and negative drift tests. Use direct/unpooled connections for migrations.
5. **Securely configure protected acceptance**, then run the source-SHA-matched browser, seeded-role, cross-tenant, admissions and institutional safety acceptance. Maintain independent approvals for any database write and release decision.
6. **Sign off only with evidence.** The environment owner/DBA must record identity, restore point, audited origin or documented unrecoverable gap, full replay results, test runs and final decision. Pending that evidence, FF-003 remains **IN PROGRESS / BLOCKED FOR SIGN-OFF**.

### Implemented safety controls

- The read-only FullFlow review now evaluates 0057–0059 stage-by-stage catalogs and the 0052–0059 committed SQL hash ledger; mismatches fail closed.
- The migration command requires `CAN_FULLFLOW_MIGRATION_APPROVED_SHA` equal to the exact checked-out commit **in addition** to existing nonproduction identity and host guards. The approval variable is intentionally not configured automatically.
- Passing static CI, passing ephemeral PostgreSQL checks or having 60 ledger rows is **not** connected release acceptance.

---

## Historical October 31 checkpoint (preserved verbatim below)

# FullFlow isolated Neon migration reconciliation (read-only evidence)

**As checked:** October 31, 2026 Pacific / November 1, 2026 UTC  
**Environment:** dedicated nonproduction `fullflow-e2e-20261022` Neon branch, project `sweet-hall-62441909`, branch `br-proud-pine-arfju8h2`  
**Authority:** GitHub Drizzle `drizzle/meta/_journal.json` and PostgreSQL's own `drizzle.__drizzle_migrations` ledger. Table existence is NOT an authorization to mark a migration applied.

## Observed facts (SELECT only; no database writes)

| Migration | Recorded in DB ledger | Observed schema | Decision |
| --- | --- | --- | --- |
| Through `0051_church_onboarding_requests` | 52 migrations, latest `created_at=1793407200000` | Base onboarding objects exist | Reviewed prior stage |
| `0052_family_recruitment_relationship` | Not recorded | `public_admissions_interests.contact_consent_at` absent | Pending |
| `0053_institutional_graduation_closeout` | Not recorded | `graduation_requirement_sets`, `graduation_decisions`, `diploma_issuances` already exist | **HOLD: unjournaled DDL** |
| `0054_academic_credential_delivery` | Not recorded | `academic_credential_deliveries` already exists | **HOLD: unjournaled DDL** |
| `0055_academic_credential_release_authorizations` | Not recorded | `academic_credential_release_authorizations` already exists | **HOLD: unjournaled DDL** |
| `0056_steep_lenny_balinger` | Not recorded | `graduation_requirement_sets.cohort_start` absent | Pending, not safe to apply atop drift |

Record counts at this checkpoint: zero graduation policies, decisions, diplomas and credential-release grants. Zero rows do **not** establish absence of dependent objects, preserved history or permission to drop tables.

**Release status: HOLD.** Running plain Drizzle `db:migrate` against this branch would attempt to apply committed `0053`–`0055` on top of their existing unjournaled tables. Do not simply create migration ledger rows, use `IF NOT EXISTS` workarounds, drop existing tables, or point integration secrets at a shared/production branch.

## Corrective engineering work

The A integration branch extends the READ-ONLY migration review to the exact `0052`–`0056` journal sequence. `scripts/fullflow-post0051-artifacts.mjs` checks future tables, columns, indexes and cohort FK/constraints against the recorded ledger stage; an object ahead of its recorded migration fails closed with an explicit `HOLD manual reconciliation` issue. Its test suite reproduces the observed 52-ledger/missing-history case. This does not modify the database.

## Required environment-owner decision

**Preferred:** Provision an approved NEW disposable Neon branch or project after resolving the project branch limit, with independently verified base and the reviewed migration chain. Ensure `verify-fullflow-neon-branch.mjs` and GitHub's protected `integration-test` environment are updated to the **new approved identity**, never only an arbitrary URL label. Run the committed Drizzle migration sequence, PostgreSQL-attested branch verification, hashes/journal check, synthetic historical-policy classification, and authenticated registrar/guardian/tenant browser suite on the same exact commit. Preserve log artifacts, source SHA and branch ID.

**If retaining the current branch is unavoidable:** Require an explicit environment-owner/DBA sign-off and recovery point first. Compare every existing `0053`–`0055` table, constraint, index, trigger, function and dependency against the committed migration SQL; identify who/what created the unjournaled objects. Produce a reviewed reversible migration ledger/DDL reconciliation plan, then execute it only in an independently approved disposable copy. A count of zero policy rows is insufficient evidence of safe reset.

## Evidence and limits

- [Full 0000–0056 committed-SQL PostgreSQL acceptance](https://github.com/bryanhkelly/can-os/actions/runs/41264214134) passed, including real FKs, synthetic historic-policy classification, invalid cohort rejection and rollback.
- The post-0051 drift guard is additionally exercised in the A branch's full-schema PostgreSQL workflow, using `node --test scripts/fullflow-post0051-artifacts.test.mjs`.
- Neither test proves the **Neon-specific Drizzle migration runner**, nor authenticated cross-role acceptance.
- `FullFlow` Admissions Neon Acceptance cannot yet pass without the approved `CAN_ADMISSIONS_TEST_DATABASE_URL` secret and required environment variables; this does not justify bypassing its protected gate.

**No original Neon tables, rows, migration-ledger entries, credentials or branch settings were changed by the review.**
