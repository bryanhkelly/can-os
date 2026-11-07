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

## Synthetic data is test infrastructure

- Use isolated deterministic fixtures for the workflows that need acceptance testing; preserve idempotency and privacy, with no authentic student/family records in fixtures.
- **Never** create separate production routes, user experiences, or business operations merely because a record was seeded. Provenance metadata is not authorization; Valor is a canonical tenant and uses the same product APIs.
- Approved Valor demo accounts use `000000` locally and on Netlify production without access flags. Preserve their fixed account list, active canonical Valor grants, session checks and server domain authority. These intentionally public accounts must never access authentic records. Separately invited real-email testers can accept an exact-Site staff invitation by verified passwordless sign-in; they are not added to the fixed public demo list. Operator provisioning still requires literal `CAN_DEMO_FIXED_ACCESS_ENABLED=true` and development/test mode. The obsolete `CAN_DEMO_WRITES_ENABLED` gate is retired.
- Public `/schools/new` setup may create a separate synthetic tenant for a new single-label `.demo` domain. Its Site Admin and explicitly invited `.demo` staff use `000000` only with exact registry/invitation identity bindings and active canonical grants. Separately invited real-email staff use verified passwordless access with exact original email, account, person, role, grant and Site evidence. This does not expand the fixed Valor list or permit adopting authentic identities. Bootstrap hands off to ordinary Launch Studio; registrar authority cannot appoint or disable a Site Admin.
- Do not introduce new `*-demo.functions.ts` product handlers or bypass verified session/grant checks without explicit architectural review.
- A generic product feature does not automatically require its own demo persona, special UI, or duplicate test tenant. External synthetic-school staff invitations use the ordinary identity workflow; they do not authorize uncontrolled family outreach, notifications or SMS.

## Development and completion

- Use `main` as the active development baseline unless a task explicitly authorizes a different branch. FullFlow is released and retired; old phase and FullFlow branch/database handoffs are historical, not active instructions.
- Before coding, identify the canonical owning service, related callers, routes, migrations, invariants, and test coverage. Prefer deleting dead paths only after reference checks.
- Keep route contracts in `docs/platform-route-contracts.json` aligned with source; newly added entries begin with `pending`, never invented acceptance claims. Run `node scripts/check-platform-route-contracts.mjs --check`.
- Validate with typecheck, unit/integration, and browser tests as relevant, using disposable databases for mutation tests. If checks are deferred or cannot run, report them **unverified** rather than passed.
- Never change production data, migrate a live database, loosen security, or merge a PR to main without explicit authorization.
- A code merge does not prove an end-to-end journey, security posture, or production release.
