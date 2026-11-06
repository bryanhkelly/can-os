# CAN OS P0 main stabilization evidence

Scope: P0-only remediation from the Batch 2 main-progression backlog. Baseline GitHub `main` SHA `836c26eb77b39e9abc7a496e7c7b94733e10d656`. This is implementation evidence, **not** a release certificate or permission to migrate/merge.

## P0-01 — Existing CI failures

Baseline [main CI 42174085807](https://github.com/bryanhkelly/can-os/actions/runs/42174085807): 21 failed, 3,900 passed across 11 failed test files. An [intermediate branch CI run 42290965518](https://github.com/bryanhkelly/can-os/actions/runs/42290965518) reported 7 failed, 3,915 passed, after targeted fixes. Current exact-head verification must be read from GitHub Actions, not inferred from earlier runs.

Changes in this PR are constrained to repairing stale route/component test fixtures, preserving required form validation, and the actual public inquiry-link defect. No removed authorization assertions or disabled test suites. Do not merge until current-head test outcomes are reviewed.

## P0-02 — Outbox event ownership

`SiteLocalWebsiteDraftSaved` is now registered in `src/workers/domain-event-worker.ts` through the existing lifecycle pass-through handler. The worker still performs ordinary subscriptions, leases and retries. This handler does not publish the private draft.

## P0-03 — Admissions connected CI: external configuration HOLD

[main Admissions Neon Acceptance 42174085785](https://github.com/bryanhkelly/can-os/actions/runs/42174085785) failed on its **Require isolated test database secret** step, before an integration assertion. Do not make the gate green by skipping acceptance or by using production, `test01`, or the pinned FullFlow acceptance branch. An authorized administrator must configure an approved disposable Neon target and GitHub Actions `integration-test` environment values:

- Secret `CAN_ADMISSIONS_TEST_DATABASE_URL` for the disposable branch only.
- Variable `CAN_ADMISSIONS_TEST_BRANCH_ID` for that branch's actual Neon ID.
- `CAN_APPLICATION_DB_HOST` for the production host guard, without credentials.
- All other current workflow-required test-write, project/branch attestation and isolation controls.

Re-run exact-head admissions acceptance only after the ordinary online identity preflight confirms a nonproduction, separate target. The GitHub connector in this session cannot set GitHub Actions environment secrets. **Unverified/HOLD.**

## P0-04 — Read-only source/Neon migration ledger reconciliation

Source `drizzle/meta/_journal.json`: 76 entries, indices 0–75, latest tag `0075_launch_studio_drafts`, timestamp `1793894025818`. Committed SQL/snapshots exist through 0075. Read-only SQL inspected `drizzle.__drizzle_migrations` on five explicit Neon branch IDs in project `sweet-hall-62441909`:

| Branch | Branch ID | Applied ledger rows | Highest timestamp mapped to current journal | Notes |
| --- | --- | ---: | --- | --- |
| Production main | br-restless-sea-ar9ooo55 | 77 | 0075 | All 76 current journal timestamps present, plus one extra historical row, ID 27 at 1792513890490; no writes |
| test01 | br-bitter-feather-ar0u63x7 | 73 | 0072 | Historical initial ledger rows differ; not approved as a fresh disposable target |
| FullFlow | br-proud-pine-arfju8h2 | 61 | 0060 | Pinned acceptance DB, behind source; do not repurpose or migrate without approval |
| integration-0067-0068 | br-blue-river-ar1k956t | 68 | 0066 | Behind journal, no writes |
| launch draft recovery | br-icy-tooth-arpvfys8 | 76 | 0074 | Deliberate recovery point predating 0075 |

Ledger timestamp coverage is **not** proof of matching SQL hashes, Drizzle generation, successful clean replay, or actual feature acceptance. The production extra legacy row is a review item, not authority to delete or rebuild history. This audit ran SELECT only, with explicit project/branch IDs. No schema or production data were modified.

## P0-05 — Fictional public-site structural visual QA

[main PX B visual acceptance run 42174085908](https://github.com/bryanhkelly/can-os/actions/runs/42174085908) captured 80 screenshots across four fictional schools. Its report recorded 15 structural failures, all from the same `/academics#program-inquiry-...` hero deep-link rendered without an actual inquiry form in read-only fixtures. The public site renderer now emits that deep-link only when a server-provided request ID factory can also generate the destination form, with a focused regression test. Rerun the original visual acceptance procedure on this PR's exact SHA before calling it accepted; do not treat a unit pass as deployed two-tenant hosting proof.

## P0-06 — Open PR ownership / collision review

Before merging, reconcile these overlapping open PR files, never wholesale-merge the old Batch 2 branches:

- [#262](https://github.com/bryanhkelly/can-os/pull/262): `src/domain/public-site-html.ts` and `tests/unit/public-site-html.test.ts`.
- [#269](https://github.com/bryanhkelly/can-os/pull/269): `src/domain/public-site-html.ts`.
- [#265](https://github.com/bryanhkelly/can-os/pull/265): broad design changes affecting route layouts; validate tests against current design.
- [#263](https://github.com/bryanhkelly/can-os/pull/263): admissions intake route; preserve separation of intake list and new inquiry.
- [#255](https://github.com/bryanhkelly/can-os/pull/255) and stacked [#261](https://github.com/bryanhkelly/can-os/pull/261): jurisdiction/opening authorization. This PR does not edit those guards.

No direct branch overwrite was performed. Any future conflict resolution must retain the exact condition that public inquiry deep-links are only offered when their target form is present, and must retain present-day authorization and institutional approval guards.

## Closure gates

1. Same-SHA `build`, `typecheck`, route checks, unit suite and visual acceptance re-execution with recorded results.
2. Independently configured admissions disposable-branch acceptance. Do not suppress failures caused by missing secrets.
3. Review any active PR overlap before changing shared files.
4. No automatic production migration and no automatic merge to main.
