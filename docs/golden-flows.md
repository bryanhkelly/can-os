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

## GF2 — New Family Enrollment

### Goal
Prove that a real household can enter CAN and produce an active student enrollment without duplicate identities or re-keying.

### Flow
1. Guardian begins application.
2. Person and Household records are created/reused safely.
3. Student Person + StudentProfile created/reused.
4. GuardianRelationship created.
5. Family selects a Program.
6. Required enrollment Journey is instantiated for that Program/Jurisdiction.
7. Forms/documents are submitted.
8. Required reviews and eligibility steps complete.
9. Student is accepted.
10. School-year/program Enrollment becomes Active.
11. Appropriate Sections are proposed/assigned.
12. Student Today experience activates.
13. Guardian sees the student under the Household.
14. Audit and DomainEvents reflect every material transition.

### Proves
Households, identities, relationships, Program, Journey, documents, enrollment lifecycle, student/family workspaces.

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

## Explicitly deferred

The initial production release does **not** require the previous GF5 ESA funding-exception flow. Finance claim/disbursement depth comes after the four flows above are operational.
