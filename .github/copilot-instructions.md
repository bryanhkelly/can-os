# CAN OS instructions for GitHub Copilot

Start with [AGENTS.md](../AGENTS.md). That is the single cross-agent instruction source; this file does not override it.

Before changing architecture or business workflows, read:

1. [Documentation home](../docs/README.md) and [CAN vision](../docs/vision/CAN-VISION.md)
2. [Documentation migration status](../docs/DOCUMENTATION-RESET.md)
3. Existing [architecture](../docs/architecture.md), [domain model](../docs/domain-model.md), and [golden flows](../docs/golden-flows.md), treated as provisional technical references until reconciled
4. Current code, migrations, and executed tests for implementation evidence

**Do not** treat `docs/archive/` notes, old draft-PR handoffs, or historical demo rollout instructions as current product requirements.

Synthetic data is required **for relevant isolated test scenarios**, not as an excuse to create synthetic-only production routes, services, identities, or UI. Never weaken server authorization, privacy checks, or deployment gates to make a demo succeed.

Treat all "implemented" status statements as unverified until checked against the exact code and tests at the current commit.

FullFlow has shipped and is retired. Do not use its branch-specific instructions as active guidance. Use main as the development baseline unless explicitly authorized otherwise.
