# WS00 Integration Plan and Dependency Matrix

**Integration base:** `5e50d26c197330b3f01403c221f6646f8cbef823` on 2026-11-16.  
**Integration branch:** `integration/programs-courses-classes`.  
**Target:** `main` only after acceptance gates and approval.  
**Source of truth:** [Participation Read Model v0.1.0](./participation-read-model-v0.1.0.md) (provisional pending WS1 ratification).

## Baseline branch inventory

| Workstream | Branch | Exclusive work owner | Depends on | Shared interfaces |
| --- | --- | --- | --- | --- |
| WS1 My Activity | `feature/my-activity` | WS1 | current principal + canonical domains | PRM schema/DTO, authorized personal list/history, learner nav |
| WS2 Enrollment Lifecycle | `feature/enrollment-lifecycle` | WS2 | PRM v1 and existing release/seat/claim authority | release/cohort registration lifecycle, waitlist/invite/transfer, status events |
| WS3 Outcomes & Completion | `feature/outcomes-completion` | WS3 | PRM v1 and existing assessment/completion authority | completion decision references, awards, progress projections |
| WS4 Class Delivery | `feature/class-delivery` | WS4 | PRM v1, published enrollment release/class IDs | schedule/rooms/attendance assertions, hosted evidence |
| WS5 Program Operations | `feature/program-operations` | WS5 | PRM v1, existing Offering/Deployment/Organization/Site | operator workspace, publication/delegation and Site boundaries |
| WS6 Participation Reporting | `feature/participation-reporting` | WS6 | PRM v1, WS2/3/4/5 evidence | reconciliation, metrics, scoped views, disclosure-safe exports |
| WS00 Integration | `integration/programs-courses-classes` | WS00 | all above | merge ordering, integration adapters, route reconciliation, QA, release |

All seven branches were created from the **same** main commit; branches are never force-reset. Other already-existing `feature/unified-class-offerings` and `feature/network-attribution-reporting` branches were behind main (0 commits ahead at baseline); do not re-merge or recreate their work. Review their existing code in main and documentation for unverified or incomplete runtime/DB adoption.

## Change-control and ownership

1. WS1 exclusively owns the versioned PRM DTO and personal history projection. Other agents consume it and propose adjustments through an explicit contract PR/issue; no local forks.
2. WS2 owns authoritative enrollment lifecycle integration, not new Course Attempt or grading tables.
3. WS3 owns completion and award **integrations to existing authorities**, not a second assessment/gradebook.
4. WS4 owns delivery evidence, not source enrollment decisions or an alternate attendance ledger.
5. WS5 owns publication/operator services, not learner participation identity or permission shortcuts.
6. WS6 owns authorized reporting calculations/projections and tests; never rewrites enrollment/completion/attendance.
7. WS00 owns shared route/navigation conflict resolution, cross-cutting adapters, migration sequence, integration smoke, and documentation. A shared source file is edited by one owner at a time; request explicit handoff for overlaps.
8. Every additive migration must have an owner, dependency predecessors, RLS/GRANT review, data backfill strategy, rollback/forward-fix and QA fixture. No agent independently changes another agent's migration or core canonical authority. DDL and deployed app version must stay compatible during release.
9. Published release and active Class Site attribution must be approved real or virtual canonical Site; do not fabricate Sites or turn affiliations into Site identities. Reconcile existing null-Site records before network attribution migration.
10. Agents submit PRs **into integration** (not main) with tests, migration plan, security notes, screenshots where UI changes, and downstream dependency changes. WS00 reviews before accepting.

## Dependency gates and merge order

1. **Gate A: contract.** WS1 publishes and tests typed PRM v1. WS00 ratifies shared identity/status/authorization/metrics contract. WS2–WS6 may work independently now, but **must not merge dependent changes until Gate A**.
2. **Gate B: authority-facing services.** Merge WS2 (enrollment lifecycle) and WS5 (operations/publication) in dependency-aware order after contracts; reconcile any overlapping release and network schema first.
3. **Gate C: evidence and outcomes.** Merge WS4 delivery and WS3 outcomes, ensuring room attendance does not become official roll-call or completion.
4. **Gate D: reports.** Merge WS6 after WS2–WS5's proven source queries and time-scoped grants; metrics must reconcile to authoritative rows.
5. **Gate E: personal UX.** WS1's complete My Activity route, navigation, history and tests must be revalidated against all integrated services.
6. **Gate F: release.** Only after green checks, audited test01 migration evidence and authenticated browser paths, open/graduate a reviewable integration-to-main PR. Merge manually once up-to-date with main.

Cherry-pick only reviewed commits when branch ancestry is unexpected. Do not force push; do not delete or reset agent branches. New commits on main require a fresh comparison and explicit integration before final PR approval.

## Required exact-SHA verification

- `npm ci` with a supported Node version and a clean lockfile
- `npm run typecheck`; `npm run lint`; `npm run test`; `npm run build`; `npm run build:cloudflare`
- Existing targeted enrollment/classroom/network tests and new WS-specific unit tests, plus `npm run test:integration` with isolated QA credentials.
- Migration dependency ordering + forward-only/idempotent dry run against **test01** or an isolated branch, schema/API compatibility, RLS, effective-role revocation, protected data reads, least privilege, cleanup and restoration plan.
- Playwright authenticated desktop/mobile E2E: **one-hour training** enrollment -> course attempt -> playback/pairing if facilitated -> knowledge-check -> feedback -> governed completion; **four-session/two-Site** separate releases, schedules, explicit hosted attendance, cross-Site denial and correct summaries; **school/guardian** authorized guardian/student access, Section and graded work preserved, no cross-person leakage.
- Negative scenarios: unknown principal, revoked Site/Organization role, stale release, suspended Deployment/adoption, waitlist expiry, duplicate request, last seat race, cancellation/transfer compensations, attendance correction, completion supersession, affiliate/network membership without report grant, small-cell differencing and role switching.
- PRM cross-domain reconciliation: no fabricated Course Attempts; no duplicated enrollment, credential, academic grade, official attendance or survey answers; projections agree with source as-of and support historical activity after permitted completion/withdrawal.

## Known baseline concerns (not newly tested)

- Existing documentation flags a null-Site QA release on test01 and native Class table not yet installed there (2026-11-16 read-only preflight), so **network migration is gated**.
- Existing My Learning at `/learn/my-programs` composes separate domain queries but is not an approved single participation-history read model; `/learn/my-courses` centers on noncredit registrations.
- Existing community participation docs explicitly flag unproven release acceptance and missing transfer, independent cross-provider delegation, national discovery scale, and annual report publication. Do not label these shipped.
- Baseline GitHub commit-status endpoint returned no statuses; **empty status is not a pass**. Confirm Actions checks and execute validations.

## Release status and sign-off

**NOT READY**. No WS1 contract ratification, feature PR integration, isolated schema verification, authenticated E2E, or deployment sign-off evidenced by this initial document. Deployment and production migrations are out of scope until each gate is proven. Record exact SHA, command, environment, timestamp, exit code and artifact URL for each claimed check. Failed/inconclusive/unrun checks remain blocking.
