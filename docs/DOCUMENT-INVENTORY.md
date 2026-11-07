# Documentation migration inventory (initial verified subset)

**Date:** 2026-11-07. **Source:** Direct GitHub file reads on `main`. This is a verified subset, **not** a complete repository tree inventory.

## Current classifications

| Existing file | Classification | Disposition |
| --- | --- | --- |
| `README.md` | Canonical entry | Rewritten for post-FullFlow main |
| `AGENTS.md` | Canonical agent policy | Updated; technical references still transitional |
| `.github/copilot-instructions.md` | Canonical agent entry | Updated |
| `docs/START-HERE.md` | Compatibility entry | Points to new docs home |
| `docs/vision/CAN-VISION.md` | Canonical product intent | New |
| `docs/README.md` | Canonical documentation home | New |
| `docs/DOCUMENTATION-RESET.md` | Active migration control | New |
| `docs/architecture.md` | Technical, mixed with historical implementation | Reconstruct after code verification |
| `docs/domain-model.md` | Technical, mixed with implementation notes | Reconstruct after code verification |
| `docs/golden-flows.md` | Product and quality, mixed with evidence | Split specifications from evidence |
| `docs/CURRENT-STATE.md` | Historical evidence with dated updates | Archive after replacing active status references |
| `docs/full-flow-acceptance-contract.md` | Retired delivery contract | Archived and original removed after reference update |
| `docs/full-flow-progress.md` | Retired delivery journal | Archive after reference check |
| `docs/integration-convergence-audit.md` | Retired branch execution plan | Exact snapshot copied to archive; original pending reference check |
| `docs/engagement-framework.md` | Historical implementation branch plan | Archived and original removed after reference update |
| `docs/school-launch-studio-site-workspace.md` | Product design mixed with implementation history | Rebuild product spec |
| `docs/website-launch-studio-implementation.md` | Implementation record | Reconcile against current main |
| `docs/school-operations-security-gates.md` | Active safety-sensitive engineering requirements | Preserve in place until verified replacement |
| `docs/neon-development.md` | Active database operational guidance with historical details | Preserve in place until verified replacement |
| `docs/platform-route-contracts.json` | Machine-readable contract | **Do not archive or move without updating scripts/CI** |
| `docs/design-system.md` | Design-system guidance | Preserve until code and Storybook verification |
| `docs/identity-and-demo-access.md` | Security and identity guidance | Preserve until verified replacement |

## Archive copies already created

- `docs/archive/2026-11-fullflow/root-snapshot/README.md`
- `docs/archive/2026-11-fullflow/root-snapshot/AGENTS.md`
- `docs/archive/2026-11-fullflow/root-snapshot/docs/START-HERE.md`
- `docs/archive/2026-11-fullflow/retired-plans/full-flow-acceptance-contract.md`
- `docs/archive/2026-11-fullflow/retired-plans/integration-convergence-audit.md`
- `docs/archive/2026-11-fullflow/retired-plans/engagement-framework.md`

The three retired plan originals were removed after archived blob SHA verification and targeted inbound-reference updates. Root snapshots remain copies only. Other historical documents remain active pending review. The archive copies are historical; new development must not treat them as current authority.

## Dependency checks required before moves

- `scripts/check-platform-route-contracts.mjs` references `docs/platform-route-contracts.json`; retain the contract path or update the script and tests together.
- `.github/copilot-instructions.md` and `AGENTS.md` have been revised to point to the new docs home, but other references in the repository are not yet comprehensively enumerated.
- Existing docs contain cross-links that will need rewriting or preserved redirects if originals are removed.
- FullFlow-named test infrastructure and scripts may still be executable code. Retirement of a delivery initiative is **not** permission to delete test assets without verifying their use.

## Next steps

1. **Completed 2026-11-07:** Obtain a complete recursive Git tree inventory of main (2,510 entries at the phase start; GitHub returned `truncated: false`).
2. Identify all inbound references to each candidate archived document.
3. Archive by coherent batch with atomic reference updates.
4. Promote validated current product and engineering specifications.
5. Run repository link, route-contract, test, and build checks and record results.

## 2026-11-07 migration update

The original `docs/CURRENT-STATE.md` and `docs/full-flow-progress.md` have been retired; historical versions are preserved under `docs/archive/2026-11-fullflow/retired-plans/`. The FullFlow progress archive was made before a final reference-only edit to the original.

Exact snapshots of `docs/architecture.md`, `docs/domain-model.md`, `docs/golden-flows.md`, and `docs/platform-integration-map.md` are now in `docs/archive/2026-11-fullflow/legacy-specifications/`. Their original paths were subsequently retired in Phase 7 below. Copilot's instructions now point to the canonical replacements.

## 2026-11-07 legacy specification retirement

After byte-identical Git blob verification, the original `docs/architecture.md`, `docs/domain-model.md`, `docs/golden-flows.md`, and `docs/platform-integration-map.md` were removed. Historical copies remain under `docs/archive/2026-11-fullflow/legacy-specifications/`. Identified inbound links in agent-platform, curriculum, connected-learning, feature-track, admissions, and school-launch documents were updated to canonical documents or exact archived targets. GitHub search is not a complete repository-wide reference audit; automated link checking remains outstanding.

## 2026-11-07 engineering consolidation

Created `docs/engineering/OPERATIONS-AND-SECURITY.md` as the entry point for active runbooks, without moving the underlying Neon, security, identity, R2, route-contract or design-system files. Archived and retired the duplicate `docs/platform-capability-matrix.md` after exact Git blob comparison; its product replacement is `docs/product/PLATFORM-CAPABILITIES.md`. Comprehensive dependency and automated link checks are still outstanding.

## 2026-11-07 dated delivery evidence retirement

Archived and removed `docs/design-system-implementation-plan.md`, `docs/PX-B-EXPERIENCE-PUBLISHING-HANDOFF.md`, `docs/PX-INTEGRATION-RELEASE-EVIDENCE-2026-11-03.md`, and `docs/integration/agent-branch-retirement-pass1.md` into `docs/archive/2026-11-fullflow/delivery-evidence/`, preserving exact Git blobs. Corrected a historical contract reference in `tests/e2e/full-flow-fixture.ts`. The active V6.1 design-system reference and operational/security runbooks were retained. This does not establish passing CI or exhaustive inbound-link coverage.

## 2026-11-07 convergence records

Archived and retired the dated `docs/implementation/CODE_BASED_SOURCE_MAP.md` and `docs/implementation/CONTRACT_CHANGELOG.md` under `docs/archive/2026-11-fullflow/delivery-evidence/implementation/`, with exact Git blob verification. Kept `docs/design-system-v6-1-migration.md` because the active design-system documents explicitly depend on its checklist; kept `docs/public-site-admissions-remaining-work.md` because the public publishing specification links to it. These retained documents need an explicit current-main review before retirement.

## Phase 11: non-truncated tree inventory and dated evidence retirement (2026-11-07)

Captured the complete recursive Git tree from `main` (2,510 entries; `truncated: false`). Archived and retired 16 dated documents covering isolated FullFlow Neon migration evidence, integration/agent handoffs, visual design checkpoints, and November browser/route test findings. See [the exact source-to-archive manifest](archive/2026-11-fullflow/README.md). The operation reuses source Git blob SHAs and removes originals in a single tree update, preserving historical bytes exactly. Targeted filename searches found no active inbound document consumers for these candidates, but this is **not** exhaustive link/CI validation.

Active, potentially operational instructions such as `docs/neon-development.md`, `docs/identity-and-demo-access.md`, `docs/school-operations-security-gates.md`, and `docs/platform-route-contracts.json` remain at their existing paths. Proposed SQL under `docs/migrations/` remains untouched.

## Phase 11 post-move verification

Verified against `main` commit `5041d51554586356b661545b00198d24f424db79`:

- Compared all 16 archived paths with their source entries in the parent Git tree. **All 16 archive blobs match exactly, and all 16 original paths are absent**.
- Inspected **69 active Markdown files** (`docs/` excluding archive, root `README.md`, `AGENTS.md`, and Copilot instructions) for inline relative Markdown links. Checked **74 local targets** (including two directory links). **No missing path targets found**. One transient read failure was retried successfully.
- Checked the archive index's **24 local links**. All targets exist in the Git tree.

This is a targeted structural audit, **not** a complete repository-wide reference audit: raw path strings in code, reference-style Markdown links, anchor fragments, archived historical links, external URLs, and semantic correctness were not validated. CI, test execution, build and runtime journeys remain unverified.

## Phase 12: historical product and integration evidence (2026-11-07)

Retired seven additional records using one Git tree operation with original blob SHAs unchanged. These include historical GF track identifiers, prototype-production mapping, FullFlow code audit, agent integration requests, church-source status and a dated Valor snapshot. Updated live source-document references in the Launch Studio and Valor acceptance documents. See [archive index](archive/2026-11-fullflow/README.md). Active security, Neon, route contracts, design authority and admission-publishing backlogs remain in place.

## Phase 13: reproducible documentation reference gate (2026-11-07)

Added `scripts/check-documentation-links.mjs`, `npm run docs:check`, and a required CI step prior to dependency installation. The validator uses Git-tracked paths, checks active Markdown inline/reference/HTML local links plus explicit `.md`/`.json` documentation references in source, scripts, tests and CI; archived historical bodies remain outside the gate, but the archive index is included.

Executed CI on commit `de28b9653b392b1bb920be3fb3353be1d03211a6`: **70 Markdown files, 109 Markdown targets, 1,926 source/CI files, 11 explicit source references, zero missing paths.** The documentation step succeeded again on Phase 12 commit `94d9545d40c0e1a9b5e3055279a5b36d38bebd32`. These counts are not claims that anchors, remote links, dynamic references, or document semantics were tested.

The earlier general CI run at `de28b965` separately failed in TypeScript typecheck due to a Node.js heap-out-of-memory error. Documentation validation passed; full CI success must not be inferred. The disposable Neon admissions workflow on Phase 12 commit failed its isolated-test-database-secret precondition. This is also separate from documentation path validation.
