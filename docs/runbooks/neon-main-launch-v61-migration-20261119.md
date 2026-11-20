# Neon main V6.1 Launch Studio: partial migration record

Date: 2026-11-19 (Pacific). Neon project `sweet-hall-62441909`, default branch `main` (`br-restless-sea-ar9ooo55`).

## Applied to Neon main

One committed Neon SQL transaction applied the additive DDL corresponding to `drizzle/0087_site_signup_organization_name.sql` and `drizzle/0088_site_marketing_packages.sql`:

- `public.school_setup_signups.organization_name text`, nullable, `ADD COLUMN IF NOT EXISTS`.
- `public.site_marketing_packages`, with canonical Organization/Site/Person foreign keys, revision/status constraints and server-managed draft status, `CREATE TABLE IF NOT EXISTS`.
- `site_marketing_packages_site_status_idx`, `CREATE INDEX IF NOT EXISTS`.
- `ENABLE ROW LEVEL SECURITY` on the new package table.

Post-apply checks: package table has **zero** rows; RLS enabled; anonymous has no direct permissions; authenticated PostgreSQL role has grants but **zero RLS policies**, so RLS denies requests; separate restricted canonical auth app has no direct table grants.

**Important:** This was a manual, schema-only Neon operation, not a Drizzle migrator run. Do NOT mark journal migrations 0087/0088 as applied. Latest `drizzle.__drizzle_migrations` before/after was ID 87, `created_at=1794990001000`; the newer six migration scripts remain unjournaled. The current repository migrations 0087 and 0088 use `IF NOT EXISTS` for these DDL objects; replay with the standard runner after checking their definitions match.

## Previously present pilot data (not a fresh migration)

Published planning Program references: `can.program.custom_training` and `can.program.ai_digital_skills` (v1/v2). Published Solution Blueprints: `can.pilot.custom-training.one-hour` (5 components) and `can.pilot.ai-digital-skills.four-session` (7). Both linked Offerings and Courses are **draft**. Custom Training has seven placeholder lessons; AI/Digital Skills has four lessons with supplemental video links pending review. Neither is published or enrollable.

## Held: backup/test capacity and independent approvals

Neon rejected both a current snapshot attempt and a disposable child branch with `limit exceeded`. Do not delete existing snapshots, recovery branches or other teams' branches without explicit retention approval. The available older snapshot predates this work and is not an adequate current rollback point.

**Not applied:** migrations 0089–0092 (Brand versioning, provenance-bearing backfill, immutable Marketing Package releases, website editor grants), canonical Site catalog RLS policy, restricted Program Catalog/Blueprint author roles, Organization-purpose bindings, or geographic classifications.

A read-only run of `database/canonical/v3.0.1/check-launch-prepare-readiness.sql` showed **4 of 9 ready** and **5 blocked**: Site catalog policy, Program Catalog SQL role, Blueprint author SQL role, geographic-area reference data, and a Site assigned verified geography. Two Sites have published website content with attributed authors, but Brand backfill still needs a disposable rehearsal and current backup. No location or institutional approval was invented.

## Safe next execution sequence

1. Obtain available Neon branch and snapshot quota through an approved retention decision.
2. Make a fresh snapshot and disposable clone of `main` and rehearse ordered Drizzle 0087–0092, validating backfill provenance, RLS/permissions, triggers and migration journal.
3. Independently test and provision the purpose-scoped Site catalog policy and restricted SQL roles; never bypass RLS or grant a privileged application login.
4. Load verified jurisdiction geography for actual Sites, then complete governed Course/Offering publication and Site-specific Blueprint configuration.
5. Run authenticated end-to-end Phase 1 and Phase 2 acceptance, including failed authorization attempts and build/test verification.

No full migration, deployment, content publication, enrollment activation, partner approval, or successful CI run is claimed.


## Follow-up: independently verified and applied fixes

The following was subsequently applied to Neon `main`:

1. Added `sites_canonical_catalog_operator_read` on `public.sites`. The transaction verified forced Site RLS, the existing restrictive `sites_no_direct_client_access` policy, the current exact-Site operator relation and the privileged-purpose binding function. Existing direct anonymous/authenticated denial was preserved; with no active catalog or Blueprint purpose bindings, the policy grants no presently usable new operator path. A future security test must prove both allowed and denied operator cases after scoped roles are installed.
2. Populated `public.geographic_areas` with a parent `US` country record and 56 canonical first-level areas (50 states, District of Columbia, five territories). The seed derives only exact `US-XX` rows from `public.jurisdictions`, requiring their `region_code` to match, and intentionally excludes seven synthetic/test jurisdictions. The seed is additive and idempotent: `database/seeds/2026-11-canonical-us-geography.sql`. **No Site was classified and no jurisdictional or educational authorization was inferred.**

**Read-only status after these commits:** 6 of 9 `check-launch-prepare-readiness.sql` checks are now ready. Remaining three blockers are restricted `program_catalog` PostgreSQL role provisioning, restricted `blueprint_author` PostgreSQL role provisioning, and an independently classified, active/planning Site with verified geography. Neither purpose-specific role nor its Organization binding was created.

**Full transaction rehearsal only:** Using the pinned feature-branch SHA `3fb0a27346ebe8df77b73ad7089d1d6f74bff8cd`, all actual SQL statements from Drizzle 0089, 0090, 0091 and 0092 were run in a single Neon `main` transaction under a savepoint, then rolled back to that savepoint. The transaction returned `rollback_verified=true` and left `public.site_brand_versions` absent. This proves SQL execution against the then-current schema, **not** committed migration, app build, runtime acceptance, snapshot readiness or safe future rollback after commit. The Drizzle migration journal was not changed.

**Capacity remains constrained:** The free Neon project has 10 of 10 branches and one existing old snapshot. Requests for a new validation branch and a fresh snapshot returned limits exceeded. Do not delete or overwrite recovery branches or snapshots without a deliberate retention approval.

**Caution:** The manual scoped Site policy is now present; the operator-run `provision-public-site-catalog-rls.sql` intentionally fails if re-executed against an existing policy. Review the installed policy rather than attempting to apply the creation script a second time.


**Independent direct-client denial probe:** After adding the scoped policy, transaction-local `SET LOCAL ROLE authenticated` and `SET LOCAL ROLE anonymous` followed by `SELECT count(*) FROM public.sites` both returned PostgreSQL `42501 permission denied for table sites`, confirming neither direct client role acquired Site read access. A positive restricted-operator probe is pending role and Organization-purpose provisioning; it has not been simulated or claimed.
