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

## P0 shared authentication hardening before session convergence

The follow-on identity review found the canonical native identity tables
(`education_v30.canonical_accounts`, `canonical_account_grants`, `canonical_sessions`,
and `persons`) all empty, but the active shared system contained 15
`public.access_accounts`, 21 `account_person_grants`, 274
`access_sessions`, and 142 `public.people`. All observed shared
sessions were expired at the time of inspection. The presence of native
login, enrollment, revocation, restricted reader, and account/person
linkage code means an empty native session table is **not** evidence it
can be dropped safely.

Before any shared-session cutover, the migration
`database/production/2026-11-17-harden-shared-auth-rls.sql` enabled
and forced RLS on `public.access_accounts`, `access_sessions`, and
`account_person_grants`, removed direct SQL access for
`authenticated`/`anonymous`, and added an explicit restrictive deny
policy to each. The owner service role remains authorized as before.

Separately,
`database/production/2026-11-17-revoke-shared-identity-metadata-client-acl.sql`
removed unnecessary `authenticated` CRUD privileges from the existing
forced-RLS, owner-only tables
`public.access_account_canonical_principals`,
`public.access_account_noncredit_principals`, and
`public.access_adult_learning_reviews`.

**Verified directly on Neon main:** all six protected public relations
have forced RLS, no direct anonymous or authenticated SELECT/INSERT/
UPDATE/DELETE, one unchanged or appropriately restrictive owner/deny
policy, and the server owner retains SELECT. Before/after checks show
15 shared accounts, 274 shared sessions, 21 grants, and zero rows in
each of the three protected identity/review ledgers. A synthetic invalid
staff-session hash returned zero grants.

**Reader acceptance limitation:** `neondb_owner` is a member of
`can_v30_canonical_auth_reader` but cannot SET ROLE to it
(`pg_has_role(...,'SET') = false`). Its EXECUTE permission is present
on both canonical session projections. The negative reader result was
tested through the privileged owner context, **not** a real restricted
reader connection. No role membership or grant changes were made to
circumvent that boundary. The actual `CAN_CANONICAL_AUTH_DATABASE_URL`
connection still needs positive and negative end-to-end authorization
testing after the schema hardening.

- Read-only acceptance: `scripts/acceptance/check-main-shared-auth-rls.mjs`
- Source regression: `tests/unit/main-shared-auth-rls.test.ts`

These security changes do not retire the native identity/session tables
and are **not** an assertion that shared login, staff role switching,
adult review or learner enrollment browser workflows have passed.
Complete unified-session design and acceptance before deleting
`canonical_sessions` or its related account/grant tables.


## Four facility, shared resource and professional service tables consolidated

Four further original, **empty** `education_v30` tables were moved in place
to `public` on Neon production main. All preserved their original object
identities, incoming/outgoing FKs, owner-only forced-RLS policy, indexes
and direct-client SELECT denial. No records were copied or deleted:

| Moved relation | Original OID | Incoming FKs | Outgoing FKs |
|---|---|---:|---:|
| `blueprint_facility_requirements` | `411738` | 1 | 2 |
| `site_space_capability_assertions` | `411656` | 1 | 4 |
| `shared_resource_pools` | `404988` | 1 | 2 |
| `professional_service_delivery_records` | `407872` | 1 | 4 |

All four inbound FKs were retained by PostgreSQL object identity, including
links from `public.shared_resource_allocations`,
`public.site_requirement_evaluations`,
`public.workforce_earning_events`, and the existing
`education_v30.site_space_capability_verifications` table.
Twelve outgoing FKs remain validated.

Six original database functions were rewritten within the SAME successful
transaction to reference the relocated relations: the two facility
verification guards, program-fit facility guard, qualification facility
guard, shared resource capacity guard, and workforce earnings validator.
The security-definer statuses were unchanged. The database was inspected
afterward: all four original locations are absent, all original OIDs were
preserved, forced RLS and existing policies are intact, and the six
dependent functions contain explicit `public` relations.

- SQL migration:
  `database/production/2026-11-17-consolidate-four-facility-resource-evidence-tables.sql`
- Read-only, main-only acceptance:
  `scripts/acceptance/check-main-facility-resource-cutover.mjs`
- Source regression:
  `tests/unit/main-facility-resource-cutover.test.ts`

The database metadata/SQL checks succeeded; the new executable script,
Vitest and positive browser workflows remain unexecuted.
At the last observed checkpoint, **300** `education_v30` base tables
remained and **370** tables were in `public`. The seven
`education_v30_secure` tables were unchanged. Concurrent updates to
main may account for additional inventory changes; do not attribute all
movement exclusively to this batch.

## Native session retirement preflight

A new main-only, **read-only, fail-closed** gate makes the next core-identity
retirement decision explicit:
`scripts/acceptance/check-main-canonical-session-retirement.mjs`.
Source regression checks:
`tests/unit/main-canonical-session-retirement-preflight.test.ts`.

Current direct production evidence:

- Four `education_v30` identity tables (`persons`, `canonical_accounts`,
  `canonical_account_grants`, and `canonical_sessions`) each have **zero
  rows**. Shared `public.access_sessions` retains **274** historical sessions.
- The remaining native Person, canonical Account, and canonical grant tables
  have **14**, **5**, and **2** inbound FKs respectively. No inbound FK
  references the native session table.
- Existing database routines still reference native sessions (**2**),
  native account grants (**6**) and native accounts (**4**). Some references
  overlap in the same routines.
- Live server modules still issue, read, touch, and revoke the second native
  session cookie and can create native Person/account/grant rows for new
  learners.
- Forced RLS and denied direct authenticated SELECT/UPDATE on all three
  authoritative public authentication tables were reverified.

**Result: not safe to delete or move `canonical_sessions` in isolation.**
The required exit is a shared-session issuer, account and Person mapping,
grant authorization, restricted reader, mutation-time revalidation,
revocation and activity-lifetime path that preserves exact existing
security invariants and does not invent an identity bridge. Only after
positive and negative end-to-end authentication tests pass should the
native credential tables be retired. No user records were altered by
this preflight.

The new checker and Vitest source contracts are committed but were not run
as scripts in this pass; the database portions were verified directly
through read-only SQL on production main.
