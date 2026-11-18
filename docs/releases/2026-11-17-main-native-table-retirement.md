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
