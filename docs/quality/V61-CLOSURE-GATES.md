# CAN OS V6.1 component architecture: bounded closure gates

**Status:** In progress. This document is a verification plan, **not** evidence that any gate has passed.

## Scope and environmental constraints

- Work from the repository's **main** branch. Do not use `test01` or an alternate application database to certify this initiative.
- GitHub Actions and Netlify are currently blocked by an outstanding balance. Their failed or step-free jobs **must not** be classified as source-code defects without independent evidence.
- No automated deployment, production database mutation, or hosted-CI rerun is part of V6.1 consolidation.
- Stop expanding the shared library for the sake of eliminating raw HTML. Specialized UI is legitimate when it preserves semantics, accessibility and domain ownership.
- Keep component migration separate from future page-by-page modernization.

## Cycle 1: independent source verification and defect classification

From a clean `main` checkout with Node 22 or newer, run:

```bash
node scripts/verify-v61-local.mjs --list
node scripts/verify-v61-local.mjs --preflight
node scripts/verify-v61-local.mjs
```

The runner checks its clean `main` commit SHA before installing locked dependencies and invoking the existing V6.1 design checker, diagnostic adoption inventory, Cloudflare **build only**, application build/route generation, typecheck, lint, focused V6.1 regressions, full unit suite, Storybook build and Storybook browser tests. No deployment or database connection is authorized.

Results are written to `results.json` with individual logs in a newly created OS temporary directory. Record the actual SHA, commands, exits and logs in the V6.1 acceptance record. **No checked result may be inferred from the existence of this script.**

The local runner rejects non-`main` or dirty checkouts and refuses common ignored `.env` / `.dev.vars` files containing database credential keys. It captures source integrity before and after every command; a moved HEAD, changed branch, or modified tracked source invalidates the whole attempt rather than mixing SHAs. The `--preflight` option verifies these prerequisites without installing dependencies. This reduces accidental database use but is **not** a network isolation sandbox: operators must keep credentials and production resources unavailable to test code.

If Storybook's Chromium executable or system dependencies are absent, report an **environment prerequisite**, not a product failure, and install the browser dependencies only in the independent local environment. If GitHub `main` advances after the checkout or during test execution, refresh `main` and rerun rather than mixing evidence across commits.

The diagnostic adoption inventory is not a completion percentage, nor does every remaining native element constitute a defect.

Classify each discovered issue as:

| Classification | Action |
| --- | --- |
| P0 critical/high application or cross-role defect | Fix before V6.1 closure |
| P1 meaningful duplication, regression or governed visual violation | Fix in Cycle 2 when within the stated scope |
| Environment blocked | Preserve logs and reason; do not attribute to code |
| Deliberate specialized UI exception | Document contract, rationale and owner |
| Future legacy-page migration | Move to a separate backlog; not a V6.1 closure blocker |

A local gate result of `engineering-gate-passed` establishes only that its recorded commands passed at that commit. It does **not** establish authenticated browser acceptance, persisted database behavior, production status, or green hosted CI. If dependency installation or browser provisioning fails, classify the cause from its log rather than silently skipping the gate.

## Bounded Cycle 1 defect ledger (November 17, 2026)

This is a source-review snapshot, **not** a passing application build or production acceptance report. Only confirmed findings and explicit environmental blockers belong here; do not invent a failure percentage or imply that unrun suites passed.

| ID | Classification | Evidence / status | Remaining gate |
| --- | --- | --- | --- |
| CLASS-TRANSFER-001 | P1, integration bug | In `/class`, transfer choices previously included `for_credit` even though the server transfer validator accepted only `audit` and `not_applicable`. The UI also initialized the selected mode independently of the destination. Corrected by a shared transfer-mode contract, destination filtering, reset behavior and focused unit/source-contract tests committed to `main`. Eight source-level consistency assertions passed against `main` at `d9f42525754d9d07fc05ce88b0fe2b4e4e4f1c35`. | Execute the focused Vitest suite and authenticated transfer/declined-transfer browser journeys; verify persisted source and destination records. |
| CLASS-REFRESH-002 | P1, integration/reconciliation bug | Class transfer and withdrawal previously caught a failed view refresh as though the server command itself failed. The affected card now reuses `useMutationFeedback` / `MutationFeedback`, preserves the saved outcome, prevents a duplicate command until refresh is retried, and calls query invalidation with `throwOnError:true`. Existing shared mutation-runner tests and a new route source-contract test cover the intended behavior. | Run full Vitest and authenticated refresh-failure/transaction-persistence acceptance; other `/class` actions still require separate source review for this pattern. |
| CLASS-REFRESH-003 | P1, integration/reconciliation bug | The same saved-command + failed-refresh ambiguity existed in public Class enrollment, approval request, approved-place acceptance and invitation acceptance/decline. The existing `/class` feature cards now share the `useMutationFeedback` recovery contract, with command-specific success messages, independent server authorization and refresh-only retry. Added a focused four-card source-contract regression and included it in the local V6.1 test gate. Source inspection across all four cards confirmed the shared feedback/refresh-retry wiring at `c7aa0dbef4dec574298f92b3a5f832512aee590e`. | Full Vitest and persisted authenticated acceptance are **unverified**; specifically test a successful server mutation followed by failed refetch, reload, and independent role visibility. |
| NONCREDIT-REFRESH-004 | P1, enrollment/reconciliation bug | In `/learn/enroll`, the adult registration and waitlist commands were wrapped together with cache refresh in a single error handler; a saved decision could therefore appear as a failed enrollment. A release- and consent-digest-keyed controller now owns the two server-authorized commands and uses shared `useMutationFeedback` / `MutationFeedback`, preserves accepted outcomes, blocks duplicate writes while refresh is unresolved and retries cache refresh separately. The two affected query families are invalidated with `throwOnError:true`; focused source-contract regression was added to the local V6.1 gate. | Run targeted Vitest and authenticated browser acceptance covering registration, waitlist invitation, changed consent, refresh failure, and persistence. Code review is not database acceptance. |
| NONCREDIT-MANAGEMENT-005 | P1, enrollment/reconciliation bug | The My Activity noncredit management panel previously combined successful server withdrawals and waitlist cancellations with cache invalidation inside the same catch block, allowing a readback failure to appear as a failed command. Withdrawal and waitlist exit now use shared `useMutationFeedback` and `MutationFeedback` with refresh-only recovery, explicit query invalidation failures, and disabled stale controls. Source regression covers each command and three read-model families. | Run focused Vitest and authenticated persisted withdrawal/cancellation tests, including a deliberately failed first refresh and successful refresh retry; no database writes were performed during source review. |
| ENV-CI-BILLING | Environment blocked, not a confirmed code defect | GitHub Actions and Netlify are blocked by an outstanding balance, per operator report. Previous step-free workflow failures cannot establish code failure. | Hosted CI remains a separate post-billing gate. |
| ENV-LOCAL-EXECUTION | Environment blocked, not a confirmed code defect | The current isolated tool runtime cannot resolve `github.com` to clone the complete repository. Local application typecheck, lint, builds, Storybook and browser acceptance have therefore **not** been executed from the checkout. | Run `node scripts/verify-v61-local.mjs` on a clean, credential-free `main` checkout, preserve its SHA-keyed logs, then classify actual failures. |

All other proposed component migration work remains out of scope unless an independently reproducible defect emerges. An isolated policy-function smoke check is not the same as a successful Vitest run against the full repository.

## Cycle 2: high-value integration defects only

Review actual behavior and affected V6.1 presentation contracts in these areas:

1. `/class` and native classroom entry, loading, errors, and actions.
2. Registration and enrollment lifecycle, including waitlists, cancellations and state recovery.
3. Academic workflow record, assessment, grade, readiness and evidence states.
4. Site administration, role switching and cross-role/authorized status consistency.
5. Reused feedback, dialogs, tables and keyboard/focus semantics in those workflows.

Preserve canonical service commands, server-side authorization, persisted records, accessibility and audit trails. Require a reproducible failure or clear contract violation before migrating a feature. Fix only validated defects; record meaningful exceptions.

**Cycle 2 exit:** no known P0/P1 V6.1 component/integration defects in these areas; any deferred work is explicitly outside the initiative.

## Cycle 3: authenticated acceptance and freeze

Authenticated browser acceptance is separate from Cycle 1's component and Storybook tests. Do not represent synthetic renders as persisted cross-role workflows.

Test from login through saved/reloaded data with independently authorized identities:

| Role | Representative connected journey |
| --- | --- |
| Student | Open assigned Class, complete permitted learning action, reload and see persisted state |
| Guardian | Use authorized child context, follow enrollment/academic status; verify unauthorized child is inaccessible |
| Teacher | Open assigned Section, perform permitted academic action and verify released state |
| Site Admin | Enter the correct Site scope, manage assigned class or enrollment operation and confirm persisted status |
| Network operator | Verify delegated scope, rollups and evidence without leaking other Sites' records |

For each journey record identity/scope (redacted), expected result, actual persisted result, timestamps, audit/reconciliation when applicable, negative authorization case, and an evidence link or log. Test 390/768/1024/1440 px layouts, 200% zoom, keyboard order, focus restoration, screen-reader names, loading/empty/error/retry paths, light/dark/site-brand contrast and V6.1 square geometry.

Only perform database-backed actions in an explicitly authorized environment, with independently verified credentials and environment identity. Do not fall back to `test01`.

## Final closure declaration

**Engineering closure** requires an exact-main-SHA passing independent local gate, passing relevant authenticated browser and persistence evidence, no unresolved critical/high V6.1 integration defects, and a governed exceptions ledger. The final declaration must report the tested SHA and the environment used.

**Hosted CI and production release** remain separately blocked until billing is resolved and the services are independently revalidated. Never write “green CI” unless GitHub Actions actually executes and passes at the claimed SHA. Neither a local pass nor this document is authorization to deploy.

After Cycle 3, freeze shared component contracts. New feature-specific issues or legacy-page migration belong to their own bounded backlogs; do not reopen an indefinite V6.1 consolidation initiative.
