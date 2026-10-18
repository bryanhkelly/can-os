# CAN OS — Agent development contract

Applies to all coding agents, including ChatGPT, Copilot and other tools. Start with `docs/START-HERE.md`. **This file is policy; current implementation must be verified against code.**

## Authority and evidence

1. Current checked-out code, database migrations, and executable tests establish what is implemented. A test is evidence only if its execution and result are recorded.
2. This `AGENTS.md`, `docs/architecture.md`, `docs/domain-model.md`, `docs/golden-flows.md`, and the security documents define intended invariants and constraints.
3. `docs/CURRENT-STATE.md` is a time/commit-pinned code snapshot, not a permanent truth or release certificate.
4. Other active documents provide domain-specific detail. If they conflict, investigate and surface the disagreement before implementing.
5. `docs/archive/` holds historical artifacts **only**. Never take "current", "next", "unmerged", demo flags, or release instructions from archived notes as authority.

## Architectural non-negotiables

- Maintain a modular monolith using Neon PostgreSQL as system of record.
- Reuse Organization → Site → Program → Section and canonical identity, Action, Journey, CalendarEvent, CommunicationThread, DomainEvent and AuditEvent contracts.
- Authorization is **capability + resource + scope + relationship** on the server. UI role selection and hidden controls are not authorization.
- Ask CAN must use approved domain APIs under the same access context; never write directly around bounded commands.
- Durable business mutations must preserve transactional audit and domain-event semantics and idempotency as applicable.
- Configuration and policies vary by program/site/jurisdiction; avoid scattered special cases and parallel workflow engines.
- Do not copy prototype JSON, localStorage business state, synthetic personas, or portal-based authorization into production.

## Synthetic data is test infrastructure

- Use isolated deterministic fixtures for the workflows that need acceptance testing; preserve idempotency and privacy, with no authentic student/family records in fixtures.
- **Never** create separate production routes, user experiences, or business operations merely because a record was seeded. Synthetic provenance may still have deliberate, restricted legacy write gates; document and converge these safely rather than bypassing them.
- `CAN_DEMO_WRITES_ENABLED` is **fail-closed**: only the literal string `true` enables the existing synthetic write gate. It is not a login, permission, or production-ready toggle.
- Do not introduce new `*-demo.functions.ts` product handlers or bypass verified session/grant checks without explicit architectural review.
- A generic product feature does not automatically require its own demo persona, special UI, or duplicate test tenant.

## Development and completion

- Start work from the approved base branch; old Phase 1/2/3 branch handoffs are archived history, not active integration instructions.
- Before coding, identify the canonical owning service, related callers, routes, migrations, invariants, and test coverage. Prefer deleting dead paths only after reference checks.
- Keep route contracts in `docs/platform-route-contracts.json` aligned with source; newly added entries begin with `pending`, never invented acceptance claims. Run `node scripts/check-platform-route-contracts.mjs --check`.
- Validate with typecheck, unit/integration, and browser tests as relevant, using disposable databases for mutation tests. If checks are deferred or cannot run, report them **unverified** rather than passed.
- Never change production data, migrate a live database, loosen security, or merge a PR to main without explicit authorization.
- A code merge does not prove an end-to-end journey, security posture, or production release.
