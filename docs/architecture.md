# CAN OS Production Architecture

For current implementation and verification status, see [archived CURRENT-STATE.md](./archive/2026-11-fullflow/retired-plans/CURRENT-STATE.md). This document defines architecture, not a claim that each capability is deployed or accepted.

## Purpose

CAN OS is a production operating system for distributed Christian education. The prototype in `bryanhkelly/academy-union-core` is a UX and workflow reference only.

## Architectural stance

### Client-safe failures

Server functions use the shared Start function middleware to replace thrown
failures with a safe code/message before serialization. Authentication,
authorization, validation, conflict, unavailable, cancellation and unexpected failures use
explicit codes from `src/domain/errors.ts`; use `DomainError` for intentional
domain failures, never message-substring classification. Unknown exceptions are
logged on the server and receive generic client text. Diagnostic messages,
custom properties and original stacks are not copied across the wire. Router
redirects, not-found signals and Response control flow remain unchanged.
Sanitized failures are plain DTOs, not Error instances: Start's shallow Error
serializer retains only `message` and would discard the safe code and retry
flag. Serialization checks use the router's actual Seroval plugins. Placement
blockers use explicit `COURSE_*` codes with fixed remediation text, never raw
student, prerequisite or database diagnostics.

Loaders and mutation feedback share `normalizeClientError`; serialized error
objects do not need an Error prototype. Loaders retain context-specific sign-in
and permission presentation. Mutation feedback distinguishes command rejection
from a successful command followed by failed refresh and blocks repeat commands
after the latter. Ordinary Error messages are not approved client-facing text.
Pickup commands retain their request IDs after uncertain delivery. An acknowledged
command retires only its own ID, even when its subsequent refresh fails; retrying
that refresh must not discard IDs belonging to other unconfirmed commands.

### Application structure

CAN OS begins as a **modular monolith**, not a microservice system.

- One production web application
- One PostgreSQL system of record on **Neon**
- Clear domain-module boundaries
- Transactional domain events
- Server-enforced authorization
- Background workers only where asynchronous work is actually required
- External services for commodity capabilities such as email, SMS, video, payments, object storage, and AI foundation models

The domain-event worker may receive an explicit list of event IDs for bounded
operator replay. Both pending claims and stale-lease recovery stay within that
list; an empty list performs no work. This uses the ordinary handlers, leases,
retries and subscription processing, not a demo-specific consumer. An omitted
selection preserves normal queue-wide processing. Callers must establish which
records they are authorized to affect before invoking this internal worker.
Site room creation, updates, retirement and Section room assignments use the
same lifecycle pass-through handler and shared subscriptions as other audited
configuration facts; they must not remain unclaimed in the outbox.

Academic setup keeps already-assigned instructors selectable for coverage
reconfirmation. The existing assignment command rechecks current authority and
full-window qualifications, then idempotently creates missing delivery coverage;
a legacy teaching relationship alone must not make its repair inaccessible.

### Public school bootstrap and Site Admin

Public `/schools/new` bootstrap classifies supported `.demo` domains into new,
isolated canonical Organization/Site tenants. An explicit registry binds each
tenant's initial Site Admin to its account, person and grant; immutable normal
staff-invitation evidence binds subsequent shared-code staff. A domain suffix
or synthetic metadata is not authority. Creation, registry, audit and domain
events commit together, with domain-serialized, conflict-aware retries.

`site_admin` inherits registrar workflows within the same resource, scope and
relationship boundaries and adds school setup management. It does not become a
network administrator, bypass independent review or gain sibling-Site access.
Registrars cannot appoint or deactivate Site Admins. The bootstrap hands off to
normal Launch Studio and domain commands, not a duplicate demo product engine.
See [identity and demo access](./identity-and-demo-access.md) for shared-account,
delivery and deployment boundaries.

### Dates, timestamps and Site timezones

Staff attendance resolves its permitted Program and Site timezone on the server
before choosing the initial date. Offline marks are isolated in tab-lifetime
`sessionStorage` by verified account, grant, actor, effective scope, Site and
Program. The previous unscoped localStorage queues are discarded, never adopted
by whichever account next opens attendance. Restoration follows an authenticated
workspace read; synchronization revalidates that context and every replay carries
the expected identity for server comparison before the normal resource checks.
Workspace changes remount attendance state and stop subsequent replay requests.
Tab-only pending marks are lost when the tab closes; encrypted durable offline
attendance is not enabled. Supporting that requires a separately reviewed device
key lifecycle, expiry, logout purge, retention and shared-device threat model.

Launch supplementary reads distinguish `ready`, `empty`, `unavailable` and
`unauthorized`. A successful empty result is not a failed read. Program configuration
requires available jurisdiction guidance/research; outreach requires invitation
data; enrollment review requires admissions/enrollment counts; opening guidance
requires jurisdiction and enrollment reads. These are presentation prerequisites,
not new operating authority: canonical server Journey and independent opening
checks remain mandatory. A failed read cannot establish zero outstanding work.

`components/shell/route-navigation.ts` classifies every generated TanStack
destination with a primary navigation owner, supported personas and visibility,
or a reason for being hidden/non-navigable. Typecheck and the route-metadata unit
test reject unclassified routes. This is presentation metadata, never server
authorization. Interest Events belongs to Launch. The onsite-day deep link is
`/home?view=onsite&siteId=<site>&date=<school-date>`; the day view verifies the
requested Site against its server-returned onsite membership before loading it.

`src/modules/calendar/timezone.ts` owns calendar-date validation/arithmetic,
timezone date keys, local-input conversion, day boundaries and display.
Date-only values are strict `YYYY-MM-DD` calendar dates, not instants:
`formatDateOnly` never shifts them into a viewer's adjacent day. Timestamp
strings require an explicit UTC offset; `formatTimestamp` and local-input
conversion require an explicit resource timezone. Invalid values fail
validation rather than silently using the browser/server timezone.

Group and trip read models expose their canonical Site timezone. Scheduling,
rescheduling and display use that timezone, including trip permission deadlines,
and label it in the UI. The compatibility `siteLocalTimeToIso` wrapper rejects
nonexistent and ambiguous DST wall times; legacy calendar conversion keeps its
earlier-overlap default. Explicit earlier/later policies remain available where
the owning workflow supports them.

Attendance shares date keys, calendar-day arithmetic and day starts. Half-open
day bounds resolve actual local boundaries independently, including 23/25-hour
days, shifted midnight and skipped dates; wholly skipped input dates are rejected.
Expected-attendance query coverage includes each authorized Site's local date.
Site Today due dates and attendance-excuse dates display in the owning Site's
timezone. The staff attendance date picker retains its viewer-local initial
date; an explicitly selected roster date remains authoritative.

Learning registration deadlines use `todayInTimezone` with the canonical Site
timezone loaded from the Section's Site. Request, guardian-decision and
registrar-review checks must not derive a Site policy date from UTC's calendar
date or the viewer's browser timezone.

### Learning command context and curriculum import jobs

Teacher class requests retain their original teacher as the Action owner.
Operations links these requests to academic setup rather than offering generic
status changes or reassignment. Only the canonical class provisioning or
recorded-decline commands complete their lifecycle; resolving an operational
Action must not imply that a Section was provisioned.

Learning server functions reuse `requireActor` for verified role, person and
capability setup. Each owning command still checks its own Site/Program/Section
scope, current enrollment, guardian relationship and resource-specific rules;
the shared session boundary does not grant resource access.

OneRoster and Common Cartridge validation share only the idempotent curriculum
import-job transaction: lookup by Organization/format/content digest, create
the importer-supplied report and status, then append the importer-specific audit
record and DomainEvent transactionally. Format parsing, publisher authorization,
digest construction, metadata, report shape and validation/reconciliation
policies remain with each importer.

### Route search selections

`src/lib/route-search.ts` shares Site/Program and group/session selection
schemas. Routes compose those fields with their own supported parameters;
unknown keys are stripped rather than expanding every route's contract.
The group-only workspace does not acquire a session parameter, nor do
program-only routes acquire Site selection.

Existing URL policies remain distinct: ordinary selections preserve strings
(including empty strings) and ignore non-string values without coercion.
Attendance and admissions application UUID hints ignore malformed IDs;
curriculum's UUID Program selection still rejects them. Route-specific page
defaults/caps, stage allowlists, application/interest links, invitation roles,
website return grants and loader dependency mappings remain local contracts.
These selections are navigation hints only: server APIs still enforce resource
scope and relationships, and parsing never grants access or chooses an
authorized Site/Program on the user's behalf.

### Directory search and list presentation

Student and teacher directories share `useDebouncedDirectorySearch`: a 250 ms
trimmed-query debounce, disposed-request protection, client-safe errors and an
explicit retry. Stable domain adapters retain the existing authorized directory
APIs and row DTOs; this hook neither caches private records nor replaces server
scope checks. Requests already sent are ignored after disposal, not assumed
cancelled at the transport layer.

Directory and admissions pipeline tables compose existing `ui/table` primitives.
Columns, profile links, row headers and next-step decisions stay with their
owning routes. `PageNavigation` shares only labelled navigation, optional
noninteractive boundary indicators and link slots. Routes retain page arithmetic,
server-provided continuation values, total counts, search parameters and whether
unavailable controls are hidden or displayed. Intake preserves independent
application and student-directory pages; detail views do not acquire paging links.

## Core invariant

> One data model. One identity. One action system. One communication layer. One calendar. Many role-aware workspaces.

A workspace is a view over the user's identity, roles, capabilities, scope, and relationships. A workspace is not a separate identity or security boundary.

### Shared workspace presentation

Student/teacher directories and student/guardian report cards compose the existing
`WorkspaceShell`, `QueryState` and `EmptyState` components instead of duplicating
page headers and loading/error/empty markup. Query states are mutually exclusive:
loading precedes error, then a successful empty result, then content. An
unavailable guardian child shows an alert and never a misleading empty report.
Authorized students with no finalized grades still see the report and transcript
empty states. Directory searches retain their debounce and stale-response cleanup;
a successful retry clears the preceding error. Data loading and authorization
remain in the existing route/server functions, not a generic form or CRUD engine.

Student display preferences belong to the authenticated actor's canonical Person.
The verified workspace session projects only the parsed preference fields, never
the Person's full metadata, and does not apply them to staff or guardian roles.
Saving refreshes that shared session projection immediately. Density and reduced
motion are scoped to the student's workspace. The default section resolves
through a fixed route allowlist on sign-in, workspace entry and CAN OS home;
explicit Today and direct links retain their destinations. Hiding completed work
affects only the default All assignment list: returned work, explicit Submitted
and Feedback views, and exact completed-assignment links remain available.
Preferences do not change session identity, grants or academic records.

Reusable workflow controls are presentation-only compositions in
`src/components/workspace`: `SiteProgramFields` renders controlled School/Program
choices and clears the Program when the School changes, while callers own
authorized options, required/all-selection labels and navigation.
`LocalDateTimeField` labels the explicit resource timezone without converting
values or choosing a DST policy. `MutationFeedback` presents the shared mutation
state, distinguishing command rejection from saved-but-refresh-failed and
retaining real saved-record links where available.

Mutation coordination belongs to `useMutationFeedback` (direct commands) and
`useWorkspaceMutation` (React Query workspaces). Both synchronously reject
duplicate submissions and block further commands after a confirmed save whose
refresh failed. Recovery retries only captured reads, never the command or its
success callback. This client guard is not durable command idempotency.

A fulfilled invalidation is not evidence that refreshed data is usable:
`safeLoader` can resolve an error envelope, and query refetches can resolve an
error result. The application router validates settled active matches after
every invalidation. Shared mutation helpers also validate explicit safe-loader,
query, workspace-session and disconnected-read outcomes; successful empty
results remain valid. Read callbacks must return their awaited result or reject,
not start a background refresh or swallow a critical read failure. Optional
decorations must not conceal the canonical workflow.

Server-safe errors cross the client boundary as plain objects. UI consumers use
the allowlisted `mutationErrorMessage`/`normalizeClientError` helpers rather than
`instanceof Error` or arbitrary diagnostic messages. An unconfirmed command is
not described as definitely rolled back: a lost response may follow a commit.
Conference-series creation additionally accepts a stable request UUID with
transactional actor/scope/payload replay checks, so retrying the same creation
does not recreate slots, audit evidence or domain events.

Readiness messages identify a concrete blocker, the responsible actor and the
existing scoped workspace for the next action. Attendance setup messages
distinguish missing academic dates, schedules, years, enrollment and delivery
patterns; only a verified registrar/Site Admin with `academic_year.manage` is
offered academic setup links. Course catalog and guardian/registrar request
reads project a content-readiness boolean from the class's pinned version using
the placement service's accessible-lesson predicate. They never expose raw
curriculum through registration DTOs or certify full enrollment eligibility.
Pending requests/guardian permission may precede content readiness; approval
remains blocked until content is ready and the transactional enrollment command
rechecks all other guards. New published releases do not silently repin classes.
Qualification status messages distinguish teacher submission, independent
evidence review, replacement evidence and school-specific teaching eligibility.

`ActionDialog` uses the browser's modal dialog for focus containment and restores
the triggering focus on close. Cancel/Escape do not submit; pending commands
disable cancellation and inputs. Domain callers own rationale constraints,
consent language, command execution and when to close after success. Insights
uses a reason dialog and study-group rescheduling uses explicit local datetime
fields; server authorization and scheduling checks remain authoritative.
Operations resolution, deadline rationale and institutional enrollment exits also
use this dialog rather than native prompts. Enrollment exits require an explicit
institutional-review acknowledgment in addition to the handoff note. A committed
command closes its dialog even if refresh fails; further operations commands are
blocked until the workspace is refreshed. These controls reuse the existing
bounded domain commands and do not grant institutional authority.

Evidence and qualifications share `FileSelectionField` and `UploadedFileNotice`
for file selection/clearing and stored-bytes retry presentation. They do not
perform uploads or approve records: existing upload tasks, domain adapters and
private-document policies remain unchanged. Insights and qualifications reuse
`QueryState` for mutually exclusive loading, failure/retry and content states.

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

Physical classrooms are Site-owned `site_rooms`, not teaching Sections or
free-text-only daily locations. Launch setup creates reusable room identities
and records default Section locations through scoped, audited domain commands.
The Section's `physicalRoomId` metadata reference is resolved against its exact
Site before assignment. New onsite coverage plans select a saved room and check
its canonical capacity on the server; reviewed documents keep their snapshots.
Neither catalog creation nor default assignment grants opening, inspection,
exclusive scheduling, staffing or supervision authority.
Room editing and retirement use expected revisions, Site-serialized commands,
and transactional audit/events. Retired identities and names are retained;
new use is rejected server-side, including independent approval of pending
plans. Existing defaults require explicit replacement or clearing, while
approved plan snapshots are not rewritten or revoked by catalog changes.
Catalog retirement is not emergency closure.

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

Learning uses `guardianRelationshipPredicate` for guardian academic visibility,
course-enrollment authority, conversation recipients, attachment visibility and
academic notification recipients, including batch queries. Academic viewing,
enrollment management and attendance-excuse permissions remain independent;
an empty student batch matches no relationships. Capability, verified role,
site/program scope, current enrollment and document-specific checks remain in
the owning workflow. The predicate is a shared SQL policy fragment, not a
replacement authorization service.

Conferences, field trips, study groups, contextual messaging, school profiles,
workspace search and office-hour booking also reuse this predicate. Conference
and academic views retain academic permission; trip invitation/consent eligibility
and study-group consent retain enrollment permission. Trip signature verification,
emergency-contact lookup and family messaging contacts that historically require
only the relationship remain relationship-only. Correlated consent-signer joins
still enforce their document and student checks; no lifecycle or scope checks
move into the predicate.

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

## Private document eligibility

`verifiedPrivateDocumentPredicate` shares the storage-eligibility checks for
class resources, profile photos, student/teacher submission files and guardian
excuse downloads: exact subject and category, private R2 provider, recorded
verification, and no expired authorization. Workflows add uploader or sensitivity
constraints where required and retain their capability, relationship, enrollment,
linked-document and object-key scope checks before signing a URL.
Submission listings use the same eligibility as downloads; expired, pending,
wrong-subject or wrong-owner files are not presented as downloadable attachments.
Assignment and excuse downloads now reject expired document records, matching
the existing class-resource and profile-photo behavior. Upload completion still
clears the temporary assignment-upload expiry when verification succeeds.

This is a SQL policy fragment, not a generic document workflow or CRUD service.
Existing storage signing, bounded verification and domain upload lifecycles
remain in place. Enrollment documents use a separate metadata-based storage
verification and human-review lifecycle; they are deliberately not treated as
`verifiedAt` download records by this predicate.

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
