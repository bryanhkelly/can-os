# Decision: One CAN OS database model, one public application schema

Status: **In progress on GitHub main + Neon main; NOT cut over**
Updated: 2026-11-17

## Outcome

- **One PostgreSQL database** (already true) and **one application schema: `public`**.
- **One Site entity**: `public.sites.id`. Preserve the existing UUIDs, website slugs, publications, planning records, audit references, and staff/site relationships.
- **One Organization entity**: `public.organizations.id`. Distinguish owner/host/operator/network roles through explicit, effective-dated scoped relationship records, **not** through duplicate Organizations.
- **One account/person identity** used for sign-in, authorization and learning history; do not create canonical identity aliases.
- Canonical capabilities such as Offers, Courses, Classes, Sessions, assessment, funding, completion, evidence and quality controls move **into `public`**. Existing verified security boundaries must survive.
- **No Site identity bridge, crosswalk, mapping table, double-write, matching by names, or new education-only Site entity.** The pre-existing public-to-canonical correspondence tables must be retired **after** the consumers are converted.

## What actually exists on Neon main

Current Neon main snapshot, 2026-11-17 (after seven guarded reference table moves):

| Metric | public | education_v30 |
| --- | ---: | ---: |
| Base tables | 198 | 477 |
| Views | 0 | 6 |
| SQL functions/procedures | 258 | 245 |
| Sites | 9 | 1 (same Site UUID as its public record) |
| Organizations | 17 | 1 (not yet unified) |
| Native Classes and Sessions | n/a | 0 |

The canonical demo Course and its child draft content have also been seeded since the initial empty-model inspection. All migrations and code changes use Neon `main` and GitHub `main`, not test01.

Additional: `education_v30_secure` contains 7 particularly sensitive tables, which also need a deliberate access-control-safe migration into the unified application schema. There are 9 colliding table names and 12 already existing cross-schema FKs. Hundreds of governed reference rows remain across canonical source tables, so these tables cannot simply be discarded.

The 9 collisions are `admission_offers`, `audit_events`, `domain_events`, `enrollments`, `graduation_decisions`, `organizations`, `qualification_definitions`, `sites`, `transcript_issuances`. They have different column definitions. Never overwrite a public table using `ALTER TABLE ... SET SCHEMA` before resolving its actual semantics. Keep ONE core entity; where concepts really differ, choose descriptive domain names rather than a `canonical_` duplicate.

The `education_v30.sites` table has 45 inbound FK constraints; `public.sites` has 51. The duplicate canonical Site and Organization tables now each have one demo row on main and are referenced by code, SQL functions, constraints and policies. Dropping them before rewiring consumers is not a valid migration.

**Security blocker:** `education_v30.sites` enforces RLS (including FORCE); `public.sites` currently does not. First build tested purpose-scoped RLS and authorization for the single platform Site. The goal does not license weakening learner privacy or cross-Site permissions.

## Main progress applied

1. Added shared Site fields directly to `public.sites`: `site_kind`, `capacity`, `lifecycle_status`, `reference_code`, `geographic_area_id`. Added Organization `lifecycle_status`, `external_reference` to `public.organizations`.
2. Enforced validation checks and nullable unique references. No existing ID was changed or inferred; no child FK was moved, no link was approved, and no new table was created by this step.
3. Updated `src/db/schema/organizations.ts`, Site creation, and Launch Studio to write actual platform Site classification and initial planning status into this same Site record.
4. Replaced the previous test01-specific consolidation check with the main-only, read-only `verify:site-identity:preflight` command.
5. Replaced Site link lookups in Launch Studio discovery, native Class handoff, public Class listings, provider noncredit release UI and publicly eligible noncredit catalog reads with **exact platform Site UUID checks**. Existing Site-specific publisher and operator permissions remain authoritative.
6. Deployed the revised restricted CAN staff SQL function on Neon main: it requires `native_grant.site_id = source.can_site_id` without a Site crosswalk. Verified that an invalid synthetic session returns no grants; the function's restricted role execute grant remains intact. **CAN Person aliasing is not yet consolidated**.
7. Moved the existing `feedback_categories` and six noncolliding static reference tables from `education_v30` to `public`. All **140** rows were preserved, no copy or bridge was created, and PostgreSQL retained their foreign-key relationships. SQL migrations: `2026-11-17-consolidate-feedback-categories.sql` and `2026-11-17-consolidate-static-reference-tables.sql`. Reviewed for source-code mapping, direct SQL routine, view, trigger and ACL risks before executing.
8. Retired obsolete Site-identity helper and noncredit bridge test code paths. The legacy `site_canonical_identity_links` table and several canonical identity aliases **still physically exist** until all remaining service/auth endpoints are removed; removing it prematurely would break those endpoints.

## Production cutover (dependency order; not yet executed)

1. Inventory every schema object and real record, including colliding names, 477 remaining canonical tables, 245 routines, 7 sensitive tables, sequences, views, non-FK UUIDs, triggers, migrations, role grants, RLS policies, published URLs and identity-related consumers.
2. Review a semantic collision plan: merge or retire duplicate `sites` and `organizations` only after rekeying inbound FKs; evaluate near-equivalent event/audit/learner tables field by field. No guessed identity matches.
3. Enforce tested RLS on the authoritative `public.sites` model (and related identity/Organization data) before exposing native Class records through it. Avoid blanket `PUBLIC` grants.
4. Move non-colliding canonical tables, sequences, types, views and routines into `public` with dependency ordering and verified rollback, keeping the existing object identities where supported. Move sensitive tables with dedicated least-privilege policies. Preserve canonical reference data.
5. Rebind the empty canonical Site/Organization foreign keys to shared `public` identities, using **direct references**, not a persistent crosswalk. All new native Classes and Deployments use the platform Site UUID.
6. Change Drizzle and server modules in the same release window; remove all schema-qualified `education_v30.` calls, legacy identity translation, duplicate publication paths and redundant enrollment implementations. Reconcile academic and noncredit participation into person-centered learning history without losing provenance.
7. Retire the now-unreferenced canonical Site/Organization tables and the unused `site_canonical_identity_links` table. Remove the empty old namespaces only after inspecting all dependent SQL routines and roles.
8. Exact SHA: typecheck, build, security/RLS negative cases, one-login, Launch Studio, Course/Offering adoption, Class and four Sessions, learner enrollment, attendance, completion, credential, reporting, website reentry, network and Site switching, plus replay and rollback validation.

**Release gate:** Main is a live database. Schema movement, FK reassignment, routine replacement, RLS enforcement and object drops are destructive/availability-sensitive. Neither the above decision nor phase-1 additive changes assert that the full cutover was executed or verified. Stop before any unsafe, unreviewed cutover.
