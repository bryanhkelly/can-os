# CAN OS instructions for GitHub Copilot

Start with [AGENTS.md](../AGENTS.md). That is the single cross-agent instruction source; this file does not override it.

Before changing architecture or business workflows, read:

1. [Current documentation map](../docs/START-HERE.md)
2. [Current-state snapshot](../docs/CURRENT-STATE.md) — source-code evidence only, not certification
3. [Architecture](../docs/architecture.md), [domain model](../docs/domain-model.md), and [golden flows](../docs/golden-flows.md)
4. [Prototype migration boundaries](../docs/prototype-migration.md)

**Do not** treat `docs/archive/` notes, old draft-PR handoffs, or historical demo rollout instructions as current product requirements.

Synthetic data is required **for relevant isolated test scenarios**, not as an excuse to create synthetic-only production routes, services, identities, or UI. Never weaken server authorization, privacy checks, or deployment gates to make a demo succeed.

Treat all "implemented" status statements as unverified until checked against the exact code and tests at the current commit.
