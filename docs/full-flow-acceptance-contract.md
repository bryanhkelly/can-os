# FullFlow — single continuous school journey (canonical acceptance contract)

**Priority: P0.** This document defines the ONE end-to-end acceptance journey.
Source-of-truth progression approved for `FullFlow`. Separate Golden Flow tests
are prerequisite evidence, **not** proof of this journey.

## Exact sequence (no skipping or replacing steps with seed-only states)

1. **School creates its high-school program.** A verified local school operator
   creates its high-school extension with real Organization, Site, grades 9–12,
   legal academic provider/credit issuer, jurisdiction and calendar.
   **Evidence:** created `organizationId`, `siteId`, `programId`, Launch
   Journey, persisted readiness/configuration; same authorized school can reload it.
2. **School adopts curriculum and provisions instruction.** The publisher
   publishes a usable course version, the school adopts that exact version,
   creates a real instructional Section and assigns an authorized teacher.
   **Evidence:** course template + immutable published version + adoption +
   `sectionId` tied to **that `programId`**, verified teacher assignment.
3. **Family applies, enrolls, and activates.** A distinct authorized guardian
   starts an actual application for **that same Program**. Registrar issues an
   offer; guardian completes required consent/forms; registrar activates the
   **same student identity** and assigns that student to the Section from #2.
   **Evidence:** `applicationId`, `personId`, `studentProfileId`,
   `enrollmentId`, `sectionId`, decision + consent + audit evidence.
4. **Student completes real instructional work.** Authenticated student
   opens a published lesson for that Section, sees an assignment/assessment,
   submits actual work and retains a persistent submission.
   **Evidence:** lesson/assessment, `submissionId` linked to the enrollment,
   stored content, event/audit, reload persistence.
5. **Teacher, guardian, and school respond.** The assigned teacher grades that
   submission; teacher/student/guardian and school see the appropriate result
   and (where applicable) notification, intervention and authorized decision.
   **Evidence:** grade, event, outbox/notification, parent relationship-based
   visibility and negative denial for an unrelated guardian; role-specific
   browser reload proves consistency.
6. **School sees one trustworthy operational record.** School operator
   reads **the exact same** Program, staffing, curriculum/Section, enrollment,
   instructional and readiness records through the operational experience.
   **Evidence:** stable IDs, joins, counts and audit history; same state after
   page refresh and a fresh authenticated session.

**Success is one connected journey across actual server-issued, separately
authorized users, with persistent records, not six screenshots or isolated seeded
demonstrations.** Production credentials and real family/student information
are excluded; use synthetic users on a disposable, migrated Neon branch.

## Acceptance invariants

- One tenant and one Program carry through all six stages; do not build separate
  fixtures and call their unrelated records a full-flow success.
- Each mutation uses its actual application command/permission checks, including
  ownership, scope and relationships. The test may initialize identity accounts,
  safe reference catalogs and prerequisites, **not** precreate the program,
  adopted course, student enrollment, work submission or grade that it purports
  to exercise.
- Assert exact identity continuity and persistence on the database and in the
  signed-in browser after reload, not just successful server responses.
- Verify negative access cases (other school/guardian, unauthorized teacher,
  revoked or scope-limited grant) before declaring a stage accepted.
- Successful unit tests, standalone GF1/GF2/GF3 flows and compile/build checks
  do **not** count as FullFlow end-to-end acceptance.
- FullFlow remains **HOLD** until the complete disposable-DB integration plus
  multi-role browser journey is green **on the same commit**. Never test or
  migrate the production branch for this acceptance.

## Priority blockers, in order

| Priority | Blocking condition | Resolution and exit evidence |
| --- | --- | --- |
| P0 | Acceptance jobs cannot start without an isolated Neon test connection and application-host comparison. Current Admissions Neon job fails on missing GitHub environment secret/variable, before DB tests execute. | Configure the `integration-test` environment with `CAN_ADMISSIONS_TEST_DATABASE_URL` pointing **only** to a disposable Neon branch and `CAN_APPLICATION_DB_HOST` as a nonsecret hostname. Run guarded preflight, migrate isolated branch, then real DB suites. This is a runner configuration action, not a code regression. |
| P0 | Existing GF3 launch, curriculum adoption, GF2 enrollment and GF1 classroom tests create independent fixtures. Their separate green results cannot prove the IDs connect. | Implement ONE orchestrated FullFlow integration/browser fixture and assertion chain using the same site/program/section/student. Find and fix the first broken handoff; rerun the whole chain after each repair. |
| P0 | Application/browser evidence is not yet captured for this continuous journey. | Run real server-issued sessions for school registrar, publisher (if separate), teacher, guardian and student on one isolated instance; verify after reload and against SQL identity continuity. |
| P1 | Data/authority mismatch may occur at each existing service boundary. | Diagnose from the first actual failing assertion: GF3 → curriculum → admission → student work → teacher/guardian → operations. Fix only the failing canonical command or projection and add a regression. |
| P1 | Security and audit may be incomplete for some cross-role handoffs. | Require scoped denial and material domain events/audits for all consequential mutations in the same journey. |
| P2 | Network contracts, denomination HQ creation and site-linking are distinct optional entry channels. | Maintain their existing work but do not expand this subsystem until this primary school journey reaches acceptance, unless an actual blocker in the journey depends on it. |
| P3 | Styling, extra features, advanced AI, new portal design and contract/product polish. | Defer until the connected journey works end to end. |

## Current evidence, not assumptions

- **Primary CI:** existing `FullFlow` commits have passed build,
  typecheck, unit tests and migration-generation parity. These are static and
  isolated checks only. See [draft PR #172](https://github.com/bryanhkelly/can-os/pull/172).
- **Disposable DB acceptance:** **TEST BRANCH MIGRATED, APP TEST NOT RUN**. On run
  [39735575555](https://github.com/bryanhkelly/can-os/actions/runs/39735575555),
  Admissions Neon Acceptance failed at the required isolated database secret
  check. It is not evidence of failed admissions domain assertions.
- **Connected six-step FullFlow integration:** **WRITTEN / NOT EXECUTED**.
  The rollback-isolated `tests/integration/full-flow.integration.test.ts` now
  follows the same newly created Site/Program through publishing, adoption,
  verified teacher assignment, program activation, family application, signed
  synthetic form, offer acceptance, enrollment/class placement, student lesson
  completion, assignment submission, teacher grade, guardian visibility and a
  relational operational-record cross-check. Its server context uses a test
  actor adapter, **not real browser session authorization**; this is not
  sufficient acceptance. The test and all dependent domain behavior remain
  unverified until run against the isolated Neon database.
- **One connected authenticated browser journey:** **NOT IMPLEMENTED / NOT RUN**.
  The rollback integration fixture cannot replace persistent cross-session
  browser verification. The notification/intervention loop and school
  dashboard reload are not fully checked in this integration test.
- **Production release:** **HOLD**. Merging to `main` requires separate user
  authorization.

## Isolated Neon test branch verified

- Neon project: `sweet-hall-62441909` (`can-os`).
- Disposable branch: `fullflow-e2e-20261022`
  (`br-proud-pine-arfju8h2`), branched from `test01`, **not** the
  project's default production branch.
- All **30** committed migrations were applied to this isolated branch and
  checked against `drizzle.__drizzle_migrations` (including migrations 0028
  and 0029). Core program rows were unchanged; the primary branch was untouched.
- We are intentionally bypassing GitHub Actions for DB acceptance. The
  repository CI may still run as a static check.
- Execute `npm run test:integration:full-flow -- --preflight` and then
  `npm run test:integration:full-flow` from a runner with Node dependencies,
  an isolated `TEST_DATABASE_URL`, `CAN_APPLICATION_DB_HOST` set to
  the main database host, `CAN_TEST_DB_WRITES_ENABLED=true`, and `APP_ENV=test`.
  Do **not** use the main Neon branch, bypass the endpoint guard or mark
  skipped/unexecuted tests as passes. The code runner is currently unavailable
  in this chat's filesystem/network environment.

## Execution order once the test runner is available

Preflight isolated Neon and migrations → GF3 program launch → publisher
publish and school curriculum adoption → teacher Section provisioning →
family application/offer/consent/activation and Section placement → student
lesson/work/submission → teacher grade and notification → guardian and
school projections → refresh/cross-role denial → persisted relational/audit
check. Stop at the first failed step, fix the narrowest canonical boundary,
rerun from the beginning.

**Not in scope for this gate:** a live executed agreement with a denomination,
opening HQ accounts or an HQ-created Site. Those are valid alternate onboarding
paths but not prerequisites for a school-operated high-school extension.
