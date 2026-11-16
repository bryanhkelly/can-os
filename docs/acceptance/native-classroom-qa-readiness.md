# Native Class facilitated classroom: QA environment readiness

Status: blocked, based on **read-only inspection** of \`test01\` on 2026-11-15.
This is not a database migration approval, release authorization, or successful
end-to-end test report.

## Confirmed environment facts

- The \`test01\` branch contains existing canonical
  \`learner_course_attempts\`, \`facilitated_classroom_plans\`,
  \`facilitated_learning_sessions\`, activity responses, and attendance evidence.
- Native \`education_v30.classes\` and \`education_v30.class_sessions\`
  do **not** exist yet, so native Class Session end-to-end execution is impossible.
- The prerequisite composite keys for adoption and Course identity exist:
  \`deployment_offering_adoptions(id, deployment_id, offering_version_id)\`
  and \`offering_courses(offering_version_id, course_version_id)\`.
- Existing classroom evidence/plans enforce RLS. The
  \`can_os_canonical_auth_app\` login role lacks direct SELECT, INSERT and UPDATE
  grants on the inspected classroom tables. Current service access may rely
  on an owner-backed application connection or purpose-specific security
  definer functions; **do not infer** that the restricted role can run the
  native Class services without an explicit test.
- All ten permitted Neon project branches were occupied when a new
  disposable child of \`test01\` was requested. Neon returned
  \`branches limit exceeded\`; no branch was created.
- GitHub Actions reports \`startup_failure\` without running the CI jobs.
  This is not a passing or failing application typecheck or browser test.

## Safe next operation (no production write)

1. Review existing Neon QA/recovery branches and preserve anything still
   needed. A project owner must approve freeing one disposable slot; do not
   delete a branch merely because its name sounds old.
2. Create an isolated temporary child of \`test01\` (never parent \`main\`).
3. With explicit \`CAN_NATIVE_CLASSROOM_PREFLIGHT=1\`, run:
   \`npm run db:canonical:classes:preflight\`.
   This command is **read-only**. Review column/FK prerequisites, original
   Course Attempt constraint, roles, schema state and forced RLS.
4. On that isolated QA copy only, review/apply both migrations in sequence:
   \`patch-unified-class-offerings.sql\`, then
   \`patch-unified-class-course-attempts.sql\`. The second replaces a
   canonical Course Attempt constraint and trigger, so it MUST NOT run
   against real users without approved impact/recovery review.
5. Design and verify exact application-role permissions and row-level
   policies for the new tables and the existing shared classroom tables.
   Do not replace owner-only RLS with a \`PUBLIC\` grant or unconditional
   \`USING(true)\` policy for unrestricted roles.
6. Run \`CAN_NATIVE_CLASS_SCHEMA_VALIDATION=1
   npm run db:canonical:classes\` using the isolated branch connection.
   Run both \`npm run typecheck\` and \`npm run test:classes:unit\` in a
   working test environment. Neither has yet been observed passing.
7. Exercise a real authenticated two-Site/25-learner acceptance journey,
   including one learner without a device, phone-based individual
   responses, explicit attendance delegation, emergency room revocation,
   short-lived R2 URL refresh and all three display configurations.
   See \`docs/acceptance/native-facilitated-classroom-p0.md\`.
8. Rebase or merge the updated main after QA changes if new commits arrived.
   Merge to main, enable the native Class commands, or migrate any live
   database **only after** all security and E2E evidence passes.

No database changes or role grants were made during this inspection.
