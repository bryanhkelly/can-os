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
Authoritative academic-year container for a defined Organization/Program scope.

### Term
Semester, trimester, quarter, or other academic period inside one SchoolYear.

### GradingPeriod
Grade-posting window inside exactly one Term.

### GradeScale
Versioned grading interpretation (letters, percentages, GPA points, pass/fail, etc.). Historical results retain the version used when finalized.

### ScheduleTemplate
Reusable bell/meeting pattern for onsite, hybrid, or live-online delivery.

### AcademicCalendar
Canonical instructional calendar including school days, holidays, closures, exceptions, and make-up days. Program overlays may specialize the calendar without creating competing shadow calendars.

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
