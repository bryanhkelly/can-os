# Canonical identity cutover decision (main)

**Decision:** One CAN login and one authoritative Person identity. There is no requirement to preserve native-v3 browser login, account-to-account bridges, or old identity endpoints during the cutover. This is an architecture decision, **not** evidence that the cutover is implemented or tested.

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
model includes `personId`. This migration is NOT installed or authorized for
production and does not itself update the v3 FK graph.

**Read-only test01 evidence (2026-11-17):** 68 `public.people`, 6
`education_v30.persons`, zero shared UUIDs; 10 CAN accounts, 4 native accounts,
zero shared account UUIDs; 141 public Person FK references and 219 canonical
Person FK references. There were no active multi-Person CAN accounts. The
`preflight-one-person-cutover.sql` check reported **BLOCKED**, not passed.
No lookup by email can authorize a rekey. An explicit verified migration plan
must preserve learner and academic history as it changes native references.

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
