# Curriculum journey acceptance: publisher → organization → teacher → student

This is the governed product acceptance path, not a synthetic page/demo route or merely JSON fixture validation. Implementation lives in the existing CAN-OS server functions and classroom, gradebook and assignment modules.

## What the database-backed scenario executes

`tests/integration/curriculum-authoring.integration.test.ts` creates synthetic **separate publisher and school organizations** within a rollback transaction. It calls the actual server functions with authenticated role/scope stubs:

1. An independent publisher with an explicit scoped grant creates, drafts, validates and publishes a course, including a **teacher-only worked-answer guide**.
2. The publisher creates a public CC-BY curriculum pack, selects the published course release and publishes its immutable pack version.
3. A different school organization discovers the pack. A registrar confirms license terms, installs the entitlement and adopts the publisher's pack.
4. Before adoption the school cannot create a section from that foreign course. After adoption, course setup lists it and allows a real section pinned to the specific publisher release.
5. The school assigns a teacher and enrolls a student in the section.
6. The assigned teacher reads publisher guidance, attaches a lesson-specific supplement and creates **graded homework** referring to a publisher lesson in the section's version.
7. The enrolled student sees that published lesson and teacher supplement, **cannot see** the protected guide, marks lesson complete, receives the teacher's published assignment and submits a written response.
8. The teacher grades the submission with the saved scoring rubric. The student sees the real score and feedback in the assignments experience.
9. Revoking the entitlement prevents **new** class provisioning; the already-provisioned section retains its immutable publisher version pointer.
10. An unrelated school registrar cannot edit or republish the external publisher's course.

All fixture records are rolled back. This does not grant credit or modify a real student. Existing self-authored publisher versioning tests also verify historical sections stay pinned when a later course release is published.

## How to run (not on production)

Run **GitHub Actions → Curriculum Journey Acceptance → Run workflow** after setting:
- Secret `CURRICULUM_TEST_DATABASE_URL`: PostgreSQL connection string for a **disposable Neon branch**, NOT the production/default branch.
- Repository variable `CAN_APPLICATION_DB_HOST`: production Neon PostgreSQL hostname (no protocol, username or port), to guard against pointing the disposable test at production.

The workflow refuses to run if either value is missing and enforces the branch host differs from production. It sets `APP_ENV=test`, `NODE_ENV=test` and `CAN_TEST_DB_WRITES_ENABLED=true` **only inside the isolated job**.

For locally connected acceptance: `npm run test:integration:curriculum-journey`, with `TEST_DATABASE_URL`, `CAN_APPLICATION_DB_HOST` and `CAN_TEST_DB_WRITES_ENABLED=true` set explicitly. The runner refuses production URLs and ignores the application's `DATABASE_URL` as a fallback.

## Evidence and limitations

- Passing ordinary CI means source build, types and **unit** tests pass. The integration test is **not executed by regular CI**. The separate acceptance job must pass before claiming database-backed lifecycle acceptance.
- This is server-function integration through authentic tables, transactions and audited operations using **scoped synthetic actors**. It does **not** validate real browser login, button clicks, email sending, media uploads, external vendor purchases, or deployment on Netlify.
- The existing `tests/e2e/algebra1-classroom.spec.ts` verifies a logged-in student's and teacher's **browser** learning, submission and grading workflows against an isolated fixture. That browser test starts from an already-provisioned section; the journey test supplies the previously missing cross-organization acquisition steps.
- Commercial license verification and Common Cartridge conversion are explicitly deferred. The journey uses a legally distributable CC-BY test pack.
- Academic-year adoption rollover is a **separate** follow-up. Do not switch an existing section's `course_template_version_id` when a school adopts a future release.

**Acceptance gate:** record the commit SHA, the isolated branch ID, the job result and the class/version IDs used. Report "NOT RUN" rather than "passed" if the external branch secret or test workflow is unavailable.
