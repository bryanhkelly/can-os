# Educational capacity model

CAN separates instructional eligibility from instructional capacity.

- **Qualification/compliance** answers whether a person may teach.
- **Instructor capability** answers what the person can teach.
- **Availability** answers when the person can teach.
- **Capacity offering** answers where/how the capacity can be used and the maximum number of students it can support.
- **Section demand** expresses how many instructional seats a section needs.
- **Reservation** allocates seats from an offering to section demand.

## Canonical flow

1. Record an instructor capability by course template or subject.
2. Record an availability window and optional weekly pattern.
3. Publish one or more capacity offerings scoped to organization/site/program/jurisdiction and modality.
4. A section creates a capacity demand with expected seats and delivery window.
5. Candidate matching requires:
   - matching course template or subject,
   - compatible modality,
   - compatible organization/site/program/jurisdiction scope,
   - an availability window covering the section demand.
6. Remaining seats are derived from open offering capacity minus active, unexpired held/committed reservations.
7. Reservation uses an advisory transaction lock on the offering so concurrent schools cannot oversubscribe the same capacity.
8. A **held** reservation supports planning. A **committed** reservation also creates the canonical `section_teachers` assignment.

### Reservation expiry

A reservation is current only when its status is `held` or `committed` and
`expiresAt` is absent or strictly later than the evaluation time. At the expiry
instant it stops consuming offering seats and stops covering section demand.
Candidate matching, instructor totals, reservation/replacement calculations,
launch readiness, committed-seat enrollment checks and operational capacity
exceptions share this rule.

New or renewed reservations reject past, current or invalid expiry dates.
Delivery arrangement creation and activation lock and recheck the referenced
reservation, rejecting inactive/expired capacity before assigning an instructor
or activating delivery. A reservation must be renewed or replaced explicitly;
activation does not silently extend its expiry.

Time passing does not rewrite historical reservation status, remove a canonical
teaching relationship or cancel delivery. Expired capacity surfaces as a coverage
gap; explicit release/replacement remains responsible for operational changes.
Section reschedule/closure and manual teacher-replacement guards still require
explicit reservation reconciliation, including expired rows whose stored status
is held/committed.

### Delivery activation retries

Activating a delivery arrangement acquires the site configuration lock, then
re-reads and locks the exact arrangement before deciding whether to transition.
`proposed`, `reserved` and `ready` arrangements can become `active`; `completed`
arrangements cannot be reopened through activation.

An already-active arrangement is a no-op only after the caller's capability,
section/program/site scope and any linked reservation's current validity are
checked again. A successful retry changes no timestamps, adds no teaching
assignments, and writes no extra activation audit/outbox records. In particular,
retrying activation is not a way to restore a removed teaching assignment.
Active arrangements whose linked capacity expired or was released return an
explicit error rather than silently recommitting it.

### Current operational delivery

The current-delivery read includes only `active` arrangements whose
`effectiveFrom` is absent or at/before the evaluation time and whose
`effectiveThrough` is absent or strictly later. The start is inclusive and the
end exclusive. Undated legacy arrangements remain effective; empty/inverted
windows never qualify. Among effective arrangements the most recently updated
one is selected, with ID as a deterministic tie-breaker. Newer future, ended or
completed arrangements do not hide a currently effective arrangement.

Operational readiness uses the same evaluation instant for delivery, capacity and
qualification evidence. Missing effective delivery is a blocker and does not
display qualification evidence for an out-of-window instructor. This read
neither changes arrangement status nor removes teacher assignments or writes
audit/events. It reports current delivery, not guaranteed coverage throughout
a future term.

### Launch staffing and qualification coverage

Launch academic setup and program activation use the explicit `launch` readiness
mode. Unlike current operational delivery, it evaluates the instructional window:
each explicit section timestamp takes precedence over its corresponding term
boundary. Missing bounds use term start at local midnight and midnight after the
inclusive term end, in the school-year timezone. The resulting interval is
start-inclusive/end-exclusive and must be nonempty.

All assigned instructors must have an active Person and a matching teacher role
in the host or academic-provider organization, with any role site/program
restrictions respected. At least one assigned instructor's active delivery
arrangement must cover the entire window. Undated legacy arrangements have open
bounds; split-instructor rotations are not yet a coverage-planning feature.

Eligibility uses published compliance framework versions and their
organization/site/program/jurisdiction/teacher-role applicability. Every
applicable rule must hold throughout the window, including intermediate policy,
issuance and expiry boundaries. The latest append-only verification sequence
determines each claim's current status. Credential types are qualification
definition keys; optional jurisdiction criteria use jurisdiction codes.
Missing policy, empty frameworks, invalid expressions and unsupported evidence
policies block rather than authorizing teaching. An unrelated approved
qualification cannot satisfy a configured requirement.

The launch page lets a scoped registrar with `staffing.policy.publish` publish
the program's initial requirements from existing qualification catalog entries.
All selected entries are required; explicit review confirmation is recorded.
This creates a framework, published version with immutable rule content, and applicability
with audit/outbox evidence in one transaction. It does not approve credentials
or certify regulatory compliance. Initial publication and revisions are limited
to pre-opening programs. Persisted exceptions are not used to waive launch requirements.

### Future-dated teacher policy revisions

Launch setup displays published version history, complete qualification sets
and effective instants in UTC. Revising requires both the registrar session
capability and an explicit database RoleAssignment containing
`staffing.policy.publish`, an active Person, same-organization membership and
matching organization/site/program scope. This additional institutional grant
is required for revisions, not retroactively for initial publication. No grants
are provisioned automatically.

A publisher supplies the expected latest version, the complete replacement
qualification set, a future effective instant after the latest version's start,
a reason and explicit confirmation. In one transaction under the shared site
lock, the command creates the next published version, rule and applicability,
and closes the predecessor's effective interval at that instant. Rule content
is never edited: only the predecessor's supersession bound changes. An immutable
AuditEvent records its before/after bounds, both version references, requirements,
reason and confirmation; a transactional DomainEvent records the revision.
Identical retries reuse the committed successor without duplicate evidence;
changed or stale requests reject. Specialized or noncanonical policy chains
require a separately reviewed migration rather than an implicit rewrite.

The predecessor applies before the change instant (exclusive end), and the
successor applies from that instant (inclusive start). Existing organization,
site and jurisdiction policies still apply. Assignment and opening evaluate
every applicable version throughout instruction, including a change inside a
term. Publishing never removes assignments, approves evidence or waives
requirements. A newly ineligible assigned instructor blocks opening until
resolved. Active-program policy changes, policy exceptions and automatic
post-opening access enforcement remain outside this workflow.

### Shared qualification catalog authoring

Launch setup offers create-only catalog authoring to an explicitly granted
steward. The registrar session capability `profiles.catalog.create` is necessary
but not sufficient: a database RoleAssignment must explicitly contain the same
capability in the program's host organization, with matching site/program
restrictions, an active Person and membership in that same organization. The
loader and command use the same predicate, and the command checks it again on
every invocation, including retries. No catalog-steward grants are created
automatically, and a policy-publisher or credential-verifier grant alone does
not grant catalog authority.

The steward supplies a stable lowercase key, display title, extensible
classification key, reason and explicit confirmation that existing entries were
checked. New basic evidence-backed definitions use schema version 1 and an empty
attribute schema. The unique shared key resolves identical retries without
duplicate audit/outbox records; conflicting title/classification/schema returns
an error instead of overwriting the entry. Existing definitions cannot be edited
or deleted by this workflow, and specialized attribute-schema authoring remains
outstanding.

The new definition and its provenance AuditEvent/DomainEvent are committed in
one transaction. Creation does not add policy rules, modify published
requirements, create claims or approve eligibility. The refreshed catalog can
then be selected for separate policy publication and teacher submission.

### Private qualification submission and review

Teachers with a current scoped teacher affiliation can submit private PDF,
JPEG or PNG evidence from their own profile. Submission creates a new immutable
claim, restricted Document and pending review event atomically. Renewal or
correction creates a new claim rather than overwriting approved evidence.
The generic form supports catalog entries without specialized attribute schemas;
other entries require a specialized submission form and fail explicitly.

Launch setup includes independent review for a selected program teacher.
The registrar session capability is necessary but not sufficient: the existing
database-backed verifier policy still requires an explicit
`profiles.credentials.verify` RoleAssignment capability, actor membership,
subject affiliation and intersecting scope. No verifier grants are created by
this feature, and no self-review is permitted. Approval requires verified
private qualification evidence; rejection/revocation require a recorded reason.
Review commands compare the displayed decision sequence under the claim lock
and reject stale actions. The shared review service accepts the caller's
transaction so claim creation/submission and review/evidence checks do not
escape their atomic boundary.

The workspace distinguishes historical review status from current expiry,
retains decision history and provides audited 60-second evidence links. Current
history lists the 100 most recent claims and explicitly indicates truncation.
After a decision, launch setup reloads server-computed eligibility and blockers.
Public profiles and related family/student views do not display credential
records. Live uploads require the separate deployment gate described in
[private storage](./cloudflare-r2-enrollment.md#qualification-evidence).

Both optional-instructor provisioning and Add instructor use the same
`assignLaunchInstructor` command. It rechecks eligibility under the site lock,
preserves co-teachers, creates the canonical teacher relationship and dated
delivery, and writes immutable eligibility snapshots referring to verification
events plus audit/outbox evidence. Valid retries add no assignment, notification,
snapshot or activation event; revoked/expired eligibility still rejects a retry.
Site-bound explicit teacher replacement also uses this command, then completes
the outgoing instructor's delivery and removes its teaching relationship.
Site-less legacy replacement remains unchanged.

Program activation rechecks launch staffing under the same site lock, locks
credential parent rows against canonical review, and captures the actual rule
and verification-event references in its activation audit. This is an opening
gate, not an automatic post-opening revocation of class access. Existing
capacity-reservation, Journey and school-year gates remain in force.

## Why seats, not FTE

The network problem is cross-school cohort allocation. A teacher may support 25 students across multiple schools even if no single school can economically employ that teacher. Seats therefore provide a useful allocation primitive:

```
maxSeats - activeReservedSeats = remainingSeats
```

HR/FTE and contract workload can be modeled separately without changing instructional capacity allocation.

## Scope semantics

A null offering scope means no restriction at that level. For example:

- jurisdiction only + live_online = available to compatible programs throughout the jurisdiction;
- site + onsite = capacity usable only at that physical site;
- program = capacity reserved to one program;
- no organization/site/program + live_online = network-wide supply, subject to any jurisdiction restriction.

## Operational truth

Capacity planning does not replace existing academic records.

- `instructional_capacity_reservations` is the allocation/planning truth.
- `section_teachers` remains the operational teaching assignment.
- Committing capacity bridges the two.

This allows Launch Studio and staffing planners to reserve future capacity without prematurely creating operational assignments.
