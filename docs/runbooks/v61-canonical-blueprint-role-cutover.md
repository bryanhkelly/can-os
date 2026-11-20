# V6.1 canonical Blueprint and Program Catalog role cutover

**Target:** Neon CAN OS project `sweet-hall-62441909`, isolated V6.1
validation branch `br-bitter-pine-ar7mjn70` only. Main stays untouched.
**Status (2026-11-20):** Code and migrations 0097–0098 applied on
validation. A password-disabled, least-privilege operations LOGIN, three
restricted NOLOGIN purpose roles, and seven-day QA-only bindings now exist
for the Valor School test Organization. **These are not institutional
approval or production-ready credentials.** No schema-drop authorization.

## What has moved

The Blueprint configuration and review author-provenance reads, independent
adoption checks, configuration/review/execution audit entries and outbox events
now use the **existing** `public.audit_events` and `public.domain_events`
schema, via `writeBlueprintTransition`. A private verified CAN Site Admin
uses the existing public journal adapter after the exact Site ownership check.

Delegated canonical operations now require an isolated non-owner connection
`CAN_CANONICAL_OPERATIONS_DATABASE_URL` for PostgreSQL `SET LOCAL ROLE`.
The code refuses missing credentials or a connection to a different Neon
endpoint/database. It does not substitute the general owner `DATABASE_URL`
or the auth-reader `CAN_CANONICAL_AUTH_DATABASE_URL`.

Migration 0097 installed `public.append_restricted_blueprint_transition`
and a reviewer-only author-provenance RLS policy. Migration 0098 removed
Neon's implicit `authenticated` and `anonymous` function execute grants.
These functions retain exact-purpose, bound-Organization and source-entity
checks. They do not publish, activate, grant academic credit, or create a
second audit/event journal.

## Required institutional setup, in order

1. Verify one real authorized canonical Organization and its active Site
   operator relationships under `public.site_organization_roles`. A demo
   Organization, shared demo identity, or merely verified email is **not**
   authorization to appoint a reviewer, Site operator or publisher. Obtain
   independent approval where necessary.
2. Through Neon/approved DBA administration, create a **dedicated** LOGIN
   `can_os_canonical_ops_app` with a separate securely held password,
   `NOINHERIT NOBYPASSRLS NOCREATEDB NOCREATEROLE NOSUPERUSER`, with no table
   ownership and no membership in the `education_v30` schema owner.
   Do **not** reuse `neondb_owner`, `authenticator`, or the canonical auth
   reader. Check the exact branch endpoint.
3. Run `database/canonical/v3.0.1/provision-program-catalog-role.sql`
   through **psql** with explicit operator-approved
   `organization_id`, `program_catalog_role` =
   `can_v30_program_catalog_<organization UUID without hyphens>`, and
   `application_role=can_os_canonical_ops_app`. This creates a **NOLOGIN**
   purpose role, grants only documented catalog reads and inserts one
   current approved Organization-purpose binding. Do not feed the script to
   the Neon SQL API: it contains psql `\\if`, `\\gset`, and `\\gexec`.
4. Run `database/canonical/v3.0.1/provision-blueprint-roles.sql`
   through psql for the same independently approved Organization and
   `application_role=can_os_canonical_ops_app`. This creates two purpose
   roles, `blueprint_author` and `blueprint_reviewer`, with separate
   grants, exact purpose bindings, public evidence-label-only reviewer reads,
   and narrowly scoped public journal function access.
5. Set `CAN_CANONICAL_OPERATIONS_DATABASE_URL` only in the V6.1 preview
   environment. Keep the same Neon project, **branch, database and endpoint**
   as the preview's `DATABASE_URL`, but use the isolated operator LOGIN.
   Protect the credential as a server-only secret; redeploy preview to apply
   the binding. Never update production variables from this runbook.
6. Under actual restricted connections, run the existing canonical
   authorization, author/reviewer independence, cross-Organization denial,
   no-bypass, RLS and role revocation tests. Verify reviewer can read only
   current evidence *labels*, not storage references. Verify successful
   authorized Blueprint save/review records one public audit and one public
   outbox event each, and cannot self-approve. Confirm Program Catalog
   availability uses a verified jurisdiction classification.
7. Run both read-only checks:
   `database/canonical/v3.0.1/check-launch-prepare-readiness.sql`
   and `scripts/sql/report-v61-blueprint-public-journal-readiness.sql`.

## QA-only restricted roles provisioned (2026-11-20)

On isolated V6.1 Neon branch `br-bitter-pine-ar7mjn70`, an exact
branch- and Organization-guarded transaction configured:

- One isolated LOGIN `can_os_canonical_ops_app` with `NOINHERIT`,
  `NOBYPASSRLS`, no database or role creation powers and **NULL password**.
- Three Valor-scoped NOLOGIN, NOINHERIT, NOBYPASSRLS purpose roles for
  `program_catalog`, `blueprint_author`, and `blueprint_reviewer`.
  Membership on the operations login has `SET TRUE`, `INHERIT FALSE`,
  `ADMIN FALSE`. No role owns application tables.
- Three time-limited `approved` **QA fixtures** in
  `public.database_role_organization_bindings`, expiring
  **2026-11-27 11:07:31 UTC**. These do not grant a person, account or Site
  operational authority; no `site_organization_roles` records were created.
  The existing shared public audit journal records the QA fixture setup.

Post-provision checks: role scopes recognized Valor and rejected Barton
under real PostgreSQL `SET LOCAL ROLE`, with the temporary owner
testing membership rolled back to its pre-test state. The Blueprint
reviewer has no Blueprint-author INSERT privilege; the author has no
review INSERT privilege. Neither can read account tables, access raw
storage references, or insert directly into audit/outbox journals.
`scripts/sql/report-v61-blueprint-public-journal-readiness.sql` now
checks the complete active role triplet, isolated membership and role
separation: **12/12 ready**. The broader Launch Prepare readiness
check is **8/9 ready**, blocked only on an independently classified Site.

**Important:** These test-scoped database-purpose approvals are not real
institutional approvals. They are short-lived and cannot authenticate
without separately enabling the operations login. No user/account,
reviewer appointment, credential, Cloudflare secret or Netlify deployment
was created or changed. Fully authenticated browser tests still need
a separate verified actor and preview-only credential configuration.

For early revocation, the designated validation-branch DBA may change
these three rows to `status='revoked'` and set `valid_through=now()`
inside a reviewed transaction, then revoke purpose-role membership from
`can_os_canonical_ops_app`. Never run this cleanup against main or
a production Organization.

## Known blockers, not repaired by creating SQL roles

- Validation now has three **temporary QA-only** Organization-purpose
  bindings, scoped to existing synthetic Valor School (`f1000000-0000-4000-8000-000000000002`),
  valid through **2026-11-27 11:07:31 UTC**. There are still **no**
  `public.site_organization_roles` rows and no appointed independent native
  staff. The `can_os_canonical_ops_app` login has a NULL password, so it
  cannot currently connect. These fixtures must not be promoted to production.
- The Sites have no verified `geographic_area_id`; Course availability must
  fail closed for those Sites.
- The old `education_v30` schema still has 7 tables, 6 views, 244
  functions and 13 public FK references; 371 public triggers call legacy
  functions. The secure schema also has 7 tables. The remaining schema
  retirement requires separate verified contracts, not renaming
  `education_v30.enrollments` to the different `public.enrollments`.
- The new journal path has been schema/permission checked but has **not**
  passed a live authenticated end-to-end restricted-role browser test.
  A Netlify build limit has previously prevented preview CI confirmation.

**Safety:** Do not drop any legacy relation, policy, trigger or function while
it has a dependent caller or constraint. Do not copy the older main schema
onto V6.1. No production migration is implied by this test-branch work.
