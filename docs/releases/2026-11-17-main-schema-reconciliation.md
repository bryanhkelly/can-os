# CAN OS | Main database schema reconciliation
**Applied:** November 17, 2026  
**Neon project:** `sweet-hall-62441909`  
**Target:** `main` (`br-restless-sea-ar9ooo55`)  
**QA validation:** `test01` (`br-bitter-feather-ar0u63x7`)

## What changed

At the outset, Neon main had 677 tables/views, with one approved
`test01` relation absent from main. The following additive canonical
SQL patches were applied to the main database in dependency order.
No existing native Class enrollment, Session, outcome or credential
issuer-approval rows were altered. The source files are committed to
GitHub `main`; the WS5 function-quoting errors were fixed before
running its migration.

| Patch (database/canonical/v3.0.1/) | New relations | Result |
| --- | ---: | --- |
| `patch-sensitive-credential-issuer-approvals.sql` | 1 | Applied |
| `patch-sensitive-credential-issuer-account-binding.sql` | 0 | Applied |
| `provision-sensitive-issuer-approval-writer.sql` | 0 | Applied |
| `patch-ws3-source-bound-evidence.sql` | 1 | Applied |
| `patch-ws3-class-completion-policy-pins.sql` | 2 | Applied |
| `patch-ws3-independent-evidence-review.sql` | 1 | Applied |
| `patch-ws3-class-governed-outcomes.sql` | 0 | Applied, Class Outcome columns and guards |
| `patch-class-session-agendas-ws4.sql` | 1 | Applied |
| `patch-publisher-rollout-approvals.sql` | 5 | Applied, 4 trigger functions fixed in source |

The WS3–WS5 migrations were first executed on `test01` and inspected.
For `main`, they were applied in several bounded transactions after
the single large transaction exceeded the remote call limit and left
no additional relations. The final WS5 patch was installed in two
stages: (1) new relations, indexes, forced RLS and owner-only policies;
(2) immutability, independence and provenance triggers. No deployment
or feature flag was changed.

## Verified database results

- **688** tables and views exist on Neon `main`, **684** on `test01`.
- **Zero** tables/views present on `test01` are missing from `main`.
- Four extra main-only relations were already present before this change:
  `education_v30.site_device_policies`,
  `education_v30.site_device_registrations`,
  `public.access_session_signals`,
  `public.session_device_retention_state`.
- All **11** new relations enforce `ENABLE ROW LEVEL SECURITY` and
  `FORCE ROW LEVEL SECURITY`, have at least one access policy, and
  grant no PUBLIC SELECT.
- **14** named WS3, WS4 and WS5 database validation triggers are enabled,
  including the native enrollment completion-policy pin, append-only
  evidence review, Session agenda, and independent rollout reviews.
- `v301_can_sensitive_capability` is SECURITY DEFINER and executable by
  the restricted canonical auth reader, but that role cannot read the
  sensitive approval table directly. A nonexistent CAN session does
  not authorize credential issuance.
- The special approval-writer role has INSERT but no DELETE privileges
  and requires action-scoped RLS; no CAN user was given approval.
- The new approval table has **0 rows**. Native Classes, Enrollments,
  Sessions, and Class Outcomes remain at **0** in both branches.

## Important distinction: schema presence is not release readiness

The tables and database guard definitions are installed, but the
WS3/WS4/WS5 workflows still require current-commit application build,
actual server-role permission tests, authorized publisher/reviewer
fixtures, completed academic-policy publication, and authenticated
browser acceptance. Adding the class-completion-policy pin trigger
means **future native Class enrollment must have a valid published policy**.
Do not create live native Class enrollments until that prerequisite
and rollback procedures are verified. Keep the WS00 source/deployment
release hold in force.

The two Neon branches are **not identical in every existing column**.
Five pre-existing column-definition differences still need separate
review: `education_v30.canonical_sessions`,
`education_v30.learning_session_events`,
`education_v30.noncredit_self_enrollment_releases`,
`public.access_sessions`, and
`public.jurisdiction_profile_versions`. Those differences were not
normalized or backfilled as part of this table-parity request.

## Repeatable read-only acceptance

`npm run db:canonical:main-schema` now checks these 11 source-defined
tables, forced RLS, public read denial, enabled WS3/WS4/WS5 triggers,
governed Class Outcome columns, and credential/verification functions,
using an explicitly identified database and a READ ONLY transaction.
It will not apply migrations or create users, approvals, or learning rows.

Example (use an authorized connection string without printing it):

```sh
CAN_MAIN_SCHEMA_CHECK=1 \
CAN_EXPECTED_NEON_BRANCH_ID=br-restless-sea-ar9ooo55 \
DATABASE_URL="$DATABASE_URL" npm run db:canonical:main-schema
```

The database inspections above were executed directly. The new script,
application typecheck, unit suite, Cloudflare build, and authenticated
browser acceptance were **not** executed in this review.


## November 17 follow-up: column-level parity across main and test01

A read-only comparison of all `public` and `education_v30`
columns identified that the five earlier differences were **not**
missing production columns. `main` already had 14 more columns
than `test01`:

- `education_v30.canonical_sessions`: seven coarse session-device
  fields (client instance, device category, browser family, OS family,
  IP address, observation time and shared-device marker).
- `education_v30.learning_session_events`: one `evidence_level`
  field with the bounded evidence-category check.
- `public.access_sessions`: six coarse session-device metadata
  fields, with an account/client-instance lookup index.

The other two drifted tables,
`education_v30.noncredit_self_enrollment_releases` and
`public.jurisdiction_profile_versions`, only differed in physical
column order. No incompatible types, nullability or defaults were
found.

**Migration applied:** the existing, additive
`drizzle/0079_session_device_evidence.sql` and
`drizzle/0080_session_device_retention.sql` definitions were
applied to Neon **test01 only** using 29 controlled DDL statements,
after explicitly verifying the Neon branch ID. The existing
`learning_session_events_evidence_level_ck` constraint was
not dropped; it was created directly on the previously missing
column. No production data or schema was altered in this follow-up.
No historic session, account, learner or evidence rows were copied,
rewritten or deleted.

**Post-migration verification:**
- Both branches now expose **689 tables/views**, with zero
  relations missing in either direction.
- Both `public` and `education_v30` expose **6,044 column
  definitions**, with zero missing names or differences in
  data type, nullability or defaults.
- `access_sessions_client_instance_idx` and the
  `learning_session_events_evidence_level_ck` constraint
  are present on both branches.
- Existing `public.access_sessions` rows were retained:
  274 on main; 15 on test01 when checked.

**Scope limitation:** this confirms relation and column parity,
not every historical migration ledger entry, trigger body, policy
definition, row count or production runtime integration. The
test01 Drizzle ledger has not been stamped to mimic production:
migration history reconciliation requires checking exact
migration hashes and already-applied changes separately.
This work does **not** lift the deployment hold.


## Follow-up: index, trigger, RLS, constraint and migration-ledger audit

A second read-only audit compared all `public` and `education_v30`
index definitions, non-internal triggers, RLS policies, constraints, and
`drizzle.__drizzle_migrations` between Neon `main` and `test01`.

**Completed additive repairs on test01:**
- Restored the missing `blueprint_configuration_review_append_only`
  BEFORE UPDATE/DELETE trigger on
  `education_v30.configuration_reviews`, using the existing
  `education_v30.v27_reject_update_delete()` function. Verified it
  is enabled on both branches.
- Recreated six missing nonunique btree indexes from the reviewed
  main schema: four foreign-key lookup indexes on
  `education_v30.canonical_account_grants` (account, Person,
  organization and Site) and two on
  `education_v30.canonical_sessions` (account and active
  grant/account). No existing rows were changed.
- Confirmed the two jurisdiction uniqueness requirements were
  already enforced on test01 by exact equivalent unique **indexes**.
  The attempt to add identically named UNIQUE constraints was
  rejected because those indexes already exist; the transaction
  made no change and no duplicate constraint was installed.

**Post-fix structural results:**

| Catalog | Main | Test01 | Structural result |
| --- | ---: | ---: | --- |
| Indexes | 2,788 | 2,788 | Same definitions after normalizing index names |
| User-defined triggers | 384 | 384 | Same enabled trigger definitions |
| RLS policies | 412 | 398 | Policy differences require role-by-role review |
| Migration ledger entries | 87 | 78 | Historical migration identities and hashes differ |

**Intentional or not-yet-remediated differences:**
- Fifteen owner/specialized read policies exist only on main, mostly
  `can_v30_trusted_owner_access`; test01 alone has one
  `site_identity_links_public_site_app_read` policy because that
  branch has the `can_v30_public_site_app` login role, which main
  does not. A blanket copy would create/broaden authority, so
  neither branch's grants/RLS policies were changed.
- The `site_local_content_status_ck` in main correctly permits
  `draft`, `published`, and `review_required` (four draft
  revisions exist there); test01's older constraint permits only
  `published` and `review_required`. The approved source
  migration `drizzle/0077_website_private_drafts.sql` defines
  the desired `draft` option. **Replacing the existing QA
  constraint requires a separately authorized DROP/ADD constraint
  migration**. It was not done in this additive-only pass.
- Some jurisdiction foreign-key and UNIQUE constraints have
  different names but enforce the same relationships; equivalent
  unique indexes exist in test01. No redundant constraints were
  created.
- Drizzle has **87 entries on main and 78 on test01**, and several
  older matching timestamps have different hashes. The most recent
  index/trigger repairs were applied as direct additive schema
  reconciliation, not mislabeled as previously executed Drizzle
  migrations. The migration ledger was not rewritten or stamped
  to conceal divergent history.

**Repeatable inspection:** `npm run db:canonical:drift-audit` invokes
`scripts/acceptance/check-main-qa-db-drift.mjs` with explicitly
verified branch IDs and read-only transactions on both databases.
It compares normalized index definitions, active trigger definitions,
relations and column types/defaults, reports security policies,
constraints and migration-hash differences, and fails when structural
drift persists. The script is committed, but was not executed against
runtime database connection strings here; the direct Neon catalog
queries above provide the verification evidence.

Neither the database repair nor the source audit changes the existing
Cloudflare application release HOLD/NO-GO status.
