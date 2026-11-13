# CAN OS canonical database v3.0.1

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

The psql provisioning file itself was not executed, and the probe simulates
role assumption with `SET ROLE` rather than opening a separate application
login connection. Application role selection is now derived from the verified
single-Organization server context and applied with transaction-local
`SET LOCAL ROLE`; this server path has unit coverage but is not tested with the
deployed application credential. Secret provisioning and live Neon role
lifecycle remain unverified.

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
