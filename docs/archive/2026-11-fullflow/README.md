# November 2026 CAN OS historical documentation archive

**Status: historical evidence only.** FullFlow was released and retired. Nothing in this archive supersedes current source, approved product direction, security gates, or executed acceptance evidence.

## Contents

- [Root snapshots](root-snapshot/): historical copies of root agent and onboarding instructions.
- [Retired plans](retired-plans/): branch-level FullFlow plans, progress, and implementation state snapshots.
- [Legacy specifications](legacy-specifications/): superseded architecture, domain, flow, and platform taxonomy documents.
- [Delivery evidence](delivery-evidence/): dated agent integration, design handoff, and coordination records.
- [Migration evidence](migration-evidence/): historical isolated Neon branch migration and reconciliation records; **not migration instructions for current environments**.
- [Acceptance evidence](acceptance-evidence/): dated browser exploration and route test findings; **not current passing test reports**.

## Moved in the November 7, 2026 consolidation

This register maps original paths to preserved blob-identical archive paths. Git blob reuse in the same commit retains exact bytes, including any dated assertions and historical links.

| Original path | Historical archive path |
| --- | --- |
| `docs/fullflow-neon-migration-review-0032-0038.md` | [`fullflow-neon-migration-review-0032-0038.md`](migration-evidence/fullflow-neon-migration-review-0032-0038.md) |
| `docs/fullflow-neon-migration-review-0039-0040.md` | [`fullflow-neon-migration-review-0039-0040.md`](migration-evidence/fullflow-neon-migration-review-0039-0040.md) |
| `docs/fullflow-operational-patch-status-2026-10-23.md` | [`fullflow-operational-patch-status-2026-10-23.md`](migration-evidence/fullflow-operational-patch-status-2026-10-23.md) |
| `docs/integration/fullflow-neon-reconciliation.md` | [`fullflow-neon-reconciliation.md`](migration-evidence/integration/fullflow-neon-reconciliation.md) |
| `docs/integration/branch-cleanup-inventory-2026-11-01.md` | [`branch-cleanup-inventory-2026-11-01.md`](delivery-evidence/integration/branch-cleanup-inventory-2026-11-01.md) |
| `docs/integration/fullflow-agent-integration.md` | [`fullflow-agent-integration.md`](delivery-evidence/integration/fullflow-agent-integration.md) |
| `docs/PX-B-VISUAL-DESIGN-BRAND-HANDOFF.md` | [`PX-B-VISUAL-DESIGN-BRAND-HANDOFF.md`](delivery-evidence/PX-B-VISUAL-DESIGN-BRAND-HANDOFF.md) |
| `docs/design-refresh-merge-gate.md` | [`design-refresh-merge-gate.md`](delivery-evidence/design-refresh-merge-gate.md) |
| `docs/parent-experience/agent-a-integration-20261103.md` | [`agent-a-integration-20261103.md`](delivery-evidence/parent-experience/agent-a-integration-20261103.md) |
| `docs/parent-experience/workstream-a-handoff.md` | [`workstream-a-handoff.md`](delivery-evidence/parent-experience/workstream-a-handoff.md) |
| `docs/parent-experience/workstream-d-handoff.md` | [`workstream-d-handoff.md`](delivery-evidence/parent-experience/workstream-d-handoff.md) |
| `docs/workstream-c-operations-jurisdiction-progress.md` | [`workstream-c-operations-jurisdiction-progress.md`](delivery-evidence/workstream-c-operations-jurisdiction-progress.md) |
| `docs/teacher-playwright-issues-2026-11-04.md` | [`teacher-playwright-issues-2026-11-04.md`](acceptance-evidence/teacher-playwright-issues-2026-11-04.md) |
| `docs/parent-playwright-issues-2026-11-04.md` | [`parent-playwright-issues-2026-11-04.md`](acceptance-evidence/parent-playwright-issues-2026-11-04.md) |
| `docs/local-main-browser-exploration-2026-11-04.md` | [`local-main-browser-exploration-2026-11-04.md`](acceptance-evidence/local-main-browser-exploration-2026-11-04.md) |
| `docs/pr271-split-route-fixture-audit.md` | [`pr271-split-route-fixture-audit.md`](acceptance-evidence/pr271-split-route-fixture-audit.md) |

## How to use this archive

Search historical decisions here only to reconstruct prior work or provenance. Use [current documentation](../../README.md), [engineering operations and security](../../engineering/OPERATIONS-AND-SECURITY.md), and current code/tests when making changes. Historical documents may contain links to earlier file paths and branches that no longer exist at those locations. This index records their new paths; do not interpret a historical link or a prior passing result as current authority.

## Protected active references

The machine-readable `docs/platform-route-contracts.json`, Neon development procedures, identity and student-safety rules, Cloudflare R2 runbooks, and approved V6.1 design specification were intentionally **not** moved by this batch. Source and operational dependency checks are required before any later retirement.
