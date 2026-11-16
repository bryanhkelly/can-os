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

## Independent canonical review and publication (new source workflow)

The feature branch now contains `/canonical/assessment-reviews` and
`/canonical/assessment-publications`, with a separate optional policy-only
SQL patch and role provisioning:

```sh
# Only on an approved isolated QA database, after the draft author patch:
psql "$TEST_DATABASE_URL" -v ON_ERROR_STOP=1 \
  -f database/canonical/v3.0.1/patch-canonical-assessment-review-publication.sql

psql "$TEST_DATABASE_URL" -v ON_ERROR_STOP=1 \
  -v organization_id=YOUR_PUBLISHER_ORGANIZATION_UUID \
  -v application_role=YOUR_RESTRICTED_NOINHERIT_LOGIN \
  -f database/canonical/v3.0.1/provision-canonical-assessment-approval-roles.sql
```

A trusted Organization administrator must **also record an explicit
Person-specific appointment in existing
`education_v30.professional_role_assignments`**, with
`role_code='assessment_reviewer'` or
`role_code='assessment_publisher'` as appropriate, the exact appointing
and operating Organization, `state='approved'`, an effective current
appointment, and verified Organization-owned, unexpired
`authority_evidence_id`. A broad Site Admin login or Organization-wide
SQL membership alone is **not** sufficient. These are independently
appointed roles without adding a second login or a new role table.

Before trying authorized review or publication, run the read-only role,
function, key-privilege and **current Person appointment** preflight:

```sh
CAN_CANONICAL_ASSESSMENT_APPROVAL_PREFLIGHT=1 \
CAN_CANONICAL_ASSESSMENT_QA_ORGANIZATION_ID=YOUR_PUBLISHER_ORGANIZATION_UUID \
DATABASE_URL="$TEST_DATABASE_URL" \
npm run db:canonical:objective-approval:preflight
```

Enable the optional flags only in that isolated QA runtime:

```sh
CAN_CANONICAL_ASSESSMENT_REVIEW_ENABLED=true
CAN_CANONICAL_ASSESSMENT_PUBLICATION_ENABLED=true
```

The reviewer role can load the publisher's draft questions and options,
and the server decrypts private correct option keys in memory solely
for the verified reviewer display. The browser never receives ciphertext,
the server secret, or an arbitrary direct database key read. Review
decisions are append-only canonical records, written separately at the
item (academic, rights, accessibility), assessment version (those three
plus independent), and form (those three) levels. A reviewer may not
approve any question they authored. The most recent decision in each
domain controls.

The publisher role is distinct: it can view readiness **without correct
answer keys** and publish ONLY when **every** question and all other
required levels have independently approved latest decisions. The
underlying canonical version/item/form publication triggers continue
to execute and the transaction reverts everything if any gate fails.
Publication grants no Class enrollment, attempt, learner consent,
certificate, course completion or academic credit.

QA must attempt, and see rejection of, all of the following: revoked
per-Person role assignment, expired role evidence, cross-Organization
publisher, author self-review, review with a latest rejection,
missing approval for a second question, reviewer trying to publish,
publisher trying to record a review, public/direct access to secure
keys, a missing server encryption secret and a publication that fails
one canonical database trigger.

**Source code and SQL have been committed but these reviewer and
publisher database roles, appointments, SQL patches, live requests,
typecheck and authenticated E2E journeys have not been independently
validated. Do not enable the flags or merge based on static checks.**

## Outstanding release boundaries

Saving a draft **does not publish** its assessment, form or item versions.
Canonical review decisions and publication must be explicitly handled by
an independently authorized publisher/reviewer workflow. Class enrollment,
survey invitations, role switching and national impact reporting are not
implemented here. Real RLS, source/unit, build, and authenticated two-Site
runtime acceptance remain mandatory before merging PR #298.
