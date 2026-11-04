# CAN OS Canonical Domain Model

This document defines production concepts. Prototype object names do not override these definitions.

## Identity and relationships

### Site Admin

`site_admin` is a distinct Site-bound school setup and administration role above
registrar. It inherits registrar workflow capabilities without changing its
audited role or weakening resource scope, relationships, institutional grants,
independent review or opening-readiness requirements. It cannot provision
network administrators. A registrar cannot appoint or deactivate a Site Admin.

Public `.demo` school bootstrap creates a new canonical Organization/Site and
its initial Site Admin, then reuses normal Launch Studio for Program creation.
Exact demo registry and staff-invitation bindings, not the domain suffix or
fixture provenance alone, authorize shared-code identities. See
[identity and demo access](./identity-and-demo-access.md).

### Person
One permanent human identity.

A Person may simultaneously be a student, guardian, teacher, volunteer, pastor, board member, coach, alumnus, or staff member.

Person-name presentation uses `src/domain/person-name.ts`:
`personShortName` chooses the preferred name, then legal first name (or surname
when it is the only name); `personDisplayName` joins preferred-or-legal first
name with the legal surname; `personLegalName` joins legal fields only and never
substitutes a preferred name. These helpers trim and collapse whitespace and
treat blank fields as absent without changing stored identity data. Missing
names display `Unknown person` unless the caller supplies a contextual label.
They do not parse a full name, deduplicate words, or determine identity.

Messaging contacts, search results and equivalent workspace labels share display
formatting; greetings and message sender labels intentionally use short names.
Official transcript/diploma output, legal-record lists and pickup identity
verification retain legal formatting. Identity verification passes an empty
missing-name fallback, not a presentation label; authorization and name matching
remain in their existing domain policies.

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

The private teacher record documents resumes/work history, degrees, licensure,
certifications and other evidence without making every item universally
mandatory. Each school selects its Program's requirements through authorized,
versioned policy, subject to applicable institutional and jurisdiction rules.
The same person-owned evidence can satisfy different schools' policies without
duplicate teacher identities or credential rows. A resume is not a verified
degree or license. See [qualification design](./adr-profile-compliance-scale.md)
for the distinction between intended records and current editor support.

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

### In-room facilitator
The `room_facilitator` is the onsite adult supervising a physical room for the
school day while students receive virtual instruction. Students sharing that
room may be enrolled in different courses and simultaneous remote classes.
Physical supervision therefore follows the assigned room and its students,
not a requirement that every student attend the same instructional Section.
Attendance and incident/safety reporting are facilitator duties; teaching,
grading and restricted case review are separate authorities.

This is the required operating model, not an implementation acceptance claim.
Room-coverage source support now links a canonical Site room, named primary
and optional backup, a bounded school-local recurring shift and instructional
Sections. Administrators can plan it before a Program exists. Facilitators see
their own assignments; adopting schools require named Section relationships for
facilitator attendance. Students remain in their original courses: no teacher
authority is implied. Occupancy conservatively counts distinct active students
across the linked Section cohorts, not one count per course. Individual seating
of only part of a Section is not modeled by this relationship.
Standalone-school use is planning only: the current reviewed daily supervision
and witnessed-presence workflow remains restricted to independent church/CAN
Programs. This change does not broaden that opening or reviewer authority.

Supervision evidence and presence remain Section/block-based. Only matching,
current, independently reviewed shared-room plans with qualified primary and
backup adults and adequate combined occupancy can avoid the generic overlap
conflict. A room assignment is not continuous physical-presence evidence.
Supporting a shared mixed-course room must preserve actual room occupancy
limits, named qualified coverage, breaks/handoffs, server-scoped student access,
independent safety review and canonical attendance/audit records. Do not remove
overlap protections or assign teacher powers to simulate room-level coverage.

## Organizations and delivery

### Organization
A legal, operating, network, or host entity.

Examples: CAN, denomination, church, Christian school, consortium, microschool operator.

### Site
A physical or operational location belonging to an Organization.

### SiteRoom
A reusable physical classroom owned by one Site, with a stable identifier,
Site-unique name (case-insensitive) and school-recorded occupancy limit. Rooms
are shared across that Site's Programs, not copied per course or academic year.
The setup workflow creates room records; it does not certify external inspection
or establish supervised capacity. A Section may reference a default
`physicalRoomId` in its metadata. This is a planning location, not a reservation.
New daily room plans select a canonical same-Site room and preserve its name and
capacity as evidence snapshots. Existing reviewed plans remain historical
evidence; changing a class default never silently replaces their reviewed room.
Independent plan review, named adults, safety and physical presence stay separate.
Scoped Site Admin/registrar commands may edit the name and occupancy limit using
an expected revision, or retire the room with a reason and explicit confirmation.
Each real change preserves transactional audit and a domain event. Retirement
retains the identity and reserves its name, excludes new assignments and plan
submissions/approvals, and leaves existing defaults visible for replacement or
clearing. Already approved plans keep their reviewed snapshots and expiry.
Catalog retirement is not an emergency closure or an instruction to relocate
students; it neither revokes approved plans nor controls physical access.

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

The registrar Curriculum authoring tools manage the owning organization's courses only
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

Teachers and curriculum-authorized Site Admins/registrars may link videos or attach verified private
MP4/WebM uploads (16 bytes to 500 MiB) classwide or to a stable published lesson
ID. They reuse `curriculumResources`, `curriculumOverlays` and `Document`; they
never modify the publisher release. Upload keys bind the uploader, Section,
course version and resource. Finalization rechecks current manager authority,
object size, MIME and container signature before committing the resource,
overlay, audit and domain event together. Staff uploads require an active
institutional `curriculum.publish` or `curriculum.adopt` grant for the exact
Organization/Program/Site and use the ordinary Curriculum Marketplace workspace;
teacher uploads require current assigned-teacher class authority. Students have
playback only, never upload controls or upload-command authority. Teachers and
authorized staff can preview. Identical finalization retries reuse
the attachment. Private playback reauthorizes the current class relationship
and active attachment before issuing a URL valid for 15 minutes.

YouTube/Vimeo embeds and direct HTTPS videos play on the class/lesson page after
the viewer selects Play; third-party requests are not made just by listing a
resource. Watching never automatically marks a lesson complete or grants a
grade, mastery or attendance. Uploads require the existing
`CAN_R2_CURRICULUM_UPLOADS_ENABLED=true` gate and private R2 configuration.
The deployment CSP permits only canonical YouTube/Vimeo frames, HTTPS media
and private R2 upload connections. R2 CORS must allow the application origin,
PUT/GET/HEAD, `Content-Type`, `If-None-Match` and `Range`. Container checks do
not transcode or certify codecs or scan content; use browser-compatible video
and school-approved sharing rights. Embedding restrictions at the provider
still apply. Real-storage upload/playback acceptance remains unverified.

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

Teachers can submit a scoped class setup request as a canonical Action. The
request remains pending for the Program registrar; it is not a Section, course
release, instructor assignment, enrollment or authorization grant. Only the
registrar launch workflow can fulfill it, after validating published
curriculum, the academic term and schedule, institutional authority, and
instructor eligibility. Fulfillment links the Action to the new Section in the
same transaction; a registrar decline requires a reason and is audited.

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

Ownership and requester visibility are separate. A student can continue to read
their own `student_support_request` by its canonical student-profile subject,
within their active Site/Program scope, after staff take ownership. This does
not expose other students' requests, staff case metadata or private support
notes. The student-safe projection includes `canComplete`; completion still
requires exact current ownership, an eligible Action type and the server's
scope/status checks. Assigning work to staff never delegates completion
authority back to the requester.

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
Only a booked appointment may become held or no-show. Held requires the slot
to have started; no-show requires it to have ended. Outcome recording locks the
booking and slot transactionally, preserving terminal cancellations and preventing
duplicate outcome notes, Actions, audits and events. The teacher workspace includes
upcoming and recent appointments (past 30 days, up to 50, pending first), even when
no future availability series remains. Family booking and rescheduling display the
teacher, series title and canonical Site timezone.

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
Explicit Person-to-StudyGroup relationship with role, eligibility, approval, moderation, and lifecycle state. A group invitation is a scoped notification, not a membership grant; joining still requires the canonical request, guardian-consent, and facilitator-approval workflow.

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
