# Agent 1 — shared shell and design system

## Assignment

Implement a focused consistency and usability pass on the shared CAN OS shell and design primitives in the current `FullFlow` branch. This is the shared dependency for the student/family and site/launch work; keep its public APIs stable where possible and communicate any proposed API changes before implementation.

## Start conditions

- Start from the exact `FullFlow` SHA supplied by the coordinator in your own worktree.
- Read `AGENTS.md`, `docs/START-HERE.md`, and the current `docs/design-system.md`, `docs/architecture.md`, and `docs/golden-flows.md` if present on that branch.
- Inspect current shell, navigation, workspace, workflow, and UI primitive usage before changing anything. Treat archived design notes as context, not requirements.

## Owned scope

Own shared presentation files only as needed:

- `src/components/shell/WorkspaceNavigation.tsx` and its directly related shell/context-switcher components.
- `src/components/workspace/`, `src/components/workflow/`, and `src/components/ui/` shared primitives.
- `src/styles.css` semantic design tokens, only where the agreed shared UI pass requires it.
- Colocated stories/tests and relevant shared design lint/check configuration.

Do not take ownership of role-specific route/component work. Do not change domain/service modules.

## Objectives

1. Identify the shared shell and component conventions that already exist; do not replace them with a new library or token system.
2. Improve consistency and responsive/accessibility behavior only where source evidence identifies a gap relevant to this pass.
3. Confirm shared components expose semantic, typed variants rather than encouraging route-local visual copies.
4. Provide stories/tests for changed reusable components and their important states.
5. Publish a concise handoff to Agents 2 and 3 listing the stable components/tokens they should compose and any intentional API changes.

## Boundaries

- Preserve authorized workspace/scope switching, session loading, route destinations, notification/search/account behavior, and existing navigation semantics.
- UI selection or visibility must never be treated as server authorization.
- Do not perform a broad raw-class migration or change role-specific visual accents across every route.
- Do not change production workflow, launch, attendance, student, family, or teacher behavior.
- Do not edit files owned by Agents 2 or 3. Coordinate shared needs through the integrator.

## Validation and handoff

Run focused tests for any changed shared component, lint/design-system checks, typecheck, and Storybook build/test where available. Record exact commands, results, tested SHA, and unverified visual/browser states. Capture responsive evidence at 390, 768, 1024, and 1440 px for changes to shared navigation/layout. Report changed files and the final public component API.

Do not claim all routes now use the design system or that the full site has been visually accepted.
