# GF40 — Course Selection, Add/Drop & Withdrawal

Synthetic release at `/student/courses`. The student and guardian browse sections and request changes; the Registrar role preview approves or declines each pending request. All state is saved in Neon through existing `sections`, `enrollments`, and `actions` records.

The synthetic fixture at `scripts/seeds/gf40-course-registration.sql` adds Spanish I (live online) and Digital Photography (asynchronous) to the existing four-course synthetic student schedule. Re-running the fixture is idempotent and does not reset changed enrollments or requests.

**Current boundaries:** registrar role switch is a demonstration, not server authorization. Add/drop dates, prerequisites, course capacity, teacher scheduling conflicts, credit totals, school approval policies, guardian consent and graduation mapping are not enforced in this first release. Withdrawal records preserve an illustrative W notation in enrollment metadata; it is not an official transcript rule. No real student records are present in this environment.

Release checks: TypeScript/CI, seeded course joins, request creation, approval adding an enrollment, approved drop ending it, approved withdrawal recording the W, and duplicate-request rejection. No schema migration was required.
