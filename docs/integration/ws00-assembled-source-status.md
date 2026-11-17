# WS00 Integrated Source Review and Release Evidence

**As of 2026-11-16, Pacific time.**  
**Main SHA:** `5f0f09a59d0d14eb0d1cc8a16f2b09d32dd160aa`.  
**Integration branch:** `integration/programs-courses-classes`.  
**Release state:** **DRAFT / NO-GO**. No main merge, production database migration, production feature flag activation or production deployment authorized.

## Source integration completed, without altering feature branches

- WS1 My Activity / participation display model v1.1: staged from `feature/my-activity`.
- WS2 native Class enrollment lifecycle, guarded publication and immutable withdrawal/cancellation: staged from `feature/enrollment-lifecycle`.
- WS5 operator Site/Course rollout, publisher version impact and governed proposal: staged from `feature/program-operations`.
- WS4 Course-linked Session agendas and schedule changes: staged from `feature/class-delivery`.
- WS3 existing-source-bound completion and independent evidence review: staged from `feature/outcomes-completion` and its subsequent feature-branch updates.
- WS6 source-evidence Class/provider reports and scoped CSV: staged from `feature/participation-reporting`.
- Latest `main` source history was merged as a parent at `ffbe2a48a9e7e418d11693cc8c0b805a31132d0a`. GitHub compare reported **zero commits behind main** when checked.

Integration uses explicit reviewable multi-parent commits and file-level reconciliations. **A staged source merge is not proof that a draft feature passes CI or its runtime database prerequisites.** All original feature branches remain intact.

## Cross-workstream code fixes on integration

| Overlap | Resolution in integration |
| --- | --- |
| WS2+WS5 Class Offering publication | Retained WS5 publisher/rollout code and restored WS2 `assertOperationalClassOfferingTerms(terms)` with live selected enrollment methods and allowed credit modes **before** the publication write |
| WS2+WS3 enrollment/completion race | WS3 governed decision now locks **parent Class -> exact Class Enrollment -> Course Attempt** so it matches the WS2 exit path; preliminary Class ID lookup is not authorization and locked Enrollment association is rechecked |
| WS1+WS2 learner Class route | Kept WS2 withdrawals, capacity visibility and paginated Class history; retained WS1 My Activity navigation |
| WS1+WS5 navigation and route contracts | Preserved My Activity links, Program Operations Site workspace, and both route-contract entries |
| WS3+WS6 route integration | Added pending operator completion/evidence review and reporting route contracts with explicit read/write boundaries |
| WS6 Class report usability | Wired existing Class Management **Reports** tab to the scoped `/reports/classes/$classId` report; added provider Reports to Site Admin/Registrar navigation |
| Main Cloudflare build changes | Preserved `prebuild:cloudflare` Site-planning import verification when synchronizing latest main |

### Static/source evidence

`scripts/acceptance/check-ws00-cross-stream-guards.mjs` and `npm run test:ws00:contracts` were added to the integration source. The actual integrated file contents were fetched read-only from GitHub and the checker was executed in an isolated in-memory virtual-file adapter; **9 checks passed, 0 failed** on a reviewed integration snapshot. These assert only code/source contract presence and selected cross-file consistency, NOT actual Node module resolution, TypeScript, Vitest, SQL, or browser behavior. The report route and completion evidence adjustments do not imply those runtime checks passed.

`.github/workflows/ws00-integration-gate.yml` defines exact-SHA `npm ci`, static gate, Cloudflare/application builds, TypeScript, lint, targeted workstream Vitest, Class/Site regression and full unit suite. **The workflow has not produced successful jobs.** Multiple GitHub Actions runs still end with `startup_failure`, zero jobs and no compiler/build logs. Treat as a CI infrastructure/startup blocker, not a passed or failed TypeScript build.

### Direct read-only QA evidence (Neon test01)

Project `can-os`, branch `test01` (nondefault). Queries were read-only; no schema was mutated.

- Canonical `education_v30.classes`, `class_sessions`, `class_enrollments` all exist; each currently has **0 rows**.
- One noncredit self-enrollment release exists; **0** null-Site release records and **0** null-Site claim records as checked. Earlier null-Site QA data report is stale.
- Class, Session, Enrollment, Class Outcome and Class Award relations have forced RLS on the queried branch, with one policy each. This is **not** a restricted-principal authorization test.
- Proposed WS3 completion policy/pin, WS4 agenda, WS5 rollout plan/application relations are not installed; no migration executed.

## Required migration and feature release sequencing

1. On an approved **disposable** Neon child, verify all prerequisite canonical Class, Site, network attribution, issuer and evidence schema; inspect/apply only approved additive SQL and audited trigger replacement with explicit reviewer authority.
2. WS3 dependency order as a proposed WS00 unifying plan: `patch-ws3-source-bound-evidence.sql`, `patch-ws3-class-completion-policy-pins.sql`, `patch-ws3-independent-evidence-review.sql`, `patch-ws3-class-governed-outcomes.sql`. The first two are prerequisites for governed decisions; review-request approval must precede allowing approval commands. Owner documentation currently presents differing ordering of the final two patches; do not run a chain until reviewed against the SQL and restricted role grants.
3. Independently sequence WS4 `patch-class-session-agendas-ws4.sql` after native Class/Session and Course/assessment prerequisites. Prove that no Class, Course, Session or Course Attempt authority is duplicated.
4. WS5 `patch-publisher-rollout-approvals.sql` remains a separate proposal; do not activate new publisher approval rights based only on table creation.
5. Run role/revocation/RLS, concurrent withdrawal-vs-completion and last seat/invitation checks, and exact-sha authenticated one-hour / two-Site four-session / guardian school acceptance. No synthetic fixtures currently exist in test01.
6. Keep all WS3/4/5 feature flags OFF until the isolated migration, application build, restricted principal and browser gates have independently passed.
7. Rollback is previous compatible application version + disabling newly gated features; retain append-only historical outcomes and events, and use reviewed forward-fix for irreversible schema changes. A destructive rollback is not authorized.

## Outstanding P0 release blockers

- GitHub Actions `startup_failure`, no usable exact-SHA build/typecheck/test results.
- Proposed migrations and restricted-role grants not approved or applied in isolated QA.
- No two-Site/four-Session or one-hour training fixtures on QA and no authenticated end-to-end execution.
- Need DB concurrency/revocation tests for Class lock order, completion validity, cross-Organization/Site and guardian actor denial.
- Source coverage is explicitly partial in My Activity: an account-wide complete historical read and independent multi-grant reconciliation are not proven.
- WS6 formal Class completion metrics remain intentionally unknown until WS3 governed decisions and revocations are independently verified; network-wide metrics also require consent/grants and disclosure controls.

**Recommendation:** keep PR #307 in draft. It is source-integrated and structurally reconciled, but is **not merge-ready to main**.
