# A–L original branch retirement — reconciliation pass 1 (2026-11-01)

Canonical integration branch: `FullFlow`. **Do not delete original branches until pass 2, exact-head CI, and missing-behavior reconciliation are complete.**

## Current source PRs

| Agent | Original PR | Branch | Changed paths vs FullFlow | Status |
|---|---:|---|---:|---|
| A | #214 | feature/parallel-a-graduation-policy | 8 | Graduation cohort/freshness merged through #225; 3/8 paths byte-identical, 5 modified by integration |
| B | #213 | feature/parallel-b-credential-release | 7 | Secure release merged through #226; 4/7 paths byte-identical, 3 modified by integration |
| C | #203 | feature/parallel-c-connected-acceptance | 5 | Acceptance workflows and browser spec imported; 4/5 byte-identical; fixture manifest diverged |
| D | #212 | feature/parallel-d-algebra1-curriculum | 24 | Draft 40/180 lesson material imported; not credit-ready |
| E | #211 | feature/parallel-e-first-day | 7 | 6/7 byte-identical; `first-school-day-handoff.functions.ts` diverged |
| F | #204 | feature/parallel-f-one-hour-launch | 10 | Launch UI/flow imported; full timed connected acceptance outstanding |
| G | #210 | feature/parallel-g-curriculum-adoption-year | 14 | Annual adoption staged; 0057 migration candidate, flag remains closed |
| H | #205 | feature/parallel-h-finance | 18 | Finance source staged; 0058 migration candidate, processor acceptance outstanding |
| I | #206 | feature/parallel-i-public-site-hosting | 13 | Hosting guards imported; deployed TLS/two-tenant acceptance outstanding |
| J | #209 | feature/parallel-j-oneroster | 6 | Canonical reconciliation imported; corrective/revocation flow outstanding |
| K | #208 | feature/parallel-k-cartridge | 7 | Private Cartridge code imported; storage/Section/license acceptance outstanding |
| L | #207 | feature/parallel-l-church-evidence | 6 | Evidence workflow staged; 0059 migration candidate and independent review acceptance outstanding |

These 125 original PR changed-file entries are **not** a unique-file or code-line count. `git compare` commit ahead/behind counts cannot be used as an unmerged-code percentage: FullFlow has selectively imported and further edited these files.

## Pass 1 completed

- Audited original PR branch identities and compared their changed-path inventories to current FullFlow.
- Verified A, B, C and E at file-content level. No missing paths in those four branches; differing files require semantic comparison, not blind overwrite.
- Confirmed the 0057–0059 SQL proposals are now staged in FullFlow (PR #229), **not registered or executed migrations**.
- Preserved all original branches and PRs. **No deletions, no direct overwrite of newer FullFlow files.**

## Pass 2 exit criteria

1. Finish byte-level and semantic comparisons for D/F/G/H/I/J/K/L and A/B/C/E divergences, noting any unported functionality by function/test name.
2. Port only verified missing behavior to FullFlow in small changes; run current exact-head CI and schema checks.
3. Register, test and deploy 0057–0059 on the approved FullFlow E2E database before enabling dependent features. Do not touch production.
4. Run connected multi-role, multi-tenant release acceptance on the same FullFlow SHA. Separate code integration from product readiness.
5. Once every source PR is accounted for, close the original PRs with integration references and delete the original feature branches **only after an explicit pass-2 inventory and final approval**. Continue all subsequent implementation on FullFlow.

## Known divergence decisions

- Agent A: `graduation-policy.ts`, `graduation.functions.ts`, registrar route, policy tests and contract document differ; preserve canonical post-#225 integration and inspect for missing guards.
- Agent B: `academic-credential-delivery.functions.ts`, platform route contract and fixture manifest differ; preserve post-#226 secure recipient and freshness checks.
- Agent C: fixture manifest differs; do not overwrite unified seeded identity fixtures without checking connected acceptance.
- Agent E: first-day handoff function differs; preserve newer FullFlow bounded query and canonical staffing checks unless missing behavior is demonstrated.

## Pass 2 — exact Git blob inventory (2026-11-01)

Compared each original PR's changed paths against the live FullFlow tree and its original head tree. A byte-identical path is present at the same Git blob SHA. **All 125 entries exist on FullFlow**; 103 are byte-identical and 22 differ. Counts include overlapping paths modified by multiple agents, not unique files or feature-completion percentages.

| Agent | PR | Total | Identical | Different | Missing |
|---|---:|---:|---:|---:|---:|
| A | 214 | 8 | 3 | 5 | 0 |
| B | 213 | 7 | 4 | 3 | 0 |
| C | 203 | 5 | 4 | 1 | 0 |
| D | 212 | 24 | 24 | 0 | 0 |
| E | 211 | 7 | 6 | 1 | 0 |
| F | 204 | 10 | 9 | 1 | 0 |
| G | 210 | 14 | 8 | 6 | 0 |
| H | 205 | 18 | 17 | 1 | 0 |
| I | 206 | 13 | 12 | 1 | 0 |
| J | 209 | 6 | 5 | 1 | 0 |
| K | 208 | 7 | 5 | 2 | 0 |
| L | 207 | 6 | 6 | 0 | 0 |
| **Total** | | **125** | **103** | **22** | **0** |

### Divergent files requiring semantic signoff

- **A:** `docs/agent-a-b-diploma-release-contract.md`, `src/domain/graduation-policy.ts`, `src/modules/learning/graduation.functions.ts`, `src/routes/admissions.graduation.tsx`, `tests/unit/graduation-policy.test.ts`.
- **B:** `docs/platform-route-contracts.json`, `scripts/seeds/fixture-manifest.json`, `src/modules/learning/academic-credential-delivery.functions.ts`.
- **C:** `scripts/seeds/fixture-manifest.json`.
- **E:** `src/modules/enrollment/first-school-day-handoff.functions.ts`.
- **F and I:** `src/components/operations/LaunchWebsiteStep.tsx`.
- **G:** `src/db/schema/index.ts`, `src/modules/learning/curriculum-marketplace.functions.ts`, `src/modules/learning/curriculum-marketplace.server.ts`, `src/modules/programs/launch-academics.functions.ts`, `src/modules/programs/launch-curriculum-eligibility.server.ts`, `src/routes/operations.curriculum-marketplace.tsx`.
- **H:** `src/db/schema/index.ts`.
- **J:** `src/modules/learning/oneroster-import.functions.ts`.
- **K:** `src/modules/learning/common-cartridge-import.functions.ts`, `src/routes/operations.curriculum-marketplace.tsx`.

**Decision:** Do not overwrite divergent FullFlow files from older source branches. Pass 2 establishes file inventory completeness, not behavioral equivalence. Retain source branches until the above semantic deltas are signed off; then close original PRs and delete branches in a separate cleanup. No production deployment or migrations authorized by this audit.

## Semantic reconciliation — safety-critical findings

- **A graduation:** FullFlow adds fail-closed handling for unclassified active graduation policies and registrar classification validation. The older A branch lacks these guards. Preserve FullFlow.
- **B credential delivery:** FullFlow replaces the branch's local latest-transcript-only guard with authoritative transcript **and diploma** freshness, row locks and recipient rechecks. Preserve FullFlow; do not restore branch's local fallback.
- **E first-day:** FullFlow replaces the branch's 180-day per-date scan with bounded candidate prefiltering and explicit `verification_incomplete` fail-closed status. Preserve FullFlow.
- **J OneRoster:** FullFlow adds durable external enrollment placement decisions, active Section checks, replay protection and nonreactivation of withdrawn enrollment. Preserve FullFlow.
- **K Cartridge:** FullFlow adds a non-null Site guard for authorized published Section lesson reads. Preserve FullFlow.
- **G curriculum:** **Real semantic divergence**: the source branch forbids legacy program-wide adoption and adds annual-year-scoped read/write checks, while FullFlow retains a legacy adoption route plus separate flag-closed annual commands. Do not copy source branch blindly or enable annual rights before migration and Section/entitlement acceptance. This requires an explicit migration/compatibility decision on FullFlow.

## Retirement actions

- **Original PR #212 (D): closed as superseded.** All 24 changed paths are byte-identical on FullFlow; the 40-lesson draft remains incomplete.
- **Original PR #207 (L): closed as superseded.** All 6 changed paths are byte-identical on FullFlow; connected church evidence remains incomplete.
- Source branches remain in GitHub until deletion is supported and the remaining semantic gates are resolved. Closing an original PR does not delete its branch.

## Agent G compatibility resolution — FullFlow `c57f89c5`

New legacy program-wide adoption writes are denied whenever `CAN_ANNUAL_ADOPTIONS_ENABLED=true` or `CAN_DISABLE_LEGACY_CURRICULUM_ADOPTIONS=true`. Existing historical adoptions remain readable. Annual writes remain independently gated until 0057 and connected license/Section acceptance. This resolves the immediate double-write authorization risk without copying the source branch's abrupt unconditional legacy shutdown. It does **not** yet establish year-scoped Section/supplement authorization, so G remains a connected-workflow hold.

**CI at time of change:** queued/in progress; do not mark verified until exact-commit checks pass.

## Agent G service-layer enforcement (2026-11-01)

The same annual rollout compatibility gate is now enforced inside `adoptPack`, not only its HTTP handler, preventing internal callers from creating new legacy adoption grants. `addCurriculumSupplement` also fails closed during annual rollout, rather than using legacy unscoped adoption as authority for new publisher-content overlays. These are deliberate temporary restrictions until year-scoped Section/supplement entitlement checks are implemented. **Do not enable annual adoption without the serial migration and connected rights tests.**

This is a safety/compatibility patch, **not** an implementation of annual Section supplement eligibility. No original source branches deleted.

## Annual activation gate hardening

Annual commands now require all three explicit environment conditions: `CAN_ANNUAL_ADOPTIONS_ENABLED=true`, `CAN_ANNUAL_ADOPTIONS_SCHEMA_READY=true`, and `CAN_ANNUAL_ADOPTIONS_CONNECTED_ACCEPTANCE=true`. The last two must be set **only after** registered migration and exact-commit connected rights tests, respectively. Legacy writes are blocked as soon as `CAN_ANNUAL_ADOPTIONS_ENABLED=true`, even when annual commands remain closed, to avoid granting new unscoped rights during partial activation. Do not set these variables based on this documentation alone.
