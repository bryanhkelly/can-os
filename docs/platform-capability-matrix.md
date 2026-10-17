# Phase 1 — Canonical capability matrix

Status reflects code evidence, **not** production acceptance.

| Capability | Existing owning areas | Convergence requirement |
| --- | --- | --- |
| Identity and authorization | identity, access-context, command-context | One server-resolved account/person/grant/scope path, all reads and commands |
| School topology | organizations, programs, operations | Organization → Site → Program → Section, independent of organization type |
| Academic time | academic-time, calendar, section planning | Site-effective school year, term, grading period and schedule |
| Student / household | identity, family, profiles | One Person and StudentProfile, explicit GuardianRelationship |
| Admissions → enrollment | enrollment, journeys | One household/student identity graph across states |
| Capacity / staffing | staffing, programs, enrollment | Shared staffing allocation and seat calculations |
| Learning | learning, student-experience | Course/section/assignment/submission/grade contracts |
| Attendance | attendance, family | Single attendance event and reviewed excuse lifecycle |
| Actions and support | actions, support, operations | One Action command/query system, contextual queues |
| Communication | communication, notifications, subscriptions | One messages/alerts delivery model with verified recipients |
| Calendar / scheduling | academic-time, calendar, platform/scheduling | Canonical events with edit/cancel/update propagation |
| Ask CAN | platform/agent, conversation | Typed authorized domain commands, no direct ad hoc writes |
| Activities / groups | activities, study-groups, field-trips | Unified student context, consent, scheduling, auditing |
| Health / incidents | health, incidents | Restricted sensitive fields and mandatory legal/security gates |

## Mandatory acceptance contract

Every surfaced capability needs: authorized entry, valid and invalid paths, canonical persistence, refresh consistency, cross-role visibility, downstream propagation, audit evidence, and multi-actor tests. A synthetic sample must behave identically to an authentic record subject to normal authorization and configuration.
