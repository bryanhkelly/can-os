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
