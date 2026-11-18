# Canonical identity cutover decision (main)

**Decision:** One CAN login and one authoritative Person identity. There is no requirement to preserve native-v3 browser login, account-to-account bridges, or old identity endpoints during the cutover. This is an architecture decision, **not** evidence that the cutover is implemented or tested.

## Current verified main checkpoint: November 17, 2026

The ongoing, guarded One-Person FK convergence has now redirected **175 reviewed staff/actor attribution constraints** to `public.people`, across the following committed Neon-main migrations:

- `database/production/2026-11-17-rebind-30-actor-person-fks.sql`
- `database/production/2026-11-17-rebind-30-more-actor-person-fks.sql`
- `database/production/2026-11-17-rebind-actor-person-fks-batch-3.sql`
- `database/production/2026-11-17-rebind-final-18-actor-person-fks.sql`
- `database/production/2026-11-17-rebind-67-audit-facilitator-reviewer-person-fks.sql`

Each migration verified the exact main branch, current FK definition, referential behavior and existence of any actor IDs in the authoritative public Person table, and ran in a rollback-on-failure transaction. No Person, learner, grant, credential or native session record was copied or reidentified. Audit events, domain events, and Class facilitator attribution now directly reference `public.people`.

**Latest read-only Neon main inspection:** 142 `public.people`, zero native Persons, **63 remaining native Person foreign keys**, 325 FKs to `public.people`, 322 public tables, 348 `education_v30` tables, and zero currently active CAN grant/Person conflicts. Five historically conflicting **inactive** grants remain as audit evidence, not as authority. Concurrent schema changes account for a separate change in the overall FK inventory; numbers are based on the live database rather than assumed batch totals.

**Release restriction remains in effect.** The still-staged `2026-11-17-stage-unified-person-fk-rebind.sql` has been rebased to the observed **63 outstanding foreign keys**, but has **not** been run. It requires explicit independent authorization and full code, RLS, guardian, learner, consent, native-cookie, and browser acceptance. Noncredit and reviewed-Class onboarding still contain native Person/account creation and native-cookie issuance. Those writes must be changed together before the remaining relationships or duplicate native identity tables can be retired. The `verify:person:runtime-main -- --strict` gate remains blocked by those source dependencies.

## Authoritative identity choice

**Chosen target:** `public.access_accounts` is the sole login account; its immutable
`person_id` refers to **`public.people.id`**, the authoritative Person key.
A Person can have many active roles and Site/Organization grants but may not be
associated with two active CAN accounts. `education_v30.persons`,
`education_v30.canonical_accounts`, native bearer sessions and account mapping
tables must be retired as authoritative identity sources, not preserved through
permanent adapters.

**Database implementation staged on main:** `patch-can-one-person-grants.sql`
adds the account Person anchor, one-account-per-Person unique index and
concurrency-serialized active-grant trigger. The corresponding Drizzle account
model includes `personId`. The account-Person anchor and its integrity triggers are now installed on Neon main; this does not itself update the v3 FK graph.

**QA installation (2026-11-17):** The 13 SQL statements in
`patch-can-one-person-grants.sql` were applied transactionally on the
**test01** Neon branch only. A subsequent independent SQL query confirmed the
account Person column, partial-unique Person index and both identity triggers
exist, and found **zero active grant/Person anchor mismatches**. Synthetic
rollback-only write behavior is represented by
`scripts/acceptance/test-one-person-account-constraints.mjs`, but this
script has not yet been executed. Application build, authorization suite and
browser journeys are **not verified**. **The native Person/Account cutover has not been migrated.**
Deploying the new `accessAccounts.personId` reader without applying the
migration in the target environment will fail. Coordinate DB and app release.

**Read-only test01 evidence (2026-11-17):** 68 `public.people`, 6
`education_v30.persons`, zero shared UUIDs; 10 CAN accounts, 4 native accounts,
zero shared account UUIDs; 141 public Person FK references and 219 canonical
Person FK references. There were no active multi-Person CAN accounts. The
`preflight-one-person-cutover.sql` check reported **BLOCKED**, not passed.
No lookup by email can authorize a rekey. An explicit verified migration plan
must preserve learner and academic history as it changes native references.

## Historical ownership correction (2026-11-17)

A second data audit found that an account can have **only revoked
memberships** yet still have a known Person. Migration
`0085_historical_person_ownership.sql` backfills an unanchored account only
when **all historical grants identify exactly one Person** and that Person
does not already belong to another anchored account. It never reactivates a
grant, infers ownership from email, reassigns a Person, or edits enrollment
history. Conflicts fail closed for an explicit identity reconciliation.

On `test01`, four accounts with solely inactive historical grants were
anchored by this additive migration. Postflight: **zero unanchored historical
accounts**, **zero mismatched active grants**, ten anchored accounts and the
immutable-identity trigger present. A separate rollback-only synthetic
transaction passed account uniqueness, multiple same-Person roles, and
Person/account reassignment denials; it left zero synthetic account or grant
rows. The Node acceptance script remains unexecuted, and browser/build checks
remain unverified.

A production read-only audit found historical Person/account relationships
that are not one-to-one. They must remain historical evidence, not be
automatically merged or interpreted as authorization. Native Person and account dependencies on production
remain **unmigrated**. The normal Cloudflare deployment gate now also
requires no historically unanchored account; release proceeds only when
the exact production schema is ready.

## Current code inspected

- `src/modules/identity/command-context.server.ts`: verifies the CAN access session and active account-person grant.
- `src/modules/identity/canonical-command-context.server.ts`: splits between CAN staff session mapping, dual-cookie noncredit learner mapping, and fallback native canonical session.
- `src/modules/identity/learning-command-context.server.ts`: selects between native canonical cookie and CAN cookie.
- `src/modules/enrollment/noncredit-self-enrollment-identity.server.ts`: can issue a second native learning cookie.
- `src/modules/identity/canonical-transaction-authorization.server.ts`: mutation revalidation chooses between CAN and native session.
- `database/canonical/v3.0.1/patch-can-staff-restricted-auth-reader.sql`: restricted reader currently resolves CAN staff through explicit cross-schema Person/Site mappings.
- `database/canonical/v3.0.1/patch-noncredit-self-enrollment.sql`: noncredit claim trigger currently depends on `access_account_noncredit_principals` and separate canonical account identity.

## Required target behavior

1. Authenticate with the existing verified CAN access session only. No `__Host-can_os_v3_session` cookie, second learner login, or dual-cookie mode.
2. Resolve exactly one authoritative Person for that session. The active grant selects a role/scope, never a different Person; fail closed for ambiguous accounts.
3. Use the same Person identifier in school, family, noncredit, native Class, Course Attempt, attendance, assessment, completion and reporting authorities. No email-based Person matching.
4. Preserve multiple explicit, effective-dated grants across organizations and Sites. Authorization is revalidated against the **current** grant and target resource for every read/write. A favorite Site is not permission.
5. Guardian access remains relationship- and consent-scoped; it cannot impersonate a dependent or inherit the dependent's private learning authority.
6. Use restricted database execution and RLS for sensitive reads and writes, including transaction-time grant revocation checks. Do not replace a missing canonical mapping with permissive defaults.
7. Retain evidence and activity history. Removing obsolete login compatibility does **not** authorize deleting existing enrollment, academic, consent or audit records.

## Coordinated breaking-change cutover

- Define the one canonical Person key and update FK/reference ownership for all source systems. Do not simply equate unrelated public.people and education_v30.persons UUIDs.
- Provide a reviewed data migration and conflict/fail-closed report for existing Person, learner, student, guardian, staff and reviewer relationships.
- Replace the CAN-to-native staff SQL projection and the learner dual-cookie identity path together; update all `getCanonicalCommandContext` consumers and native Class transaction revalidation in the same atomic release.
- Rewrite noncredit enrollment claim checks to the selected canonical Person/account authority; remove the cross-account linking requirement, separate native session issuance and obsolete mapping table after the new workflow is verified.
- Remove native cookie reader, legacy login routes and tests that encode two-login behavior, **without** preserving adapters or fallback behavior.
- Update end-to-end tests for new CAN account self-enrollment, existing adult activity, guardian/dependent isolation, site administrator, facilitator, independent reviewer, cross-organization denial, revoked grant and historical participation.
- Verify source build, restricted DB migrations and RLS, one-hour and two-Site four-session pilot, and rollback/recovery before enabling production. Do not activate flags or migrate production in advance.

**Release gate:** Until both schema and application paths are migrated and verified together, main cannot be represented as having completed the identity cutover. Partial removal of the old session path is unsafe because existing guarded workflows still invoke it.

## Incremental one-Person work on main, November 17, 2026

The authenticated guardian identity resolver now returns the **immutable CAN Person UUID** from the verified `public.access_accounts.person_id` and current CAN guardian session. It no longer requires a second CAN-to-native guardian identity link. **Guardian access to a child is still independently checked** against the current verified guardian authority, time window, learner relationship, and verified age. This does not implicitly allow a guardian to assume the learner's identity or make native enrollment work before the remaining Person FKs are migrated.

The facilitated classroom attendance name projection now reads `public.people`, after the existing Site-, Class-, release- and learner-specific roster authorization. Names are not accepted from browser payloads and the change does not expand roster visibility. Both changes are on GitHub `main`; authenticated browser acceptance remains outstanding.

A guarded main-only transaction moved empty `course_sections` and `foundations` into `public`, retaining their original table objects and **seven incoming FKs**. SQL: `database/production/2026-11-17-relocate-course-sections-and-foundations.sql`.

The opt-in, read-only `verify:person:runtime-main` command evaluates both the live Neon main database and checked-out source files. It explicitly reports active blockers such as native Person/account creation in noncredit and reviewed-Class enrollment, native learner session issuance, dual-cookie fallbacks, and historical Person grant differences. The verifier has a strict failing mode; **it does not approve or run the staged remaining Person FK migration**.

At this historical snapshot (superseded by the current checkpoint above): **311 public tables, 360 remaining `education_v30` tables, seven secure-schema tables, 142 platform People, zero native Person rows, and 239 original native Person FKs**. There are **five historically mismatched inactive grant rows**. These are evidence to preserve and reconcile, not permission to remap Persons or reactivate revoked grants. Counts may advance independently as other workstreams commit to main.

The full Person/account/native session cutover remains **blocked** until all relevant writers, sensitive authorization, guardian and learner readers, release acceptance, and rollback checks agree on the one Person UUID.

## Main-only security checkpoint, November 17, 2026

The authoritative `public.people` table now has **forced row-level security** and a restrictive direct-client deny policy. The inherited unscoped `authenticated` and `anonymous` read/write permissions have been revoked without changing any of the 142 existing People, access accounts, guardian relationships, grants or audit records. SQL: `database/production/2026-11-17-protect-authoritative-people.sql`.

The same restrictions now apply to `public.sites` and `public.organizations`, both of which are the only surviving Site and Organization identity tables. The native Person/account model has **not** been dropped; its 239 foreign keys remain pending coordinated application, authorization, evidence and release acceptance.

This is a database privilege hardening milestone, **not** proof that privileged server commands use least-privilege connections, that a single CAN login works across all native Class/learner flows, or that guardian separation has passed live testing. Existing historical Person/grant disagreement is not resolved by the RLS change. Work must continue on Neon **main** only, not test01.

## P0 main production checkpoint (2026-11-17)

The read-only Neon **main** inspection supersedes earlier test01 counts for
production readiness. GitHub `main` now includes
`scripts/acceptance/check-main-person-cutover.mjs`. Run only against the
verified `can-os` Neon **main** branch:

```sh
CAN_MAIN_PERSON_CUTOVER_CHECK=1 DATABASE_URL="<production main neondb URL>" \
  npm run verify:person:main-cutover
```

| Direct main observation | Count |
| --- | ---: |
| Platform People | 142 |
| Native Person rows | 0 |
| CAN accounts anchored to `public.people` | 15 / 15 |
| Active account/Person grant mismatches | 0 |
| Historical accounts with grants for multiple Persons | 1 |
| Native Person inbound FKs | 239 |
| Platform Person inbound FKs | 150 |
| Native accounts / active native sessions | 0 / 0 |
| Staff / learner correspondence rows | 0 / 0 |
| Remaining transitional correspondence tables | 2 |

The production immutable account trigger, active-grant Person trigger and
one-account-per-Person unique index exist. This is an **account ownership
milestone, not the native identity cutover**. The new verifier emits
`BLOCKED` while the FK graph, historical conflict or transitional tables
remain. Add `--strict` to use its report as a failing acceptance gate.
It never creates Persons, copies history or changes grants.

### P0 sequencing and non-negotiable security gates

1. Inventory every native Person FK, function, role policy, trigger, and
   runtime reader/writer. Rebind only after its actual data ownership and
   references are reviewed. There are no native Person rows to automatically
   match or copy, but 239 FKs cannot be discarded without rewiring.
2. Preserve `public.people.id` and immutable CAN account ownership.
   Retain the one conflicting historical account's evidence for explicit
   reconciliation; do not resolve it by email, mutate the Person on an old
   grant, or reactivate revoked access.
3. Replace native staff-grant authorization with **explicit, current,
   exact-Site CAN grants and independently reviewed, evidence-backed
   authorization**. An identity anchor is never a staff appointment.
   Reviewer and subject must be distinct; authors cannot self-approve.
4. Move Class learner, guardian, enrollment, attendance, completion,
   credential and historical readers/writers to the single Person key.
   Preserve current consents, revocation checks, role scope, RLS, audit
   history and independent official decisions. A dependent's access is
   never inherited from a guardian login.
5. In one coordinated code/database acceptance release, retire the two
   empty account-to-canonical correspondence tables, native sessions,
   native account/Person ownership and their *live* consumers. **Do not
   introduce replacement crosswalks, shadow Person IDs, fallback cookies
   or provisional grants.**
6. Validate exact Site operator/reviewer separation, staff grant
   issuance/revocation, cross-Site denials, one-hour adult training,
   four-session learner cohorts, guardian consent, historical participation,
   direct SQL/RLS denials and browser journeys. Record the production
   commit and database state; neither this report nor zero native rows
   certifies completion.

The current deployed application may still rely on transitional readers.
Do not drop tables or enable a new path independently of its authorization
and test migration. Do not represent the P0 as closed until both the source
code and production database have passed the integrated acceptance.

## Implementation continuation: exact Person FK ownership and reusable CAN grant checks

GitHub `main` now contains an **unapplied** migration at
`database/production/2026-11-17-stage-unified-person-fk-rebind.sql`.
Direct Neon main catalog inspection established **239 validated, one-column
foreign keys across 209 referencing tables**. Three referencing tables are
still the `public` Person/account correspondence or adult-review schema;
the other references remain native. There are zero native Person records and
zero native accounts on main. The staged SQL preserves each FK name and
referential action, rejects unexpected graph or source records, and requires
an explicitly approved, independently verified runtime release before it can
execute. **Historical checkpoint only:** FK rebinding had not yet begun at this point. See the current checkpoint above for the independently verified incremental actor migrations.

The read-only inventory script is callable as:

```sh
CAN_MAIN_PERSON_FK_INVENTORY=1 DATABASE_URL="<Neon main URL>" \
  npm run verify:person:main-fk-inventory -- --details
```

A reusable `assertCurrentCANGrantForMutation` now authenticates and locks
the **same CAN session, immutable public Person, exact active grant,
Organization and Site** within the business mutation transaction. It also
supports locking the required Organization classification for institutional
reviewers. This verifier does **not** itself award staff roles or replace
independent official approvals. The credential issuer's independent reviewer
write path now calls it instead of duplicating hand-written reviewer
session SQL. The existing reviewer role and separate approved issuer grant
remain mandatory.

Before executing the FK migration, migrate the native Person Drizzle
mappings, SQL functions/readers, staff and learner session resolvers,
guardian authority, DOB evidence access, issuance and assessment revalidation,
RLS and FK-connected writes to `public.people`. The authoritative
`public.people` table does not contain a birth-date field; verified
age/eligibility must come from separately reviewed protected evidence,
never an inferred or publicly exposed Person property. Preserve existing
`access_adult_learning_reviews` consent and evidence history when retiring
its canonical Person/account columns.

This is a **staged implementation checkpoint**, not P0 closure. Current
runtime still has native-session and cross-account authorization consumers.
The staged SQL must not run before those consumers and end-to-end journeys
are updated and accepted.

## Staff correspondence write retirement (November 17)

The legacy `/site-identity` page no longer offers staff Person pairing, and the
old `verifyCANStaffCanonicalPrincipal` server command rejects every new link.
The authoritative CAN account Person remains the immutable
`public.access_accounts.person_id` referencing `public.people`. Explicit
`public.account_person_grants` are the only legitimate Site role grants.
A separate independent decision is still required for high-risk authority.

The `revokeCANStaffCanonicalPrincipal` path is retained **only** to revoke
historical links with audit evidence, requiring the independent verified CAN
network steward and an exact transaction-time, locked reviewer grant check.
The production correspondence table was empty at the checkpoint; **no
correspondence rows or production identity data were changed**.

This removes creation of a second staff Person while the read-side canonical
session, guardian, learner, class authority, FK and RLS code are migrated.
Do not treat the revoked creation path as proof that the other historical
callers are retired, and do not drop legacy Person tables until those
consumers are removed and verified.
