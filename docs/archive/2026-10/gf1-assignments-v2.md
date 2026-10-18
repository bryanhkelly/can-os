# GF1 Assignments v2

This release extends the synthetic student and teacher experience at `/student/assignments`.

- Teachers can publish an assessment directly for an enrolled class, supply directions, set due dates, points, and a simple textual rubric.
- The assignment read model shows the most recent attempt, with all earlier submitted/graded attempts accessible as revision history.
- A returned assignment can be resubmitted as a **new numbered attempt**, retaining earlier scores, feedback, and responses in Neon.
- Posting a grade also creates a synthetic student's feedback notification.
- Existing assessment and submission tables are reused. No structural migration is necessary.

Synthetic fixture: `scripts/seeds/gf1-assignments-v2.sql`, which inserts a rubric-based English comparison exercise with an assigned submission. The SQL is idempotent by its reserved synthetic identifiers; resetting mutations requires an explicit fixture-specific reset.

Current limitations: text-only assignment responses, textual rubrics (not criterion-level scoring), no actual binary file upload, no enforced role authorization (the whole database contains synthetic records), and no independent automated integration test of the submission revision cycle. A browser and Neon transaction-level test is necessary before real students use this workflow.
