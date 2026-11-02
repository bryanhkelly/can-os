# CAN OS Golden Flows

This is the canonical catalog of **specified** golden and experience flows, not proof of execution or production readiness. Historical development labels `GF40`, `GF41`, and `GF41B` appear in archived feature notes but are **not currently defined as Golden Flows in this catalog**. See [feature tracks](./FEATURE-TRACKS.md); do not renumber tests or APIs silently.

Golden Flows are the unit of production delivery. A feature is not considered complete merely because its page exists.

## GF1 — Academic Intervention

### Goal
Prove that one academic fact propagates correctly across teacher, student, family, and support workspaces.

### Flow
1. Teacher publishes an assignment to a Section.
2. Enrolled Student sees the assignment.
3. Deadline passes without a valid Submission.
4. Assignment becomes Missing while preserving the correct assignment lifecycle.
5. DomainEvent is written.
6. Student receives appropriate notification / Today update.
7. Guardian sees the missing item in family Needs You.
8. Teacher sees missing-work queue.
9. Coach/site support view receives the intervention signal.
10. Insight recommends support.
11. Human accepts or policy creates an Action.
12. Guardian and teacher communicate in the same contextual thread.
13. Student submits after deadline.
14. Submission records Submitted + Late as separate dimensions.
15. Teacher grades.
16. GradePosted event updates the student/family views and any mastery calculation.
17. Support Action resolves with resolution note.
18. Audit trail can reconstruct the complete flow.

### Proves
Identity, authorization, Sections, enrollment, assignments, submissions, notifications, communication, Insights, Actions, events, audit, cross-workspace consistency.

---

## GF2 — Accepted Student → Active Enrollment

### Goal
Prove that an accepted student can move from admissions into an active CAN enrollment without duplicate identities, re-keying, or collapsing admissions and enrollment into one state machine.

GF22 owns inquiry → application → eligibility → acceptance. GF2 begins at acceptance.

### Flow
1. Accepted Application hands off the existing Household, Person, StudentProfile, GuardianRelationship, and selected Program.
2. Enrollment Journey is instantiated for that Program/Jurisdiction.
3. Family completes enrollment-specific forms/documents and signatures.
4. CAN completes enrollment-specific reviews and readiness requirements.
5. Blocking requirements reach Complete.
6. School-year/program Enrollment becomes Active.
7. Appropriate Sections are proposed/assigned.
8. Student Today experience activates.
9. Guardian sees the student under the Household.
10. Audit and DomainEvents reflect every material transition.

### Proves
Admissions-to-enrollment handoff, identity continuity, Household relationships, Program, Journey, documents, enrollment lifecycle, student/family workspaces.

### Current acceptance evidence and remaining gates

The focused `admissions-offers` integration mode now exercises actual registrar
and guardian endpoints from canonical application creation through offer
withdrawal/reissue, acceptance, readiness regression/review, program activation
and section placement. It checks current guardian authority, role/program
denials, identity continuity, duplicate-command evidence, Family Home,
Student Today and student/guardian class access. The new handoff fixture rolls
back all writes; the existing separate-connection fixture retains final-seat
concurrency coverage on the disposable test database.

The guardian workspace distinguishes acceptance from enrollment activation and
class assignment, including outstanding blocking requirement titles without
internal notes. Withdrawal requires registrar confirmation and an internal
reason, releases only an unaccepted offer's seat, and preserves history.

The guardian's existing offer workspace now opens an application-specific
enrollment checklist, including requested/rejected document instructions,
current files and superseded history. Request/rejection notifications link
directly to that child and application. Guardians can submit or replace
PDF/JPEG/PNG evidence when the corresponding deployment gate is enabled;
submission resets readiness for registrar review rather than completing it.
The generic registrar checkbox cannot complete a document awaiting review.
Approval of the current verified file restores readiness. Closed checklists
are historical, and every read/upload/download rechecks current resource
authority. Internal registrar notes and storage keys are absent from the
guardian DTO.

The acceptance fixture now proves this request-to-correction-to-approval path
through real endpoints, including storage-verification failure, outbox failure
rollback, retry evidence, superseded-file denials, access revocation during
upload verification and activation only after approval. R2 signing and object
verification are mocked at the storage boundary; no objects are uploaded.

School-configured enrollment forms now use the same JourneyRequirements.
One currently managing guardian supplies typed answers, acknowledges the exact
configured school statement and signs with their authenticated identity and
typed name. The form/version, answers and signing instant are retained together.
Mandatory registrar review either completes the requirement or returns it for
correction and a new signature. The signer must retain enrollment-management
authority when the registrar approves it. There is no generic completion,
document-upload substitute or automatic waiver for a configured signature.
Program-selected packet keys apply to both family applications and registrar
intake; changing a definition does not rewrite an existing application's form.
Acceptance checks the actual signed/approved evidence, not only checklist status.

Admissions exception acceptance now also exercises waitlist/restore through
the actual registrar command, strict role/school scope, closure after explicit
offer withdrawal, declined/withdrawn terminal states and stale issued offers
on closed or waitlisted Applications. A stale guardian response cannot revive
the application, and issuance retries cannot bypass the current disposition.
Restore preserves identities and the existing readiness/signature evidence;
it is not a reopening operation for closed Applications. Intake does not
cancel accepted offers or active enrollment. The handoff fixture verifies
stage-outbox rollback and one-time decision evidence. Separate-connection
transactions race waitlisting against issuance in both request orders; only
one may commit, while the existing final-seat race remains covered.

Authenticated browser acceptance now covers the same configured-form handoff
on a separately started local application and the guarded disposable Neon
database. Real synthetic guardian, registrar and student sessions exercise
signing, return for correction, re-signing, approval, waitlist/restore,
offer issuance/acceptance, activation and section assignment. The student sees
the assigned class but cannot open registrar admissions. Database assertions
verify identity continuity, two retained signatures/reviews, one active
program and section enrollment, and one-time offer/activation events.
The browser run exposed pre-hydration interactions on the forms and decision
pages; their mutation controls now wait for handlers to be ready instead of
silently losing input or clicks. The test uses no mocked application endpoints.

This does not certify all GF2 steps: approved packet content and jurisdiction
policy configuration, live private document upload, legal/electronic-signature
and production-deployment acceptance remain separate release gates.
Browser acceptance uses synthetic packet text and deliberately disables R2
uploads; it does not certify object storage or external delivery.
The tested readiness flow uses the
existing configured application Journey; it does not introduce a second
hard-coded workflow engine or automatically configure approved school forms.

**2026-10-28 status reconciliation:** the GF1/GF2 browser specs and fixtures
were realigned to the current UI (program+section enrollments, teacher
eligibility/delivery stack, first lesson, executable guardian permissions) and
are repaired and wired, but they were **not re-executed** in the 2026-10-28
review environment. The browser acceptance described above remains historical
evidence from its original runs; a fresh live run is required before claiming
current GF2 browser acceptance.

---

## GF3 — Host / Program Launch

### Goal
Prove CAN can launch multiple deployment models using one architecture.

### Flow
1. Partner Organization is created.
2. Site is created if the deployment has a local site.
3. Program is created with type, grade range, delivery model, Jurisdiction, host, academic provider, issuing authority, and calendar.
4. Launch Journey is instantiated from configuration.
5. Required staff/role assignments are completed.
6. Facility/onsite readiness requirements are completed where relevant.
7. Teacher readiness and Section provisioning complete.
8. Orientation/calendar events are created once and surfaced in the correct role workspaces.
9. Blocking requirements reach Complete.
10. Program moves to Ready, then Active.
11. National/network workspace sees the new Program without special-case code for church vs school extension.

For new site-based openings, step 10 also selects a named existing active site
registrar/operator. Activation creates a canonical handoff Action and in-app
notification atomically. The selected operator reviews Site Today and
acknowledges receipt with a confirmed note; this is recorded separately from
activation and does not certify legal compliance. Both cross-person receipt and
an eligible opener receiving their own handoff must be tested. Earlier active
programs are not implicitly marked acknowledged.

### Required acceptance scenarios
- Church-hosted academy
- Existing Christian K-8 adding a CAN high-school extension

### Proves
Organization -> Site -> Program, Journey engine, role/scope model, configuration, calendar propagation, generalized host architecture.

---

## GF4 — Attendance + Parent Excuse

### Goal
Prove CAN can run a real physical/hybrid school day and reconcile site and family actions.

### Flow
1. Student is expected onsite based on enrollment/calendar/schedule.
2. Authorized site staff marks Student absent.
3. AttendanceEvent is persisted and audited.
4. Guardian is notified.
5. Guardian submits an excuse and supporting document if required.
6. Site reviews the excuse.
7. Excuse is approved/rejected.
8. AttendanceEvent reflects the resulting status without destroying history.
9. Teacher sees the correct state.
10. Attendance metrics recalculate from canonical events.
11. Offline-capable attendance writes may be queued and synchronized later without duplicate events.

### Proves
Site operations, attendance, family workflow, documents, notifications, audit, metrics, and the foundation for offline operation.

### Current cross-role acceptance evidence

The `attendance-handoff` integration mode verifies actual registrar, teacher,
guardian and School-Year Studio endpoints. It covers configured expected
rosters, absence notifications, guardian excuses, append-only corrections,
registrar closure of obsolete excuses, reviewed excuses becoming excused, and
teacher/family visibility. Family Home and Needs You no longer treat an old
absent row as a current absence after a present correction.

Calendar closures and removal of instructional schedule periods remove the
student from the expected roster and block new marks. The final transactional
calendar guard is exercised directly as well. A committed offline operation
remains replayable after configuration changes; a stale uncommitted write
cannot overwrite a newer mark. Losing the teacher assignment denies replay.
The schedule period editor accepts valid `HH:mm` values and rejects invalid
times; its previously double-escaped digit matcher is corrected.

The obsolete-excuse path requires registrar authority, confirmation, a reason
and the expected current event. It preserves all attendance rows, removes the
excuse from the pending queue, retains guardian history and emits one audit,
outbox event and in-app notice across retries. Tests include wrong-role,
capability, scope, relationship, stale-content and terminal-state denials.

This evidence does not certify live supporting-document upload, browser offline
queue synchronization, separate-connection correction/closure races, outbound
email delivery or jurisdiction-specific attendance policy. Those remain
release acceptance gates rather than assumed functionality.

---

## GF22 — Admissions Pipeline

### Goal
Prove that CAN can move a prospective family from first interest through an explicit admissions decision with stage-gated next actions and no re-keying when the student is accepted.

### Flow
1. Inquiry is created from a parent, referral, partner, event, or staff entry.
2. Household/Person records are created or safely linked where appropriate.
3. Prospect selects or is matched to one or more Programs.
4. Inquiry advances to Application only when required inquiry actions are complete.
5. Application collects academic, family, program-fit, and required jurisdiction-specific information.
6. Application advances to Eligibility only when required application evidence is complete.
7. Eligibility checks run as explicit requirements, not hidden booleans.
8. Staff sees stage-appropriate next actions and blocking reasons.
9. Decision authority accepts, declines, waitlists, or requests more information.
10. Acceptance emits an ApplicationAccepted event and hands the same canonical identities into GF2.
11. Decline/withdrawal preserves the full audit/history without creating an Enrollment.
12. Admissions board can filter by stage, owner, Program, age/grade, missing requirement, and days-in-stage.

### State model
```text
Inquiry → Application → Eligibility → Accepted
                              ├→ More Information
                              ├→ Waitlisted
                              ├→ Declined
                              └→ Withdrawn
```

### Proves
Admissions pipeline, stage gating, Journey/Action reuse, prospect-to-student identity continuity, ownership, evidence, decision authority, audit, and handoff into enrollment.

---

## GF23 — School-Year Setup

### Goal
Prove that CAN can define one authoritative academic year structure that every downstream experience can trust.

This is a platform prerequisite, not a back-office convenience. GF1, GF4, Student Today, grading, report cards, transcripts, attendance expectations, and scheduling all depend on it.

### Flow
1. Authorized academic operator creates a **Site-scoped** SchoolYear. Program/network configuration may seed defaults, but the Site owns the effective operational calendar.
2. Terms/semesters/trimesters are defined with non-overlapping start/end dates.
3. Grading periods are defined within Terms.
4. Grade scale and grade-posting rules are selected/versioned.
5. Instructional calendar is created with school days, holidays, closures, special days, and make-up days.
6. Bell/schedule templates are created for onsite and hybrid delivery patterns.
7. Site-specific calendar/schedule configuration is authoritative. Program/network templates may seed Site calendars but never override local effective dates implicitly.
8. Sections are assigned to the correct Term and schedule pattern.
9. Effective dates make future changes explicit rather than silently rewriting history.
10. SchoolYear moves from Draft → Ready → Active only after blocking validation passes.
11. Student Today, teacher calendars, attendance expectations, assignment due-date validation, and grading windows read from the same canonical structure.
12. A mid-year calendar change emits events and updates downstream views without corrupting previously completed records.

### Required invariants
- no overlapping Terms within the same Site-scoped SchoolYear;
- two Sites in the same Program may have different first/last instructional days and holidays;
- every GradingPeriod belongs to exactly one Term;
- grade scales are versioned and historically stable;
- calendar exceptions override templates rather than mutating them;
- a Section cannot activate without a valid academic period;
- attendance expectations derive from the effective calendar/schedule;
- downstream clients never maintain their own shadow academic calendars.

### Proves
SchoolYear, Term, GradingPeriod, GradeScale, AcademicCalendar, ScheduleTemplate, effective dating, calendar propagation, and a trustworthy time model.

---

## GF25 — Report Card & Transcript

### Goal
Prove that finalized academic results become family-facing report cards and durable transcript records under the correct issuing authority.

### Flow
1. Teacher completes grading for the GradingPeriod.
2. Section grade moves through Draft → Ready for Review → Finalized.
3. Required academic review/override workflow completes.
4. Finalized grade becomes immutable except through an explicit correction workflow.
5. Report Card is generated for the student/period.
6. Guardian and Student receive publication notification and land directly in the report-card context.
7. Credits earned and term grades post to the student academic record.
8. Transcript view regenerates from canonical finalized records.
9. CreditIssuingOrganization determines the transcript issuer; never assume CAN is the issuer.
10. Counselor/registrar can generate an official transcript artifact with issuance metadata.
11. A correction preserves the prior finalized grade and issuance history rather than silently rewriting it.
12. Audit trail reconstructs grade finalization, report publication, credit posting, and transcript issuance.

The registrar issues artifacts from the scoped **Admissions → Official transcripts** workspace. A transcript cannot combine records from different credit-issuing organizations without a transfer-credit agreement.

### Proves
grade-posting states, grading-period close, report cards, credits, academic record, issuing authority, transcript generation, correction history, counselor/registrar workflow.

---

## Experience Flow P1 — Parent: "What needs my attention?"

### North-star question
**Is anything wrong with my kid, and what do I need to do about it?**

### Flow
1. Notification deep-links to the exact object/context that caused it.
2. Family Home summarizes each child in one glance: on track, needs attention, attendance issue, unresolved Action, unread message, etc.
3. If anything requires the parent, **Needs You** becomes the dominant/default queue.
4. Parent opens one item and acts in context: reply, sign, confirm, upload, excuse, schedule, or later pay.
5. Action returns an unmistakable success/confirmation state.
6. Completed item disappears from Needs You or moves to Done/History.
7. Parent can finish a normal check-in in under 60 seconds.

### Non-negotiable UX rule
A notification about "Avery's English dropped 8 points" must land on **Avery + English + the relevant grade/context**, never a generic dashboard.

### Proves
deep links, multi-child family state, Action aggregation, contextual notifications, fast completion loops, confirmation semantics.

### Implemented class participation slice

Parents can enter `/classes`, choose a child/class, read published lessons and
syllabus, inspect that child's durable student-reported completion, open the
exact class assignment, read released text annotations, and start/reply to the
shared student/family/teaching-team assessment conversation. Every contextual
link retains the selected child and class. Removing academic guardian access or
active enrollment blocks subsequent academic-thread reads/replies despite old
participant rows. The isolated `class-participation` integration suite proves
these command/read-model boundaries; it does not certify live notification
delivery or authenticated browser acceptance.

### Implemented curriculum authoring-to-classroom slice

At `/operations/curriculum`, an explicitly granted registrar publisher creates
an owning-organization course, saves a structured syllabus and ordered
modules/lessons, then confirms publication with a reason. Incomplete or stale
drafts fail explicitly; publication is immutable and repeat commands do not
duplicate evidence. The studio links published releases to section setup.
New sections consume the new release; existing classes retain their exact
release, lesson content and completion records. Student, authorized parent and
assigned teacher class views consume the same published content.

The isolated `curriculum-authoring` integration mode exercises actual authoring,
publication, section provisioning and class participation endpoints, including
missing/revoked grants, inactive publishers, missing membership, wrong roles and
scope, foreign course ownership, stale edits and forbidden published edits.
It also verifies the synthetic studio seed is repeatable inside the rollback
fixture. This closes the structured reading-content release path, not broad
instructional planning, private asset publication or live browser acceptance.

---

## Experience Flow S1 — Student: "What do I have to do today?"

### North-star question
**What do I have to do today, and am I behind?**

### Flow
1. Open lands on **Today**, not a generic dashboard.
2. Today fuses onsite schedule, live sessions, due work, late/missing work, formation/church items, mentor meetings, and important announcements in chronological/actionable order.
3. Student opens a class and immediately sees Due, Next, and Late.
4. Student completes work and submits.
5. Submission shows a strong confirmation and a stable submitted/locked state where appropriate.
6. Returned grade shows feedback plus an explicit next step when performance is weak.
7. Missing work is presented as a recovery path, not a shame state: what is missing, what can still be submitted, who can help, and the fastest route back on track.
8. Formation obligations such as chapel, service hours, and mentor meetings are first-class Today items.
9. Calendar/schedule/due-date changes propagate immediately so Today remains trustworthy.

Published class lessons, syllabus, resources and announcements are available
at `/classes?section=<sectionId>`. Lesson completion is durable per student,
section and immutable curriculum release, not a grade or attendance claim.
Students can discuss work with their teaching team, see released response-text
annotations, and open a shared assignment conversation with their authorized
family and teachers. The same completion record is read by the parent class
view and assigned-teacher roster. Authoring, live sessions and replay are not
part of this participation slice.

Student Today summary cards link to enrolled My classes (Classes), assignments
(Upcoming assignments), and `/student/assignments?filter=missing` (Missing work).
Assignment filters are URL-backed so reloads and browser back/forward retain
the selected view; `assessment` deep links continue to open individual work.
Assessment-backed actions open their specific assignment, including returned
work for revision. Other Review action links use
`/student/experiences?action=<actionId>` to show the selected authorized action,
not the general experiences list. Unavailable targets show an explicit message
rather than silently opening unrelated work. Assignment selection is URL-backed.

The student Support page uses the same destinations for support-action titles
and Review links: assessment-backed actions open the exact assignment, while
support requests and other follow-ups open their selected saved-action detail.
These links do not grant access to private staff referral or service records.

My classes uses `/student/courses` with actively enrolled sections only.
`section` selects the class and `tab=overview|classwork|grades` selects its
detail panel. Catalog and schedule-change requests remain separate at
`/student/courses?view=catalog`. Assignment scores and revision feedback are
not presented as finalized course grades; official results remain in report cards.

### Trust invariant
If the canonical calendar says a live session is cancelled or an assignment due date moved, Student Today must reflect it from the same source of truth. No shadow calendar.

### Proves
Student Today read model, fused calendar, real-time event propagation, submission confidence, feedback-to-next-action, recovery UX, formation integration.

---

## Experience Flow N1 — Contextual Notification → Action

This is a shared cross-persona flow and should be treated as a platform primitive.

1. DomainEvent occurs.
2. Notification policy determines audience.
3. Notification contains a resolvable resource/context target.
4. User taps notification.
5. Authorization is re-evaluated at open time.
6. App lands on the exact authorized context.
7. Primary next action is immediately available.
8. Completion writes the underlying domain mutation.
9. Notification/Action state updates everywhere.

No notification should exist without a meaningful landing context.

### Navigation contracts

- Record-title links and their adjacent Open/Review controls resolve to the same
  canonical workspace and preserve the selected record, child, section, site or
  program. Page headings and informational labels need not be links.
- Search results retain context: courses use `section`, assignments use
  `assessment` (plus `section` for teacher gradebooks), student results use the
  authorized child's `student` parameter or staff profile route, and messages
  use `thread`.
- Teacher Today grading links open the gradebook, not the missing-work queue.
  A student-assessment link opens the corresponding grading/review panel.
- Family needs link to the selected action, notification or attendance case,
  rather than looping to an unselected family home.
- Admissions and family readiness links preserve `application` and delivery
  scope. Site and program shortcuts preserve their school/program context.
- Calendar titles retain the canonical event and its date in the event's time
  zone. Permission, offer and operations notifications retain their resource ID.
- Unavailable deep-link targets show explicit context errors, never a different
  child's records or an unrelated assignment. URL parameters select views only;
  server authorization and domain-owned mutation boundaries remain authoritative.
- Disabled coming-soon controls stay explicitly disabled. Non-actionable
  gradebook statuses are text, not inert buttons. Registrar referral summaries
  do not link into teacher/specialist-only support workflows.
- Saved student-action titles and Review controls use the exact assignment or
  `/student/experiences?action=<id>`, including non-assessment support requests.
  Exact Action reads retain owner/site/program authorization and are not limited
  to the latest 100 directory results. Waiting, in-progress and cancelled work
  keep their actual status; only resolved work is labeled completed. Student
  completion controls match the server's existing supported types and open state.
- Staff Action links use `/actions/<id>` for read-only canonical details.
  Academic interventions recheck the shared academic Action policy; generic
  operational Actions remain registrar-only. Referral details stay in
  `/support?referral=<id>` for teachers, specialists and counselors.
  Details include a verified-role workspace return link; site-less academic
  Actions do not link into the site-only Operations queue.
- Staff profile insights use `/operations/insights?insight=<id>` and select that
  exact authorized insight regardless of its status. Accepting an insight
  offers a link to the created Action; unavailable selections never fall back
  to another record.
- Teacher study-group request, report, group and session titles preserve
  `group` and, for sessions, `session` in `/teacher/study-groups`. Group selection
  filters the facilitator queues and schedule choices; unavailable groups or
  sessions are explicit. These links do not change facilitator authority.

Route integrity tests inspect static/templated targets and native button
handlers across application source. Contextual navigation tests cover selection
and URL preservation; they do not certify authenticated browser journeys.

---

## GF26 — Study Group / Peer Connection

### Goal
Prove that distributed CAN students can form durable, safe academic peer connections around real courses and learning needs.

### Flow
1. Student discovers an eligible Study Group from a Section, subject, campus, cohort, or approved recommendation.
2. A student may create a course group from an actively enrolled Section and invite classmates with active enrollment in that same Section; a current Section teacher remains the facilitator.
3. Group creation starts the organizer's existing membership and guardian-consent review. Invitations notify classmates but do not bypass guardian consent or facilitator approval when they request membership.
4. Eligibility/safety rules determine whether the student can join directly or requires approval.
5. Membership creates a real relationship, not merely a chat-room subscription.
6. Group has scheduled sessions tied to the canonical calendar.
7. Students can see agenda/resources and approved peer interaction.
8. Teacher/tutor/facilitator can attach LearningActivities, office hours, or support resources.
9. Attendance/participation can be recorded where educationally useful without turning peer interaction into surveillance.
10. Student can leave/report/escalate safely.
11. Group health/participation can inform retention/support Insights without exposing private peer content broadly.

### Calendar visibility invariants
- A Study Group session is visible only while its Group is active and the viewer has current access: an approved member with active Program enrollment, or the scoped facilitator.
- Course-linked Groups additionally require active enrollment in the Group's active Section.
- Site, Section, and participant calendar visibility must not bypass these Group membership and scope checks.
- Session creation, rescheduling, and cancellation write through the shared calendar projection service in the owning workflow's transaction, alongside its audit, domain event, and member notifications.
- School Experiences derives event status from the canonical CalendarEvent cancellation metadata and displays cancelled events explicitly rather than presenting them as scheduled.

### Proves
peer-group domain model, membership, moderation/safety, calendar integration, academic context, distributed-network community.

---

## GF33 — Field Trip End-to-End

### Goal
Prove that CAN can coordinate a real off-campus event across approval, Household consent, fees, medical safety, offline chaperone access, attendance, and incidents without granting broad student-record access.

### Flow
1. Staff proposes a FieldTrip at a Site.
2. Authorized approver approves it and one canonical CalendarEvent is created.
3. Students are added to the trip roster.
4. Household receives permission action and guardian e-signs a versioned ConsentRecord.
5. Any fee becomes a Household FinancialObligation.
6. Chaperones are assigned.
7. Each chaperone receives a time-limited SensitiveAccessGrant for the trip only.
8. Trip Safety Packet contains only required student identity, emergency contacts, relevant medical alerts, and trip attendance fields.
9. Safety packet is available offline for the trip window and automatically becomes unauthorized after expiry/revocation.
10. Departure/boarded/return attendance is recorded idempotently and separately from school attendance.
11. If an incident occurs, GF35 is filed and linked to the FieldTrip.
12. Audit reconstructs consent, sensitive access, attendance, and incident linkage.

### Proves
ConsentRecord, FinancialObligation, least-privilege medical access, offline-safe scoped data, Calendar fusion, trip attendance, and Incident composition.

---

## Running the GF1 e2e test

A Playwright golden-flow test covers GF1 end to end (assignment becomes missing -> guardian notified -> student submits late -> teacher grades -> grade visible): `tests/e2e/missing-assignment.spec.ts`, with its self-contained Neon fixture in `tests/e2e/fixture.ts`.

Prerequisites:

- Run `npm ci` for the committed dependencies and `npx playwright install chromium` for the browser.
- Point `TEST_DATABASE_URL` and `DATABASE_URL` at the same **disposable Neon branch** (never production). The test inserts and deletes its own synthetic rows, but it is not isolated against real data.
- Set `CAN_TEST_DB_WRITES_ENABLED=true`, `APP_ENV=test`, `NODE_ENV=test`, and `CAN_APPLICATION_DB_HOST` to the distinct application database hostname used for the endpoint-identity check.

Run:

```powershell
$env:TEST_DATABASE_URL = "<disposable Neon connection>"
$env:DATABASE_URL = $env:TEST_DATABASE_URL
$env:CAN_TEST_DB_WRITES_ENABLED = "true"
$env:APP_ENV = "test"
$env:NODE_ENV = "test"
$env:CAN_APPLICATION_DB_HOST = "<distinct application database hostname>"
npm run test:e2e -- tests/e2e/missing-assignment.spec.ts
```

Playwright starts `npm run dev` itself (reusing an existing server on port 3000) with `CAN_ACCESS_TOKEN_PEPPER` and `CAN_JOB_SECRET` set to test values; override them via the environment. The test signs in by inserting normal scoped session rows (secret hashed with the pepper) and injecting the session cookie; no synthetic write flag grants product authority. Reports land in `playwright-report/` (git-ignored).

## GF34 — Health Office

### Goal
Prove medical-tier data can be operated safely without leaking into ordinary academic views.

### Flow
1. HealthProfile exists for the student.
2. Immunization/health compliance items track missing, pending review, compliant, waived, and expired states.
3. Supporting Documents carry medical sensitivity, verification, expiry, and retention metadata.
4. MedicationAuthorization is created with instructions, start/expiry, and supporting authorization/guardian consent.
5. Each MedicationAdministration is an immutable fact.
6. Student visits health office.
7. If student is sent home, guardians are notified in context.
8. If required, a ReturnToSchoolClearance is created automatically.
9. Authorized health staff clears return with evidence.
10. Every medical read/write is audited; ordinary teacher/student read capabilities do not imply medical access.

### Proves
medical-tier authorization, compliance states, document expiry/verification, immutable administration logs, guardian notification, clearance lifecycle, and sensitive-read audit.

---

## GF35 — Safety Incident Lifecycle

### Goal
Treat incidents as governed legal records rather than free-form notes.

### Flow
1. Authorized reporter files Incident with type, severity, site, timestamp, people, location, summary, and immediate actions.
2. Filing emits a durable event and audit record.
3. Later factual corrections create IncidentAmendments preserving prior/new value and reason.
4. Required Site/network/legal reviews are assigned explicitly.
5. Parent, leadership, network, or authority notification requirements become explicit IncidentNotifications.
6. Evidence/Documents are attached without mutating the original narrative history.
7. Follow-up work becomes Actions linked to the Incident.
8. Restricted reads are themselves audited.
9. Closure is blocked until assigned reviews are complete.
10. Closure records who closed it and why; historical amendments/reviews/notifications remain immutable.

### Proves
legal-record governance, review chain, notification/escalation policy, evidence lineage, restricted visibility, read/write audit, and non-destructive correction history.

---

## GF36 — Co-Curriculars & Athletics

### Goal
Prove that activities beyond classes compose with Household consent, physical/document expiry, eligibility logic, fees, and the same Site calendar.

### Flow
1. Site creates Activity and ActivitySeason.
2. Guardian registers student and signs versioned consent.
3. Physical/document status and expiry are tracked.
4. Fee becomes a Household FinancialObligation when applicable.
5. Eligibility is evaluated using a versioned rule and evidence.
6. Eligibility decision is stored as ActivityEligibilityCheck with valid-through date.
7. Grade/other changes can trigger a new eligibility check without rewriting prior decisions.
8. Eligible student may move to roster.
9. Practices/games/meetings are canonical CalendarEvents at the Site.
10. Parent/Student calendar reads the same events as academic/formation events.

### Proves
registration, consent, expiring documents, configurable eligibility, re-evaluation history, minimal fee contract, roster state, and calendar fusion.

---

## GF39 — Parent-Teacher Conferences

### Goal
Prove Calendar, Household relationships, reminders, communication, notes, and follow-up Actions compose in a universal school workflow.

### Flow
1. Teacher creates ConferenceSeries availability at a Site.
2. System generates bookable ConferenceSlots.
3. Authorized guardian books a slot for their student.
4. Booking atomically reserves the slot and creates one canonical CalendarEvent with teacher, guardian, and student participants.
5. Confirmation/reminder notifications deep-link to the booking.
6. Conference is marked held/no-show/cancelled.
7. Teacher may write a family-visible summary and/or staff-private note.
8. Follow-up work becomes a canonical Action tied to the student.
9. Appropriate conference context remains attached to the canonical student record without exposing staff-private notes to families.

### Proves
calendar participants, conflict-safe booking, guardian authorization, reminders, note visibility, and Action composition.

---

## GF-A1 — Ask CAN: Grounded Answer

### Goal
Prove Ask CAN answers questions over canonical records with the asking person's exact authorization — nothing more, nothing stale.

### Flow
1. Parent in the Family workspace asks: "How is Bobby doing in Biology?"
2. Intent is classified as Ask; the Agent Runtime plans read-only tool calls.
3. Every tool call is authorized as `capability + resource + scope + relationship` (GuardianRelationship with academic visibility for Bobby's Section).
4. The answer is composed from current canonical records (Submissions, SectionGrades, AttendanceEvents), each claim carrying an evidence reference.
5. Sensitive-tier fields the parent cannot access (counseling, discipline, staff-private notes) are absent from the answer and from the agent's context.
6. A follow-up turn ("Has this happened before?") re-queries current records rather than relying on earlier generated text.
7. Conversation and evidence persist server-side and reopen across sessions/devices.
8. A guardian without academic visibility for a student receives a refusal that reveals nothing about the student's records.
9. Every tool invocation writes an AuditEvent with the authorization context snapshot.

### Proves
Conversation durability, Agent Runtime tool calling, identical authorization for agent and UI, evidence-grounded answers, fresh-record rule, sensitive-field exclusion, agent audit.

### Running the GF-A1 test

`tests/integration/agent-conversation.integration.test.ts` covers the flow against a disposable Neon database: evidence-grounded answers, the watch-confirmation flow producing a durable subscription that then delivers (the A1 → A2 loop), approval-gate enforcement (including cross-person approval attempts), and safe refusals that leak nothing.

There is no dedicated runner alias for this file. Run it as part of the isolated integration suite, targeting the file directly with the required environment (`TEST_DATABASE_URL` on a disposable Neon branch, `CAN_TEST_DB_WRITES_ENABLED=true`; see `scripts/run-integration-tests.mjs` safeguards):

```sh
npm run test:integration -- tests/integration/agent-conversation.integration.test.ts
```

The runtime lives in `src/platform/agent/` (planner, tools, runtime); the session-authenticated boundary is `src/modules/conversation/ask-can.functions.ts`; the UI is `src/routes/ask.tsx` with watch management at `src/routes/guardian.watching.tsx`. The planner is deterministic by design for v1 — an LLM planner can replace it behind the same `planTurn` contract without touching execution, authorization, or audit.

---

## GF-A2 — Ask CAN: Watch (Durable Subscription)

### Goal
Prove a spoken standing instruction becomes a durable, inspectable, revocation-safe subscription — not a chat promise.

### Flow
1. Parent says: "Let me know whenever Bobby misses an assignment. Remind me the next day if it's still missing."
2. The agent prepares a Subscription (event type `AssignmentBecameMissing`, subject Bobby, reminder after 24h unresolved, channel per preference) and presents it for confirmation.
3. Parent confirms; the Subscription is created with `createdVia: conversation` and appears under "Things CAN Is Watching," where it can be edited, paused, or revoked.
4. A deadline passes without a valid Submission (GF1 steps 1–5); `AssignmentBecameMissing` commits with the mutation in one transaction.
5. The outbox worker processes the event; the subscription matcher finds the parent's Subscription.
6. Authorization is re-evaluated at delivery time against the current GuardianRelationship before anything is sent.
7. The delivery arrives in the parent's existing conversation (with evidence and deep link), not as an orphaned alert.
8. At +24h the reminder check re-reads current canonical state; because the Submission is still missing, exactly one reminder is delivered.
9. When the student submits, no further reminders fire; delivery history is idempotent per `(subscriptionId, domainEventId)`.
10. If the GuardianRelationship is revoked, subsequent deliveries are suppressed and the subscription is flagged — never delivered on stale permission.
11. Audit reconstructs subscription creation, every delivery decision, and every approval.

### Proves
Subscription lifecycle, event-driven delivery over the outbox, delivery-time authorization re-check, reminder policy against current state, channel routing, idempotent delivery, user-visible management of agent behavior.

Outbound subscription deliveries claim one item immediately before processing;
school-family alerts claim only the next six concurrent items. Both workers
renew an unexpired owned lease before transport and fence every completion,
suppression, deferral and error update with its lease timestamp. Provider
requests have a 20-second timeout within the two-minute lease. Email retains
its stable provider idempotency key; a provider timeout after acceptance remains
ambiguous, especially for SMS, and is not an exactly-once guarantee.
School-authored email requires a verified, enabled account under the current
guardian school grant. SMS instead requires verified phone consent. Quiet-hour
deferral finds the first permitted real minute in the configured timezone,
including skipped and repeated daylight-saving times.

### Running the GF-A2 test

`tests/integration/subscription-delivery.integration.test.ts` covers the flow end to end against a disposable Neon database: delivery to authorized subscribers, suppression of unauthorized ones, idempotent reprocessing, reminder gating on current canonical state, revocation-safe delivery, outbox backoff/escalation, and lease reclaim.

There is no dedicated runner alias for this file. Run it as part of the isolated integration suite, targeting the file directly:

```sh
npm run test:integration -- tests/integration/subscription-delivery.integration.test.ts
```

Requires `TEST_DATABASE_URL` and `CAN_TEST_DB_WRITES_ENABLED=true` in `.env.local` (see scripts/run-integration-tests.mjs safeguards). The subscriptions schema lives in `src/db/schema/subscriptions.ts` (migration `drizzle/0011_charming_logan.sql`); the matcher, reminder processor, and per-event-type policies live in `src/platform/subscriptions/`.

---

## GF-A3 — Ask CAN: Act (Human-Approved Cross-Module Action)

### Goal
Prove an agent can coordinate across modules to prepare consequential work, while execution remains human-approved and fully audited.

### Flow
1. Within a subscription-triggered conversation, the parent asks: "Should I talk to the teacher?"
2. The agent retrieves current authorized context (missing Submissions, Section, teacher) and offers: "I can prepare a message to Bobby's Biology teacher summarizing the missing work."
3. Parent: "Do that."
4. The agent presents an action preview — recipient, thread context, drafted body with evidence links — and waits for explicit approval.
5. On approval, the Communication module creates a canonical CommunicationThread addressed to the section teacher; Ask CAN does not create a human conversation inside chat.
6. Optionally, a follow-up Action is created for the parent ("Check for teacher reply by Friday") in the same approval.
7. The teacher sees the message in their own workspace through the normal notification policy; nothing about the agent path changes the teacher's experience.
8. The conversation records the preview, approval, tool invocations, and resulting thread reference.
9. Audit reconstructs: who asked, what the agent planned, what was approved, what executed, and under which authorization context.
10. If the parent navigates away without approving, nothing executes and the pending preview expires safely.

### Proves
Do-intent approval gates, cross-module coordination through shared capabilities, Communication/Ask CAN thread separation, delegated execution recorded as the person, expiry of unapproved actions, end-to-end audit.

---

## Explicitly deferred

The initial production release does **not** require the previous GF5 ESA funding-exception flow. Finance claim/disbursement depth comes after the four flows above are operational.
