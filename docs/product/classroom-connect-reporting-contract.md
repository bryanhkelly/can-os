# Classroom Connect | Reporting-ready evidence contract

**No dashboard UI is included in this workstream.** The operational application writes
evidence to `education_v30`. All reporting filters must honor current organizational
and Site authorization; the database views are accessible to privileged runtime
services only, not by embedding unrestricted client queries.

| Metric | Canonical evidence source | Interpretation |
| --- | --- | --- |
| Sessions delivered | `facilitated_learning_sessions` | Room-start records grouped by Site, Deployment, Course and week |
| Unique registered learners | `learner_course_attempts`, `enrollments`, `noncredit_registrations` | Authorized enrollments/registrations, not a join count |
| Unique paired learners | `facilitated_learning_participants` | Distinct Course attempts attached to rooms, not attendees |
| Active device estimate | Latest `facilitated_room_presence_events` by attempt + client instance, 90s window | Unverified and ephemeral, never attendance |
| Responses submitted | `facilitated_room_activity_responses` | Append-only formative responses, distinct attempt counts reported separately |
| Content actually released | `facilitated_room_activity_releases` | Facilitator action, not proof a participant watched/read |
| Media controls | `facilitated_learning_playback` | Facilitator playback observations, not learner watch time |
| Attested present | Latest `facilitated_room_attendance_assertions` per room and attempt | Explicit host in-person/remote check, not school official roll-call |
| Noncredit completions | `learner_course_attempts`, noncredit assessment/completion policies | Existing independent canonical completion authority |
| Feedback and exit surveys | `facilitated_room_feedback` and `facilitated_room_survey_campaigns` → existing `survey_responses` | Respect original survey confidentiality and consent model |
| Course week/site totals | `facilitated_room_pilot_weekly_evidence` | Reporting-ready, per-Site/Deployment/Course/week summary |
| Existing client session activity | `learning_sessions` + `learning_session_events` | Not login identity and not verified teaching attendance |

## Data boundaries

- Never generate attendance, grades, credit, grant eligibility, certificates or academic completion automatically from pairing, playback, client presence or quick feedback.
- All user actions use real native canonical identity and a current authorized Course attempt.
- Site-scoped school learners require effective-dated enrollment placement at the host Site; a noncredit remote participant may pair into the same Deployment/Course but is not labelled physically present.
- Class code is HMAC-digested and expires in 15 minutes; client IDs are not security principals.
- Learner answers are formative, append-only and deduplicated by server scope plus idempotency key. Repeated answers remain distinct evidence, not grade overrides.
- Attestations are append-only with the latest accepted host assertion used for display. Keep earlier attestations for audit.
- A questionnaire is governed by canonical `survey_definitions` / versions / questions. `facilitated_room_survey_campaigns` only links the room to an authorized survey campaign, never copies anonymous answers.
- Feedback `question_key` is an operational 1-to-5 pulse and is distinct from configurable governed surveys.

## Deployment and release gate

1. `scripts/sql/canonical-v301/classroom-connect-phase2-evidence.sql` creates evidence tables, owner-only forced RLS and a per-room view.
2. `scripts/sql/canonical-v301/classroom-connect-pilot-weekly.sql` adds the weekly rollup.
3. Enable neither `CAN_FACILITATED_LEARNING_ENABLED` nor `CAN_CANONICAL_ACTIVITY_ENABLED` until restricted DB roles, signed-in browser tests, and actual current-commit preview are verified.
4. No new dashboard route or UI. Export/reporting queries will use the views and existing canonical assessment/completion records.

### Four-week acceptance

Run two Sites and at least ten synthetic learner identities, checking cross-Site denial,
time-limited pairing, dropped connections, reconnection without duplicate response,
release/close concurrency, accurate room counts, exit survey confidentiality, and
progress from the same Course attempt across sessions.
