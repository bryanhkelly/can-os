# Phase 1 — Integration map and invariants

## Ownership

- Identity owns Account, Person, role grants and relationships.
- Programs owns organization/site/program/section lifecycle.
- Academic Time owns school year, term, grading period and effective schedule.
- Enrollment owns application, offer, enrollment and seat lifecycle.
- Learning owns assignments, submissions, feedback, grades and academic record.
- Attendance owns attendance facts, excuses and outcomes.
- Actions owns shared work state, ownership and escalation.
- Communication owns human threads and delivery outcomes.
- Calendar owns visible events derived from authoritative scheduling.
- Ask CAN calls the same domain APIs under the same command context.

## Main dependencies

`Organization → Site → Program → SchoolYear → Sections → Staffing → Offer → Enrollment → Course access → Academic activity → Grading/Support`

`SchoolYear + Schedule + Enrollment → Attendance expectation → AttendanceEvent → Guardian excuse → Site review → Metrics`

Every consequential domain transaction should write its event and audit evidence together; downstream read models use canonical identifiers and do not invent shadow statuses.

## Synthetic vs authentic records

No special UI, route, service, access policy or alternate state machine is permitted merely because records originated from fixtures. Synthetic fixtures remain test data only. Apply identical authorization, business validation and lifecycle effects. Isolation of disposable tests remains mandatory and distinct from product semantics.

## First implementation cut

Workspace navigation now suppresses persona browsing for signed-out visitors and offers only verified membership grants for signed-in users. Further changes must consolidate operations and student parallel data pipelines before deleting their legacy code.
