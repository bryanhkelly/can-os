# CAN OS canonical database v3.0.1

**Canonical baseline decision: net-new only.** Organizations, Sites, Persons,
identity/session principals, role grants and demo data are created directly
in the canonical model. No legacy ID inference, wholesale historical-data
migration or reliance on existing demo account/Site identifiers. Native
canonical sign-in, session scope, PostgreSQL permissions and Site selection
remain enforced independently for Blueprint actions.

**Narrow additive exception for adult self-enrollment:** The separately reviewed
`patch-noncredit-self-enrollment.sql` introduces a verified, one-to-one
`public.access_account_noncredit_principals` link between an existing
verified My CAN account/Person and a *newly created* canonical learner
account/Person. It never auto-merges by email, provides no Blueprint/admin
access, requires current server-side identity checks and adult consent, and
does not migrate school/guardian/child records. This exception must not be
generalized to other canonical entities.

### Adult noncredit self-enrollment (additive migration)
  
The enrollment page, provider publisher and native learner-session flow depend
on `patch-noncredit-self-enrollment.sql`. This migration was installed on
`test01`; it is **not** part of `schema.sql` and must not be assumed present
on production. It creates no course or registration data.

The patch enables and **forces** row-level security on release, consent and
bridge tables; the trusted schema owner gets the explicit access policy, while
the restricted native auth reader is denied direct SELECT. The claim trigger
binds the release's Course, provider, exact Site, current consent digest and
participant to the canonical registration. Schema owner permissions cannot be
silently reused as the public authentication reader.

With an *isolated* acceptance database:

```sh
psql "$TEST_DATABASE_URL" -v ON_ERROR_STOP=1 \
  -f database/canonical/v3.0.1/patch-noncredit-self-enrollment.sql
APP_ENV=test npm run db:canonical:noncredit-self-enrollment
npm run test:enrollment:unit
npm run typecheck
npm run build
```

**Important:** The patch is additive for a branch that does not yet have
these tables, but includes named triggers and a composite FK, so do not
rerun it blindly. Review its current schema state before applying. A user
cannot enroll until the program is **active**, the course and training are
published, the Offering adoption is currently approved, a completion policy
is published/effective, the operator and any facilitated Site are authorized,
and a provider publishes an enrollment release. A draft or merely authorized
deployment must not be shown as ready for enrollment.

The live Netlify deploy and production DB remain separate release gates.
See `docs/product/NONCREDIT-SELF-ENROLLMENT.md`.

### Repairing the disposable `test01` branch

The `can-os` Neon branch `test01` was provisioned before the final native
authentication tables and Blueprint role-purpose values were added to the
v3.0.1 baseline. Its three missing auth tables and session projection were
installed from `schema.sql`, and the committed native demo fixtures and
starter recipes were seeded. Do not reinstall the complete fresh-install
schema over this partially populated branch.

Before provisioning the restricted Blueprint author/reviewer roles, the
old role-binding CHECK must accept `blueprint_author` and
`blueprint_reviewer`. The exact, guarded, transactional repair is in
`repair-test01-blueprint-purpose-codes.sql`. It modifies a database
constraint and requires explicit authorization before execution. A fresh
v3.0.1 install already has the correct constraint.

### Canonical Blueprint authoring, review, and execution roles

A trusted administrator must provision **two independently scoped PostgreSQL
roles per canonical Organization** before using the new Studio. The application
login must be a restricted `NOINHERIT` login, never the schema owner:

```sh
psql "$TEST_DATABASE_URL" \
  -v organization_id=11110000-0000-4000-8000-000000000001 \
  -v application_role=YOUR_RESTRICTED_LOGIN \
  -f database/canonical/v3.0.1/provision-blueprint-roles.sql
```

Repeat with the Barton demo Organization ID
`11110000-0000-4000-8000-000000000002`. The roles are bound to
`blueprint_author` and `blueprint_reviewer` purposes, and application
services explicitly enter the permitted role for each transaction.
Authors can create and freeze draft versions; reviewers can assess a
different person's frozen version using current verified Organization evidence.
Execution requires an approved review and an approved operator relationship
with a canonical Operation. Any resulting Deployment is **planning only**.

The isolated native demo-seeding command automatically applies
`seed-blueprint-execution-demo.sql` in the same transaction. It provides
school/learning-center Operations, their explicit Site relationships, active
operators, verified Organization-owned review evidence, and one published,
non-credentialed Digital Skills demo Offering. No external credential or
permission to operate is fabricated.

The acceptance runner uses a *different restricted application login*
pointing at that same disposable database. It always rolls its drafts,
approvals, execution batches and planning-only Deployment back.

```sh
# Prepare an isolated database with schema.sql, then seed the new entities:
APP_ENV=test CAN_TEST_DB_WRITES_ENABLED=true \
  npm run db:seed:canonical:v301:demo

# Publish the two starter recipes as a trusted schema administrator:
psql "$TEST_DATABASE_URL" \
  -v publisher_organization_id=11110000-0000-4000-8000-000000000003 \
  -f database/canonical/v3.0.1/seed-blueprint-starters.sql

# Provision the Valor author/reviewer roles for a *restricted* test login:
psql "$TEST_DATABASE_URL" \
  -v organization_id=11110000-0000-4000-8000-000000000001 \
  -v application_role=YOUR_RESTRICTED_TEST_LOGIN \
  -f database/canonical/v3.0.1/provision-blueprint-roles.sql

# CAN_CANONICAL_TEST_APP_DATABASE_URL points to the same TEST_DATABASE_URL
# database, but authenticates as YOUR_RESTRICTED_TEST_LOGIN.
APP_ENV=test CAN_TEST_DB_WRITES_ENABLED=true \
  npm run db:test:canonical:v301:blueprint-flow
```

This acceptance checks the mainline flow with the actual restricted database
roles: create a draft, select a published Offering, freeze it, record an
independent evidence-backed approval, execute the approved recipe, and assert
the result remains a *planning* Deployment with a *proposed* Offering adoption.
It also checks that Valor roles cannot see Barton Sites or evidence and that
authors cannot self-approve. This is an executable test path, **not** a claim
that tests have passed.

The optional reference library and published Offering discovery use the
separate, restricted `program_catalog` purpose and its
`provision-program-catalog-role.sql` workflow. The native Blueprint author
role does **not** implicitly become a program-catalog reader. Provision that
read-only role and its current Organization binding before enabling
`CAN_CANONICAL_CATALOG_ENABLED`. The default is off. The isolated
draft → review → planning Deployment acceptance test does not require
catalog discovery or claim to validate real-world program eligibility.

Never grant either role access to raw canonical sessions, learner records,
safeguarding data, finance data or direct publication. SQL policies, grants
and server transactions must be exercised in a disposable test database
before any rollout flag is enabled. GitHub Actions runner failures are not
evidence of passing tests.

### Native v3.0.1 authentication and demo setup

The new canonical model includes `canonical_accounts`,
`canonical_account_grants`, and `canonical_sessions`. A new v3 session
identifies one Person, Organization and optional Site directly in
`education_v30`. The session projection checks that the account is verified,
the grant is current and the Site has a current operator relationship. A
Blueprint reviewer is Organization-scoped and cannot author or execute.

After installing `schema.sql`, a database administrator can provision the
least-privilege session projection role for the real application login:

```sh
psql "$TEST_DATABASE_URL" -v application_role=YOUR_RESTRICTED_LOGIN \
  -f database/canonical/v3.0.1/provision-canonical-auth-reader.sql
```

The restricted role can only execute
`v301_canonical_session_context(text)`. It cannot directly query the raw
accounts, grants or session hashes. The application selects this role within
the session read transaction. The new session cookie is
`__Host-can_os_v3_session` and requires a separate
`CAN_CANONICAL_ACCESS_TOKEN_PEPPER`.

The isolated v3 demo is independent of the current application's records. It
creates Valor School and Barton Community Learning Center with separate
operators, administrators and independent reviewers, plus a separate CAN
publisher Organization. No network is mandatory. For a disposable database
already initialized with `schema.sql`:

```sh
APP_ENV=test CAN_TEST_DB_WRITES_ENABLED=true \
  npm run db:seed:canonical:v301:demo

# With the test session pepper configured:
APP_ENV=test CAN_TEST_DB_WRITES_ENABLED=true \
  npm run db:seed:canonical:v301:demo -- \
  --issue-session=valor.admin@can.example
```

The guarded script requires an isolated `TEST_DATABASE_URL`, separate from
the deployed `DATABASE_URL`. It prints a one-time browser cookie **only** when
explicitly asked to issue a test session. Apply the starter recipes separately
with `seed-blueprint-starters.sql`, using publisher Organization
`11110000-0000-4000-8000-000000000003`.

Use `/canonical/blueprints` for the native v3 planning experience and
`/canonical/blueprint-reviews` for reviewers. The existing School Hub does
not mount canonical widgets because its identifiers come from a separate
application model. No mappings or compatibility tables are required.

The Blueprint endpoints have no global write feature switch. They require
native authenticated sessions, restricted database roles and authorized
Blueprint lifecycle transitions. Provision the canonical database and its
roles before exposing the routes to real users. Acceptance testing remains
required before release.

`schema.sql` is a fresh-build target for PostgreSQL 16 or newer. It owns the
`education_v30` and `education_v30_secure` schemas; it is not an additive
Drizzle migration and must not be run with `npm run db:migrate`.
This integration copy is based on the supplied v3.0.1 candidate (base
SHA-256 `2A024B13A7CBA27BA8B7BA262F7C339B17A7BD168D0F79007DB014CCB6AA51C2`)
and includes PR #279 Blueprint identity/reference-catalog additions and the
initial PR #280 instructional-policy port; it is not byte-identical to that
supplied baseline.

The rollback-only validator executes the complete DDL in a transaction,
checks the 74 versioned Blueprint reference entries and 25 self-declared
affiliation options, then rolls everything back. It requires an isolated
`TEST_DATABASE_URL`, `APP_ENV=test`, and `CAN_TEST_DB_WRITES_ENABLED=true`.
It refuses to run if either canonical schema already exists.

PR #279's configuration persistence uses immutable version rows, selected
reference versions, explicit local-experience proposals, and published
Offering adoption intents. Configuration creation, revision saves, and
submission append canonical audit and domain events in the same transaction.
The new tables inherit deny-by-default, forced RLS; production application and
outbox-worker policies are still required before these commands can be exposed.

PR #280's schema port adds adoption-scoped versioned instructional policies,
selection/practice provenance, publication-manifest gating, evidence-bound
rights, withdrawal semantics, and command receipts. Canonical track commands
cover draft creation, versioned saves, immutable submission, independent
review, publication, withdrawal, learner choices, selected-track reads, and
formative practice/history, with transactional audit and domain events.
Provider access requires a current verified grant plus an evidence-backed
course-scoped professional assignment. Server-function wrappers are present
but are not imported by routes. Asset download signing rechecks current learner
or guardian participation, selected-track policy, publication and review
decisions, rights evidence, distribution authorization, and withdrawals on
every request. It signs only the immutable
`learning/instructional-track/<asset-version-uuid>` object key for 30 seconds.
These relations are forced-RLS. Apart from the schema-owner policy installed
for forced-RLS tables, the only instructional policy in this DDL is the
organization-and-purpose-scoped noncredit registration read policy. No route
exposes the commands until the remaining access policies and
authorization/database acceptance tests are reviewed and pass.

The recorded rollback validator passed on isolated PostgreSQL 18 before the
public-interest contact and Site-publication binding additions. The complete
current `schema.sql` was subsequently installed on an isolated Neon test branch
with the test-write gate enabled. Post-install checks confirmed the public
claims function is executable by the reader role and that the role cannot
directly read its source table. Neon provides a `neondb_owner` membership in
the reader role with `INHERIT` and `SET` disabled; this is not an application
role binding. A restricted application login is provisioned for this isolated
test branch, and a local canonical-route request for an unpublished slug
returned the expected 404. The deployed credential remains untested; the
public route remains disabled by default.

`SCHEMA-OWNERSHIP.md` describes canonical entity ownership and lifecycle
boundaries. `src/db/canonical-v301/` contains typed mappings for Blueprint,
catalog/program-fit, learning, and public-planning entities. They are
intentionally excluded from the default Drizzle schema and migration journal;
the SQL baseline remains authoritative for constraints. Canonical application
data remains separate from the legacy `public` schema.

The native canonical Blueprint Studio can expose a read-only curated
Blueprint reference library once `CAN_CANONICAL_CATALOG_ENABLED=true`.
The flag defaults to false until a real canonical Site catalog and restricted
application database-role provisioning are available; the existing legacy
Launch Hub must not show a broken canonical workflow. This path uses the same Organization-bound
`program_catalog` role, restricted column grants, and forced RLS to return
only active/published reference titles, summaries, and categories. The
`BlueprintReferenceCatalogPanel` does not create Site Blueprint revisions,
Offerings, Deployments or authorization. The disposable PostgreSQL acceptance
checks 74 visible curated entries and denies draft versions, private metadata,
and writes. Launch Studio's legacy editable PR #281 Blueprint workspace is
not ported here because it depends on incompatible `public` tables and
migrations; canonical authoring is held behind the existing write-policy
acceptance gate.

PR #281's initial program-discovery service calls the canonical catalog
availability function and returns published Offerings with policy-specific
availability. Results are advisory only: discovery does not establish
qualification, approval, or activation eligibility. The DDL now forces RLS on
its catalog reads and requires an active
`program_catalog` Organization binding on the PostgreSQL role; the availability
function also rejects unbound roles. `provision-program-catalog-role.sql`
installs the discovery role's read/function grants and binding for one
Organization, plus a non-inheriting, `SET`-only membership for the restricted
application login. A trusted operator must first provision both non-owner,
non-superuser login roles and manage their credentials through the deployment
secret manager. The discovery service now derives the catalog role from the
verified single-Organization server context and sets it transaction-locally;
the legacy School Academics workflow exposes the read-only discovery panel
only when `CAN_CANONICAL_CATALOG_ENABLED=true`. With the flag disabled (the
default), the Hub shows an explicit unavailable state and the service refuses
catalog requests before switching database roles. Enabling the flag alone
does not provision database roles or establish native canonical identity.
The restricted application login, Organization binding, and exact Site
identity must be verified in the target environment first. Deployed
credentials and end-to-end route access remain unverified; this UI does
not create or qualify programs, approve them, or authorize operation.

On 2026-11-13, the guarded rollback validator passed on isolated PostgreSQL 18
at integration worktree HEAD `5263e7a4` plus uncommitted changes. It creates a
temporary least-privilege Organization role and non-inheriting application
login inside the rollback transaction, applies the provisioning script's
grants, and verifies the app-to-Organization `SET ROLE` chain, authorized Site
access, cross-Organization denial, denied ungranted columns and writes,
catalog-function access, binding expiry and revocation, and rollback of both
schemas and temporary roles. The check was invoked with
`node --env-file="<ignored local env file>" scripts/check-canonical-v301-ddl.mjs`,
using the guarded disposable `TEST_DATABASE_URL` and write gate with
`APP_ENV=test`.

The historical rollback-only probe above used transaction-local role
simulation. The separate `.github/workflows/canonical-v301-database.yml`
integration acceptance now installs the committed schema into disposable
PostgreSQL 18, runs both psql role-provisioning files, and connects using a
restricted application login to verify permitted Organization access, denied
cross-Organization access, draft-site isolation, and scoped program-fit
availability. This workflow still requires a green run at the exact branch
commit. Production credentials, live Neon role lifecycle, write-capable
application policies, and end-to-end command execution remain unverified.
The server derives the catalog role from a verified single-Organization
session context and uses transaction-local `SET LOCAL ROLE`.

The read-only `evaluateProgramFit` adapter delegates selected-policy status,
qualification requirements, reviewed fit, and stage preflight to
`v301_policy_evaluation`; it does not recreate those rules in TypeScript.
It is also not route-wired. The database function is revoked from `PUBLIC`,
and its assessment path relies on current database-role organization bindings.
Do not grant execution or expose the adapter until those bindings are tied to
the verified application session and tested for scope, expiry, and revocation.
An `activationEligible` result is a preflight only; the mutation being
authorized must independently recheck current operational authority.

The public Operation projection reads only
`v301_current_public_program_claims`, whose canonical view excludes superseded
or withdrawn snapshots and claims without current matching authorization.
It preserves each claim's proposed/approved/enrolling/operating state and
omits internal authorization identifiers. The view is
`security_invoker=true` and requires explicit reader grants and RLS policies;
the public adapter is not route-wired until anonymous/public access is
provisioned and tested without exposing the underlying tables.

The canonical prospect model keeps anonymous public-site contact fields in
`education_v30_secure.enrollment_prospect_contact_details`, separate from
organization-scoped prospect and interest rows. The record supports the
existing bounded name/email/message payload, explicit contact consent,
request idempotency, and a pepper-keyed email digest; it does not create a
Person, Household, Application, or enrollment. Forced RLS is enabled and no
application role is granted access. The existing public inquiry route remains
on its current storage path until the existing site-publisher command is
wired to the canonical binding, writer authorization is tested, and isolated
database acceptance tests pass.
`site_publication_bindings` binds unique public slugs directly to canonical
Sites. Its forced-RLS state is deny-by-default. The existing
site-publisher command and public route have not yet been migrated to use this
binding, and no public-claim capture is exposed through it yet.
The `v301_public_site_claims` security-definer function returns only a
published Site name and current claims for its active Operation links.
`provision-public-site-reader-role.sql` grants that function—not its source
tables—to the restricted public reader role. The existing public-site route
uses the canonical projection only when `CAN_PUBLIC_SITE_CANONICAL_ENABLED=true`;
the default remains off. Enable it only after deploying this schema, running
the role provisioning script, and validating the target database.

Blueprint execution uses the canonical execution-batch and output records.
It requires the separate `blueprint.execute` capability, current operator
relationship to the target Operation, a frozen configuration, the latest
independent approved review, and current approvals for every selected
component. Selected published Offerings produce planning-only Deployments
with proposed adoption records; Blueprint approval does not grant enrollment,
delivery, or operating authority. The service is not route-wired pending
application-role RLS policies and database-backed replay, revocation, and
authorization tests.

Program-fit review creation uses the canonical reviewer authorization,
revocation, and append-only review records. It verifies current policy-owner
scope, reviewer validity, expiry, revocation, and applicant-contact
independence; review outcomes remain constrained by the database's current
requirement recommendation and override rules. The command is server-only and
not route-wired pending application-role RLS policies and database-backed
expiry, revocation, supersession, and override tests.

## Canonical Blueprint Studio integration

The dedicated canonical Blueprint author route mounts `CanonicalBlueprintWorkspace`
using native canonical authentication and explicit Site selection. Its
Organization-owned configuration is tied to a chosen canonical Site in the
version's `config.siteId` planning context. A verified Site operator may
create a draft from a published recipe, select required or optional components,
choose approved catalog references, propose local experiences, save immutable
revisions, and freeze the current revision for independent review. Approval
and execution remain distinct from permission to operate a school or program.

The editor's program-model components can now carry published Offering
adoption intents selected from the Site's canonical availability service.
Only `supported` and `conditional` results are selectable for private
planning; unavailable or research-required Offerings are not selectable. An
intent is not a Deployment or operating approval. The reviewer queue shows the
Site, selected curated references, Offering intents, and locally proposed
experiences. Its evidence picker returns only current, verified documents
owned by the reviewing Organization; the decision service rechecks that scope
before recording approval.

The canonical review service requires the `blueprint.review` capability, an
Organization-scoped independent reviewer, and evidence for approved decisions.
Selected components are approved explicitly in the same transaction as the
configuration review; decisions, audit events and domain events are recorded
atomically. The execution service requires that current independent approval
and emits only planning-level Deployments. The generic reviewer grant
(`blueprint_reviewer`) is separate from Site administrator authoring and
execution capabilities; this grant must be provisioned through verified
identity infrastructure, not inferred from Site membership.

`seed-blueprint-starters.sql` is an optional, idempotent catalog bootstrap for
an existing canonical publisher Organization. It creates two published recipes:
a school and a community learning center. Run only on a controlled database
with `psql -v publisher_organization_id=<existing-uuid> -f
database/canonical/v3.0.1/seed-blueprint-starters.sql`. Publishing a recipe
does not create an Operation, an Offering, or operating authority.

**Do not enable canonical Blueprint writes yet.** The current canonical
forced-RLS schema denies application-role writes until scoped role provisioning,
read/write policies, exact-commit PostgreSQL acceptance, canonical Site identity
cutover, reviewer grants and an evidence-picker workflow are completed. The
legacy PR #281 School Blueprint service uses different tables and cannot be
enabled alongside the canonical writer as an alternative authority.

### Learning-award schema (November 14, 2026)

The fresh-build `schema.sql` includes the additive six-table learning-award domain
and its issuer approval, immutable evidence, currentness and forced-RLS controls.
An existing v3.0.1 database must apply **only** `patch-achievement-credentials.sql`
as an additive transaction; do not rerun the full fresh-install schema.
`test01` Neon passed the isolated additive DDL/trigger/RLS verification.
The credential issuer and learner-reader runtime paths remain disabled pending
scoped database-role provisioning and multi-user acceptance tests. Do not interpret
the mere existence of these tables as authorization to issue a badge or certificate.

**Neon migration record (November 14, 2026):** Existing `can-os` / `neondb`
branches `test01` and `main` have the six additive learning-award tables installed.
On `main`, all six tables passed the read-only verification for installation,
forced RLS, owner-only policy, trigger coverage and absence of PUBLIC table grants.
Do **not** rerun the one-time patch on those branches. The published schema and
runtime database are aligned for these tables, but credential feature flags
remain disabled until restricted DB grants and role-based acceptance tests pass.
See `verify-achievement-credentials.sql` for the reusable, read-only checks.

### Optional survey draft writer (not installed by default)

The temporary Capability Lab survey draft page is guarded by
`CAN_CANONICAL_SURVEY_DRAFT_ENABLED` (default off). On an isolated test database,
a trusted schema owner first runs:

```sh
psql "$TEST_DATABASE_URL" -f database/canonical/v3.0.1/patch-survey-draft-authoring.sql
psql "$TEST_DATABASE_URL" -v organization_id=YOUR_NATIVE_ORGANIZATION_UUID \
  -v application_role=YOUR_RESTRICTED_APP_LOGIN \
  -f database/canonical/v3.0.1/provision-survey-draft-author-role.sql
```

The writer role is isolated per Organization and has only SELECT/INSERT on draft
survey definitions, versions, questions and options, plus restricted audit/event
inserts. PostgreSQL RLS blocks cross-organization and published-content writes.
Existing independent survey publication review and campaign permission gates
remain unchanged. Do not enable for production until restricted-role SQL and
browser acceptance pass. This patch is not automatically applied or migrated.

Before enabling the feature flag, run the nonmutating role check:

```sh
psql "$TEST_DATABASE_URL" -v organization_id=YOUR_NATIVE_ORGANIZATION_UUID \
  -f database/canonical/v3.0.1/verify-survey-draft-author-role.sql
```

This verifies role restrictions, RLS policy presence, draft INSERT grants and
absence of publication, invitation, review and respondent-data privileges.
It does not replace a transaction-based cross-tenant database test.

### Optional independent survey reviews and publication

After the draft-authoring patch, the trusted schema administrator can apply
`patch-survey-review-publication.sql` in an **isolated test database**, then
provision the narrow `survey_reviewer` and `survey_publisher` roles per Organization
using `provision-survey-review-publication-roles.sql`. This explicitly extends
native canonical account grants to an **organization-only survey reviewer**;
the existing Site-scoped provider may publish only after independent privacy,
accessibility and safeguarding approvals. Existing published-version immutable
triggers and draft-child gates remain in force. No database patch is automatically
installed by application deployment.

```sh
psql "$TEST_DATABASE_URL" -f database/canonical/v3.0.1/patch-survey-review-publication.sql
psql "$TEST_DATABASE_URL" -v organization_id=YOUR_NATIVE_ORGANIZATION_UUID \
  -v application_role=YOUR_RESTRICTED_APP_LOGIN \
  -f database/canonical/v3.0.1/provision-survey-review-publication-roles.sql
```

Do not enable `CAN_CANONICAL_SURVEY_REVIEW_ENABLED` or
`CAN_CANONICAL_SURVEY_PUBLICATION_ENABLED` until role and RLS tests,
cross-tenant denials, and authenticated browser tests pass. Neither role can
create survey campaigns or invite respondents.

Run the nonmutating verification before switching on either feature flag:

```sh
psql "$TEST_DATABASE_URL" -v organization_id=YOUR_NATIVE_ORGANIZATION_UUID \
  -f database/canonical/v3.0.1/verify-survey-review-publication-roles.sql
```

The verifier checks role isolation, scope bindings, review/publication triggers,
current-evidence metadata privileges and absence of campaign, invitation and
respondent-data access. It is not proof of successful DB integration or browser
testing; those remain required for release.

### Private credential reader installation

`patch-credential-learner-reader.sql` was applied to existing Neon `test01`
and `main` databases after the credential-award hardening patch. The
fresh-build `schema.sql` includes the same two session-bound wallet
projections, private EXECUTE ACLs, and `pg_temp`-safe SECURITY DEFINER paths.
No production application login has yet been granted the reader role.

After confirming an actual restricted app login (never `neondb_owner` or
any schema owner), provision only that login:

```sh
psql "$TEST_DATABASE_URL" -v application_role=YOUR_RESTRICTED_TEST_LOGIN \
  -f database/canonical/v3.0.1/provision-credential-learner-reader.sql

psql "$RESTRICTED_TEST_APP_DATABASE_URL" \
  -f database/canonical/v3.0.1/test-credential-learner-reader.sql
```

The negative-permission smoke test was run against `test01` with a restricted
application login and passed. Positive two-learner/two-issuer integration
fixtures, production role provisioning and the credential-reader feature flag
remain deliberately pending. No issuer-management UI is included.

### Canonical activity, noncredit migration and integrity record (November 14, 2026)

Applied the additive noncredit patches in order on Neon `test01`, then
atomically on Neon `main`: objective result finalization, noncredit assessment
access provisioning, baseline diagnostic support, lesson milestones, verified
completion evidence, immutable enrollment-time policy, and opt-in automatic
completion. The production database had zero noncredit trainings, registrations,
course attempts, and completion decisions at deployment; the migration wrote no
completion decisions. Approval remains explicitly `provider_review` by default.

The five learning session/facilitated delivery tables additionally received
`patch-learning-session-integrity.sql` on both databases. It introduces 10
constraints and six identity/append-only triggers. Unknown participant attempts,
room pairings and room media were rejected during negative database tests.

Read-only checks after selecting the appropriate database connection:

```sh
CAN_NONCREDIT_SCHEMA_VALIDATION=1 npm run db:canonical:noncredit-schema
CAN_ACTIVITY_SCHEMA_VALIDATION=1 npm run db:canonical:activity-schema
```

These tests establish schema presence, not full authorization or activation.
GitHub Actions runs still report `startup_failure` with no executed jobs.
Credential issuance, learner-wallet reading, canonical activity and facilitated
learning runtime flags remain disabled. Do not treat a database migration as a
production application release.

### Security hardening: noncredit privileged functions (November 14, 2026)

After the verified noncredit migration, `patch-noncredit-definer-hardening.sql`
was applied to both Neon `test01` and `main`. Six SECURITY DEFINER
functions now resolve the canonical schema before `pg_catalog` and
`pg_temp`, protecting against untrusted temporary relation shadowing.
No PUBLIC execution privileges were granted; both databases passed the
read-only function ACL and execution-search-path check. The additive source
patches and fresh-install `schema.sql` contain the corresponding security
configuration. The noncredit release checker now enforces these properties.


## Site-first Launch Studio: public ↔ canonical Site identity bridge

Apply `patch-site-identity-links.sql` **after** the public-schema Site and v3.0.1 canonical Site tables exist. This additive, evidence-based mapping is not a migration that copies, equates or renames Site IDs. It was applied to `test01` on 2026-11-14; there are no approved correspondences there.

A privileged operator must first verify that the exact legacy public Site and canonical v3.0.1 Site represent the same authorized physical service location, then record an evidence reference, a requesting Person ID, and an independent reviewer Person ID with approval date. Codes, matching names, or membership in the same network do not constitute a verified link. Do not create an approved link in a seed or automated migration.

The public website adapter projects only currently eligible facilitated noncredit releases at a linked Site, and only after the Site's independent publication gate. Even a verified link cannot create a learner entitlement, Program adoption, noncredit release or enrollment claim. In the test01 environment, 1 published facilitated release and 1 published independent online release were found; neither has a verified public Site link.

**Role/permissions caution:** `can_v30_public_site_app` has no direct `public` or `education_v30` schema USAGE privileges on test01. The adapter detects restricted roles and omits cross-schema cards rather than widening privileges or failing the whole Site website. Confirm the actual runtime database role and its eligibility reader before enabling the projection in a deployed environment.

Also ensure `CAN_ACCESS_PUBLIC_ORIGIN` is the real HTTPS CAN application origin. No register link should be displayed without a current, valid release and working destination. Production migration, build, browser acceptance, hosting and reviewer-approved mapping are separate release gates.
