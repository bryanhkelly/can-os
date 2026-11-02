# Agent 3 — Site Today and launch experiences

## Assignment

Improve the presentation and clarity of the existing site-operator and school-launch experiences in the current `FullFlow` branch. Show canonical operational state and useful next steps without turning the launch guide into a client-owned workflow or implying that configuration grants permission to open.

## Start conditions

- Start from the exact `FullFlow` SHA supplied by the coordinator in your own worktree.
- Read `AGENTS.md`, `docs/START-HERE.md`, and current design-system, architecture, domain-model, golden-flow, launch, and security-gate documentation relevant to your routes.
- Trace source read models, server-side command checks, route links/search params, refresh behavior, and tests before changing presentation.
- Consume Agent 1's shared component APIs. Do not edit shared shell, tokens, or primitives.

## Owned scope

- Site Today route and its site-operator presentation components (confirm current route and file ownership at task start; likely `src/routes/site.day.tsx` and directly rendered operations components).
- Existing launch guide and portfolio presentation, including `src/components/operations/OneHourSchoolLaunch.tsx`, `/operations/launch`, and directly composed presentation components.
- Stories/tests colocated with owned presentation components.

Do not edit shared shell/navigation, `src/styles.css`, shared workspace/workflow primitives, or student/family files owned by Agent 2. Avoid incidental edits to shared launch/service code; confirm ownership with the coordinator if a file is shared.

## Objectives

1. Help site leaders scan today's real priorities, staffing/attendance exceptions, and the next authorized action using existing read models.
2. Make launch progress understandable in plain language and progressively disclose technical configuration where current contracts allow.
3. Reconcile the guide with the existing portfolio and detailed launch views so the experience feels connected without duplicating readiness state.
4. Make clear that proposed models/defaults are setup inputs, not provisioned academic structures or opening authorization.
5. Keep readiness, safeguarding, institutional review, and opening gates distinct and server-authoritative.
6. Add/update synthetic Storybook states and focused tests for presentation changes.

## Boundaries

- No new launch workflow engine, persisted shadow state, backend command, endpoint, table, or migration.
- Do not change `activateLaunch`, opening approval, readiness policy, staffing verification, safeguarding, school-day attendance, audit/event semantics, or any authorization check.
- Do not invent progress percentages, completion, delivery success, or permission based on UI state.
- Family contact import remains preparation/preview only. Do not implement campaign persistence, send, retry, delivery claims, or unsubscribe handling as part of this design task; those need a separately reviewed domain/service design.
- Do not change shared components or Agent 2's screens; request shared needs from Agent 1 through the coordinator.

## Validation and handoff

Run focused tests for changed launch/site presentation, typecheck/build, relevant Storybook build/tests, and route-contract checks where applicable. Validate 390, 768, 1024, and 1440 px, keyboard/focus behavior, and blocked/empty/loading/error states. Authorized command/browser acceptance must use a guarded disposable database; if unavailable, record it as blocked and do not infer acceptance from component tests.

Return exact changed files, canonical data/actions reused, behavior and gates preserved, test commands/results and tested SHA, screenshots where available, and unresolved service or acceptance gaps. Do not claim one-hour end-to-end school setup or opening readiness has been certified.
