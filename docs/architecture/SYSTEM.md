# CAN OS System Architecture

**Status:** Canonical architectural principles and system boundaries. This is **not** a claim that every implementation detail has been verified against the current main commit.

## Architecture principles

CAN OS is a modular monolith with TypeScript/React and a PostgreSQL system of record on Neon. Domain modules own their commands, queries, authorization, persistence, and events. A screen, demo persona, or workflow step does not create a separate source of truth.

The product has one canonical identity, school topology, action system, communication layer, calendar, and event/audit model, with role-aware experiences on top.

## Institutional topology

`Organization → Site → Program → Section` is the baseline. A Site is a physical or operational location, while a Program defines an approved academic offering. Explicit attributes and relationships distinguish the academic provider, school of record, credit issuer, local host, and network governance.

Do not infer legal or credentialing authority from a site name, URL, or partner brand.

## Service boundaries

| Boundary | Owns | Must not duplicate |
| --- | --- | --- |
| Identity / access | Account, Person, role grants, relationships, access context | Per-portal authorization or demo-only identity |
| Organizations / programs | Institutional topology, sites, programs, sections | Alternate school graphs |
| Academic time | School year, terms, grading periods, effective schedules | Local screen-specific calendars |
| Enrollment | Inquiry/application/offer/enrollment transitions and capacity checks | Independent admissions status machines |
| Learning | Courses, versions, lessons, assignments, submissions, grades, progress | Parallel student progress records |
| Attendance | Attendance facts, expectations, excuses, review outcomes | Separate facilitator/registrar attendance truth |
| Actions / support | Work items, ownership, escalation, intervention state | Untracked inbox-specific tasks |
| Communication | Threads, delivery intent, verified recipients | Unscoped notification senders |
| Calendar | Canonical events and scheduling visibility | Uncoordinated event copies |
| Content / publishing | Curriculum rights, resources, website drafts, publishing | Unreviewed public exposure of private assets |
| Reporting / Ask CAN | Scoped reads and authorized domain commands | Direct agent database writes |

These boundaries are architectural intent. Verify concrete module paths and APIs before editing.

## Authorization

Server enforcement is **capability + resource + scope + relationship**. A client-side role switch, hidden control, or guessed tenant ID does not grant access. Commands validate institutional, Site, Program, Section, and record-level scope as applicable. Ask CAN uses the same access context and bounded commands as a human.

Sensitive student, guardian, health, safeguarding, and incident information requires the appropriate additional access and privacy checks. Shared synthetic demo tenants must never contain authentic private records.

## Mutation contract

Durable business commands should be transactional, validate current state, enforce idempotency where applicable, and persist audit/domain-event evidence with the state change. Downstream views must use canonical IDs and explicit state transitions. Do not silently manufacture completion states or approvals.

## Operational safety

Before database writes or migrations, identify the exact environment and database branch. Use disposable databases for fixture-writing tests. Production deployment, a successful build, and schema generation do not constitute full release acceptance.

Preserve existing runbooks and security gates until code-verified replacements are available. In particular, do not move `docs/platform-route-contracts.json` without changing its script and CI consumers together.

## Architecture verification checklist

For each module, record its actual source owner, routes, commands, tables, migrations, tests, and integration dependencies from the **current main commit**. Identify differences from these principles as explicit work items. Do not copy old FullFlow branch-specific implementation claims into current-state assertions.

## Historical references

The previous `docs/architecture.md`, `docs/domain-model.md`, and `docs/platform-integration-map.md` contain useful design decisions and dated implementation notes. They remain transitional references until reviewed and archived. Historical FullFlow execution plans are not architecture authority.
