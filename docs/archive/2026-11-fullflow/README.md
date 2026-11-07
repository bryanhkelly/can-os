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

## Supplementary retirement batch (2026-11-07)

Additional historical identifiers, prototype mapping, FullFlow source audit, church-source agent handoffs, and the dated Valor tenant snapshot were preserved using their exact Git blobs:

| Original path | Archived path |
| --- | --- |
| `docs/FEATURE-TRACKS.md` | [`FEATURE-TRACKS.md`](legacy-specifications/FEATURE-TRACKS.md) |
| `docs/prototype-migration.md` | [`prototype-migration.md`](legacy-specifications/prototype-migration.md) |
| `docs/codebase-alignment-audit.md` | [`codebase-alignment-audit.md`](delivery-evidence/codebase-alignment-audit.md) |
| `docs/parent-experience/agent-a-authoritative-source-model-request.md` | [`agent-a-authoritative-source-model-request.md`](delivery-evidence/parent-experience/agent-a-authoritative-source-model-request.md) |
| `docs/agent-p-church-sources-integration.md` | [`agent-p-church-sources-integration.md`](delivery-evidence/agent-p-church-sources-integration.md) |
| `docs/church-source-discovery-status.md` | [`church-source-discovery-status.md`](delivery-evidence/church-source-discovery-status.md) |
| `docs/valor-reference-school-baseline-2026-11-03.md` | [`valor-reference-school-baseline-2026-11-03.md`](acceptance-evidence/valor-reference-school-baseline-2026-11-03.md) |

## Phase 14: dated acceptance and UX snapshots (2026-11-07)

These six records retain their exact original Git blobs; the original paths are no longer active:

| Former path | Archived record |
| --- | --- |
| `docs/hybrid-site-ops-verification.md` | [`hybrid-site-ops-verification.md`](acceptance-evidence/hybrid-site-ops-verification.md) |
| `docs/implementation/CAN_SCHOOL_SITES_VISUAL_ACCEPTANCE.md` | [`CAN_SCHOOL_SITES_VISUAL_ACCEPTANCE.md`](acceptance-evidence/implementation/CAN_SCHOOL_SITES_VISUAL_ACCEPTANCE.md) |
| `docs/implementation/VALOR_ONBOARDING_TO_WEBSITE_ACCEPTANCE.md` | [`VALOR_ONBOARDING_TO_WEBSITE_ACCEPTANCE.md`](acceptance-evidence/implementation/VALOR_ONBOARDING_TO_WEBSITE_ACCEPTANCE.md) |
| `docs/curriculum/valor-algebra1-week01-activation-acceptance.md` | [`valor-algebra1-week01-activation-acceptance.md`](acceptance-evidence/curriculum/valor-algebra1-week01-activation-acceptance.md) |
| `docs/lint-baseline.md` | [`lint-baseline.md`](delivery-evidence/lint-baseline.md) |
| `docs/ux-workflow-reconciliation.md` | [`ux-workflow-reconciliation.md`](delivery-evidence/ux-workflow-reconciliation.md) |

## Phase 15: design and school-media documentation (2026-11-07)

The following original Git blobs were preserved unchanged. Canonical requirements now live in [Design Authority](../../design/README.md), [School Website Media](../../product/WEBSITE-MEDIA.md), and [School Launch and Run](../../product/LAUNCH-AND-RUN.md).

| Original path | Preserved archive |
| --- | --- |
| `docs/design-system-editorial-v5.md` | [`design-system-editorial-v5.md`](design-history/design-system-editorial-v5.md) |
| `docs/implementation/SCHOOL_MEDIA_FOLDER_AUTOMATION.md` | [`SCHOOL_MEDIA_FOLDER_AUTOMATION.md`](delivery-evidence/implementation/SCHOOL_MEDIA_FOLDER_AUTOMATION.md) |
| `docs/school-launch-hub-implementation.md` | [`school-launch-hub-implementation.md`](delivery-evidence/school-launch-hub-implementation.md) |

## Phase 16: Website Studio integration handoff (2026-11-07)

The dated [Website Studio implementation handoff](delivery-evidence/website-launch-studio-implementation.md) was moved from `docs/website-launch-studio-implementation.md` without changing its Git blob. Its PR merge status is historical, not a current assertion. The active product contract is [Website Studio](../../product/WEBSITE-STUDIO.md), with [Website Media](../../product/WEBSITE-MEDIA.md) as its consent and media boundary.
