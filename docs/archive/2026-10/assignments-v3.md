# Assignments v3: persisted drafts, rubric workflow, management

- Student draft responses autosave to the existing synthetic Neon submission record (900 ms typing debounce).
- Draft saves never overwrite submitted or graded work. Returned work becomes a separate attempt when the student begins a revision.
- Teachers may close/reopen a synthetic assignment; assignments may be rescheduled using the server function.
- Rubric criteria remain stored in assessment metadata; the UI displays the rubric but criterion-level grading and binary file attachments are not yet implemented.
- The v2 synthetic fixture (scripts/seeds/gf1-assignments-v2.sql) remains the reproducible test baseline. V3 scenarios are exercised against those same reserved synthetic records.

Limits: role selection is demo-only. No actual student data is in Neon. Run browser smoke tests and persistence/concurrency integration tests before deploying to a real school.
