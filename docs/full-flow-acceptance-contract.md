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
| P0 | The connected service journey passed at `773b94c2`, but the current instructional-coverage change has not been executed against the migrated disposable database. | Run guarded `--preflight` and `npm run test:integration:full-flow` on the isolated Neon branch. Fix the first failed assertion; no skipped tests count. |
| P0 | The rollback-only fixture cannot prove persisted UI behavior after refresh, actual session grants, event delivery, or the unified operations view. | Build a persistent but disposable per-run scenario using existing Playwright authentication helpers, test registrar/publisher/teacher/guardian/student in distinct sessions, process the event outbox, verify notifications and operations from the app after reload, then revoke sessions and clean up. |
| P1 | The current branch-wide unit and type checks are not green even though focused staffing tests and the production build pass. | Triage stale fixtures separately from product regressions; require the full unit suite and typecheck to pass on the acceptance commit. |
| P1 | Data/authority mismatch may occur at each existing service boundary. | Diagnose from the first actual failing assertion: GF3 → curriculum → admission → student work → teacher/guardian → operations. Fix only the failing canonical command or projection and add a regression. |
| P1 | Security and audit may be incomplete for some cross-role handoffs. | Require scoped denial and material domain events/audits for all consequential mutations in the same journey. |
| P2 | Network contracts, denomination HQ creation and site-linking are distinct optional entry channels. | Maintain their existing work but do not expand this subsystem until this primary school journey reaches acceptance, unless an actual blocker in the journey depends on it. |
| P3 | Styling, extra features, advanced AI, new portal design and contract/product polish. | Defer until the connected journey works end to end. |

## Implementation bite: response loop and connected operations

- **Guardian academic view:** a related guardian can read a graded attempt and
  submit exactly one school follow-up question per submission. Its Action is
  scoped to the same School/Program/Section/Student, with an audit and durable
  domain event. Identical retries return the prior Action; conflicting retries
  are rejected. A revoked academic relationship prevents reading or creating
  new requests. The grade itself is not changed.
- **School operations:** school registrars see and can triage/resolve that
  Action through `/operations` with an explicit resolution note. The teacher
  and active school registrars receive in-app notification on request; on
  resolution, the guardian receives a notification only if their academic
  relationship still exists. Guardian academics renders the original question,
  current status and school resolution. Notification links enforce current
  site/program/organization and guardian relationship membership.
- **Operational record:** the `/operations` dashboard now reads canonical
  Programs, published course releases and program adoptions, Section teacher
  assignments, Applications, active Program enrollments and Section placements,
  Assessments, graded/submitted work, and outstanding guardian responses.
  It presents aggregate per-program counts with academic provider and credit
  issuer references. It is a read model, not a new data store, and never
  presents synthetic readiness approval flags or student identifiers.
- **Regression coverage:** pure unit tests enforce guardian question ownership,
  nonduplicate summary counts, program isolation, and no fabricated readiness
  indicators. The six-stage rollback fixture additionally attempts grade
  notifications, guardian questions, school response, duplicate closure,
  cross-tenant dashboard denial and guardian relationship revocation. The
  connected run at `773b94c2` passed two tests against 46 migrations; current
  changes require a fresh connected run before they inherit that evidence.

**Remaining P0 acceptance:** rerun the complete integration test on the current
commit, then connect real verified sessions in a multi-user browser run with
persistent state and reload. **Do not label this bite end-to-end passed until
both checks are green on the same commit.**

## Current evidence, not assumptions

- **Static and unit checks:** the production build, 86 route contracts and
  mutation-hygiene checks pass with the shared instructional-coverage change.
  Focused staffing/placement tests pass. The full suite currently records 43
  failed tests and typecheck retains 47 diagnostics; these are not acceptance
  passes. See [draft PR #172](https://github.com/bryanhkelly/can-os/pull/172).
- **Disposable DB acceptance:** the dedicated branch was reported migrated
  through 46 migrations. Two connected tests passed at `773b94c2`, including
  the six-stage school journey and independent church/CAN operating authority.
  The current instructional-coverage change is **not yet database-verified**.
- **Connected six-step FullFlow integration:** **EXECUTED AT PRIOR COMMIT /
  CURRENT COMMIT PENDING**. The rollback-isolated test follows one newly
  created Site/Program through publishing, adoption, verified teacher
  assignment, activation, family application, consent, offer acceptance,
  enrollment/class placement, student work, grading, guardian response and the
  operational record. Its test actor adapter is not real browser session
  authorization and cannot satisfy browser acceptance.
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
- The dedicated branch was reported migrated through **46** committed
  migrations and checked against `drizzle.__drizzle_migrations` before the
  connected run at `773b94c2`. Current schema parity must be checked again by
  the guarded runner before further acceptance claims. Production data and the
  primary branch remain excluded from these tests.
- We are intentionally bypassing GitHub Actions for DB acceptance. The
  repository CI may still run as a static check.
- Execute `npm run test:integration:full-flow -- --preflight` (offline,
  endpoint-isolation only), then `npm run test:integration:full-flow`
  (connected schema validation and integration fixture) from a runner with
  Node dependencies,
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
