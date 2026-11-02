# Agent 2 — student and family experiences

## Assignment

Implement a cohesive, bounded presentation pass over the existing Student and Family experiences in the current `FullFlow` branch. Preserve their canonical data, navigation, and household/child access behavior. This work is presentation-focused; do not create new workflows or business endpoints.

## Start conditions

- Start from the exact `FullFlow` SHA supplied by the coordinator in your own worktree.
- Read `AGENTS.md`, `docs/START-HERE.md`, and the current design-system, architecture, domain-model, and golden-flow documents.
- Trace each route's current loader/query shape, links/search params, authorization boundary, loading/error states, and tests before editing.
- Consume Agent 1's existing shared component APIs. Do not wait for or create a parallel component library.

## Owned scope

Primary experiences:

- Student Today: `/student`, `src/components/student/StudentExperience.tsx`, and directly composed student presentation components.
- Family Home: `/guardian`, its family-home presentation, and directly composed family summary components.
- My School/School & Community: student school experiences such as `src/components/student/LiveSchoolExperiences.tsx` and the owning route.
- Guardian attendance presentation: `src/routes/guardian.attendance.tsx` and directly composed attendance presentation, only as needed for consistency.
- Colocated stories/tests for the owned presentation.

Confirm exact current filenames/routes at task start. Do not edit shared shell/navigation, `src/styles.css`, shared workspace/workflow primitives, Site Today, or launch components.

## Objectives

1. Make the next useful action and the distinction between urgent, informational, and completed items easy to scan.
2. Use consistent page hierarchy, shared cards/status/empty/loading/error patterns, and responsive layouts without flattening student and guardian needs into one persona.
3. Preserve Family Home prioritization and student/class/assignment links; maintain route search parameters and child context.
4. Keep School & Community language user-facing; do not expose infrastructure-health terminology as ordinary product status.
5. Preserve guardian attendance draft reset and stale-response protection when selected-child context changes.
6. Add/update stories or focused tests for meaningful visual state changes using synthetic presentation data only.

## Boundaries

- Do not change server authorization, family relationships, student visibility, query contracts, domain services, mutations, audit/event behavior, or database schema.
- Do not introduce localStorage/business state, synthetic-only production routes, demo personas, or invented readiness/status values.
- Do not modify shared tokens or components; request shared additions from Agent 1 through the coordinator.
- Do not modify site operator or launch files owned by Agent 3.
- If an experience requires data not provided by its current read model, document the gap rather than inventing fields or adding a service.

## Validation and handoff

Run focused unit/component tests for owned screens and changed states, plus typecheck/build as feasible. Validate 390, 768, 1024, and 1440 px, keyboard navigation, visible focus, headings/labels, loading/empty/error states, and child-context transitions. Any authenticated cross-role/tenant acceptance requires the guarded disposable test environment; otherwise report it as blocked/unverified.

Return exact changed files, behavior preserved, test commands/results and tested SHA, screenshots where available, and remaining gaps. Do not claim end-to-end guardian/student Golden Flow acceptance unless it was executed and recorded.
