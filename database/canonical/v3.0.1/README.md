# CAN OS canonical database v3.0.1

**Integration decision: net-new only.** Organizations, Sites, Persons,
identity/session principals, role grants and demo data must be created directly
in the canonical model. No legacy identity mapping tables, cross-schema record
bridges, historical-data migration or reliance on existing demo account/Site
identifiers. Until native canonical sign-in, session, permissions and Site
selection are implemented and verified, keep the canonical Studio write flag
disabled. Existing app session code does not establish canonical identity.

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
`/operations/blueprint-reviews` for reviewers. The existing School Hub does
not mount canonical widgets because its identifiers come from a separate
application model. No mappings or compatibility tables are required.

**Keep `CAN_CANONICAL_BLUEPRINT_WRITE_ENABLED=false` in deployment.**
Native authentication and the isolated seed do not by themselves provision
Blueprint read/write RLS or establish the production sign-in/verification
workflow. These remain required before enabling the routes for real users.

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

The School Launch Academics module can expose a read-only curated
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
the read-only discovery function is exposed from the existing School
Academics workflow. It requires the restricted application login and
Organization binding to be provisioned in the target environment. The
deployed credential and end-to-end route access remain unverified; this UI
does not create or qualify programs, approve them, or authorize operation.

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

The School Launch Academics module can mount `CanonicalBlueprintWorkspace`
behind `CAN_CANONICAL_BLUEPRINT_WRITE_ENABLED=true` (off by default). Its
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
