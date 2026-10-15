# CAN OS Production Architecture

## Purpose

CAN OS is a production operating system for distributed Christian education. The prototype in `bryanhkelly/academy-union-core` is a UX and workflow reference only.

## Architectural stance

CAN OS begins as a **modular monolith**, not a microservice system.

- One production web application
- One PostgreSQL system of record on **Neon**
- Clear domain-module boundaries
- Transactional domain events
- Server-enforced authorization
- Background workers only where asynchronous work is actually required
- External services for commodity capabilities such as email, SMS, video, payments, object storage, and AI foundation models

## Core invariant

> One data model. One identity. One action system. One communication layer. One calendar. Many role-aware workspaces.

A workspace is a view over the user's identity, roles, capabilities, scope, and relationships. A workspace is not a separate identity or security boundary.

## Organization model

Do not encode "church" as the root production primitive.

```text
CAN
  -> Organization
       -> Site
            -> Program
                 -> Section
```

Organization types may include:

- CAN network
- Denomination / network partner
- Church
- Christian school
- Microschool operator
- Consortium
- Other partner

Program types may include:

- Church-hosted academy
- High-school extension
- Full school
- Microschool
- Hybrid program
- Homeschool cohort
- Summer / enrichment program

## Database

**Neon PostgreSQL** is the transactional source of truth.

Use PostgreSQL relationships for the person, organization, curriculum, enrollment, and action graphs. Do not add a graph database unless a measured production requirement later justifies one.

Recommended production data characteristics:

- UUID primary keys
- UTC timestamps
- immutable audit rows
- explicit status/state machines
- foreign keys wherever practical
- unique constraints for identity and lifecycle invariants
- row filtering enforced in application policy first, with database-level protections added where useful
- migrations checked into the repository

## Events

Domain events are durable facts such as:

- AssignmentPublished
- AssignmentBecameMissing
- SubmissionReceived
- GradePosted
- StudentMarkedAbsent
- AttendanceExcuseSubmitted
- AttendanceExcuseApproved
- EnrollmentActivated
- JourneyRequirementCompleted
- ActionCreated
- ActionResolved

Initial event architecture should use the transactional outbox pattern:

1. mutate business data;
2. insert DomainEvent in the same PostgreSQL transaction;
3. commit;
4. worker processes unhandled events;
5. handlers create notifications, actions, derived metrics, or integrations.

Do not introduce Kafka or a distributed event platform for v1.

## Authorization

Authorization is not portal-based RBAC.

```text
permission = capability + resource + scope + relationship
```

Examples:

- Teacher may grade submissions for Sections they teach.
- Guardian may view a Student through an active GuardianRelationship.
- Site operator may read students currently attached to the operator's Site.
- Network staff may have broader scope only when explicitly assigned.
- Ask CAN receives exactly the same authorization context as the UI.

Object access and field access are separate. Sensitive fields include medical, counseling, discipline, family financials, internal notes, and formation records.

## Production build order

1. Domain model + Neon migrations
2. Identity and authorization
3. DomainEvent / AuditEvent / Action foundations
4. GF1 Academic Intervention
5. GF2 New Family Enrollment
6. GF3 Host / Program Launch
7. GF4 Attendance + Parent Excuse
8. Broader product depth
9. Ask CAN over real authorized data

Finance/ESA claim and disbursement workflows are intentionally deferred from the initial four-flow release.
