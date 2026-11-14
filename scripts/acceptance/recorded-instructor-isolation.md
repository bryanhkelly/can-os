# Recorded-instructor RLS acceptance

**Gate:** Do not enable the recorded-instructor route until both the ten-check
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
and presence of application policies. **Only when all ten pass**, it invokes
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

**Current state:** `test01` (Neon branch `br-bitter-feather-ar0u63x7`)
is the approved database target for this acceptance, confirmed by the project
owner. It already contains the canonical learner tables and the corrected
same-presenter policy-renewal trigger. It has no seeded learner Course
attempts, and native canonical account/session tables and restricted
application-role policies remain absent. Run the readiness check against
`test01`; do not sign off the learner route until the ten-check readiness
contract and restricted two-learner isolation both pass. Do not run these
acceptance scripts against `db3.01` or `main`.
