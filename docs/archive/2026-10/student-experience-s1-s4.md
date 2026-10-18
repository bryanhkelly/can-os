# Student Experience S1–S4

## Shipped in this branch

- `/student` responsive, interactive review environment
- S1 **Today**: schedule, academic work, formation and mentoring in one surface
- S2 **Complete Learning**: assignment detail, editable response, clear submit confirmation and submitted state
- S3 **Recover Learning**: accessible missing-work queue and teacher next actions, not shame labels
- S4 **Improve Mastery**: teacher feedback, progress, and recovery steps
- `src/modules/student-experience/student-today.server.ts`: initial server-side database composition of student/sections, calendar events, submissions, Actions, and recovery candidates

## Honest product boundaries

The visual experience uses isolated sample data from `demo-data.ts`; it does not simulate a production backend connection. Submissions and recovery checkboxes affect local demo state only. Ask CAN is a non-operative preview. No student records are modified.

The server query is deliberately not exposed through an open API. A future authenticated loader can call it once student identity/session exists; it must first resolve Site-local day boundaries and event audience rules. The UI will then swap sample data for the server read model and wire submission to the existing `submitAssessment` command.

## Next UX increments

1. Site-local 'Today' boundaries and cancellation/moved-session messaging.
2. True course detail pages, lesson content, attachment uploads, and resubmission policy.
3. Durable RecoveryPlan as Actions over existing academic events.
4. Learning companion in-assignment with guided—not answer-dumping—help.
5. Real notification → precise work/feedback deep links.
6. Formation, service logs, and approved study group schedule fusion.

No migrations or live database writes are included in this phase.
