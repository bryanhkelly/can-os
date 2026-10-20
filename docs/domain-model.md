# CAN OS Canonical Domain Model

This document defines production concepts. Prototype object names do not override these definitions.

## Identity and relationships

### Person
One permanent human identity.

A Person may simultaneously be a student, guardian, teacher, volunteer, pastor, board member, coach, alumnus, or staff member.

School profiles use this permanent identity and current scoped teaching,
enrollment or guardian relationships. They do not expose clinical, contact or
credential evidence. A profile photo is an existing verified `Document` with
category `profile_photo`, subject `person`, standard sensitivity and private R2
storage. Only the person can upload their own bounded JPEG/PNG; related viewers
are reauthorized before receiving a short-lived download URL. Missing photos
render initials, not stock images.

Teacher self-service qualifications are a separate private workspace, not part
of the public profile DTO. A qualification claim references the shared catalog
definition and person-owned restricted evidence. Submission and independent
review append immutable verification decisions; corrections and renewals create
new claims. Verification, current validity, program-specific eligibility and
class authorization remain distinct facts. Launch reviewers require an explicit
institutional verifier grant and relationship even when their session role is
registrar; a policy-publication permission does not grant evidence-review access.

Qualification definitions belong to a shared catalog, not a program-specific
credential store. Initial basic definitions may be created by an explicitly
granted institutional catalog steward. Their unique stable key, classification
and title are create-only in this workflow; identical retries reuse the entry
and conflicting definitions are rejected. Adding a catalog entry never changes
existing claims, verification decisions or published program requirements.

Program teacher-policy revisions create a new immutable requirement set and
record an audited supersession bound on the preceding version. Future effective
instants preserve earlier requirements; launch eligibility evaluates every
version applicable during instruction. Revising requires an explicit scoped
institutional publisher grant and is restricted to pre-opening programs. It
does not remove teaching relationships, approve credentials or grant exceptions.

### StudentProfile
Student-domain data associated with a Person. Never a second identity.

### Household
A family/household grouping for guardians, students, communications, addresses, documents, and financial responsibility.

A Student may participate in more than one Household.

### GuardianRelationship
Explicit Person-to-Student relationship including legal/visibility rules.

### School-support staff
`counselor` and `specialist` are distinct verified membership roles sharing the
school-support workspace. Caseload, referrals, plans, services and outreach use
existing scoped Actions and support records, with immutable mutation evidence
and transactional domain events. This shared school-support policy does not
authorize clinical/private counseling notes; those remain excluded pending
explicit confidentiality, consent, retention and exceptional-access policy.

## Organizations and delivery

### Organization
A legal, operating, network, or host entity.

Examples: CAN, denomination, church, Christian school, consortium, microschool operator.

### Site
A physical or operational location belonging to an Organization.

### Program
A defined educational offering operated by or at an Organization/Site.

Required because CAN supports church-hosted academies, K-8 high-school extensions, microschools, hybrid programs, and other models without changing the underlying architecture.

Suggested fields:

- organizationId
- siteId nullable
- type
- name
- gradeRange
- deliveryModel
- academicProviderOrganizationId
- creditIssuingOrganizationId
- accreditationAuthorityOrganizationId nullable
- hostOrganizationId nullable
- jurisdictionId
- academicCalendarId
- status

### Jurisdiction
Regulatory/geographic context used to select requirements and policy configuration.

Do not scatter state-specific `if state === ...` logic through features.

### Program opening handoff

New site-based activation requires a deliberately selected existing active
site registrar/operator. Activation atomically creates a
`program_opening_handoff` Action owned by that person, an in-app notification,
and audit/outbox evidence alongside the Program and Journey transition.
The Action retains the opening instant, launch Journey and section IDs; no
school records are copied into a new operational store.

Only the selected recipient with a current active site operator grant and
matching organization/site/program scope may acknowledge receipt, with a
confirmed note. Receipt resolves that same Action and records immutable
evidence; it is separate from activation and is not regulatory approval.
The opening registrar may select themselves when they hold the required site
operator grant. Generic Action reassignment/status commands cannot bypass this
domain workflow. Earlier active programs are not backfilled or falsely marked
acknowledged, and site-less programs retain their existing activation behavior.

A pending handoff may be recovered only when its current recipient is no
longer eligible. A scoped registrar with an explicit institutional
`program.opening.handoff.manage` grant selects an eligible replacement, records
a reason and confirms transfer. The same Action remains open, preserving its
opening snapshot. An expected revision and request identity guard stale writes
and identical retries; immutable audit/events preserve previous and replacement
ownership. The replacement receives an in-app notification and must independently
acknowledge receipt. Resolved handoffs and still-eligible recipients cannot be
transferred through this recovery command.

## Scheduled activities

### ScheduledOccurrence
One scheduled instance with its start/end, timezone, and delivery scope
(Organization, Site, Program, and optionally Section). `CalendarEvent` is the
calendar-facing representation linked to this record; it carries presentation
details and participant rows. During migration, its existing time/scope fields
are a synchronized compatibility copy. Domain aggregates remain authoritative
for specialized rules and lifecycle state—for example, trip approval and
attendance, conference booking, activity eligibility, or study-group
membership. Create, reschedule, and cancellation commands run through the
owning domain workflow and write calendar projections transactionally. During
rolling deployment, database triggers also bridge legacy CalendarEvent inserts
and schedule/scope updates into the linked occurrence.

This is a shared scheduling primitive, not a universal Event, task, approval,
or workflow model.

## Authorization model

### Membership
Connects a Person to an Organization.

### RoleAssignment
Assigns one or more roles/capability bundles within a scope.

### Capability
An atomic permission, e.g. `submission.grade`, `student.read`, `attendance.write`.

### Scope
Constrains a capability to network, organization, site, program, section, caseload, or another defined boundary.

### Relationship
May further constrain authorization based on a real relationship, e.g. guardian-child or teacher-section.

Production workspaces are derived from these concepts. The prototype's 19 PortalIds are personas, not production entities.

## Academics and learning

### CourseTemplate
Canonical reusable course definition.

### CourseTemplateVersion
Immutable/versioned curriculum release used by Sections.

Published class reading content uses the optional `curriculum.learning` contract:
`version: 1`, `syllabus`, ordered `modules` with stable IDs and ordered `lessons`
(`id`, `title`, `body`, `resources`), and class-level `resources`. Resource IDs
are unique throughout the release. Each resource contains exactly one HTTPS
`url` or private `documentId`. Invalid configured content fails explicitly;
absent content is an unpublished-content empty state, not synthetic lessons.
Sections never maintain a second browser-side curriculum store.

The registrar Curriculum Studio authors the owning organization's courses only
with an explicit institutional `curriculum.publish` grant, active membership and
matching organization/site/program scope. A registrar session alone is not
publisher authority. A course has at most one authoring draft; new drafts may
clone a published release while retaining stable module/lesson/resource IDs.
Saves use a canonical content revision to reject stale edits. Publication requires
a syllabus, modules, lesson reading, confirmation and a reason, and writes
immutable audit and transactional outbox evidence. Published releases cannot be
edited. New releases are selectable for new sections only: publishing never
changes an existing Section's version or carries forward lesson completion.
Drafts already referenced by a Section require reconciliation before publication.
This authoring workflow permits HTTPS resource links only; private document
publication awaits a verified asset workflow. Existing published private
resources retain their authorized read/download behavior.

### ModuleTemplate
Reusable ordered module structure.

### LearningActivity
Instructional unit/activity in a template or section.

### Course
Catalog-level course identity where needed.

### SchoolYear
Authoritative **Site-scoped** academic-year container. Program/network configuration may provide defaults, but the Site owns the effective operational year because start/end dates, closures, and schedules vary locally.

### Term
Semester, trimester, quarter, or other academic period inside one SchoolYear.

### GradingPeriod
Grade-posting window inside exactly one Term.

### GradeScale
Versioned grading interpretation (letters, percentages, GPA points, pass/fail, etc.). Historical results retain the version used when finalized.

### ScheduleTemplate
Site-scoped reusable bell/meeting pattern for onsite, hybrid, or live-online delivery. Program/network templates may seed it, but the Site-effective schedule is authoritative.

### AcademicCalendar
Site-scoped canonical instructional calendar including school days, holidays, closures, exceptions, and make-up days. Florida and Washington Sites in the same Program may have different effective calendars without forking the Program.

### Section
A delivered instance for a specific Term, roster, teachers, Program, and schedule context.

The launch academic-readiness projection reports whether the assigned
instructor has any current verified qualification evidence. Review decisions
are `submit`, `approve`, `reject` and `revoke`; only the latest sequence per
claim determines its status. Evidence is current when approved, not
future-issued and not expired (the expiry instant is exclusive). Unsupported
persisted decisions fail explicitly rather than becoming an unreviewed claim.
This advisory indicator is not program/jurisdiction-specific teaching
eligibility and does not authorize assignments or replace configured policy.

### Enrollment
Keep kinds explicit:

- admission/program enrollment
- school-year enrollment
- section enrollment

AdmissionOffer acceptance is a guardian decision, not an active Enrollment.
Activation retains the Application's Household, Person, StudentProfile and
GuardianRelationship identities. It requires the recorded accepting guardian
to retain enrollment-management authority, a ready Journey with no outstanding
blocking requirements, and a configured school-year seat pool. Readiness review
and activation serialize on the Journey; guardian decisions retain a shared
relationship lock through the transaction. Checklist changes record before/after
requirement and Journey status in immutable audit and outbox evidence.

A scoped registrar may withdraw an issued, unaccepted offer with explicit
confirmation and an internal reason. This releases its seat, preserves the
Application and offer history, and notifies managing guardians without exposing
the reason. Identical retries are no-ops; a changed reason is rejected. Accepted
offers and active enrollments cannot be cancelled through this command.

Waitlist is an Application disposition, not a new Journey or identity. A
registrar must explicitly restore it to eligibility review before an offer
can be issued or accepted. Declined/withdrawn Applications cannot be revived
by a stale offer response or issuance retry. Intake must first reject a
closing/waitlisting decision while any unexpired issued or accepted offer
exists, across all school years. The registrar explicitly withdraws each
unaccepted offer using the existing confirmed, audited command; accepted
offers and active enrollments cannot be cancelled through intake. Elapsed,
declined and revoked offers do not prevent closure. Closing clears any
waitlist/offer-ready disposition; restoring a waitlist preserves the same
Household, student, Application, Journey and evidence. Closed Applications
are not reopened by the waitlist-restore command.

Application decisions, offer issuance, guardian response, offer withdrawal
and both activation paths take the same transaction-scoped application
advisory lock before taking seat-pool or application row locks. This prevents
a concurrent intake decision and offer action from both committing conflicting
states. Pool-wide expiration only takes the pool lock; it never waits for an
application lock. Registrar and guardian projections expose the same waitlist/
closed state and actionable next steps; server checks remain authoritative.

Guardian offer progress distinguishes response, readiness review, activation
and class placement. Only active section enrollments in active Sections count
as assigned classes. A later accepted offer does not overwrite the historical
status of withdrawn, declined or expired offers. Family Home and Student Today
restrict these enrollment/class projections to current relationship and
site/program grants; accepting an offer alone does not grant class access.

Enrollment evidence remains attached to the application's canonical
JourneyRequirement, not a separate family checklist engine. Managing guardians
see requirement status, explicit family-visible document instructions and file
history, never internal registrar notes or raw storage keys. Replacing a file
supersedes the preceding Document, invalidates requirement completion and
returns the Journey to review. Only registrar approval of the current,
storage-verified file completes a document requirement; the generic checklist
cannot bypass pending document review. Upload and review mutations append
audit and transactional outbox evidence, and identical retries do not duplicate
records or request/rejection notifications. Archived journeys remain readable
to currently authorized actors but do not accept new uploads.

An enrollment requirement may snapshot a configured `enrollmentForm` from its
JourneyDefinition. Program metadata `enrollmentJourneyDefinitionKey` chooses
the approved packet for both family application and registrar intake; absent
configuration preserves the existing `family-enrollment` default. Named
packets can encode the school's jurisdiction-specific requirements without
state-specific code branches. Active definition selection retains the existing
key/version mechanism; use a new approved key for a new packet release.

One currently authorized managing guardian signs each form. A submission
retains its exact form/consent, version, answers, signer identity, typed name
and signing instant. Registrar approval is mandatory and rechecks the signer's
current enrollment-management relationship. Rejection requires a family-visible
reason and a fresh corrected signature. Review targets the latest submission;
old reviews cannot approve newer answers. Signature and review retries preserve
the original evidence and reject changed input. Audit stores reference/digest
evidence rather than copying private answers or consent signatures into the
outbox. Generic checklist completion and document approval cannot waive a
configured form. Offer readiness and legacy activation verify the signed,
approved snapshot rather than trusting only its `complete` status.

Packet configuration uses `requirements[].enrollmentForm` with `version`,
`instructions`, `consent` and up to 30 `fields`. Each field has a unique `key`,
`label`, `type` (`text` or `yes_no`) and `required` flag. A false yes/no answer
is a supplied answer, not missing consent; the school statement requires its
own affirmative signature acknowledgement. Required forms must also set the
JourneyRequirement's `blocking: true`. Configure only school-approved text in
reviewed JourneyDefinitions; the application does not invent legal language,
retrofit historical journeys or apply production packet configuration.

### Assessment
Definition of work to be completed/evaluated.

### Submission
Student attempt against an Assessment.

Lifecycle and timeliness are separate dimensions.

### LessonProgress
Student-reported completion of a stable lesson ID, scoped to the StudentProfile,
Section and CourseTemplateVersion. A version change does not silently carry
completion onto different content. This is not attendance, a grade or mastery.
Repeated writes of the same state are idempotent; changes produce an AuditEvent
and transactional outbox DomainEvent. Parents read only their academically
authorized child's progress; assigned teachers read current roster progress.

### SubmissionAnnotation
Append-only teacher feedback on an exact text range of one Submission attempt.
Browser UTF-16 offsets and the quoted text must match the persisted response.
Students and academically authorized guardians see annotations only after that
attempt is graded or returned. A revision creates another attempt and does not
retarget earlier annotations. This does not provide PDF/image markup.

### Class communications
Announcements and discussions reuse CommunicationThread/CommunicationMessage
with Section context; they are not separate communication stores. Assignment
conversations use Assessment context plus the target StudentProfile and are
shared with the student, academically authorized guardians and assigned teachers.
They are not private teacher notes. Reading or replying rechecks current
enrollment, scope and relationship, even when historical participant rows remain.

### SectionGrade
Computed/finalizable academic result for a Student in a Section/GradingPeriod. Finalization is explicit and corrections are append-only/audited.

### ReportCard
Published family/student view of finalized grades for a GradingPeriod or Term.

### AcademicRecord
Canonical durable set of finalized grades, credits, and academic standing facts used to generate transcripts.

### TranscriptIssuance
An issued transcript artifact with issuer, timestamp, version/correction lineage, and issuance metadata. The issuer is the explicit CreditIssuingOrganization, never assumed to be CAN.

### Standard / Skill / Objective
Curriculum graph entities. Publisher content, CAN content, teacher extensions, and later AI-generated extensions map into the same graph.

## Work and orchestration

### Action
Universal work object.

Used for tasks, cases, interventions, exceptions, follow-ups, compliance remediation, and operational work.

Lifecycle:

```text
Open -> In Progress -> Waiting -> Resolved
                 \-> Cancelled
```

An Action may have owners, due dates, dependencies, evidence, related entities, and resolution notes.

### Journey
Reusable readiness/onboarding engine.

Examples:

- family enrollment
- teacher classroom readiness
- partner/program launch
- volunteer clearance
- re-enrollment

Requirements have states:

- Needs You
- Needs CAN
- Waiting on Third Party
- Blocked
- Complete

Blocking requirements override percentage-style readiness. UI should prefer categorical readiness plus "x of y requirements complete."

### Insight
System-generated observation with evidence, uncertainty, and recommended Actions.

Proactive AI enters the product as Insights, not unsolicited chat.

## Operations

### ConsentRecord
Versioned e-sign/consent fact tied to a Household, signer, subject, document version, timestamp, and signature evidence.

### SensitiveAccessGrant
Temporary, purpose-bound, field-scoped permission for exceptional sensitive access. Used for cases such as a field-trip chaperone receiving only the emergency fields needed for the trip. Grants have explicit validity windows and revocation.

### FinancialObligation
Minimal money-due contract tied to a Household and business subject (trip, activity, etc.). This is not the full accounting ledger.

### Incident
First-class governed legal/safety record. Filing creates a durable record; corrections are IncidentAmendments rather than destructive edits. Reviews, notifications, evidence, follow-up Actions, closure, and sensitive reads are auditable.

### HealthProfile
Medical-tier student context. Detailed health data is never implied by ordinary student-read access.

### HealthComplianceItem
Explicit compliance state for immunization or other health requirements, including document evidence, review, and expiry.

### MedicationAuthorization
Time-bounded authority to administer a medication, with instructions and supporting authorization/consent documents.

### MedicationAdministration
Immutable fact that a medication was administered, refused, held, or missed at a Site by an authorized person.

### HealthOfficeVisit
Medical-tier operational visit with disposition, send-home state, and optional return-to-school requirement.

### ReturnToSchoolClearance
Explicit state that prevents a send-home/illness workflow from being silently forgotten.

### FieldTrip
Site-scoped off-campus event with proposal/approval, household permission, fees, chaperones, trip-specific attendance, safety access, and Incident linkage.

### Activity
Site co-curricular or athletic program.

### ActivitySeason
Time-bounded instance of an Activity with registration, fee, eligibility, roster, and calendar lifecycle.

### ActivityRegistration
Student participation request with consent, physical/document expiry, eligibility state, financial obligation, and roster state.

### ActivityEligibilityCheck
Versioned eligibility decision with evidence and validity window. Do not hard-code one national GPA rule into the schema.

### ConferenceSeries
Teacher/Site-defined availability window for parent-teacher conferences.

### ConferenceSlot
Bookable interval within a ConferenceSeries.

### ConferenceBooking
Guardian-to-student booking for a specific slot; produces a canonical CalendarEvent and communication/reminder context.

### ConferenceNote
Conference note with explicit visibility, separating family-visible summaries from staff-private notes.

### AttendanceEvent
Expected/present/absent/tardy/excused operational attendance fact.

### AttendanceExcuse
Parent/guardian explanation and site review state.

A submitted excuse belongs to the exact AttendanceEvent it explains. If a
subsequent correction supersedes that event, approval/rejection must not change
the newer school record. A currently scoped registrar with
`attendance.excuse.review` can explicitly close the obsolete excuse as
`withdrawn`, with confirmation, a guardian-visible reason and the expected
current AttendanceEvent identity. Assigned teachers cannot perform this
closure. Current or already-approved/rejected excuses cannot be closed this way.

Closure takes the same occurrence advisory lock as marking and excuse review,
changes only the excuse, and writes immutable audit/outbox evidence plus an
in-app notification to its submitter. Identical retries reuse the result;
different retry content or a changed current attendance event is rejected.
Guardian history distinguishes earlier excuses from the current mark, and
notification links recheck the guardian relationship and site/program grants.
Family attendance counts and absence follow-ups use effective correction-chain
facts, not superseded absent rows.

### CalendarEvent
Canonical shared calendar object.

### CommunicationThread
Canonical human communication record with contextual links to students, sections, sites, programs, Actions, etc.

### StudyGroup
Academic peer group tied to a Section, subject, cohort, Program, or approved learning purpose.

### StudyGroupMembership
Explicit Person-to-StudyGroup relationship with role, eligibility, approval, moderation, and lifecycle state.

### Document
Managed artifact with ownership, purpose, sensitivity, and retention metadata.

## Platform infrastructure

### DomainEvent
Canonical business fact emitted by a successful mutation.

### AuditEvent
Immutable record of who changed what, when, and under which authorization context.

### Notification
Delivery/read state for something the user should know. Notifications are not the underlying business fact.

## Deferred finance

Initial production may store minimal tuition/funding attributes needed by enrollment, but the following workflows are deferred:

- ESA claims
- disbursement processing
- detailed education subledger
- partner revenue allocation

The schema should not preclude them later.
