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

## Validation branch: ordered migrations 0086–0094 (2026-11-19 Pacific)

**Prepared branch:** `v61-launch-brand-migration-validation-20261119` (`br-bitter-pine-ar7mjn70`), forked from Neon production `main` (`br-restless-sea-ar9ooo55`) at parent timestamp `2026-11-20T05:35:13Z`.

**Source baseline:** Feature branch commit `8ae02f75508bb40e48c26d8f38295fffdd276b75` for migrations 0086–0093. An independently reviewed additive privacy migration `drizzle/0094_class_participant_delivery_privacy.sql` and journal entry `1795132000000` were subsequently added to the feature branch.

**Important journal correction:** The prior production journal actually stops at migration **0085** (journal ID 87, timestamp `1794990001000`), not 0086. This test therefore applied **0086, 0087, 0088, 0089, 0090, 0091, 0092, 0093, 0094** in that order. Previously manually added 0087/0088 schema objects were skipped idempotently by their source SQL; each migration then received its original journal timestamp and the SHA-256 of its exact source SQL. This matches the SHA-256 method and timestamp format used by the existing Drizzle journal, which were independently verified against applied migration 0085. The validation journal now has 96 rows, through 0094.

### Verified outcomes on the validation branch

- Brand versioning and historical backfill: **3** immutable Site Brand versions from **6** existing content revisions. Both previously published Sites remain published, carry valid pinned Brand/content revisions and retain attributed authors. One Site correctly has a different current Brand from its older published Brand.
- Immutable Package Release tables, append-only Brand and artifact guards, cross-Site FK constraints and product checks exist.
- A transaction-local synthetic Marketing Package → Package Release → Artifact Release round trip succeeded, including the exact Release reference; immutability and cross-Site FK negative cases behaved as expected. Its savepoint was rolled back, leaving **zero** fixture rows.
- A direct UPDATE of an existing Brand version was denied by the immutability trigger (SQLSTATE P0001).
- Untrusted `authenticated` role sees **zero** Brand/Package release rows under enabled RLS.
- A distinct issue was discovered in migration 0093: the Class participant-delivery receipts table inherited direct `authenticated` read/write grants with RLS disabled. New migration **0094** enables deny-by-default RLS and revokes those direct privileges from `PUBLIC`, `anonymous` and `authenticated`. After applying 0094, a direct restricted-client SELECT returned permission denied (SQLSTATE 42501). The server-owned table is still available through the trusted owner path, not a new client API.
- Production-row preservation: Site count **9**, existing content revisions **6**, published Sites **2**; no synthetic test rows persisted. Notification receipt columns and Class participant transport table were installed on the validation branch.
- All SQL migrations and the additive privacy hardening were actually **committed on the disposable validation branch**, not just rolled back as in the earlier production rehearsal.

### Production status and promotion gate

**Neon main remains unchanged** by validation: its journal still has 87 applied rows through 0085; `site_brand_versions`, `site_marketing_package_releases` and `class_participant_deliveries` do not exist there. Site Brand pointers have not been updated on production.

The Neon project remains at its branch capacity limit (validation now consumes the released slot); the sole existing snapshot is historical, not a current production rollback. Do not delete recovery branches or old snapshots as an automatic workaround. For the production promotion, secure a current rollback strategy first, then recheck live preconditions and apply the exact immutable reviewed migration sequence 0086–0094 using the standard database migrator. If code branch migrations advance again, review the new entries separately before running them. Use verified deployment and application-authorization acceptance afterward. This validation alone does **not** authorize a COGIC pilot Site, publish Course/Offering content, enable enrollment or establish cross-Organization reporting.

## Validation branch: migrations 0095–0096 independently verified (2026-11-20)

**Target:** Neon project `sweet-hall-62441909`, nondefault branch
`v61-launch-brand-migration-validation-20261119`
(`br-bitter-pine-ar7mjn70`). This is a read-only reconciliation of an
**already applied** migration state, not a new migration, schema write,
production deployment, or enrollment fixture.

- The branch's Drizzle journal has **98 applied rows**, from the existing
  baseline through **0096**, with the latest timestamp `1795134000000`.
  The exact Git feature-branch SQL SHA-256 checksums match the journal:
  - 0094: `a2e90445e3ead6de1935621b03db3dbba154c383b4741a6adf81335dbd860c45`
  - 0095: `fc8daa33f0aecc7a19d8e038da2e76f403ce9ef40f9fa119a1919e9429b7329d`
  - 0096: `a3b2e8fa480de567e5c12a3286ad5899cf52e7973f8d1085e2e0e48a4e77473c`
- The `public.learner_course_attempts` constraint
  `course_attempt_one_registration_with_optional_class_ck` permits one
  original source or an explicitly permitted noncredit Registration +
  native Class Enrollment pair. The migration's provenance guard function
  and its `BEFORE INSERT OR UPDATE` trigger are installed.
- The `public.class_participant_deliveries`
  `class_participant_delivery_kind_ck` constraint includes
  `enrollment_cancelled`. The table has RLS enabled and neither
  `authenticated` nor `anonymous` holds direct SELECT privileges;
  `authenticated` also lacks direct INSERT privileges.
- The branch has **zero** persisted native Class Enrollments, Course
  Attempts, and Class participant delivery receipts, so this check does
  **not** prove live self-enrollment, two-source Course Attempt insertion,
  delivery dispatch, cancellation or deduplication.
- The existing `learner_course_attempt_source_gate` trigger still calls
  `education_v30.validate_course_attempt_source()`. Its inspected
  function checks the active matching Class when `class_enrollment_id`
  is present, while the newly installed public provenance trigger verifies
  the combined Course/Class source. This legacy function dependency must be
  reconciled before dropping the legacy schema. Do not drop this trigger
  without a separately reviewed, positive/negative data-backed test.
- CAN purpose-specific Program Catalog/Blueprint SQL roles and approved
  Organization-purpose bindings remain absent. All nine Sites lack
  a verified `geographic_area_id`. These are independent readiness
  dependencies, not missing Drizzle migrations.
- **Neon main was rechecked and not modified**: journal remains at
  87 rows through 0085, with no `public.site_brand_versions`,
  `public.class_participant_deliveries`, or new Course/Class guard function.

**Outstanding validation before promotion:** Run authorized, disposable
positive/negative Course registration → single Class placement tests,
retries and last-seat concurrency; verify one Course Attempt, session
invitations/ICS, Course-owned withdrawal and calendar cancellation,
restricted-role cross-Site denials, and actual application build/tests
against the exact source SHA. Do not reapply journaled 0095/0096, create
a second Class/Attempt, or promote these migrations to main without
separate production authorization and a current rollback plan.

## 2026-11-20 · Complete feature-branch database inventory audit

Target: `v61-launch-brand-migration-validation-20261119`
(`br-bitter-pine-ar7mjn70`), **not** Neon main.
Compared the 730 changed paths in PR #348; 34 were Drizzle, SQL,
seed, database-schema or database-check files. The feature-branch
`drizzle/meta/_journal.json` contains entries through 0096.

### Numbered migrations: complete on validation branch

All **eleven** feature migration files 0086–0096 exist on validation
with the original journal timestamp and **SHA-256 of the complete exact
current GitHub source bytes**. All eleven checks passed. Journal holds
98 rows (latest ID 98, timestamp 1795134000000). No migration was
replayed or added; no schema changes were made by this audit.

Schema probes confirmed new Brand/release/delivery objects, installed
Course→Class provenance trigger and check constraint, cancellation
delivery kind, and denied direct authenticated/anonymous access to
Class participant receipts.

### Reference/demo data: present on validation

- Canonical geographic reference: one `US` parent and 56 subdivisions.
- COGIC pilot Program references: both intended codes with published v1
  and v2. COGIC published planning-only Solution blueprints: 2,
  containing respectively 5 and 7 components.
- Draft pilot knowledge checks: one version for each of two pilots.
  Both pilot feedback surveys have 5 questions.
- Existing Jordan demo YouTube resource library: 32 resource records,
  **743 section-local lesson/class overlay placements**; four AI/Digital
  Skills canonical pilot lessons have video candidate references.
- Canonical immutable Site Brand versions: 3, marketing package
  releases: 0 (new table structurally present and empty as expected);
  Class participant delivery receipts: 0.

This verifies expected records and schema state, **not the original
execution history of each non-Drizzle seed** or any educational
publication, partner approval, or real email delivery.

### Remaining configuration and legacy cutover: NOT complete

The checked-in `check-launch-prepare-readiness.sql` on validation
returned **6 ready and 3 blocked**: the restricted Program Catalog SQL
role, restricted Blueprint Author SQL role, and an independently verified
Site geographic-area classification. No purpose-bound restricted roles,
Organization bindings, or classified Sites are present. The applicable
DBA scripts require approved role identities, current Site-operator
permissions and non-owner application credentials; they are **not**
ordinary automated Drizzle migrations, and were not executed.

The legacy `education_v30` schema retains **7 base tables, 6 views**.
The public schema has **13 foreign keys targeting legacy tables**,
and **371 application-table triggers whose function is defined in
education_v30**. Do not drop the schema or its functions based solely
on empty row estimates: they actively enforce data and access rules.
The canonical Person/Account and legacy Enrollment source cutover must
be separately designed and tested. The existing Course Attempt source
trigger remains dependent on `education_v30.validate_course_attempt_source`.

Direct Neon branch schema diff was unavailable because Neon returned
HTTP 413 (schema too large). Therefore the assessment used individual
migration source hashes, catalog metadata, dependent objects, targeted
data counts and the repository's read-only readiness query. **It is
not a byte-for-byte entire schema diff.**

Neon main was not changed. All current numbered feature migrations are
present and matching on the validation branch. The broader restricted-role
and legacy-schema retirement projects still require approved independent
work and real application acceptance.

## 2026-11-20 · Applied Blueprint public journal cutover, migrations 0097–0098

**Actual target:** Neon V6.1 validation branch `br-bitter-pine-ar7mjn70`.
Two additive, reviewable migrations were applied atomically and journaled,
without modifying Neon main or deleting old schema objects.

- **0097**: `public.has_restricted_blueprint_purpose`,
  `public.append_restricted_blueprint_transition`, and an exact
  reviewer-author-history RLS read policy on the existing
  `public.audit_events`. SHA-256:
  `fe3a2107963af996ed43bfb7be34ae886c711ca2b402b7f702679610cfb47e65`.
- **0098**: explicitly `REVOKE` client `EXECUTE` grants that were
  supplied through default function privileges. SHA-256:
  `a10de2e6ba67bdcfb199c75f6efa5aa9b082b5e616e9b3967d5f125362d0f31c`.
- Post-apply journal: **100 rows**, through 0098. Both complete migration
  files match their journal hashes byte-for-byte. Direct
  `authenticated` and `anonymous` function execution is denied.
  An owner-session attempt to append an unbound purpose event returned
  SQLSTATE `42501`, without inserting an event.
- Preserved existing 842 public audit entries, 268 public domain events
  and the full preexisting learner data. No persisted Blueprint
  configurations were present to require legacy author-event backfill.
- Source now routes Blueprint configuration/review/execution journaling and
  independent-review authorship through the shared public infrastructure.
  The non-owner dedicated operations connection is validated by exact Neon
  endpoint and selected through the existing Drizzle `db` proxy, rather
  than substituting an owner or auth-reader login.
- Standalone readiness query:
  `scripts/sql/report-v61-blueprint-public-journal-readiness.sql`
  returned **7 ready / 3 blocked**. Blockers are the real per-Organization
  Program Catalog role, independently approved Blueprint author/reviewer
  roles, and purpose bindings. A separate Site geography prerequisite
  is also outstanding.
- No real restricted principal, Canonical reviewer, Organization Site
  operator appointment, or purpose binding was fabricated. An approved
  `can_os_canonical_ops_app` LOGIN and preview-only
  `CAN_CANONICAL_OPERATIONS_DATABASE_URL` must be independently
  provisioned, as detailed in
  `docs/runbooks/v61-canonical-blueprint-role-cutover.md`.

**Not yet accepted:** A true scoped author/reviewer DB transaction,
real browser flow, CI typecheck/build, or entire `education_v30`
retirement. The old schema's seven tables and 13 dependent public FKs,
244 legacy functions and 371 function-backed public triggers remain.
The unrelated `education_v30.enrollments` and `public.enrollments`
represent different models and must not be aliased or dropped.

## 2026-11-20 · V6.1 QA-only purpose roles and bindings

Three formerly missing delegated-purpose roles and their explicit
Organization-purpose bindings have now been provisioned **only** on Neon
branch `br-bitter-pine-ar7mjn70` for the existing synthetic
`Valor School` test Organization (`f1000000-0000-4000-8000-000000000002`):

- `can_v30_program_catalog_f1000000000040008000000000000002`
- `can_v30_blueprint_author_f1000000000040008000000000000002`
- `can_v30_blueprint_reviewer_f1000000000040008000000000000002`

All three purpose roles are `NOLOGIN NOINHERIT NOBYPASSRLS`. Their
`approved` **test fixtures** expire on **2026-11-27 11:07:31 UTC**.
They are granted to the isolated `can_os_canonical_ops_app` LOGIN only
with `SET TRUE, INHERIT FALSE, ADMIN FALSE`. That login has **NULL
password**, no direct table authority, and no direct audit gateway
execution; it cannot yet be used by a preview application.

A single public audit event records the setup. No synthetic staff
appointment or `site_organization_roles` rows were created.
No deployment secrets or auth clients were configured. These temporary
bindings are not real institutional approval and must never be promoted
to production as such.

Restricted-transaction checks with real PostgreSQL role switching
verified own-Organization purpose = true and foreign Organization
purpose = false for all applicable roles; author/reviewer journal-purpose
checks also deny foreign Organizations. Author INSERT, reviewer INSERT,
private evidence-label reading, and sensitive document storage rights
remain distinct. The operations LOGIN inherits no direct permissions
and cannot sign in without a separately configured password.

Strengthened source readiness query
`scripts/sql/report-v61-blueprint-public-journal-readiness.sql`
now checks exact three-purpose scope, enabled bindings, membership
semantics, and privilege separation: **12 of 12 ready**. Launch Prepare
readiness: **8 of 9 ready**, with Site geography classification
independently blocked. Neon main remains 87 journal rows, with zero
QA purpose roles and zero purpose bindings.

**Still needed for actual feature deployment:** provision a secure
operations password and preview-only secret; verify actual canonical
staff authority, independent reviewer and exact Site permissions; run
authenticated application acceptance. QA bindings expire after seven
days and must be revoked or independently renewed as appropriate.
