# GF40 policy follow-up + assignments

## What this release implements
- The GF40 synthetic Site catalog now reads per-section registration policy from `sections.metadata.registrationPolicy`: capacity, prerequisite course codes, add/drop deadline, withdrawal deadline, and meeting-key conflict.
- Registration requests reject out-of-window add/drop/withdraw operations, and approved additions recheck capacity, prerequisites and schedule conflicts.
- The student assignment experience at `/student/assignments` reads published assessments by active section enrollment using a left join, so assignments without a submission are visible.
- Students can submit text responses; a teacher persona can score submitted work, enter feedback, and return graded work for revision. Data is persisted in the existing `assessments` and `submissions` tables.
- The release includes synthetic policy examples and a returned-for-revision Biology assignment at `scripts/seeds/gf40-rules-assignments.sql`.

## Known boundaries
- This is a demonstration using a fixed synthetic student and persona switch, not a role-secured application.
- Course capacity and conflict checks currently use policy metadata and current enrollments; approval does not yet re-evaluate the calendar deadline. A formal rules engine, credit evaluation, graduation requirements and authoritative historical transcripts remain follow-on work.
- Assignments support text only; there is no attachment upload, offline authoring, rubric scoring, or immutable attempt history. Returning work makes the same record editable for revision.
- The existing Student Today page remains a separate demo surface; the new assignment page is the Neon-backed workflow.
- These fixtures deliberately use October 2026 demonstration dates. They are not production scheduling guidance.

## Release validation
Typecheck and unit tests in CI, followed by a browser walkthrough and positive/negative transactional checks on synthetic Neon data. No new schema migration is necessary.
