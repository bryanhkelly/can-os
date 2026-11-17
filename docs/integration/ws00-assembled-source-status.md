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


## WS00 follow-up: WS6 retake evidence, execution fallback and CI dispatch

On the next integration pass, WS3's remaining two documentation/contract-test edits were reconciled. Five other feature branches had no unintegrated commits when checked; a feature author can continue pushing later, so recheck exact SHAs before promotion.

### P0/P1 verified cross-stream reporting correction

WS2 explicitly allows historical retake Course Attempts to reference the **same original native Class Enrollment**. The earlier WS6 report reader selected only the single pointer `class_enrollments.course_attempt_id`, which could silently omit actual attendance and assessment results from other exact-source Course Attempts. The integrated WS6 reader now:

- Selects **all** canonical `learner_course_attempts` for the exact authorized `class_enrollment_id` set in the report's existing read-only repeatable-read transaction.
- Verifies source Enrollment, Section/noncredit exclusivity, Deployment and Course version for every returned attempt, and checks that the selected current pointer belongs to the same Enrollment.
- Passes the full historical attempt ID set to the report's pure aggregation while preserving **one** Registration/Enrollment metric per Enrollment and distinct Person counts across those attempts.
- Refuses a duplicated historical attempt ID, an attempted cross-Enrollment reuse, or a selected pointer not present among exact owned attempts.
- Retains private report scope, source limits and the deliberately unavailable formal completion metric. No new activity or grading ledger was introduced.

Added test cases to `tests/unit/participation-reporting.test.ts`. The original TypeScript aggregation logic was separately evaluated in V8 **after erasing type annotations** against four focused fixtures: one retake's valid presence/assessment with one registration, incorrect selected pointer, duplicate retake, and an attempt shared across Enrollments. **4/4 passed**. This is NOT a successful TypeScript compiler, Vitest, SQL integration or signed-in browser result. Direct read-only `test01` SQL confirms `learner_course_attempts.class_enrollment_id` exists and a partial unique index `native_course_attempt_class_seq_uq` begins with that column. No database rows or schema were modified.

The cross-workstream static guard was tightened to insist on complete Class Enrollment attempt query/mapping. Actual retrieved integrated source passed **9/9 static contract checks** after this change, executed in a read-only in-memory adapter.

### Reproducible build path while GitHub Actions cannot dispatch

- Created [P0 GitHub Actions issue #317](https://github.com/bryanhkelly/can-os/issues/317). Runs have empty workflow names, a synthetic `BuildFailed` path, `startup_failure` and **0 jobs**. This is a GitHub Actions pre-job problem, NOT a compiler result.
- Possible causes include account/org billing restrictions, disabled Actions, or a broken/deleted synthetic workflow registry. **No actual billing or GitHub backend root cause has been verified.** The issue lists run IDs, settings/API checks and a GitHub Support escalation path.
- Added `npm run verify:ws00`, backed by `scripts/acceptance/run-ws00-local-gate.mjs`. It requires a clean checkout of `integration/programs-courses-classes`, prints its SHA, disables new feature flags for its subprocesses, clears common DB/deployment environment variables, and sequentially runs `npm ci`, documentation/static guards, Cloudflare/app builds, TypeScript, ESLint/design system, focused and full unit regressions. **This script was syntax-checked but cannot be executed in the current runtime because the private repository cannot be cloned and npm dependencies are not mounted.** `npm ci` still requires package network/cache access on the machine running the local gate.
- Success of the local source/build gate would still **not** authorize a database migration, changes to main, enabling feature flags or production deployment. Signed-in, isolated SQL, RLS and last-seat/concurrency acceptance remain mandatory.

**Status remains DRAFT / NO-GO**, without altering main or production.


## WS00 latest WS3 assessment revision reconciliation

After the prior status update, WS3 pushed 11 more source commits. WS00 merged the new revision projection, native Class evidence reader, completion authorization SQL, two revised tests, integration-gate assertions and WS3 documentation at `70f889477187931862627848116d7f021e256a9f`. The original WS00 Class -> exact Enrollment lock discipline was preserved in WS3's new source. A final compare confirmed **all six feature branch heads were included** in the integration history at the time checked; integration remained **zero commits behind `main`**.

The WS3 `latestCanonicalAssessmentRevisions` projection correctly chooses the highest revision instead of trusting a possibly incomplete `supersedes_id` chain. WS00 identified and corrected an additional edge case: if any row for a canonical assessment attempt has an invalid revision number, the adapter must mark that attempt ambiguous and suppress its ostensibly valid current result. This is now enforced at the pure domain boundary, not solely by downstream caller checks. Added a mixed-valid/invalid regression to `tests/unit/ws3-assessment-revisions.test.ts` and included it in both CI and the clean-checkout local verification path.

Read-only V8 runtime evaluation of the retrieved pure TypeScript projection after type erasure passed **5 of 5 focused cases**: latest-revision selection, later voiding, mixed invalid and valid revision denial, duplicated latest revision denial and independent assessments. WS6's independent retake-evidence checks passed **4 of 4** in the same limited V8 technique. Cross-stream inspection passed **10 of 10 source gates** (the original nine checked together, new WS3 gate checked separately). These outcomes are **not** a compiled application, Vitest run, Neon mutation test or signed-in E2E pass.

A later GitHub Actions integration run [44004753007](https://github.com/bryanhkelly/can-os/actions/runs/44004753007) also reported `startup_failure` with empty name and synthetic `BuildFailed` path; no jobs began. Issue [#317](https://github.com/bryanhkelly/can-os/issues/317) remains the CI P0 dependency. `npm run verify:ws00` is available on a clean checked-out integration branch as a **locally executable fallback**; WS00 could not execute it in the current environment.

**NO-GO for main and production** pending an actual exact-SHA build, restricted database acceptance, migration approval and two-Site/guardian authenticated testing.


## WS00 continued integration: guarded completions and My Activity history

- WS3's subsequent append-only `class_outcomes` guard and rollback-only, isolated SQL fixture tests were merged at `8eb7221edc55f0808e2052afac7fc7cdc24ef336`. A governed formal Class completion can no longer be silently changed or deleted by that proposed migration. The SQL is still **staged and unapplied**, so this does not claim persistent database protection.
- Found a WS1/WS2 cross-stream issue: My Activity called the old `getMyNativeClassEnrollments` source, which returned only the first 100 Class Enrollment records. This lost older history despite WS2 having a Person-scoped, immutable, microsecond-cursor history API.
- WS00 now calls `getMyNativeClassEnrollmentHistoryPage` through `readBoundedNativeClassHistory`, revalidating the original canonical learner scope for every page. It fetches at most ten pages of 50 records, denies duplicates and stalled cursors and continues reporting its source coverage as **partial**.
- If more than 500 Class enrollments exist, the My Activity source emits a bounded-history notice, and its 6.1 UI links to `/learn/classes`, which supports continued historical pagination. This is not a blanket claim of lifetime history completeness across school Sections and noncredit sources.
- Added `tests/unit/native-class-history-pagination.test.ts` and included it in `ws00-integration-gate.yml` and `npm run verify:ws00`. Its tested scenarios include 120 historic rows, duplicate IDs, stagnant cursors, empty continuing pages, bounded truncation and oversized pages. A scratch copy of the pure helper was separately compiled using `tsc --strict`, and seven isolated Node assertions passed; the full GitHub repository, Vitest and authenticated browser suites are still **unexecuted**.
- A source-level check of the new WS1/WS2 integration and its UI/guard/tests passed 9 of 9 inspected assertions. This is narrower than an application build.

**Latest observed status:** all six feature branch heads were included and integration was **0 commits behind** `main`. However, the GitHub Actions run [44010158564](https://github.com/bryanhkelly/can-os/actions/runs/44010158564) still produced `startup_failure` before any job. PR #307 stays **DRAFT / NO-GO**; issue [#317](https://github.com/bryanhkelly/can-os/issues/317) tracks CI restoration. No changes to main, test01 or production were made in this continuation.
