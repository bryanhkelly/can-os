# Neon main: education_v30 table retirement audit

Checked against Neon project `sweet-hall-62441909`, branch `br-restless-sea-ar9ooo55` on November 17, 2026.

## Completed in this cleanup

- Preserved the active `public.admission_offers` (1 record). The empty `education_v30.admission_offers` duplicate was already absent when the guarded cleanup attempted to run, so the final migration was made idempotent. This pass did not remove a nonempty admissions record.
- Moved `framework_competency_reuse_authorizations`, `network_memberships`, and `official_authorization_scopes` from `education_v30` to `public`, retaining table OIDs, all 15 validated outgoing FKs, and the existing owner-only access grants.
- Updated four legacy database functions to resolve these three tables explicitly in `public`: `v26_validate_framework_membership`, `v28_check_network_delegation`, `v26_check_placement_authorization`, and `v27_check_credential_support`.
- Moved `site_device_policies` and `site_device_registrations` to `public`, retaining their original table OIDs, their three validated outgoing FKs and enabled RLS. Direct authenticated SELECT remains disallowed.
- Updated the Drizzle Site-device declarations to `pgTable`, updated the production parity validator to reference `public`, and added source-level regression tests.

## Verification

- After this pass, 5 selected original tables exist in `public` and none remain in `education_v30`.
- `education_v30.admission_offers` is absent; `public.admission_offers` still holds the operational record.
- Schema inventory at last check: **386 education_v30 base tables**, **285 public base tables**. Other agents were changing main during the audit, so these totals should not be attributed exclusively to this batch.
- Database transaction and SQL metadata checks succeeded; application E2E, Vitest, and browser acceptance were **not run**.
- `education_v30_secure` is not included in this cleanup.

## Still blocked or intentionally preserved

Remaining collisions such as `audit_events`, `domain_events`, `enrollments`, `graduation_decisions`, `qualification_definitions`, and `transcript_issuances` require semantic reconciliation and access-control review. Tables with data, inbound FKs, policies, routines, business triggers, or active Drizzle references cannot be dropped simply to reduce the table count. Continue migrating those capabilities into `public` in guarded, coordinated batches rather than destroying operational functionality.

Source migration files:
- `database/production/2026-11-17-retire-unused-native-admission-offers.sql`
- `database/production/2026-11-17-consolidate-three-empty-gov-tables.sql`
- `database/production/2026-11-17-consolidate-device-scope-tables.sql`

## Continued low-risk consolidation

Seven additional empty, noncolliding native tables were moved in two main-only guarded transactions:

- `equipment_ownership_periods`, `evaluation_basis_invalidations`, `improvement_action_evidence`, `qualification_reassessment_requests`
- `deployment_operating_contexts`, `funding_award_eligible_deployments`, `initiative_deployments`

No records were deleted or cloned. All seven preserved original table OIDs and the full set of **20 validated outgoing foreign keys**. All seven retained `ENABLE ROW LEVEL SECURITY`, `FORCE ROW LEVEL SECURITY`, one existing access policy, and denied direct `authenticated` SELECT access. Nine dependent SQL function bodies were re-pointed to the same physical tables in `public`.

Verified on Neon `main`: seven `public` tables and nine updated SQL functions. The last inventory sampled **361 `education_v30` base tables** and **310 `public` base tables**; other agents' concurrent work may alter the totals.

- Migrations: `2026-11-17-consolidate-four-empty-native-capabilities.sql` and `2026-11-17-consolidate-three-empty-operational-capabilities.sql`
- Acceptance gate: `scripts/acceptance/check-main-easy-native-consolidation.mjs` (read-only, main-only)
- Source contracts: `tests/unit/main-easy-native-consolidation-contract.test.ts`

The migrations and SQL metadata checks succeeded. The added executable checks and browser workflows have **not** been run as part of this pass. Further quick moves need per-table routine/source reviews; avoid touching `education_v30_secure` or merging semantically different colliding tables under an "easy" cleanup.

## Four additional learning tables in public (next safe batch)

- `guardian_authorities` (2 validated outgoing FKs)
- `enrollment_prospect_interests` (4 validated outgoing FKs)
- `learner_unit_progress` (2 validated outgoing FKs)
- `facilitated_pairing_rate_limits` (0 outgoing FKs)

All four were verified empty before migration. The native tables had zero inbound FKs, zero custom triggers, no dependent SQL routines or views, no public name/index collision, and a single owner-only forced-RLS policy. The migration guarded these conditions and moved original objects with `ALTER TABLE ... SET SCHEMA public` in one Neon main transaction. All four Drizzle mappings were updated to `pgTable`.

Afterward the database confirmed all four exist only in `public`, with unchanged OIDs, eight validated outgoing foreign keys, forced RLS and one policy apiece. Direct `authenticated` and `anonymous` SELECT remained unavailable.

- Migration: `database/production/2026-11-17-consolidate-four-empty-learning-tables.sql`
- Main-only read acceptance: `scripts/acceptance/check-main-learning-table-cutover.mjs`
- Source regression tests: `tests/unit/main-learning-table-cutover.test.ts`

The Neon transaction and direct metadata queries succeeded. New script and Vitest suite were committed, **not executed**. Last observed inventory: **351** `education_v30` tables, **320** `public` tables, **7** `education_v30_secure` tables. Counts include other concurrent updates to main. Do not treat these changes as browser-level acceptance or evidence that wider `education_v30` can be dropped.

## Continued: learning asset reviews and noncredit waitlist receipts

A main-only transaction moved `published_asset_reviews` and
`noncredit_waitlist_email_deliveries` to `public` without copying or deleting
records. Both were empty at cutover. Their original table OIDs remain
`403743` and `540672` respectively. The first retains its
`published_asset_reviews_decision_order_seq` owned identity sequence, now
physically in `public`.

Verified afterward on Neon production `main`:
- Both tables exist only in `public` and retain `ENABLE` and `FORCE` row-level security.
- Existing owner-only policies are unchanged.
- Their four outgoing foreign keys are validated and no others are unvalidated.
- Direct `authenticated` and `anonymous` SELECT privileges remain denied.
- The asset-review identity sequence resolves through `pg_get_serial_sequence`.
- The current application Drizzle models use `pgTable`; the existing native
  learning RLS/policy check includes the moved review relation from `public`.

Migration: `database/production/2026-11-17-consolidate-learning-reviews-and-waitlist-receipts.sql`.
Read-only main acceptance gate: `scripts/acceptance/check-main-learning-reviews-receipts.mjs`.
Regression tests: `tests/unit/main-learning-reviews-receipts-cutover.test.ts`.

At the last check there were **346 `education_v30` base tables**,
**324 `public` base tables**, and **7 `education_v30_secure` base tables**.
Other work on main is concurrent, so inventory changes do not all belong to
this migration. SQL transaction and metadata verification passed; the new
automated check and Vitest suite have been committed but not executed.

## Classroom Connect evidence and network grants

This continued production-main pass migrated the following **original** empty
tables into `public` using guarded `ALTER TABLE ... SET SCHEMA` operations:

| Table | Preserved OID | Validated outgoing foreign keys |
|---|---|---:|
| `facilitated_rehearsal_events` | `483539` | 5 |
| `facilitated_room_assisted_activity_evidence` | `516166` | 5 |
| `network_reporting_grants` | `542349` | 4 |

Both transactions committed on Neon project `sweet-hall-62441909`, branch
`br-restless-sea-ar9ooo55`. Post-migration database queries confirmed all
three tables exist in `public`, with all 14 foreign keys validated, original
OIDs retained, no unvalidated foreign keys, forced RLS and one owner-only policy
per table. Neither the `authenticated` nor `anonymous` role can directly
SELECT these tables. Zero rows existed before migration, and no records were
deleted, copied, or synthesized.

Drizzle declarations in `classroom-rehearsal.ts`,
`classroom-assisted-activity.ts`, and `network-attribution.ts` now use
`pgTable`. The existing classroom schema acceptance check explicitly resolves
the two migrated Classroom Connect tables from `public` while keeping its
other expected native relations in `education_v30`; it does not relax forced
RLS or policy-count requirements.

Migrations:
- `database/production/2026-11-17-consolidate-classroom-evidence-tables.sql`
- `database/production/2026-11-17-consolidate-network-reporting-grants.sql`

Acceptance and regression contracts:
- `scripts/acceptance/check-main-classroom-network-consolidation.mjs`
- `tests/unit/main-classroom-network-consolidation.test.ts`

The **latest observed inventory** is 323 `education_v30` base tables and 347
`public` base tables, plus seven tables in the untouched
`education_v30_secure` schema. Concurrent work may account for part of that
inventory movement. This pass performed database post-cutover checks but
did **not** execute Vitest, browser, or full application workflows.

The historical, test-branch-only network-attribution validator still assumes
the legacy schema and includes a network membership forced-RLS requirement
that predates the separate `network_memberships` consolidation. It should be
reconciled independently without weakening the intended authorization posture.

## Follow-on: shared Site publication binding cutover

The original empty `education_v30.site_publication_bindings` table, already
keyed by the authoritative `public.sites.id`, has been moved **in place** to
`public.site_publication_bindings` on Neon production `main`. Its original
OID (`402497`), validated Site FK, two indexes, one owner-only policy, forced
RLS, and denial of direct client reads were retained.

The preexisting `education_v30.v301_public_site_claims(text)` security-definer
function was rewired **in the same SQL transaction** to read from
`public.site_publication_bindings`. Verification confirmed the function
remains a SECURITY DEFINER, references the public relation, and returns no
projection for a nonexistent slug. The table has zero records, so this is
a schema/negative-path verification, not full positive publication acceptance.

- Migration: `database/production/2026-11-17-consolidate-site-publication-bindings.sql`
- Application mapping: `src/db/canonical-v301/public-planning.ts`
- Legacy canonical public-reader acceptance SQL updated in
  `scripts/check-canonical-v301-ddl.mjs`
- Main-only read-only production check:
  `scripts/acceptance/check-main-classroom-network-consolidation.mjs`
- Source regression contracts:
  `tests/unit/main-classroom-network-consolidation.test.ts`

At this cutover checkpoint: **322** tables in `education_v30` and **348** in
`public` (plus seven untouched `education_v30_secure` tables). These are
a current snapshot across concurrent main work, not an exclusive workstream
attribution. The transaction and SQL metadata/negative-projection checks
succeeded; full automated and browser acceptance have not been run.

## Continued: learner login and qualification consent withdrawal records

On production Neon `main`, two more original empty tables moved in place:

| Table | Preserved OID | Validated outgoing FKs |
|---|---|---:|
| `instructional_learner_login_bindings` | `418949` | 1 |
| `qualification_person_consent_withdrawals` | `416894` | 3 |

The migration used `ALTER TABLE ... SET SCHEMA public`, preserving the
original objects and their owner-only, forced-RLS policies, relationships,
indexes and privileges. The preflight required zero source records,
zero inbound FKs, no custom triggers, no name/index collisions, and
exactly the two expected SECURITY DEFINER SQL consumers.

The two original functions, without changing names, signatures, execute
privileges, SQL logic or SECURITY DEFINER status, now read the matching
`public` relations:

- `education_v30.v301_instructional_login_can_read_attempt` validates the
  learner's recorded-instruction login and Course attempt binding in
  `public.instructional_learner_login_bindings`.
- `education_v30.v29_guard_subject` rejects a personal qualification
  when a valid consent is withdrawn, checking
  `public.qualification_person_consent_withdrawals`.

The restricted recorded-learner role provisioning script was updated to
insert/read `public.instructional_learner_login_bindings`.
Direct database checks confirmed both retained OIDs, one policy each,
forced RLS, four validated FKs, no client SELECT access, and original
security-definer function OIDs. An invalid learner attempt still returns
false. No positive authorization or personal-consent insert was attempted.

- Migration: `database/production/2026-11-17-consolidate-learner-login-and-qualification-consent.sql`
- Main-only, read-only check: `scripts/acceptance/check-main-protected-identity-table-cutover.mjs`
- Regression contracts: `tests/unit/main-protected-identity-table-cutover.test.ts`

Current snapshot at verification: **320** `education_v30` tables,
**350** `public` tables, seven `education_v30_secure` tables. Other agents
may be making concurrent changes. The database migration and direct SQL
verification passed; the new executable script, Vitest and browser
acceptance remain unexecuted. The safeguarding queue, session records
and database-role organization bindings are not part of this pass.

## Authorization and safeguarding cutover

This production-main cleanup moved two existing empty tables into `public`
without copying, deleting or manufacturing authorization records:

| Original table | Preserved OID | Validated foreign keys |
|---|---|---:|
| `database_role_organization_bindings` | `416485` | 1 |
| `safeguarding_triage_queue` | `412764` | 2 |

The original one-policy, owner-only `FORCE ROW LEVEL SECURITY` state and
direct-access denial to `authenticated` and `anonymous` were retained.
The original five indexes and three foreign keys remain validated.
The two role authorization routines and three existing safeguarding trigger
routines were rewritten in their migration transactions to target the new
`public` table locations. Their OIDs, signatures and security-definer
settings did not change. Each safeguarding routine retains its one dependent
database trigger.

Active Blueprint, survey, assessment and program-catalog role-provisioning
scripts, restricted-role verification scripts and authorization preflight
readers have been updated to use
`public.database_role_organization_bindings`.
The existing canonical test-branch catalog acceptance query was made
schema-aware for the moved role table.

A first attempt at the safeguarding migration failed its SQL preflight due
to a PL/pgSQL local record name colliding with a SQL alias. That entire
transaction rolled back; the guard was fixed and the retry committed.
Afterward database verification confirmed both public tables, no old
physical locations, original object OIDs, three validated FKs, forced RLS,
one policy each and no direct authenticated or anonymous SELECT. The
two role functions rejected a fabricated unapproved organization/purpose,
and all three safeguarding trigger dependencies remain present. These are
negative-path and metadata checks, not positive safeguarding-case acceptance.

- Migrations:
  `database/production/2026-11-17-consolidate-role-organization-bindings.sql`
  and `database/production/2026-11-17-consolidate-safeguarding-triage.sql`
- Main-only read-only acceptance:
  `scripts/acceptance/check-main-role-and-safeguarding-cutover.mjs`
- Source regression contracts:
  `tests/unit/main-role-safeguarding-cutover.test.ts`

At final verification: **304** `education_v30` base tables,
**366** `public` base tables and **7** separate `education_v30_secure`
tables. Other concurrent main changes can affect these totals.
Migration SQL and direct DB metadata/negative authorization checks passed;
the new executable acceptance script, Vitest and browser-based tests
have not been run.

**Do not relocate `canonical_sessions` merely to reduce the table count.**
It participates in session credentials, active grants, runtime
`canonicalSessions` models and audit/device session lifecycle. First
reconcile it with the authoritative shared account/session model and
exercise positive and negative login, refresh, expiry and revocation
tests without introducing an additional identity system.
