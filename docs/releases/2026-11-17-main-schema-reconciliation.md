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
