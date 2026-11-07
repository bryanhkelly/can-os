# CAN OS Canonical Domain Model

**Status:** Canonical domain vocabulary and invariant guide, subject to verification against current migrations and code. This is not a schema dump or a claim that all planned relationships are implemented.

## Core graph

| Concept | Meaning | Invariant |
| --- | --- | --- |
| Organization | Institutional or partner organizational boundary | Explicit identity and authorized relationships |
| Site | Physical or operational school location | Local operating authority and jurisdiction are scoped |
| Program | Academic offering under an approved institution | Academic provider and credentialing relationships are explicit |
| Section | Delivery instance of a course within program/time | Enrollment and instructional assignment are independently governed |
| Account | Authenticated access identity | Does not itself establish institutional membership |
| Person | Canonical human identity | Reused across roles and relationships |
| Role grant | Authorized capability and scope assignment | Evaluated server-side with relationship evidence |
| StudentProfile | Student-specific record attached to Person | No duplicate student identity for each portal |
| GuardianRelationship | Verified guardian/student relationship | Determines access and consent, not surname |
| SchoolYear / Term | Effective academic time | Scoped to the approved school context |
| Course / Version | Academic content and its pinned release | Active sections do not silently change published content |
| Enrollment | Student membership in a program/section | Explicit lifecycle, dates, and audit trail |
| Assignment / Submission | Academic work and student response | Authorized and versioned evaluation context |
| AttendanceEvent | Recorded attendance fact | Distinct from expectation and excuse disposition |
| Action | Canonical work item | Explicit owner, scope, lifecycle, and escalation |
| CommunicationThread | Authorized correspondence | Recipient visibility and delivery are relationship-scoped |
| CalendarEvent | Canonical scheduling artifact | Updates and cancellation propagate |
| DomainEvent / AuditEvent | Mutation evidence | Persisted with relevant durable business changes |

## Authority is not identity

An academic provider, credit issuer, school of record, local host, and denomination can be separate organizations. Their roles must be explicitly modeled and checked. A Site Admin is the final local operating authority for website and site setup, subject to CAN institutional controls, legal requirements, and student protection.

## Curriculum and instruction

Publisher-owned versions, institutional entitlements, Program/Site adoption, classroom Section pointers, and local overlays are distinct. Student choice of approved curriculum and presenters is a product requirement; a responsible instructor assignment and a room facilitator are different roles. Live tutoring does not automatically create a scheduled live teaching requirement.

## School lifecycle

Interest, partner authorization, school profile, launch preparation, opening approval, active operation, and closure/transfer are different states. A completed launch card or published website does not by itself authorize operation.

## Data and event invariants

- Use one authoritative lifecycle for each entity; avoid screen-specific shadow states.
- Preserve history for enrollment transfers, academic records, section changes, and approvals.
- Validate capabilities, resource ownership, and relationship scope on reads and writes.
- Keep consequential state transitions auditable and idempotent where appropriate.
- Do not infer approvals, safeguarding compliance, accreditation, or credential eligibility from fixture data.

## Reconciliation required

Before changing schema or service code, compare this vocabulary with current tables, migrations, and domain commands. Record missing concepts as planned work rather than silently claiming implementation. The former `docs/domain-model.md` remains a provisional technical reference until its source references are reconciled and archived.
