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
