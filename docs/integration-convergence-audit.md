# CAN OS — Integration Convergence Audit and Execution Plan

**Status:** Active technical convergence plan; **release HOLD**.
**Scope:** `FullFlow` / draft PR #172, reviewed 2026-10-23.
**Method:** Inventoried the GitHub branch's complete tracked tree; traced selected critical
source, schema, UI routes, tests, CI scripts and existing active architecture contracts.
This is a **repository-wide structural inventory and cross-domain code review**, not a
claim to have executed or inspected every line of all 953 tracked files. Live cross-role
browser and disposable-database acceptance remain unverified.

## Principle

Integrate existing authoritative modules, do not create a second church product or
new parallel stores. Preserve Organization → Site → Program → SchoolYear → Section,
the canonical Person/Household/Enrollment relationships, Action, Journey, outbox,
audit history, and signed-in capability + resource + scope + relationship checks.
No synthetic persona, unchecked client selection, or product screenshot counts as proof.

## Inspected architecture surfaces

| Boundary | Canonical implementation | Integration obligation |
| --- | --- | --- |
| Identity | `src/modules/identity/command-context.server.ts`; `src/domain/access-context.ts`; `src/db/schema/access.ts` | Derive an explicit CAN-to-host Program authorization without widening unrelated church Organization grants |
| Organization / launch | `src/db/schema/organizations.ts`; `src/modules/programs/program-launch-service.ts`; `src/modules/programs/launch.functions.ts` | Separate host ownership, academic institution, credit issuer, contract and effective entitlements |
| Readiness / staffing | `src/modules/programs/launch-academics.functions.ts`; `src/modules/programs/section-readiness-service.ts`; `src/modules/staffing/delivery-arrangement-service.ts` | One verified staff/Section/calendar handoff, not a checkbox substitute |
| Curriculum | `src/modules/learning/curriculum-marketplace.functions.ts`; `src/modules/programs/launch-curriculum-eligibility.server.ts` | Publisher release → school adoption → eligible Section → assigned teacher under proper authority |
| Enrollment | `src/modules/enrollment/enrollment-service.ts`; `src/modules/enrollment/admissions-offer-service.ts`; `src/modules/enrollment/course-placement.functions.ts` | One application/offer/consent/Enrollment/Section identity, no synthetic-only state machine |
| Instruction | `src/modules/learning/class-access.server.ts`; `src/modules/learning/gradebook.functions.ts`; `src/modules/learning/academic-domain-api.ts` | Real student/teacher/guardian sessions, authored assignment, submission, grade, support Action and evidence |
| Official academic record | `src/modules/learning/report-cards.functions.ts` | Institution of record must authorize issuer-specific transcript creation |
| Onsite operations | `src/routes/site.day.tsx`; `src/modules/attendance/onsite-attendance-workflow.functions.ts`; `src/modules/operations/site-today.functions.ts`; onsite supervision/day review functions | Local site director role → attendance, staffing, site-day exceptions, limited permitted contacts, escalation |
| Oversight and response | `src/modules/operations/full-flow-dashboard.server.ts`; `src/modules/operations/workflow-integration.functions.ts`; `src/modules/communication/notification-center.functions.ts` | Same canonical IDs and source facts visible only to each verified actor |
| Trust and release | `scripts/run-integration-tests.mjs`; `scripts/verify-fullflow-schema.mjs`; `tests/integration/full-flow.integration.test.ts`; `tests/e2e/`; `docs/platform-route-contracts.json` | Execute the complete service and browser story on one commit / isolated migrated database |

## Prioritized confirmed findings and evidence gaps

### I-01 — Route inventory drift [P0, source fix committed; runtime not checked]
`src/routes/enrichment.tsx`, `src/routes/guardian.enrichment.tsx`, and
`src/routes/site.day.tsx` were absent from `docs/platform-route-contracts.json`.
The static route-contract checker rejects missing ownership. All three entries
were added on `FullFlow` in commit `cf65e286`; they start with `pending`
acceptance as required. Rerun the checker and pin results to the latest branch SHA.

### I-02 — Dedicated Neon migrations reconciled [P0 schema gate RESOLVED; runtime acceptance pending]

**Completed 2026-10-23:** Explicitly authorized migration `0032`–`0038`
was applied to `fullflow-e2e-20261022` with one branch-verified transaction
per committed SQL file, preserving original Drizzle source SHA-256 and
timestamps. A pre-migration recovery branch
`fullflow-pre-0032-0038-20261023`
(`br-spring-heart-arjhajgf`) was created first. Read-only postcheck shows
**39/39** ledger entries, all seven new hashes matching GitHub source, correct
new enums, columns, tables, indexes and constraints, and unchanged existing
Program/Site/Activity record counts. This is not a connected application test.
**Neither production nor test01 was used as a SQL target.**

**Current migration review:** [Dedicated Neon 0032–0038 SQL/branch preconditions](./fullflow-neon-migration-review-0032-0038.md).
A read-only, server-identity-attested `npm run db:review:fullflow` command is
committed. Those reviewed pre-0032 guards intentionally fail once the
target has 39 migrations and need a post-application/no-op mode before reuse.
The migration run used the branch-scoped Neon SQL connector with explicit
user authorization; its SQL transactions are recorded in the linked review.
Post-migration verification queries remained read-only.
**Neon branch isolation requirement (verified 2026-10-23):**
- Project: `can-os` (`sweet-hall-62441909`).
- ONLY authorized FullFlow database migration/fixture target:
  `fullflow-e2e-20261022` (`br-proud-pine-arfju8h2`).
- Its parent is `test01` (`br-bitter-feather-ar0u63x7`), which is NOT a writable
  FullFlow migration/fixture target.
- The default `production` branch (`br-restless-sea-ar9ooo55`) is NEVER a
  FullFlow migration or test target.
- Never treat `GitHub FullFlow` as a Neon branch name; these are different
  versioning systems. Migration SQL is committed to GitHub; applying schema
  migrations requires an explicit Neon branch connection.
- Before **any** mutating SQL or migration, verify project + branch ID, database
  name, host and isolated connection target against the approved branch;
  compare with production, fail closed on any uncertainty, and use the
  repository's guarded `TEST_DATABASE_URL` checks.
- Read-only inspections do not apply migrations. As of this review, **no
  migration was run** by this review on any Neon branch.

Before the authorized migration run, the source journal had 39 entries
while the dedicated branch had 32. That **specific schema drift is now
resolved**, with all seven migrations applied and postchecked. The next
gate is to run the guarded `verify-fullflow-schema.mjs` check and
connected FullFlow service acceptance from a trusted runner; neither was
executed by the Neon SQL migration session.

**Branch enforcement improvement (2026-10-23):** The code now checks
Postgres-reported `neon.project_id` and `neon.branch_id` against the approved
FullFlow IDs before executing any integration fixture. The guarded
`db:migrate:fullflow` command performs the same online branch verification
before invoking the existing Drizzle migrator. **Correction (2026-10-28):**
the independent admissions, academic-intervention, and curriculum-browser
GitHub workflows run plain `npm run db:migrate` against their own isolated
Neon targets; the `db:migrate:fullflow` wrapper remains intentionally
isolated to the FullFlow branch and is not wired into those workflows.
The admissions browser runner and all three
Playwright entry configurations also require branch identity verification.
Unit regressions assert these security gates are present.
**No migration execution, green CI or browser acceptance is claimed.**
The dedicated branch still needs reviewed migrations `0032`–`0038`.

### I-03 — FullFlow is still not a connected acceptance pass [P0, unverified]
`tests/integration/full-flow.integration.test.ts` uses a rollback transaction
and mocked actor/session context. It cannot by itself prove issued sessions,
persistent UI reloads, dispatched notifications or cross-workspace projection
integrity. The `tests/e2e/` inventory has focused browser scenarios but no
continuous Church-Hosted or six-stage FullFlow browser story. First run the
existing connected service fixture and fix the **first actual failing assertion**.
Then add one persistent-disposable, cross-session Playwright story.
Do not mark standalone GF1/GF2/GF3 tests as FullFlow acceptance.

### I-04 — Provider metadata is not CAN's institutional access [P0, confirmed]
`startProgramLaunch` currently sets `programs.organization_id` to
`hostOrganizationId`; `getCommandContext` projects accessible Programs from
`programs.organization_id` and the selected account grant. Thus simply
naming a different `academic_provider_organization_id` does **not** give
CAN staff scoped authority to that Program. Conversely, a local registrar's
broad built-in capability list is not proof of CAN institutional approval.
Do not change `programs.organization_id` as an isolated patch: readiness,
academic year, sections, enrollment, school-year and site projections join on
these values. First design and test a narrowly scoped, effective and revocable
academic service authorization keyed to the existing Program and Site.

### I-05 — Issuer-specific transcript authority [P0, initial fail-closed guard committed]

An additional command guard now denies transcript issuance when the authenticated
registrar's verified Organization scope does not include the credit issuer.
GF25 integration assertions explicitly deny host-only authority and check that
no official issuance row was inserted. **The database integration test is not
yet executed.** This interim control does not implement CAN's future verified
cross-organization delegation, which remains a separate P0 requirement.
`issueTranscript` checks registrar role, `enrollment:manage`, scope and
grade rows, then adopts the rows' `creditIssuingOrganizationId` as the
issuer. It does not establish that the *issuing actor* is authorized by that
issuer organization. A church-host registrar must not create an official CAN
transcript solely because they can view its courses. Add a distinct institutional
issuance capability/RoleAssignment and verify current issuer, active agreement
and program/actor relationship in the server command. Test unauthorized host
issuance, CAN-authorized issuance, revoked grants and mixed-issuer records.

### I-06 — School configuration / responsibility records lack connected workflow [P0, partly evidenced]
`school_configuration_versions` and
`program_responsibility_assignments` exist in
`src/db/schema/profiles-compliance.ts`, but the inspected disposable branch
contains zero rows in each. Current launch/services do not show a completed
approval, version activation, delegation and revocation journey for those
records. Reuse these tables and an accountable authority service instead of a
new responsibility JSON or demo-only workflow. Validate schema/service usage
against the latest branch before adding new fields.

### I-07 — Local site leadership and CAN supervision are different workspaces [P1]
`/site/day` gives a narrowly scoped onsite attendance/supervision surface;
`getSiteToday` remains registrar-only. That preserves student-data protections,
but the local leader cannot yet be credited with operating a fully supervised
school day from an integrated workflow. Join lawful site-director actions,
assigned instructional coverage, expected roster, exceptions, responses,
handoffs and family communication to the same Site/Program identifiers.
No local leader should inherit grades, counseling, custody records or issuer authority.

### I-08 — Child safety and regulated onsite operations [pre-onsite P0]
`docs/site-student-safeguarding-and-welfare.md` expressly says the intended
restricted intake/escalation system is **not yet operational**. A submit-only
capability does not mean there is an effective reporting channel, on-call
coverage or approved jurisdictional policy. Block actual onsite minors until
separately approved legal/child-protection controls and restricted workflow
exist and pass authenticated, negative-access and offline acceptance.

### I-09 — CI runtime unavailable; no source execution [P0 evidence]

GitHub Actions API job results on the reviewed FullFlow SHA show failed jobs
with `runner_id=0`, `runner_name=""`, `steps=[]` and completion in
roughly two seconds. **No runner accepted the job and no tests executed.**
This is an Actions execution/runner provisioning obstacle, not verified
application test failure. Diagnose the repository/account/organization Actions
availability or billing and re-run actual build/typecheck/unit checks.
The `FullFlow` CI and Admissions Neon Acceptance workflows were reporting
failure during this review. The connected API did not provide current job
steps/logs, so failure causes are **not diagnosed**; missing test secrets,
source failures, migration checks, and fixture failures must not be conflated.
Capture exact SHA, run, failed step and logs, fix underlying cause, rerun.

### I-10 — Finance is not the core-school acceptance gate [defer]
A host share/tuition simulation is not a ledger. Do not add actual invoices,
payments, ESA reimbursement or financial claims while the single-school
academic/onsite flow and institutional controls remain unproven.

### I-11 — Incomplete fixture route registration [P0, source fix committed]

The route fixture coverage manifest omitted `/enrichment`,
`/guardian/enrichment`, `/site/day` and `/sites/$siteId/publish`.
The checker requires a row for every surfaced route. All four now have
specific personas and needed interactions, but are explicitly flagged
`fixtureRequired:false` with the missing schema, verified relationships and
browser-story blockers. **This removes a manifest omission; it does not
prove any feature has usable fixture data.**

### I-12 — FullFlow branch enforcement previously leaked into unrelated suites [P0, corrected]

Earlier FullFlow Neon pinning was accidentally attached to the generic
admissions, GF1 and curriculum browser/migration runners. Those suites
have independent isolated Neon targets. Corrected: only `full-flow`
mode, its schema checker and the explicit `db:migrate:fullflow` command
require `br-proud-pine-arfju8h2`. Independent suites retain their
existing, separately guarded test connections and CI commands.

## Integration order and small acceptance bites

| Bite | Deliverable | Must pass before next |
| --- | --- | --- |
| C0 | Route/schema/CI convergence and reproducible evidence | All route ownership entries aligned; isolated migration ledger matches source; unit/type/build runner outcome recorded |
| C1 | One verified K–8 extension six-stage **service** flow | Same Org/Site/Program/Section/Student IDs from actual commands, grade, guardian/ops projection and negative access |
| C2 | Full authenticated browser flow and outbox/reload | Distinct server-issued publisher, registrar, teacher, guardian, student sessions; persisted state after reload; notifications and denied unrelated access |
| C3 | CAN–church service authority contract | Church Site retains ownership; independently approved, dated CAN authority references the existing Program; expiry/revocation and cross-tenant isolation tested |
| C4 | Institutional command enforcement | Actual CAN authorized academic staff and credit issuer can act; host registrar cannot use a named issuer to confer self-authority |
| C5 | Site director + onsite-day integration | Named director, site-day coverage, attendance, exceptions, restricted communications and approved safeguarding workflow verified |
| C6 | Unified school record / monitoring | CAN school-of-record oversight and local operational views reconcile to same canonical IDs, events, audit and source timestamps |
| C7 | Financial/operating service integration | Only after above: verified entitlements, billing, tuition obligations and host distributions against a real finance ledger |

**Cross-cutting tests for every bite:** revocation, other tenant/site, different
Program/Section, wrong guardian, unrelated teacher, expired policy, retries,
simultaneous writes, auditable events and reload. Prefer tests through real
server commands, not manually seeded goal-state records.

## Decision constraints

1. Keep `FullFlow` and draft PR #172 as the review surface; no main merge.
2. Preserve existing data and role boundaries; never grant CAN unrestricted church
   scope or make a local site director a registrar merely to reuse a screen.
3. Never label selected CAN provider/issuer, course credit units, contract
   references or completed Journey steps as legal authority/accreditation.
4. Disambiguate **Host Organization**, **Site Owner**, **Program Operator**,
   **Academic Provider**, **Institution of Record**, **Credit Issuer**,
   **CAN Service Entitlement**, and **Actor's Role Grant** before changing
   `programs.organization_id`.
5. Record committed code, runtime evidence and user-facing readiness separately;
   a green build alone never clears the release HOLD.
6. Do not introduce new features or route families until C0 and C1 have an
   executable evidence trail.

## Immediate next implementation

Finish C0: obtain diagnosable current CI logs, reconcile all 39 migrations
**on the disposable database only after reviewing each pending migration**,
rerun route/contracts/type/build/unit checks, then execute the canonical
`npm run test:integration:full-flow` runner. Fix the first observed failing
command or join before designing the broader CAN–church authority workflow.
