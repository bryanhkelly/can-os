# Recorded-instructor RLS acceptance

**Gate:** Do not enable the recorded-instructor route until both the eleven-check
schema readiness query and the restricted two-learner isolation test pass.

The schema and UI are intentionally separate from operating permission. A
published instructional policy is not permission for one learner to inspect
another learner's Course attempt, teacher choice, lesson progress, or practice.

## Execute on an isolated test branch only

Seed two learner Course attempts in **the same canonical Section and Course
version**, with **different approved recorded instructors**. Each must have
canonical lesson progress, an active selection, a formative practice attempt,
and saved practice answers. Configure two independently scoped, non-owner test
database identities that represent the two learners. Their accessible rows must
match the corresponding Course attempt. Do not use an owner or unrestricted
application credential for either learner.

Provision each restricted test login against its exact active learner Course
attempt with `database/canonical/v3.0.1/provision-recorded-learner-role.sql`
using `psql -v application_role=... -v course_attempt_id=...`. This creates
no broad learner permissions. The test script selects the dedicated read-only
`can_v301_recorded_instruction_reader` PostgreSQL role, and its policies
resolve the **original login**, not a caller-provided learner ID.

This is a database isolation mechanism for acceptance; it does **not**
replace native authenticated learner-session identity. Do not enable learner
routes until that separate native identity gate is satisfied.

Set these environment variables in the isolated test environment:

- `APP_ENV=test` and `TEST_DATABASE_URL` (the isolated database for the
  read-only schema readiness pass; never the application database)
- `CAN_INSTRUCTIONAL_LEARNER_A_DATABASE_URL`
- `CAN_INSTRUCTIONAL_LEARNER_B_DATABASE_URL`
- `CAN_INSTRUCTIONAL_LEARNER_A_ATTEMPT_ID`
- `CAN_INSTRUCTIONAL_LEARNER_B_ATTEMPT_ID`

Run `npm run db:canonical:v301:instructional-readiness`.

The command first checks the canonical relationships, immutability, force-RLS
and presence of application policies. **Only when all eleven pass**, it invokes
`db:canonical:v301:instructional-isolation` to prove that both restricted
logins can read their own Course attempts, selected presenters, lesson
progress, and practice records but cannot see the other learner's rows.

The isolation script runs **read-only** and rolls back both connections.
Success requires separate recorded instructors for the two learners in the
same Section. This proves database isolation only; release also requires the
actual application to use verified, scoped identities through its database
transactions. Merely creating a policy or supplying an app-wide login must
not count as signoff.

**Identity prerequisite:** A forced-RLS policy must be backed by the
canonical account, grant, and session tables and their approved server-side
identity projection. Do not treat separate database usernames or caller-set
session variables as proof of the logged-in learner. The learner-role binding
must be verified before exposing an application route.

## Verified db3.01 acceptance state

**Target:** Neon project `sweet-hall-62441909`, branch `db3.01`
(`br-tiny-mode-arh9wa2e`). The committed acceptance scripts fail closed
against `test01`, `main`, or a different Neon project.

On 2026-11-14, the designated `db3.01` branch was verified directly:

- The canonical v3.0.1 DDL and native Valor/Barton demo data are installed
  alongside the unchanged legacy `public` tables.
- The synthetic two-learner fixture
  `database/canonical/v3.0.1/seed-recorded-instructor-isolation-demo.sql`
  is installed. It creates two learner Course attempts in one Section with
  different approved **synthetic** recorded instructors, independently saved
  lesson progress, practice answers, and draft official course grades.
- The eleven-check `recorded-instructor-readiness.sql` contract passed
  **11/11** against `db3.01`.
- Two actual restricted PostgreSQL LOGIN principals,
  `can_v301_demo_learner_a` and `can_v301_demo_learner_b`, were provisioned
  with no automatic role inheritance and separate active Course-attempt
  bindings. A dedicated `can_v301_recorded_instruction_reader` role grants
  narrowly scoped read access only when selected explicitly.
- Each principal's independent read-only Neon database transaction verified
  **one own / zero other** for Course attempts, selected instructors,
  lesson progress, practice attempts, and private practice responses.
  The raw login has no direct access to the canonical schemas.
- A rollback-only instructor switch for Learner A verified that its prior
  practice, private answers, lesson progress, official assignment, and
  draft official grade remained unchanged. No changed selection persisted.

**Scope of signoff:** This is real database-level acceptance for the two
restricted identities on `db3.01`. The combined Node-based acceptance
command has not separately run using their private connection URLs, and
end-to-end **application** learner-session authorization has not been
validated. The fixture contains no playable media and no real licensing or
content-rights approvals. Do **not** enable learner-facing recorded-instructor
routes until those independent application and content gates are met.
