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

Activity, conference, and field-trip commands use the existing `writeAudit` and
`emitEvent` helpers inside the same database transaction as their business
writes. This includes activity/season creation, registration and withdrawal,
calendar publication, conference-series creation and reminder queuing, both
conference outcomes and follow-up Actions, trip consent, chaperone safety grants,
attendance and incident linkage. Existing no-op retries do not append duplicate
evidence. Reminder requests remain explicit sends, not deduplicated retries.
Reminder queuing checks the booking's site scope. Incident linkage checks both
resources' scopes and requires the same site and, for program-specific trips,
the same program before writing the association or evidence.
Audit/event payloads carry resource references, scope and decision metadata,
not private conference notes, consent signatures or medical evidence.
Integration regressions inject audit and event failures and verify business
writes and mutation evidence roll back together; no separate mutation framework
or schema migration is needed.

### Scheduled activities and calendar projections

`ScheduledOccurrence` is the shared record for the time and delivery scope of
one scheduled instance. `CalendarEvent` remains the calendar-facing
representation, including its title, description, display type, participants,
and source metadata; its `scheduledOccurrenceId` points to the occurrence.
CalendarEvent's existing time/scope columns remain as a compatibility copy for
current readers. Shared writers synchronize them transactionally; migration
triggers also bridge inserts and schedule/scope updates from older application
instances during rolling deployment.
Domain aggregates such as FieldTrip, ConferenceSlot, Activity occurrence, and
StudyGroupSession continue to own their specialized lifecycle, eligibility,
attendance, and approval rules.

Writers create or update the occurrence and calendar projection in the same
transaction through the shared calendar projection API. Domain-owned events
must still be changed through their owning workflow. This additive boundary
allows common schedule queries and future calendar capabilities without
collapsing unrelated business processes into a universal Event entity.
Calendar month, study-group visibility, Site Today, Student Today, and School
Experiences reads now take schedule and scope from `ScheduledOccurrence`.
`CalendarEvent` retains synchronized compatibility columns for older consumers
and domain-specific workflows. Remove the database bridge and compatibility
columns only in a later contract migration, after old application instances and
all remaining readers/writers have been retired.

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

### Workspace shell and navigation lifecycle

The root route resolves minimal workspace display context on the server through
the Identity module's `readWorkspaceSession` service, also used by
`GET /access/session`. The initial HTML contains the verified role-aware
navigation; hydration does not start a second account bootstrap. Responses with
workspace context are private and must not be cached by a shared CDN.

One React Query session entry feeds the persistent shell, application entry,
and command palette. It revalidates on window focus and every minute while the
app is active. A changed verified identity, active grant, or scope discards the
mounted workspace through a document reload. Login, membership switching and
logout deliberately retain document navigation to discard previous identity
state and caches. Session infrastructure failures are reported explicitly, not
converted into successful signed-out responses.

Ordinary internal links, scope selectors and search destinations use TanStack
Router navigation. Resource URLs retain their query and fragment. External
resources and file downloads retain native browser navigation. Root display
context is not an authorization cache: every protected read and command still
resolves and enforces its own server access context.

Route loaders and components are code-split separately. The shared pending
component lives inside the route outlet, leaving the shell available while
page-specific code and data load during client navigation. Route reference
metadata remains eager; unrelated page implementations and loader dependencies
are lazy. Full-document server rendering can still wait on page loaders;
database read-model latency is a separate optimization from shell hydration.


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

Academic student discovery and summary section selection use one shared
relationship-and-scope predicate. An explicit nonempty program grant is required;
supplied site/section scopes further restrict it, including empty lists. Only
active section enrollments in active sections qualify. Guardian academic
visibility, student self-access, and the teacher's assignment are checked at
each section, so teaching one class does not expose that student's other classes.
Approval-time academic access is rechecked before a watch is created.

Conference booking and rescheduling enforce current guardian relationship,
explicit site/program scope, school enrollment and (for section-scoped series)
active section enrollment inside their canonical commands. UI callers cannot
disable these invariants with an optional command parameter.

Student-section academic Actions share one resource policy across direct
Insight acceptance, operational acceptance, assignment, status changes and
resolution. Authority requires explicit organization/program scope, explicit
site scope for site-backed sections, an active section enrollment matching the
recorded delivery scope, and a current teacher assignment or active
registrar/specialist grant. Assigning an owner does not confer authority.
Supplied section scopes further restrict access, including empty lists.

The direct Action resolver is bounded to these academic interventions, not a
universal override for consent, referrals or moderation. Operational site-wide
follow-ups retain their existing scoped operations path; referrals retain
their owning lifecycle. Academic resolution locks the Action, checks authority
even on retries, rejects cancelled work and blank notes, and writes its audit
and outbox event once. Withdrawn enrollment or an inactive section currently
denies academic mutation; historical follow-up requires a separately defined
policy rather than falling back to generic mutation.

School-Year Studio calendar-day create/update, Program Launch orientation and
site creation, and launch teacher assignment write their audit evidence in the
same transaction as the mutation. Calendar/launch changes that feed downstream
projections also emit scoped domain events. Repeating an already-active launch
teacher assignment is a no-op and does not create another arrangement or
duplicate evidence. Audit writers receive the verified command context so
request IDs are retained.
