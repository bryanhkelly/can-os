# Documentation Reset Register

**Initiated:** 2026-11-07
**Decision:** FullFlow is released and retired. Archive-first migration; selectively reconstruct canonical product and engineering documentation.

## Target layout

- `docs/vision/`: product mission and institutional operating model
- `docs/product/`: capabilities, roles, workflows, requirements
- `docs/architecture/`: domain model, service boundaries, authorization, ADRs
- `docs/design/`: design system and experience contracts
- `docs/engineering/`: development, deployment, operations, recovery
- `docs/quality/`: acceptance, test evidence, release gates
- `docs/archive/2026-11-fullflow/`: frozen historical FullFlow documentation
- `docs/archive/legacy/`: older historical material

## Migration controls

1. Inventory every tracked documentation file, including `docs/`, root Markdown, `.github/`, runbooks, and scripts referencing documentation.
2. Record each file's path, owner, references, classification (canonical/supporting/historical/duplicate/obsolete), and destination.
3. Preserve exact historical bytes and relative links where feasible, with a commit-pinned manifest and Git rename tracking.
4. Identify active code and CI references before relocating files; update them atomically.
5. Preserve security and operational runbooks until validated replacements exist.
6. Rebuild the smallest authoritative set of documents from approved product intent and verified main code.
7. Validate references, tests, and workflows before declaring the migration complete.

## Initial review findings

- `docs/archive/2026-11-fullflow/retired-plans/CURRENT-STATE.md` mixes dated implementation and migration evidence with current status.
- `docs/architecture.md` and `docs/domain-model.md` include detailed implementation notes alongside canonical definitions.
- `docs/golden-flows.md` mixes flow requirements with acceptance evidence.
- `docs/school-launch-studio-site-workspace.md` needs reconciliation with the latest Launch Hub and Website Studio decisions.
- Root `README.md` still contains retired FullFlow checkout guidance.

## Migration status

**Phase 2 completed:** Root README, AGENTS.md, .github/copilot-instructions.md, and docs/START-HERE.md have been updated for the post-FullFlow main baseline. Pre-reset copies of README, AGENTS.md, and docs/START-HERE.md are preserved in `docs/archive/2026-11-fullflow/root-snapshot/`. The new docs/README.md and docs/vision/CAN-VISION.md are active.

**Phase 3:** Added `docs/DOCUMENT-INVENTORY.md` with a verified subset of document classifications; exact archival snapshots of three retired delivery plans; new canonical `docs/product/PLATFORM-CAPABILITIES.md` and `docs/product/OPERATING-MODEL.md`. These product documents specify intent and boundaries, not current implementation certification.

**Phase 4:** Created canonical `docs/architecture/SYSTEM.md`, `docs/architecture/DOMAIN-MODEL.md`, and `docs/quality/ACCEPTANCE-STANDARDS.md`. These are architectural and quality principles, not a source-verified implementation map or executed test report.

**Phase 5:** Retired the original `docs/full-flow-acceptance-contract.md`, `docs/integration-convergence-audit.md`, and `docs/engagement-framework.md` after exact archived-blob comparison. Updated identified references in the FullFlow test runner, Playwright config, e2e spec, and public-site backlog. Executable tests were not run; this is not a complete inbound-link audit.

**Phase 6:** Retired `docs/CURRENT-STATE.md` and `docs/full-flow-progress.md` into the historical archive, updated identified references, and snapshotted four legacy technical specifications. Copilot now points to canonical architecture and quality documents. The original technical specifications remain until cross-reference verification is complete.

**Still outstanding:** A complete tracked-file inventory, dependency analysis of code/CI references, full archival of legacy docs, and selective reconstruction of technical, product, design, engineering, and quality specifications. The three archived root snapshots are not the entire historical corpus. Do not bulk-move remaining documents until active references and critical runbooks are accounted for.
