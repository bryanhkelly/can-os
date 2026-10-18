# Phase 1 — Route and capability inventory

Baseline: main at `62e1d142ca58663d7768a86cabe75d0f1944431e` (2026-10-17).
This is an implementation inventory, not browser acceptance evidence.

## Route families

| Route family | Current responsibility | Canonical module or service | Phase 1 treatment |
| --- | --- | --- | --- |
| `/access*` | Passwordless access, session selection | identity | RETAIN; server-issued grants only |
| `/` | Public/product navigation landing | shell | REPLACE with authenticated entry or public access gateway |
| `/student*` | Today, assignments, courses, discussions, support, report cards, notifications | student-experience, learning, support | RETAIN; consolidate demo/live components |
| `/guardian*` | Family home, academic progress, offers, attendance, consent, monitoring | family, enrollment, learning | RETAIN; family/child resource context |
| `/teacher*` | Today, grading, missing work, notices, discussions, study groups | learning, study-groups | RETAIN; teacher-section scoped |
| `/staff*` | Student records, teachers, attendance | identity, attendance, learning | RETAIN; shared student detail resource |
| `/admissions*` | Application, intake, household readiness, capacity | enrollment | RETAIN; inquiry-to-active canonical lifecycle |
| `/operations*` | Needs You, launch, school years, policies, insights | operations, programs, academic-time | RETAIN but remove synthetic-only operations pipeline |
| `/sites*` | Site directory and daily site view | operations, programs | RETAIN; active site context |
| `/calendar*` | Calendar and export | calendar, academic-time | RETAIN; site-effective calendar |
| `/messages` | Communication threads | communication | RETAIN; shared thread context |
| `/ask` | Ask CAN | conversation, platform/agent | RETAIN; same authorized service boundaries |
| `/coach` | Student support caseload | support | RETAIN; shared actions |
| `/profiles`, `/admin`, `/readiness` | Configuration and administration | profiles, identity, programs | REVIEW overlap; consolidate into administration workspace |
| `/demo-health` | Synthetic fixture health | operations | REMOVE public route; relocate diagnostics to protected internal ops |

## Known implementation convergence targets

1. `src/components/student/DemoNavigation.tsx`: historical demo persona and browser-local storage selection. Replace all runtime persona selection with verified account grants. Rename after imports/tests are migrated.
2. `src/modules/operations/operations.functions.ts`: synthetic metadata filtering and hard-coded teacher ownership. Replace with canonical Action queries/commands and real authorized assignee selection.
3. `src/routes/operations.tsx`: mixes synthetic operations preview with live command center. Merge into a single canonical operation workspace.
4. `src/components/student/{StudentExperience,StudentQuickWins,LiveQuickWins,LiveSchoolExperiences}.tsx`: review and consolidate parallel product and demonstration experiences; preserve capabilities.
5. `src/routes/index.tsx`: currently routes visitors through a product/demo showcase; redesign for access/context routing.
6. `src/modules/_demo/*`, `scripts/seeds/*`: fixtures are allowed as data/test infrastructure; no product branching or privileged writes based on metadata.
7. `src/routes/guardian.index.tsx`: contains link to student notification surface; replace with an identity-aware shared notification center.
8. `src/routes/student.*`, `teacher.*`: ensure all learning writes/reads delegate to the same learning-domain contracts.

## Inventory completion work

For every TSX route, generate a machine-readable manifest listing pathname, route module, authorization boundary, loader, commands, canonical owner, outbound resource links, events, tests and disposition (retain/converge/remove). Fail CI on undisposed new routes and inaccessible retained routes. Do not infer functional completion from a passing build.

## Record safety

Do not delete, truncate, reseed, or rewrite authentic records. Avoid relying on `metadata.synthetic` to choose ordinary product behavior. Test fixture lifecycle belongs exclusively to isolated environments and must never serve as authorization.
