# Assignments v4: criterion-level grading

Published synthetic assignment at `/student/assignments` uses `metadata.rubricCriteria`, with individually scored criteria and teacher comments. The score is normalized to the assessment's points possible, saved with detailed scoring in submission feedback, and accompanied by a student notification.

The fixture in `scripts/seeds/gf1-rubric-v4.sql` adds three criteria to the existing seeded English assignment. It is idempotent and changes no unrelated records. `tests/unit/rubric-scoring.test.ts` covers numeric validation and score totals.

Limits: text-based student responses only; file attachments remain unimplemented. Live integration/browser testing is separate from CI typecheck. The system is entirely synthetic.
