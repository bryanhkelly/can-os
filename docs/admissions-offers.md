# Admissions offers — current service boundary

This document replaces historical offer implementation notes, preserved under [archive/2026-10](./archive/2026-10/). It describes observed code boundaries, **not** complete production acceptance.

## Current owner and sequence

- Server function wrappers: `src/modules/enrollment/admissions-offer.functions.ts` exposes `getAdmissionOfferOptions`, `issueAdmissionOffer`, `respondToAdmissionOffer`, and `activateOfferedEnrollment` to the registrar and guardian routes.
- Domain service: `src/modules/enrollment/admissions-offer-service.ts`.
- Core sequence: authorized registrar issuance → guardian accept/decline → authorized enrollment activation, under program and household relationships, with seat-pool/idempotency protections and audit/event behavior at the service boundary.

## Family self-service applications

`/apply` is the ordinary family entry point, not a demo-only screen. A registrar
opens or closes online applications per active Program from
`/admissions/intake` and can copy its family application link. The public catalog
exposes only explicitly published programs and their school/grade ranges.
Closing intake prevents new registrations, drafts, edits and submissions;
existing applicants can still read their own status.

New contacts register for an applicant-only membership using a verified
single-use email link. Existing signed-in people can opt into an open school
with the same restricted membership without changing their existing roles.
Valor School uses new `@valorschool.demo` addresses and code `000000` instead of
email delivery, subject to the existing tenant-bound access controls. There is
no separate synthetic application service or schema.

Applicants create a canonical inquiry-stage Application draft with linked
Household, Person, StudentProfile and pending GuardianRelationship records.
Sibling applications reuse that contact's household within the school.
Relationship permissions are explicitly false; neither email verification nor
submission establishes guardianship. Save uses request idempotency and draft
versions. Submission requires confirmation, a saved current revision and a
complete core packet, then advances that same Application to `application`.
It writes transactional audit and outbox evidence, not an Enrollment or an
automatically completed enrollment Journey.

Continue draft scrolls to and focuses the editor, including when the same draft
is already open. Saved drafts explain that they have not been sent to admissions;
the editor identifies the review confirmation needed to enable submission.
Closed programs explain why a retained draft cannot be submitted.

### Core application packet

The signed-in `/apply` landing page is an application dashboard. Start an
application or continue an existing draft to open a sectioned workspace:

1. **Instructions** explains saving, submission and the limits of applicant access.
2. **Student information** collects legal names, optional middle/preferred names,
   date of birth, primary language, entering grade and requested school year.
   Requested year is a consecutive-year preference (for example `2026-2027`),
   not a SchoolYear assignment, offered seat or enrollment.
3. **Family and households** collects one or two self-reported households,
   mailing addresses, up to four contacts per household and optional siblings.
   Each listed contact requires name, relationship, email and phone for submission.
4. **Previous schools and interests** collects up to six prior schools (or an
   explicit first-school response), last grade, location and reason for leaving,
   optional attendance dates, learning interests, reason for applying and optional
   academic context. It does not create official transcript/grade records.
5. **Review and submit** displays the entire packet, identifies missing items,
   saves any pending edits as part of submission and requires the existing
   submission confirmation.

Incomplete packets can be saved; malformed dates/emails, excessive collections,
unknown fields and unsupported versions are rejected. The server independently
enforces completeness on submission. Section readiness is not a school review
or approval. Changing a previously complete section back to incomplete regresses
its readiness. Switching drafts/programs or starting another student prompts
before discarding unsaved edits.

Section readiness and the review checklist also include schema validation errors,
not just populated fields: an invalid contact email cannot display as Ready.
Submitting with unsaved edits saves the current revision first (subject to the
same validation, ownership and optimistic-version checks) and then submits that
exact revision in one family action; a separate save is not required. If the
save succeeds but submission fails, the draft remains saved and selected.

Required and malformed fields are highlighted with an inline explanation,
`aria-invalid` and an associated error description. Section/review error lists
link directly to the affected input, opening its section and moving keyboard
focus there. Correcting a value clears its error immediately. The same
field-addressed completeness/validation checks drive server-side packet readiness;
blank optional fields are not errors, and valid incomplete drafts remain saveable.

The validated version-1 `applicationPacket` is application evidence in canonical
Application metadata. The existing student names/grade remain on the same
Person/StudentProfile. Other supplied claims are not silently applied to shared
households, verified guardians or credential records. Registrar intake displays
the same typed packet in its authorized application review; submitted families
can read the packet without gaining access to internal notes.

Packet progress uses the existing Journey definition/instance/requirement tables,
not a new workflow engine. Definition `admissions-core-packet-v1` materializes
three blocking sections using participant type `admissions_application`.
That participant type intentionally keeps admissions collection separate from
the existing `application`-participant enrollment Journey used by GF2. Saves
record the revision and section statuses transactionally with audit/outbox
evidence; a complete packet makes only its admissions Journey ready. Generic
requirement completion cannot bypass packet validation.

Existing drafts retain their names, grade and statement; missing packet fields
are shown as incomplete rather than invented. An old draft must complete the
core packet before a new submission. Already submitted historical applications
remain unchanged and readable. No bulk backfill, reset or schema migration is
required.

**Deferred by scope:** document uploads, reference requests, religious/policy
questions, acknowledgments, signatures, payments, custom packet authoring,
official transcript import and family correction/resubmission after submission.
The core packet does not represent these as completed.

The registrar sees the same records and family statement in the existing
intake/pipeline. Unsubmitted family drafts cannot advance through registrar
review. The school independently verifies the guardian relationship and
provisions guardian membership on the existing person/account before the
ordinary offer, Journey, readiness, acceptance and activation flow. The applicant
status DTO excludes raw metadata and internal decision notes.

Focused acceptance commands:

```powershell
$env:CAN_TEST_DB_WRITES_ENABLED = "true"
npm run test:integration -- family-applications
npm run test:integration -- admissions-offers
npm run test:e2e:admissions -- --grep "GF22: family"
```

These commands require the guarded disposable test database configuration.
Family-application tests roll back their records and cover real challenge
redemption with a mocked sender, scope/ownership/revocation denials, permissions,
draft retries/revisions, sibling relationships, outbox rollback, one submission
event, publication closure and canonical registrar handoff. Route unit tests
cover public/closed/error states and membership-gated forms. The isolated GF22
browser test passed draft save/reload/edit, unsaved-submit blocking, submission,
pending guardian permissions, audit/events and registrar intake/pipeline
visibility. Its fixture closes online publication and retires account access
afterward. Actual external email delivery and hosted deployment remain unverified.

### Registrar-assisted existing-student intake

The registrar's `/admissions/intake` form can reuse an existing StudentProfile,
Person, Household and managing GuardianRelationship. Choices require an active
enrollment (including section-only enrollment) in the selected Program, matching
organization and school scope, active student/guardian identities and shared
household membership. When neither person belongs to any household, intake
requires explicit registrar confirmation to create one and attach both existing
people. It cannot merge separate households or silently replace a household.
This is not a global person lookup or a student-transfer
workflow. Registrars select the existing student/guardian/household combination;
names, grade and relationship permissions are not overwritten.

The server rechecks those relationships and tenant/program scope,
serializes existing-student inquiries on the StudentProfile (and the guardian
when creating a household), rejects another
open application for the same Program and makes identical request retries
idempotent. Inquiry creation writes audit and outbox evidence transactionally.
It does not grant guardian login access, activate enrollment, waive readiness,
accept an offer or change existing class enrollments. Normal registrar and
guardian sessions must complete the same application, configured Journey,
offer, consent and activation workflow.

The rollback handoff integration regression covers identity/household/class
preservation, scoped discovery and mutation denials, tenant scope, outbox
rollback, duplicate commands, readiness blocking, guardian acceptance and
activation through the existing endpoints. This does not repair application
database fixtures or certify authenticated browser execution.

## Applicant detail page and registrar next steps

`/admissions/applications/$applicationId` is the registrar's single view of one
application. Pipeline links point here. The page reuses the shared panels in
`src/components/enrollment/` (`AdmissionsDecisionPanel`,
`ApplicationReadinessPanel`, `AdmissionsOfferPanel`), which the pipeline, intake
and families pages also use, so there is one implementation of each command UI.

`admissionsProgress()` in `src/domain/admissions-next-step.ts` derives the next
step from persisted records only: submit → eligibility review → verify guardian
→ provision guardian login → complete requirements → approve for offer → issue
offer → family accepts → activate enrollment → place in courses. Each step names
its owner (family or registrar).

Prerequisites that are tenant configuration, not code:

- **Seat pool.** Registrars create one on `/admissions/capacity`
  (`createAdmissionsSeatPool`, audited `admissions.capacity.create`). A school
  year serves a program when both share the organization and either the year is
  program-specific to that program or the year's site equals the program's site
  (`schoolYearServesProgram`).
- **Enrollment Journey.** The program's
  `metadata.enrollmentJourneyDefinitionKey` selects the Journey definition that
  "Begin eligibility review" instantiates. Valor uses `valor-family-enrollment`
  v1 (`scripts/seeds/valor-admissions-config.sql`): a blocking family
  confirmation form signed by the guardian, then a blocking registrar
  enrollment review. Offer acceptance requires the Journey to be `ready`.
- **Guardian verification** uses an inline form (method plus evidence note of at
  least 12 characters), matching the server schema.

Documents and payments are not part of this checklist yet.

## Unresolved verification

The service retains historical synthetic-prefixed compatibility command names,
and wrappers preserve the existing `synthetic-offer:` idempotency-key format so
retries still resolve prior offers. Legacy synthetic-record write gates were
removed in the tenant-scope refactor; capability, resource, scope and relationship
authorization remains mandatory. Compatibility names are not a separate demo
workflow or evidence that the whole operating system has been accepted.

Production acceptance requires concurrent last-seat tests, repeated activation/idempotency, revoked-grant/guardian negatives, school/program crossover denials, correct downstream student/guardian visibility, event delivery and full database/browser evidence on a disposable Neon branch. See [golden flows](./golden-flows.md) GF2 and GF22; track results as `unverified` until actually executed.
