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

- `docs/CURRENT-STATE.md` mixes dated implementation and migration evidence with current status.
- `docs/architecture.md` and `docs/domain-model.md` include detailed implementation notes alongside canonical definitions.
- `docs/golden-flows.md` mixes flow requirements with acceptance evidence.
- `docs/school-launch-studio-site-workspace.md` needs reconciliation with the latest Launch Hub and Website Studio decisions.
- Root `README.md` still contains retired FullFlow checkout guidance.

## Migration status

This register is not evidence that the archive move has been completed. A complete tracked-file inventory and atomic relocation remain outstanding. Do not delete, rewrite, or bulk-move documentation until references and critical runbooks are accounted for.
