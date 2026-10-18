# CAN OS Production Architecture

For current implementation and verification status, see [CURRENT-STATE.md](./CURRENT-STATE.md). This document defines architecture, not a claim that each capability is deployed or accepted.

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

## Ask CAN agent platform

Ask CAN is the primary interaction surface for CAN OS, not a late-stage feature. Natural-language conversation produces real domain objects — subscriptions, actions, communication threads — under the same authorization context as the UI.

The platform is three modules inside the monolith: **Conversation** (durable threads, evidence, deep links, action previews), **Agent Runtime** (tool registry, planning, approvals, execution state, scoped memory), and **Event & Subscription** (standing instructions, triggers, recurring schedules, delivery). They share canonical identity, Actions, DomainEvents, and AuditEvents rather than creating parallel infrastructure, and they are the first extraction candidates if measured scale ever justifies services.

Full design: [ask-can-agent-platform.md](./ask-can-agent-platform.md).

## Capability dependency sequence (architectural roadmap, not current work queue)

1. Domain model + Neon migrations
2. Identity and authorization
3. DomainEvent / AuditEvent / Action foundations
4. **GF23 School-Year Setup** — canonical time/calendar/grading prerequisite
5. GF3 Host / Program Launch
6. GF22 Admissions Pipeline
7. GF2 Accepted Student → Active Enrollment
8. GF1 Academic Intervention
9. GF4 Attendance + Parent Excuse
10. Experience Flow N1 Contextual Notification → Action
11. Experience Flow P1 Parent Needs You / Family Home
12. Experience Flow S1 Student Today
13. GF25 Report Card & Transcript
14. GF26 Study Group / Peer Connection
15. Ask CAN over real authorized data — GF-A1 Ask, GF-A2 Watch, GF-A3 Do (see [ask-can-agent-platform.md](./ask-can-agent-platform.md)); the Conversation / Agent Runtime / Event & Subscription foundations are platform primitives and may be built alongside the flows above, with each GF-A flow landing after the flow it observes

Finance/ESA claim and disbursement workflows are intentionally deferred from the initial four-flow release.


## Experience architecture

Golden Flows validate durable business processes. Experience Flows validate how a person enters, understands, and completes work across those processes.

The two must share the same primitives:

- DomainEvents create context, not generic alerts.
- Notifications always resolve to an authorized resource/context target.
- Work requiring a human becomes an Action and can aggregate into role-specific "Needs You" queues.
- Parent and Student home experiences are read models over canonical domain state; they do not own duplicate workflow state.
- Student Today reads the canonical SchoolYear/Term/Calendar/Schedule/Assessment data.
- Family Home aggregates each child's canonical status rather than maintaining a separate family dashboard state.


## Agent-to-academic service boundary

The Agent Runtime does **not** query academic tables directly. Its tool
`get_student_academic_summary` delegates to the Learning module's
`academic-domain-api.ts`, which owns student resolution, guardian/teacher/self
relationship checks, enrollment-scoped section visibility, grade/assignment
queries and evidence generation.

```text
Agent Runtime
  -> Typed Agent Tool (platform/agent/tools.ts)
  -> Academic Domain API (modules/learning/academic-domain-api.ts)
  -> Academic queries and authorization (Learning module)
  -> Canonical academic tables
```

A future external academic service can replace the implementation behind this
contract without changing Ask CAN's planner, approval logic, tool registry, or
chat UI. New academic capabilities should be introduced as module contracts
rather than direct cross-module SQL.
