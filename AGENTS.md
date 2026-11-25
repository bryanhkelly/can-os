# CAN OS — Agent development contract

Applies to all coding agents, including ChatGPT, Copilot and other tools. Start with `docs/README.md` and `docs/vision/CAN-VISION.md`. **This file is policy; current implementation must be verified against code.**

## Authority and evidence

1. Current checked-out code, database migrations, and executable tests establish what is implemented. A test is evidence only if its execution and result are recorded.
2. `docs/vision/CAN-VISION.md` defines current product intent. This `AGENTS.md` defines agent policy. Existing technical and security documents remain provisional engineering guidance until reconciled under `docs/DOCUMENTATION-RESET.md`; verify them against current code.
3. `docs/archive/2026-11-fullflow/retired-plans/CURRENT-STATE.md` is historical accumulated implementation evidence, not an up-to-date release certificate. Check the exact current commit and executed tests.
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

## Demo identity, synthetic data and test infrastructure

- A demo Organization or Person is classified by its normalized .demo domain. Synthetic operational data is classified by its owning Organization, not the participant's email or fixture provenance.
- Production application functionality, authorization, workflow, rendering, persistence and performance must be independent of demo classification. Use the same services, canonical identities, grants and components.
- The only intended functional exceptions are automatic email verification for demo identities and suppression of outbound email to .demo destinations. Record verification provenance accurately. Never equate automatic email verification with authentication or grant authority.
- Preserve account ownership, current session checks, role/capability/resource/scope/relationship authorization and separation of duties for all identities. Existing public shared-code fixtures must not gain access to authentic records or privileged operations; migrate to equivalent secure credentials and canonical grants before removing legacy guards.
- Synthetic classification is a reporting dimension; fixture provenance is test infrastructure, not business authorization. Use isolated deterministic fixtures and never place authentic student/family records in test fixtures.
- During the convergence release, legacy demo registry, fixture and SMS restrictions remain until their consumers, data and security invariants are reconciled. Their existence is not a precedent for new demo-specific business logic. Do not introduce new demo-only handlers or deployment flags.

## Permanent V6.1 architecture contract

- New feature UI composes canonical primitives and workspace/workflow patterns; new cross-feature interaction patterns belong to the existing shared layers, not a second component library. Remove superseded implementations after reference checks.
- No legacy debt is grandfathered: `npm run design:source` must pass across the entire production TSX inventory, including untouched source. Normal and Cloudflare builds enforce it. Never weaken a rule or add a filename exception to get a release through.
- For changes to reusable patterns, add representative populated, empty, error, loading and applicable keyboard/responsive Storybook cases. Review actual rendered output against approved V6.1 references; source compliance alone is not visual acceptance.
- Release acceptance requires strict coverage, current reviewed independent-render evidence, Storybook interaction tests, visual regression review and applicable authenticated browser journeys. Missing execution or evidence is a release blocker, not permission to report completion.

## Development and completion

- Use `main` as the active development baseline unless a task explicitly authorizes a different branch. FullFlow is released and retired; old phase and FullFlow branch/database handoffs are historical, not active instructions.
- For V6.1 page migration, discover routes, components and legacy controls from the actual source graph using `scripts/lib/v61-source-audit.mjs`. Do not add route-name allowlists, fixed migration counts, duplicated per-page checklists or JSX-text assertions to the design-system checker. Put domain-specific state transitions and permissions in behavioral tests, and source/design rules in reusable AST analysis.
- Before coding, identify the canonical owning service, related callers, routes, migrations, invariants, and test coverage. Prefer deleting dead paths only after reference checks.
- Keep route contracts in `docs/platform-route-contracts.json` aligned with source; newly added entries begin with `pending`, never invented acceptance claims. Run `node scripts/check-platform-route-contracts.mjs --check`.
- Validate with typecheck, unit/integration, and browser tests as relevant, using disposable databases for mutation tests. If checks are deferred or cannot run, report them **unverified** rather than passed.
- Never change production data, migrate a live database, loosen security, or merge a PR to main without explicit authorization.
- A code merge does not prove an end-to-end journey, security posture, or production release.
