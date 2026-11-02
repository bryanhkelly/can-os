# CAN OS design refresh: parallel implementation plan

## Decision on the archived branch

Do **not** recreate or pull back `design/full-site-refresh` as the implementation base. Its refresh work was merged through PR #176 into `FullFlow`; the local `FullFlow` ref at review was `8f3aca2efbef879c5b29bb488d5a238269e8b7f3`. The reported launch, contact-import, school-community, and guardian-attendance commits were reachable from that ref. The design branch is not present among the local or remote-tracking branches inspected for this plan.

The old branch and its handoffs remain useful as historical review material, not as the current source of truth. If a later review finds a specific design commit or required file missing from the current `FullFlow` head, investigate that item through the merged PR and commit history before considering recovery. Do not blindly merge or restore the archived branch.

## Purpose and current evidence

This plan turns the design-refresh write-up and Builder.io preparation handoff into three independent implementation assignments. It targets the existing CAN OS frontend and its canonical services; it is **not** a greenfield redesign or an authorization/workflow rewrite.

At the review baseline:

- The refresh has substantial shared tokens, workspace/workflow primitives, role-aware navigation, and Storybook infrastructure.
- The launch guide, proposed school models, family-contact parser/import preview, school-experience wording/layout, and guardian attendance child-switch safeguards are present in `FullFlow`.
- The launch guide is not evidence that the ten steps form a single orchestrated workflow or that a configured program is authorized to open.
- Family contact import is preparation only. There is no invitation campaign persistence or send behavior established by the reviewed write-up.
- Existing design-system documentation reports successful typecheck/build and component-level Storybook evidence at its recorded commit, but also records full-suite failures and browser/Golden Flow, Chromatic, and disposable-database checks that were not completed. These are historical results, not current-head acceptance.
- The Builder.io handoff defines a separate, narrow `/operations/workflows` pilot. It is not a mandate to involve Builder in this three-agent site-refresh pass.

Source of truth for implementation is a freshly updated `FullFlow`, not these notes or the archived branch. Before dispatch, confirm its current SHA and re-check the relevant routes, components, tests, package scripts, design-system docs, and route contracts. The reviewed SHA above is a planning reference only.

## Parallelization model

Use three separate worktrees, each created from the **same current `FullFlow` SHA**. Give each agent only its task file plus the repository's required instructions (`AGENTS.md`, `docs/START-HERE.md`, and current design-system/architecture/golden-flow documents available on that branch). Agents implement bounded code changes, not merely recommendations.

### Shared rules

1. Keep the existing React/TanStack frontend, semantic tokens, shared components, canonical domain services, and server authorization. No alternate frontend, state engine, endpoint, or data source.
2. Do not change database schema/migrations, authentication/session/grant logic, capability/scope/relationship policies, audit/event plumbing, or canonical mutation semantics.
3. Setup/readiness presentation must not imply that setup completion is opening approval. A visible control does not grant authorization.
4. Do not add authentic or sensitive people data. Storybook/visual fixtures must be deterministic and synthetic, and must not drive production routes.
5. Preserve route search parameters, deep links, child/site context, loading and error behavior, and post-mutation refresh semantics.
6. If a requested visual improvement requires a service or policy change, stop at the presentation boundary, document the dependency, and raise it for separate review.
7. Keep each diff scoped. Add or update colocated stories/tests for changed shared behavior; avoid sweeping card/status rewrites.
8. No merge, deployment, production data access/write, live migration, or weakening of a fail-closed test gate.

### File ownership and conflict prevention

- **Agent 1 owns shared shell and design primitives.** Agents 2 and 3 consume current shared APIs and must not edit Agent 1's files. They request any needed shared API change rather than making it themselves.
- **Agent 2 owns Student and Family route/component presentation**, excluding shared shell, global tokens, and shared primitives.
- **Agent 3 owns Site Today and launch presentation**, excluding shared shell, global tokens, and shared primitives.
- Agents 2 and 3 must not edit each other's owned route/component files. If `site.day` or a launch component is consumed elsewhere, preserve the existing public contract and coordinate only through the integrator.
- No agent may make opportunistic edits to global CSS/tokens. Agent 1 owns them and should make only changes directly needed for the agreed pass.

## Integration plan

1. **Baseline and dispatch:** update `FullFlow`, record its SHA and clean worktree status, inspect task ownership, then create three worktrees at that same SHA.
2. **Agree on shared API:** Agent 1 publishes the existing and proposed component/token contracts early. Agents 2 and 3 use those contracts; they do not wait on a new design system before starting their route inventories.
3. **Implement in parallel:** each agent updates only its assigned surfaces, tests, and stories. Each returns exact changed-file list, rationale, test commands/results, screenshots where applicable, and unresolved blockers.
4. **Integrate serially:** review Agent 1 first, then rebase/reconcile Agents 2 and 3 against its final shared API. Resolve only ownership conflicts; do not combine unrelated changes automatically.
5. **Validate the combined diff:** run the current branch's lint/design checks, typecheck, production build, targeted unit/component tests, Storybook build and tests, and route-contract check. Use browser/accessibility and viewport checks on changed experiences.
6. **Acceptance boundary:** database-backed/browser journeys require the repository's guarded disposable test database and authorized synthetic identities. If unavailable, record the prerequisite as blocked and keep the affected journey unverified.
7. **Review and handoff:** inspect the final diff for changed business behavior, authorization, privacy, routes, and unintended scope. Report what passed, failed, was blocked, and remains unverified. Do not merge without explicit authorization.

## Completion criteria

- Three localized diffs implement the agent scopes without overlap or hidden shared-file ownership conflicts.
- Shared patterns are applied consistently without forcing role screens into identical information density or interaction models.
- Student and guardian contexts remain correct across links, child switches, empty/loading/error states, and mobile layouts.
- Site/launch views show canonical state and clear next steps without fabricating readiness or equating setup to approval.
- Changed interactions remain keyboard-operable and provide accessible labels, focus, and status/error feedback.
- Required checks have been executed at the integrated SHA or are explicitly marked blocked/unverified.
- This work does not claim whole-product design completion, full-flow acceptance, Builder pilot completion, or production readiness.

## Agent briefs

- [Agent 1: shared shell and design system](./design-refresh-agents/agent-1-shared-shell.md)
- [Agent 2: student and family experiences](./design-refresh-agents/agent-2-student-family.md)
- [Agent 3: site and launch experiences](./design-refresh-agents/agent-3-site-launch.md)
