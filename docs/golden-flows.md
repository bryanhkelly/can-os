# CAN OS Golden Flows

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
1. Authorized academic operator creates a SchoolYear for an Organization/Program scope.
2. Terms/semesters/trimesters are defined with non-overlapping start/end dates.
3. Grading periods are defined within Terms.
4. Grade scale and grade-posting rules are selected/versioned.
5. Instructional calendar is created with school days, holidays, closures, special days, and make-up days.
6. Bell/schedule templates are created for onsite and hybrid delivery patterns.
7. Program-specific calendar overlays are applied without duplicating the canonical year.
8. Sections are assigned to the correct Term and schedule pattern.
9. Effective dates make future changes explicit rather than silently rewriting history.
10. SchoolYear moves from Draft → Ready → Active only after blocking validation passes.
11. Student Today, teacher calendars, attendance expectations, assignment due-date validation, and grading windows read from the same canonical structure.
12. A mid-year calendar change emits events and updates downstream views without corrupting previously completed records.

### Required invariants
- no overlapping Terms within the same SchoolYear scope;
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

---

## GF26 — Study Group / Peer Connection

### Goal
Prove that distributed CAN students can form durable, safe academic peer connections around real courses and learning needs.

### Flow
1. Student discovers an eligible Study Group from a Section, subject, campus, cohort, or approved recommendation.
2. Eligibility/safety rules determine whether the student can join directly or requires approval.
3. Membership creates a real relationship, not merely a chat-room subscription.
4. Group has scheduled sessions tied to the canonical calendar.
5. Students can see agenda/resources and approved peer interaction.
6. Teacher/tutor/facilitator can attach LearningActivities, office hours, or support resources.
7. Attendance/participation can be recorded where educationally useful without turning peer interaction into surveillance.
8. Student can leave/report/escalate safely.
9. Group health/participation can inform retention/support Insights without exposing private peer content broadly.

### Proves
peer-group domain model, membership, moderation/safety, calendar integration, academic context, distributed-network community.

---

## Explicitly deferred

The initial production release does **not** require the previous GF5 ESA funding-exception flow. Finance claim/disbursement depth comes after the four flows above are operational.
