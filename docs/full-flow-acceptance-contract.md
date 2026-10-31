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

## Release gates — in priority order

| Priority | Gate | Required evidence |
| --- | --- | --- |
| P0 | FullFlow connected school journey | The real `npm run test:integration:full-flow` and `npm run test:e2e:full-flow` both pass on the **same reviewed commit** against the pinned disposable Neon branch. |
| P0 | Church-supervised onsite day | `npm run test:integration:journey-c` passes on the same commit, with independently verified child custody, safeguarding, staff presence and authorized attendance evidence. |
| P0 | Authentication and child-data authorization | Distinct verified sessions and negative cross-tenant/guardian checks pass, including after browser reload and access revocation. |
| P0 | Admissions/identity handoff | The separate `Admissions Neon Acceptance` workflow passes authenticated enrollment acceptance on an isolated Neon branch. |
| P1 | Static and schema integrity | CI build, typecheck, route/mutation audits, complete unit suite and incremental Drizzle migration parity pass on the same commit. |
| P1 | Operational readiness | Netlify scheduled jobs, email provider credentials, urgent-family delivery, alerting and independently verified opening authorization are configured for the deployed environment. |

The manual GitHub workflow `.github/workflows/fullflow-release-acceptance.yml`
runs the first two connected gates in a single serialized job. Its
`CAN_FULLFLOW_TEST_DATABASE_URL` GitHub environment secret must point to the
**pinned** `fullflow-e2e-20261022` Neon branch. The guard compares the
database-reported project and branch IDs, and refuses the production endpoint.
Do not weaken this gate to obtain a green badge.

CI success does not constitute release approval. A failed/skipped/missing
connected acceptance step means **HOLD**, even when every unit test is green.

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

## Current evidence and release decision (2026-10-31)

- **Build and unit suite:** GitHub CI on `FullFlow` passed at
  [run 41207022328](https://github.com/bryanhkelly/can-os/actions/runs/41207022328)
  after the admissions pagination and Neon entrypoint changes. On the
  earlier verified baseline, 2,039 tests passed, with no TypeScript or Drizzle
  migration-generation errors. Always use the most recent CI run for the
  exact proposed release commit; older green runs are not transferable evidence.
- **Connected rollback integration:** a connected six-stage transaction was
  previously reported at `773b94c2`; it does not prove current
  `FullFlow` behavior. The complete integration test exists at
  `tests/integration/full-flow.integration.test.ts` but requires a fresh,
  migration-aligned run.
- **Authenticated multi-role browser journey:** **IMPLEMENTED, NOT ACCEPTED**.
  `tests/e2e/full-flow.spec.ts` drives the operator, publisher, teacher,
  guardian, student and cross-tenant denials, persisting canonical IDs
  across app sessions and refresh. The guarded runner is
  `npm run test:e2e:full-flow`; it has **not** been demonstrated green
  on this document's current commit against an isolated Neon database.
- **Church-hosted day:** Journey C integration exists, but the separate
  site-director, safeguarding and child-release browser acceptance evidence
  is not yet recorded here as a passing release gate.
- **Admissions/GF1 acceptance:** the workflow currently fails at its
  missing isolated-test database GitHub secret. No admission or browser tests
  were executed in that failed run, so it cannot be counted as a regression.
- **Production release:** **HOLD** until all required connected checks pass,
  environment delivery is monitored, and the user independently authorizes
  promotion or merge to `main`.

## Pinned FullFlow Neon branch and runner

- Neon project `sweet-hall-62441909` (`can-os`).
- Pinned nonproduction branch `fullflow-e2e-20261022`
  (`br-proud-pine-arfju8h2`) is **not** the production branch.
- A historical connected run used a smaller committed migration set; current
  schema parity must be reverified. Never infer that generated Drizzle
  migrations were applied to Neon.
- Configure the `integration-test` GitHub environment with secret
  `CAN_FULLFLOW_TEST_DATABASE_URL` for this branch and environment variable
  `CAN_APPLICATION_DB_HOST` naming the production database hostname.
  The dedicated FullFlow release workflow first runs read-only preflights,
  then the guarded, reviewed migrations, rollback integration, Journey C and
  authenticated Playwright suite. A missing secret, unexpected Neon branch,
  absent database migration or failing session must block release.
- A connected CI workflow is a verification mechanism, **not** authority to
  create a school or release it to production. Screenshots, seed-only
  states, and static documentation are not proof of operational acceptance.

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

## Agent C acceptance evidence ledger (frozen baseline)

This ledger is a **test plan**, not a claim that any gate passed. All IDs below must originate from one continuous run; never substitute separately seeded school, Program, Section, enrollment, submission or grade records.

| Gate | Required positive evidence | Required negative evidence | Decision without verified run |
| --- | --- | --- | --- |
| School launch | Site, Program, Journey and authorization persist across a new session | Different organization cannot read or mutate Program | HOLD |
| Curriculum and instruction | Published version, adoption, Section, qualified teacher assignment and lesson share Program identity | Unassigned teacher cannot grade; wrong tenant cannot adopt or access | HOLD |
| Admissions and identity | Inquiry/application, offer, required consents, enrollment and activated student use stable identifiers | Unrelated guardian cannot view student or accept offer; revoked guardian denied | HOLD |
| Student and grading | Student loads published lesson, submits work, teacher grades and persisted grade survives reload | Wrong student or teacher denied submission/grade mutation | HOLD |
| Guardian and operations | Related guardian sees result; school sees canonical joins, audit and notification state | Other guardian/tenant denied; revoked access denied after fresh session | HOLD |
| Supervised onsite day | Authorized staff, roster, check-in/out, safeguarding and custody evidence linked to same student and Site | Unsafe attendance, unauthorized pickup, absent supervision and revoked staff denied | HOLD |
| Database parity | Exact integrated commit migrates cleanly on verified disposable Neon branch | Production/shared FullFlow endpoint rejected before writes | HOLD |
| Release provenance | Integration, Journey C, admissions and authenticated browser acceptance pass on same integrated SHA, with run IDs | Missing secret, skipped step, mismatched SHA or partial test coverage blocks approval | HOLD |

### Coordinator handoff and execution boundaries

1. Integration owner merges independently reviewed PRs to `FullFlow`; Agent C does not merge them or run acceptance against a moving branch.
2. Capture the final integrated commit SHA and the exact disposable Neon project/branch identifiers. Read-only preflight must attest the endpoint and migration journal **before any migration or fixture writes**.
3. Run the connected integration, Journey C, admissions acceptance and multi-role browser checks against that commit; record command, CI run URL/ID, migration parity, pass/fail and any skipped step separately.
4. Repeat the authenticated checks with a fresh session after revocation, and reload each role's persisted views. A server-function mock or a rollback transaction does not replace browser evidence.
5. Any missing `CAN_FULLFLOW_TEST_DATABASE_URL`, unsafe endpoint, incomplete migrations, failed child-safety denial, skipped browser step, or unavailable admissions acceptance is **HOLD**, not a product regression by inference and not a PASS.

**Frozen-baseline audit (2026-10-31):** Source inspection confirms the integration test, browser spec and serialized workflow exist. No connected test, migration, CI job or browser session was executed during this audit. No database was accessed or modified. The missing admissions test secret described above remains an unverified environment blocker pending coordinator configuration. CI run IDs for a definitive integrated release: **none**.

### Agent C implementation coverage versus unverified release gates

The browser spec now checks a separately authenticated unrelated guardian at three
different points: **before** offer acceptance (no acceptance or enrollment-form
signature), **after** grading (no grade, follow-up action or report-card
disclosure), and **after reload** (no reappearance of graded academic data).
The registrar's active enrollment must retain the application student
`personId` and the same `programId` even when the student has multiple
placement/enrollment rows. These are source-level assertions, **not recorded
passing test results**.

The browser spec does **not** yet exercise the church-hosted onsite attendance
and pickup experience. That remains a separately required Journey C acceptance
suite, whose negative custody and supervision cases must be verified on the
same final integrated SHA. Never substitute a passing academic browser journey
for those safeguarding results.

A workflow that passes only its connected job does **not** prove admissions
Neon acceptance, deployment operational readiness, or static/schema integrity.
The coordinator must record independent run IDs and verify every required
gate; an unavailable secret, skipped job or absent run is a release **HOLD**.
