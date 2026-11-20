# CAN OS main: final legacy-schema closeout checkpoint

**Target:** Neon project `sweet-hall-62441909`, production main branch
`br-restless-sea-ar9ooo55`. **Verified:** November 19, 2026.
This file records observed structure, not a release certificate.

## Verified catalog state

- `public`: 659 base tables.
- `education_v30`: **seven empty tables** and six existing views.
- `education_v30_secure`: seven safeguarding tables, separately governed.
- **19** foreign keys run from a `public` table to an `education_v30` table.
- No remaining old `persons` FKs. All fourteen were reattached to
  the authoritative `public.people` in the guarded 2026-11-19 cutover.
- The 264 previously moved tables are represented by pinned migration
  inventories in `check-main-consolidation-batches.mjs`.
  The active 148 canonical Drizzle mappings were compared against the
  live catalog and none pointed to a nonexistent table.
- These are structural checks only. TypeScript/Vitest, restricted-role
  negative authorization, browser E2E, and deploy acceptance remain pending.

| Legacy table | Public FKs pointing at legacy | Resolution |
| --- | ---: | --- |
| `persons` | 0 | Replace remaining native Person reads/creation and verified DOB handling with `public.people` and independently reviewed evidence; then retire |
| `canonical_accounts` | 3 | Replace old learner account and correspondence consumers with `public.access_accounts` |
| `canonical_account_grants` | 1 | Rebind independently governed issuer approval to reviewed `public.account_person_grants`; preserve scope, role and revocation |
| `canonical_sessions` | 0 | Eliminate the second native cookie, issuer and restricted reader flow in favor of one CAN session, then retire |
| `enrollments` | 10 | Reconcile credit enrollment semantics and the composite enrollment/deployment FKs with authoritative `public.enrollments` |
| `graduation_decisions` | 2 | Harden public graduation authority, adapt v27 credential support to public Person/Student, then rebind two FKs and retire old empty table |
| `qualification_definitions` | 3 | Reconcile distinct old qualification subject/owner/code fields with public key/kind/version model and dependent validators; rebind three FKs |

All seven legacy tables were checked to contain **zero rows**. Existing
records in `public.people`, `public.access_accounts`, `public.enrollments`,
and other authoritative tables must remain untouched.

## Current application dependencies that prohibit dropping identity tables

- `src/modules/enrollment/noncredit-self-enrollment.functions.ts` and
  `src/modules/classes/native-class-reviewed-onboarding.functions.ts`
  still create native accounts, native Persons and learner grants.
- `src/modules/enrollment/noncredit-self-enrollment-identity.server.ts`
  still issues a second learner cookie and persists native sessions.
- `src/modules/identity/canonical-command-context.server.ts`,
  the restricted reader, and learner Class/guardian workflows still
  validate or join the native learner/session model.
- Existing approved-adult evidence and canonical Person correspondence
  may **not** be silently synthesized or joined by email. Deny unresolved
  or ambiguous identities. No duplicate model, parallel session, implicit
  role approval, or compatibility view should survive the final cutover.

## Security issue found during graduation FK preparation

`public.graduation_decisions` and `public.student_profiles`
currently have RLS disabled and direct `authenticated` database
`SELECT/INSERT/UPDATE/DELETE` privileges. No graduation FK was
redirected into these tables. Review and harden their authorization
before relinking issuance support. The live graduation tables and
credential support/issuance child tables were empty at this audit;
this does not authorize weakening their future permission checks.

## Applied source and QA corrections

The application now points migrated operational, issuer-approval,
content publishing, and completion-evidence SQL directly at `public`.
The obsolete native-session retention update was removed; shared
`public.access_sessions` retention remains.

Updated schema-aware read-only acceptance checks cover WS00, WS2, WS3,
WS4, native Class, noncredit, network attribution, objective approval,
and the main consolidation inventory. The inventory verifier now
fails if active `src` code qualifies one of the 264 moved tables
as `education_v30.<table>`. Actual isolated QA execution is still
required and must use a post-cutover schema branch.

## Required order to finish

1. Implement and validate **one CAN login, one public Person** with
   transaction-level current grant verification, independent adult and
   issuer reviews, guardian authority, revocation, and wrong-Person
   negative tests. Remove dual-cookie and correspondence dependencies.
2. Retarget the governed issuer approval's grant FK to the authoritative
   grant, validate its RLS and restricted writer, then retire the four
   empty native identity tables using `DROP ... RESTRICT`, never `CASCADE`.
3. Reconcile and close the three remaining academic name collisions
   (graduation, qualifications, enrollments) without stripping composite
   integrity checks or changing issuer authorization.
4. Review/relocate the six legacy views, dependent routines, and
   seven restricted safeguarding tables with equivalent isolation.
   Do not move safeguarded records into broadly writable public tables.
5. Require structural, TypeScript, unit, integration, restricted-role,
   browser and production smoke-test acceptance before any final
   `DROP SCHEMA ... RESTRICT`.

**Status: BLOCKED for final schema retirement, not an authorized
production release.** Empty records are necessary, not sufficient:
live runtime paths, foreign keys and security boundaries still depend
on the old model.
