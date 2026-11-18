# Decision: One CAN OS database model, one public application schema

Status: **Shared Site and Organization identities retired on Neon main; Person and broader schema consolidation still in progress**
Updated: 2026-11-17

## Outcome

- **One PostgreSQL database** (already true) and **one application schema: `public`**.
- **One Site entity**: `public.sites.id`. Preserve the existing UUIDs, website slugs, publications, planning records, audit references, and staff/site relationships.
- **One Organization entity**: `public.organizations.id`. Distinguish owner/host/operator/network roles through explicit, effective-dated scoped relationship records, **not** through duplicate Organizations.
- **One account/person identity** used for sign-in, authorization and learning history; do not create canonical identity aliases.
- Canonical capabilities such as Offers, Courses, Classes, Sessions, assessment, funding, completion, evidence and quality controls move **into `public`**. Existing verified security boundaries must survive.
- **No Site identity bridge, crosswalk, matching by names, or new education-only Site entity.** The Site correspondence table is now physically retired on main. Remaining Person/account correspondence is a separate transitional issue to eliminate only when its live authorization consumers are migrated.

## Site retirement verified on Neon main

- The former `education_v30.sites` table is physically absent. All nine Sites remain in `public.sites`, preserving their original UUIDs.
- All 40 former native Site foreign keys now reference `public.sites` and are validated. There are 94 validated inbound FKs overall.
- Six database functions that previously resolved the duplicate Site now use `public.sites`; no inspected database routine retains an explicit `education_v30.sites` reference.
- `public.sites` has RLS enabled and forced. The `authenticated` and `anonymous` database roles have no direct Site table access, and a restrictive deny policy is installed. Database-owner service queries can bypass RLS and still require audited application authorization.
- The matched demo Site retained its existing planning lifecycle, classification, reference code, and clearly labeled synthetic metadata. This metadata is not a verified street address.
- Migration files: `2026-11-17-retire-duplicate-native-site.sql` and `2026-11-17-retired-site-demo-address-preservation.sql`. The Site retirement is complete; the Organization was also subsequently retired. Person, Class, and remaining schema consolidation are not complete.

## Main verification snapshot, November 17, 2026

The authoritative Neon `main` database now has **no duplicate Site or Organization tables**. Current read-only measurements:

| Metric | Public | Remaining native |
| --- | ---: | ---: |
| Base tables | 270 | 401 in `education_v30` |
| Sites | 9 | 0; `education_v30.sites` absent |
| Organizations | 17 | 0; `education_v30.organizations` absent |
| Foreign keys pointing to duplicate Site/Organization tables | n/a | 0 |
| Foreign keys pointing to `public.sites` / `public.organizations` | 94 / 229 | n/a |
| Native Person FKs still requiring review | n/a | 239 |
| Separate sensitive-schema tables | n/a | 7 in `education_v30_secure` |

The authoritative `public.people`, `public.sites`, and `public.organizations` tables now all have **enabled and forced row-level security**, restrictive client-denial policies, and no direct `authenticated` or `anonymous` SELECT permissions. The Person security migration preserved all 142 People and did not alter identity ownership. The server's privileged connection still requires application authorization; forced RLS does not replace command-level membership checks.

The native staff-reader and five additional governed SQL functions were updated in place to reference `public.organizations`. An invalid synthetic staff/native session returned zero grants. `catalogSites`, `canonicalEnrollmentSites`, and `canonicalEnrollmentOrganizations` are now public-schema Drizzle projections, not new identities. A regression check and read-only acceptance command were committed on GitHub `main`.

**Remaining:** public Person cutover, native account/session and correspondence retirement, 401 additional canonical tables and 7 sensitive tables at this verification snapshot, all associated routines/permissions, and an authenticated build/browser acceptance run. Other workstreams can advance the table counts independently. Do not claim that a single application schema or the one-login experience is already fully delivered. A separately staged Person-FK migration has an explicit runtime/approval gate and must not be executed independently.

## Historical pre-retirement Neon main inventory

Snapshot before Site retirement, 2026-11-17 (54 table relocations; all Site and Organization foreign keys had converged):

| Metric | public | education_v30 |
| --- | ---: | ---: |
| Base tables | 244 | 430 |
| Views | 0 | 6 |
| SQL functions/procedures | 258 | 245 |
| Sites | 9 | 1 (same Site UUID as its public record) |
| Organizations | 17 | 1 (not yet unified) |
| Native Classes and Sessions | n/a | 0 |

The canonical demo Course and its child draft content have also been seeded since the initial empty-model inspection. All migrations and code changes use Neon `main` and GitHub `main`, not test01.

Additional: `education_v30_secure` contains 7 particularly sensitive tables, which also need a deliberate access-control-safe migration into the unified application schema. There are 9 colliding table names and 12 already existing cross-schema FKs. Hundreds of governed reference rows remain across canonical source tables, so these tables cannot simply be discarded.

The 9 collisions are `admission_offers`, `audit_events`, `domain_events`, `enrollments`, `graduation_decisions`, `organizations`, `qualification_definitions`, `sites`, `transcript_issuances`. They have different column definitions. Never overwrite a public table using `ALTER TABLE ... SET SCHEMA` before resolving its actual semantics. Keep ONE core entity; where concepts really differ, choose descriptive domain names rather than a `canonical_` duplicate.

At this historical snapshot, `education_v30.sites` had zero inbound foreign keys and `public.sites` had 94. Both the duplicate Site and Organization tables have since been retired using guarded migrations, after preserving the exact public UUIDs and dependent authorization behavior.

**Current security status:** Forced RLS and restrictive direct-client privileges protect both authoritative Site and Organization tables. Application-level Site authorization and related sensitive tables must still be independently verified, particularly for privileged database-owner connections.

## Main progress applied

1. Added shared Site fields directly to `public.sites`: `site_kind`, `capacity`, `lifecycle_status`, `reference_code`, `geographic_area_id`. Added Organization `lifecycle_status`, `external_reference` to `public.organizations`.
2. Enforced validation checks and nullable unique references. No existing ID was changed or inferred; no child FK was moved, no link was approved, and no new table was created by this step.
3. Updated `src/db/schema/organizations.ts`, Site creation, and Launch Studio to write actual platform Site classification and initial planning status into this same Site record.
4. Replaced the previous test01-specific consolidation check with the main-only, read-only `verify:site-identity:preflight` command.
5. Replaced Site link lookups in Launch Studio discovery, native Class handoff, public Class listings, provider noncredit release UI and publicly eligible noncredit catalog reads with **exact platform Site UUID checks**. Existing Site-specific publisher and operator permissions remain authoritative.
6. Deployed the revised restricted CAN staff SQL function on Neon main: it requires `native_grant.site_id = source.can_site_id` without a Site crosswalk. Verified that an invalid synthetic session returns no grants; the function's restricted role execute grant remains intact. **CAN Person aliasing is not yet consolidated**.
7. Moved the existing `feedback_categories` and six noncolliding static reference tables from `education_v30` to `public`. All **140** rows were preserved, no copy or bridge was created, and PostgreSQL retained their foreign-key relationships. SQL migrations: `2026-11-17-consolidate-feedback-categories.sql` and `2026-11-17-consolidate-static-reference-tables.sql`. Reviewed for source-code mapping, direct SQL routine, view, trigger and ACL risks before executing.
8. Retired obsolete Site identity-link service, noncredit bridge tests, and the empty Site correspondence table. Separate canonical Person/account aliasing still exists and must only be retired once its active authorization consumers are replaced.
9. Moved an additional **36 empty, noncolliding canonical tables** into `public` on Neon main in one guarded transaction after verifying no direct SQL routine/view use, no table-level policies, no custom triggers, no data, and no identifiable runtime table mappings for the selected tables. Preserved table OIDs and inbound/outbound foreign keys. Source: `database/production/2026-11-17-consolidate-36-empty-legacy-tables.sql`. At that stage: **234 public / 441 education_v30** base tables.
10. Added `verify:schema:consolidation` to reconcile all **51** committed table moves on actual main without changing data. This check intentionally does not claim full schema unification while canonical objects remain.


11. Relocated **eight further empty, noncolliding operational tables** in a checked main-only transaction, including `organization_relationships`, `organization_classifications`, `provider_authorizations`, `provider_eligibility_reviews`, `institutional_approvals`, `curriculum_rights_grants`, `production_opportunities`, and `session_staff`. Each retained its table identity and FK targets; none had existing business records. Source: `database/production/2026-11-17-consolidate-8-empty-operational-tables.sql`. **After these moves: 242 public tables, 433 canonical tables, 51 total tables relocated.**

12. **Retired the empty Site identity bridge on Neon main:** `public.site_canonical_identity_links` was dropped with `RESTRICT` after confirming zero records, incoming FKs, dependent routines/views, or user triggers. Source: `database/production/2026-11-17-retire-empty-site-identity-bridge.sql`. Staff reviewer authorization now uses the same Site ID rather than a Site mapping; the old Site link request/confirm/review service was deleted, and the bookmarked `/site-identity` route is limited to independent staff Person verification. Current post-retirement count: **241 public / 433 education_v30** base tables. **The separate Person alias table still exists pending a one-Person model cutover**, as do the canonical identity tables. These are not yet unified.

13. Moved three native tables with active Drizzle mappings (`content_assets`, `deployment_organization_roles`, and `enrollment_site_placements`) into `public` in a guarded main-only transaction, changing the corresponding models to `pgTable`. Table OIDs and all inbound and outbound FKs remained intact. SQL: `database/production/2026-11-17-consolidate-drizzle-native-support-tables.sql`.
14. Rebound four reviewed, empty `public` operational tables' Site foreign keys from `education_v30.sites(id)` to the authoritative `public.sites(id)`, preserving constraint names and validation. SQL: `database/production/2026-11-17-rebind-public-operational-site-fks.sql`. Exact Site UUIDs were already the same; no mapping or backfill was introduced.
15. Added `verify:site:main-consolidation` to assert directly on Neon main that moved tables remain in `public`, four reviewed Site constraints target `public.sites`, and the Site identity bridge remains absent. This check does not certify the remaining 430 native tables, browser flows or release readiness.

16. Rebound **26 Organization FKs across 23 empty public operational tables** from `education_v30.organizations(id)` to `public.organizations(id)`. Preserved their names and validation; isolated the active adult-learning identity-review FK for later authorization migration. SQL: `database/production/2026-11-17-rebind-public-operational-organization-fks.sql`.
17. Rebound **7 operational Person FKs** from `education_v30.persons(id)` to `public.people(id)`. The three Person/account correspondence and review tables were not touched. Read-only source inspection verified that the native Person and Account tables are empty on main, while the platform retains 142 People and 15 login Accounts. SQL: `database/production/2026-11-17-rebind-public-operational-person-fks.sql`.
18. Extended main-only `verify:site:main-consolidation` to check 4 direct Site FKs, 26 direct Organization FKs, 7 direct Person FKs, 10 representative relocated table locations, and the retired Site bridge. This is a **milestone gate**, not full typecheck, migration rollback acceptance or browser release.

19. Rebound **all 40 native Site foreign keys** directly to `public.sites(id)`, in reviewed batches of 11 and 29. Preserved existing `ON DELETE RESTRICT` behavior and every child table's RLS/permissions. The Site UUID did not change and no correspondence service or table was introduced. Migration files: `2026-11-17-rebind-11-core-native-site-fks.sql`, `2026-11-17-rebind-remaining-29-native-site-fks.sql`. **Verified: 0 FKs still reference `education_v30.sites`.**
20. Preserved the one matched native demo Site's education-only fields (`site_kind`, `status`, `code`, capacity, geography) on its **same** `public.sites` row. Verified exact ID, name and timezone agreement. The unverified synthetic address was initially omitted; it was subsequently preserved with `synthetic` and `addressVerified: false` markers, not treated as a verified physical address. SQL: `2026-11-17-consolidate-native-site-attributes.sql`.
21. Rebound **all 154 native Organization foreign keys** to `public.organizations(id)`, preserving constraint names, validation, and delete behaviors, including two actual published/draft Course/Offering reference rows. Completed in core 23-FK and subsequent 30-FK batches plus the final adult review FK. **Verified: 0 FKs still reference `education_v30.organizations`.** The actual duplicate Organization has subsequently been retired after its readers were migrated.
22. Preserved the one matching canonical demo Organization's `prospective` status, external reference, and explicitly synthetic legal name on its **same** public Organization row; no new Organization was created. SQL: `2026-11-17-consolidate-native-organization-attributes.sql`.
23. Added `verify:identity:main-core-fks`, a **read-only main-only verification milestone** for zero native Site/Organization FKs, exact UUID/attribute agreement, and absent Site identity bridge. This remains a schema reconciliation check rather than full browser acceptance. Native Person and Account identities still require separate consolidation.
24. **Retired `education_v30.sites` on Neon main** using a guarded transaction, updated six dependent SQL functions and relevant app readers, installed forced RLS on `public.sites`, and verified anonymous/authenticated roles cannot read or modify that table directly. A negative synthetic staff-session query returned zero grants.

25. Repointed the restricted CAN staff SQL projection and five additional canonical SQL functions to `public.organizations`, including active lifecycle checks and display names. No identity correspondence or role grants were invented; unknown sessions still return zero rows. SQL: `2026-11-17-repoint-restricted-staff-identity-to-public.sql` and `2026-11-17-repoint-five-canonical-organization-functions.sql`.
26. **Dropped the duplicate `education_v30.organizations` table with `RESTRICT`**, after verifying the only native demo row already existed in `public.organizations`, all FKs were redirected and all affected SQL functions had been migrated. SQL: `2026-11-17-retire-duplicate-native-organization.sql`.
27. **Enabled and forced RLS on `public.organizations`**, revoked unscoped `authenticated` / `anonymous` table privileges and applied a restrictive direct-client deny policy. A direct privilege probe confirms the generic client roles have no Site or Organization SELECT. SQL: `2026-11-17-secure-public-organizations.sql`.
28. Updated public-only Drizzle Site and Organization projections, Launch Studio Course Site scope, tests and the `verify:identity:main-core-fks` gate. The verifier now fails if either duplicate table returns, direct client read permission reappears, or forced RLS is disabled. App-wide build and browser acceptance remain unverified.

## Production cutover (dependency order; remaining steps)

1. Inventory every schema object and real record, including colliding names, 430 remaining canonical tables, 245 routines, 7 sensitive tables, sequences, views, non-FK UUIDs, triggers, migrations, role grants, RLS policies, published URLs and identity-related consumers.
2. Review a semantic collision plan: merge or retire duplicate `sites` and `organizations` only after rekeying inbound FKs; evaluate near-equivalent event/audit/learner tables field by field. No guessed identity matches.
3. Enforce tested RLS on the authoritative `public.sites` model (and related identity/Organization data) before exposing native Class records through it. Avoid blanket `PUBLIC` grants.
4. Move non-colliding canonical tables, sequences, types, views and routines into `public` with dependency ordering and verified rollback, keeping the existing object identities where supported. Move sensitive tables with dedicated least-privilege policies. Preserve canonical reference data.
5. Rebind the empty canonical Site/Organization foreign keys to shared `public` identities, using **direct references**, not a persistent crosswalk. All new native Classes and Deployments use the platform Site UUID.
6. Change Drizzle and server modules in the same release window; remove all schema-qualified `education_v30.` calls, legacy identity translation, duplicate publication paths and redundant enrollment implementations. Reconcile academic and noncredit participation into person-centered learning history without losing provenance.
7. Retire the now-unreferenced canonical Site/Organization tables and remaining Person identity aliases, then remove the empty old namespaces only after inspecting all dependent SQL routines and roles. The Site crosswalk table has already been dropped.
8. Exact SHA: typecheck, build, security/RLS negative cases, one-login, Launch Studio, Course/Offering adoption, Class and four Sessions, learner enrollment, attendance, completion, credential, reporting, website reentry, network and Site switching, plus replay and rollback validation.

**Release gate:** Main is a live database. Schema movement, FK reassignment, routine replacement, RLS enforcement and object drops are destructive/availability-sensitive. Neither the above decision nor phase-1 additive changes assert that the full cutover was executed or verified. Stop before any unsafe, unreviewed cutover.
