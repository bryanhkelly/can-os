# CAN OS Canonical Domain Model

This document defines production concepts. Prototype object names do not override these definitions.

## Identity and relationships

### Person
One permanent human identity.

A Person may simultaneously be a student, guardian, teacher, volunteer, pastor, board member, coach, alumnus, or staff member.

### StudentProfile
Student-domain data associated with a Person. Never a second identity.

### Household
A family/household grouping for guardians, students, communications, addresses, documents, and financial responsibility.

A Student may participate in more than one Household.

### GuardianRelationship
Explicit Person-to-Student relationship including legal/visibility rules.

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

### Enrollment
Keep kinds explicit:

- admission/program enrollment
- school-year enrollment
- section enrollment

### Assessment
Definition of work to be completed/evaluated.

### Submission
Student attempt against an Assessment.

Lifecycle and timeliness are separate dimensions.

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
