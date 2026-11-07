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
- Root `README.md` originally contained retired FullFlow checkout guidance; the revised root file and archived snapshot supersede it.

## Migration status

**Phase 2 completed:** Root README, AGENTS.md, .github/copilot-instructions.md, and docs/START-HERE.md have been updated for the post-FullFlow main baseline. Pre-reset copies of README, AGENTS.md, and docs/START-HERE.md are preserved in `docs/archive/2026-11-fullflow/root-snapshot/`. The new docs/README.md and docs/vision/CAN-VISION.md are active.

**Phase 3:** Added `docs/DOCUMENT-INVENTORY.md` with a verified subset of document classifications; exact archival snapshots of three retired delivery plans; new canonical `docs/product/PLATFORM-CAPABILITIES.md` and `docs/product/OPERATING-MODEL.md`. These product documents specify intent and boundaries, not current implementation certification.

**Phase 4:** Created canonical `docs/architecture/SYSTEM.md`, `docs/architecture/DOMAIN-MODEL.md`, and `docs/quality/ACCEPTANCE-STANDARDS.md`. These are architectural and quality principles, not a source-verified implementation map or executed test report.

**Phase 5:** Retired the original `docs/full-flow-acceptance-contract.md`, `docs/integration-convergence-audit.md`, and `docs/engagement-framework.md` after exact archived-blob comparison. Updated identified references in the FullFlow test runner, Playwright config, e2e spec, and public-site backlog. Executable tests were not run; this is not a complete inbound-link audit.

**Phase 6:** Retired `docs/CURRENT-STATE.md` and `docs/full-flow-progress.md` into the historical archive, updated identified references, and snapshotted four legacy technical specifications. Copilot now points to canonical architecture and quality documents. The original technical specifications remain until cross-reference verification is complete.

**Phase 7:** Retired four legacy specifications from their original paths after matching archive blob SHAs and updating identified references. Canonical replacements are in `docs/architecture/` and `docs/quality/`; original details remain in `docs/archive/2026-11-fullflow/legacy-specifications/`. Full repository link and build verification is still outstanding.

**Phase 8:** Added engineering operations/security index and retired duplicate capability matrix after archive verification. Operational runbooks and machine-readable route contract remain at their original paths pending source-verified migration.

**Phase 9:** Retired four dated design/integration/branch-delivery records into exact verified archive copies. Repaired FullFlow fixture's historical contract path. Current V6.1 design authority and operational runbooks remain active.

**Phase 10:** Archived two November 3 integration coordination records after exact blob comparison. Retained the V6.1 migration checklist and public-site admissions backlog due to explicit live documentation dependencies; both require current-main verification before retirement.

**Phase 11:** Captured a non-truncated recursive Git tree (2,510 entries at phase start). Atomically relocated 16 historical handoff, Neon branch evidence, and browser exploration files to the November 2026 archive, with a source-to-destination index. Preserved Git blob SHA identity for every moved artifact. Left security, database runbooks, draft SQL, route contracts and current design guidance in place.

**Phase 11 validation:** Verified exact Git blob reuse and removal for all 16 moved documents. Scanned 69 active Markdown files and 74 inline local link targets against the non-truncated Git tree; no missing targets found. All 24 links in the new archive index resolved. This manual connector-based scan is limited in scope and is not an automated CI gate.

**Phase 12:** Retired seven dated or superseded product/integration documents, preserving exact blob identities and updating the two identified live documentation references. Full test/build and broader non-Markdown dependency auditing remain pending.

**Phase 13:** Added a required GitHub Actions documentation reference check plus `npm run docs:check`. CI evidence at `de28b965`: 70 active Markdown files, 109 targets, 1,926 source/CI files, 11 explicit doc references, zero missing targets. The check also passed on `94d9545d`. The earlier general CI run separately failed during TypeScript typecheck due to heap OOM, and the Phase 12 Neon acceptance workflow failed its isolated database secret precondition; neither was counted as a passing overall release gate.

**Phase 14:** Retired six dated site, UX, lint and acceptance records after exact Git blob preservation. Added canonical `docs/product/LAUNCH-AND-RUN.md` with source-pinned nine-module Launch Hub, three planned capabilities, and explicit Church Information gap. Corrected initial Site-stub language, updated the dated Algebra I acceptance reference, and linked the rebuilt product contract.

**Still outstanding:** Complete source and CI raw-reference checks, reproducible automated Markdown link validation (including reference-style links and anchors), current-main verification of retained operational/product specifications, and test/build execution. The new documentation structure is not yet certified as fully reconciled.
