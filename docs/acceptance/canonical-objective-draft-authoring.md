# Native Class: canonical objective assessment draft acceptance

Status: feature-branch implementation only. NOT approved for `main`,
`test01`, production, or live participants. No migrations executed.

## Purpose

Restore the one-screen, five-question publisher experience without
reintroducing the unshipped `course_activity_sets`,
`class_activity_submissions`, duplicate private answer store, or
`patch-unified-class-activities.sql`.

This is a **canonical capability policy patch**, not a third Unified Class
schema migration. It writes existing `education_v30.assessment_*` records:
definition, version, form, fixed section, item bank, item versions, options,
form items and encrypted keys. The only optional change to canonical
authorization is a purpose-specific PostgreSQL stored command and one
Organization-bound NOLOGIN writer role.

## Required isolated QA setup

1. Provision a disposable Neon child of `test01` after reviewing branch
   capacity and retaining all necessary snapshots. Do not mutate production.
2. As the trusted schema owner, inspect the existing
   `database_role_organization_bindings` purpose constraint and apply
   `patch-canonical-assessment-draft-authoring.sql`. It extends the current
   allowed-purpose list without replacing known unrelated purpose codes
   and creates two restricted SECURITY DEFINER functions.
3. Provision one active test publisher Organization's restricted NOLOGIN
   role using `provision-canonical-assessment-draft-role.sql`, passing the
   exact `organization_id` and restricted NOINHERIT `application_role`.
   Do not use `neondb_owner` for the application login.
4. In the isolated test process only, configure
   `CAN_CANONICAL_ASSESSMENT_DRAFT_ENABLED=true` and a unique
   `CAN_NONCREDIT_ASSESSMENT_KEY_HEX` (64 hexadecimal chars, secret).
   Do not print this secret or store it in a fixture.
5. Run `npm run typecheck`, `npm run test:classes:unit` and the
   read-only script `CAN_CANONICAL_ASSESSMENT_DRAFT_PREFLIGHT=1
   npm run db:canonical:objective-draft:preflight` against the isolated QA DB.
   Check the database role privileges, force-RLS on answer keys, and
   published-only Course selection.

## Positive journey

1. Sign in as a verified publisher registrar with `curriculum.publish`
   and a single active canonical Organization scope.
2. Open `/canonical/course-activities`. Select a published Course owned
   by this Organization. Do not allow another publisher's Course to appear.
3. Enter an original, reviewed five-question multiple-choice check with
   correct choices, a 0.8 passing threshold and three maximum attempts.
4. Save using the canonical draft writer. The service generates immutable
   item-version and option IDs, encrypts correct option UUIDs with AES-256-GCM,
   and invokes the sole-purpose PostgreSQL stored function under a temporary
   organization-specific role.
5. Verify a draft assessment definition, version, form, section,
   five draft item versions, options and encrypted keys exist. Every write
   must commit or roll back together; no answers are visible on the
   returned record or UI. Reload the page and verify only own draft
   metadata appears in the readback.
6. Confirm the saved record remains `draft`. Existing canonical
   academic/rights/accessibility/independent review triggers remain
   authoritative for item, assessment and form publication.
7. Once separately approved canonical publication and local administration
   exist, the actual Class registrar may provision an assessment grant.
   The Class loader may read only its own enrolled Person's Attempt.

## Negative/security tests

- Unauthenticated, learner, unverified and revoked accounts cannot author.
- Invalid or multiple Organization scopes and missing curriculum capability
  fail before assuming a database role.
- Restricted login without the Organization-bound role cannot execute the
  function. A role bound to Organization A cannot insert an assessment for B.
- A Site operator cannot create a draft for a Course owned by the national
  publisher or another independent organization.
- Invalid, duplicate or missing answers, duplicate choice text, invalid
  keys, invalid question counts or a malformed encrypted payload roll back
  the entire draft; no partial definition, answer or audit event remains.
- Restricted author cannot directly SELECT `assessment_item_secure_keys`,
  INSERT into assessment tables, UPDATE published versions, issue awards or
  read results. Check all current role grants and memberships.
- Draft readback never includes correct option UUIDs, raw answer-key bytes,
  other organizations' definitions, participant PII or response values.
- Encryption decryption with a wrong item version ID or wrong secret fails.
- A local administration cannot increase the publisher's published maximum
  allowed attempts.
- Existing school/noncredit assessment and survey permissions, content
  publication triggers and current learner scoring remain unaffected.

## Outstanding release boundaries

Saving a draft **does not publish** its assessment, form or item versions.
Canonical review decisions and publication must be explicitly handled by
an independently authorized publisher/reviewer workflow. Class enrollment,
survey invitations, role switching and national impact reporting are not
implemented here. Real RLS, source/unit, build, and authenticated two-Site
runtime acceptance remain mandatory before merging PR #298.
