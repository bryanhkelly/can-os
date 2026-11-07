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

1. Obtain a complete recursive Git tree inventory of main, including .github workflows and scripts.
2. Identify all inbound references to each candidate archived document.
3. Archive by coherent batch with atomic reference updates.
4. Promote validated current product and engineering specifications.
5. Run repository link, route-contract, test, and build checks and record results.

## 2026-11-07 migration update

The original `docs/CURRENT-STATE.md` and `docs/full-flow-progress.md` have been retired; historical versions are preserved under `docs/archive/2026-11-fullflow/retired-plans/`. The FullFlow progress archive was made before a final reference-only edit to the original.

Exact snapshots of `docs/architecture.md`, `docs/domain-model.md`, `docs/golden-flows.md`, and `docs/platform-integration-map.md` are now in `docs/archive/2026-11-fullflow/legacy-specifications/`. **Their original paths remain active pending complete inbound-link review**. Copilot's instructions now point to the canonical replacements.
