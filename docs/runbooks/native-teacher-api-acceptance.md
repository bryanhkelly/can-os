# Native teacher API acceptance

Status: source changes and test definitions only; execution and release acceptance pending.

## Run against the isolated pilot QA environment

Use the existing guarded pilot provisioning configuration and its exact-commit,
clean-checkout, localhost, test branch, outbox and no-external-email requirements.
Do not use production or change the guards to obtain a passing test.

Set CAN_TEACHER_QA_API_FIXTURE_JSON to a reviewed JSON object containing:

- teacher, student, otherTeacher: each has email (distinct ordinary .test address) and grantId (UUID).
- classId: the teacher's active approved native Class.
- otherClassId: a different active Class not assigned to the teacher, preferably in another Site.
- classEnrollmentId: the student's active Class Enrollment in classId with creditMode not_applicable and current Course Attempt.
- assignmentId: official native assignment visible in the learner homework API, past due and not yet submitted or returned for revision, with no open follow-up.
- expectedClassIds: all current native Classes assigned to the teacher's active grant.

Provision these records with standard governed application services. A reviewed,
isolated fixture may be reused only if the intended assignment state is reset
through ordinary supported workflows; do not fabricate submissions, grants,
or grading records in SQL. The other teacher must not be assigned to classId.
The test submits, returns and revises real practice homework on the test branch.

Run:
```sh
npm run typecheck
npm run check:class-architecture
npm run test:classes:unit
npm run test:e2e:teacher:api
```

## Acceptance evidence

The API test uses ordinary email-link authentication and the same transformed
application RPCs as the UI. Its assertions cover exact Class directory,
dashboard population, unauthorized learner/visitor/other teacher reads,
cross-Class denial, submission and review count reconciliation, missing-work
pagination, practice feedback, duplicate feedback retry and student revision. It also creates a canonical missing-work Action, retries creation, verifies owner-only detail and resolution, retains the open Action after submission, resolves it, and verifies the idempotent resolution retry.

The new query contract test compiles parameterized SQL without a database;
it is not evidence of SQL execution or runtime authorization.

Record exact source SHA, target QA branch, actual results, and elapsed times.
Do not claim end-to-end acceptance based solely on committed test files.

## Outstanding

- Native missing-work creation, owner resolution and detail now use the existing
  Action table with a Class Enrollment subject and validated Class/assignment metadata.
  The teacher queue is connected. Runtime evidence is pending. Generic operator
  edits/reassignment are denied until Class-specific authority is migrated; broader
  academic interventions, transfer/withdrawal handling, student notification deep
  links, guardian access and all remaining Action projections require reconciliation.
- Native written assignment draft creation and inventory now reuse the appointed
  Course author and draft lock. Official requirements, delivery assignments, and
  grading policy definitions are included in release review hashes. Existing
  nonempty manuscripts may require resubmission and independent review; do not
  reset or waive those gates. This authoring command creates new definitions,
  not draft editing/deletion, Class-specific assignment deadlines, or publication.
- Native teacher gradebook reads current immutable grading decisions and flags
  ambiguous decision heads, graded submissions lacking a decision, and practice
  submissions with official decisions. Standard API suite now checks scope and
  practice-versus-official separation. No grade-writing command, grader appointment
  provisioning, policy authoring, course credit or student/guardian grade release
  is authorized by this reader.
- Independent grading mutation and release need an explicitly governed current
  grader grant, exact professional appointment, independently approved policy,
  correction/evidence rules, and student/guardian access reconciliation. Do not
  repurpose teacher practice feedback or the noncredit knowledge-check finalizer.
- Native Class discussions still filter on synthetic Valor fixture metadata.
  Remove only after general private thread creation, membership, lifecycle,
  transactional send/audit and revocation behavior are independently verified.
- Institution-wide and multi-Site teaching grants, teacher reports, Class
  directory pagination, assessment pagination and score policy remain open.
- Offset paging is bounded and ordered; concurrent modifications can shift
  pages. Cursor/snapshot pagination and performance acceptance remain open.

## November 28 academic authoring and gradebook checkpoint

On isolated QA branch `br-solitary-art-arun91gj`, read-only schema inspection
confirmed the official requirement immutability trigger, append-only grading
decision trigger, and independent grader gate. PostgreSQL EXPLAIN (without ANALYZE)
accepted the native gradebook query with placeholder UUIDs. This proves SQL
planning against the branch schema, not actual authorization, data reconciliation,
RLS under the application's role, or HTTP acceptance. Grading decisions and
submissions have forced RLS and the trusted owner policy in that inspected schema;
no permissions were altered. Full build, unit and authenticated acceptance are
still pending. No SQL mutations or schema migrations were applied.
