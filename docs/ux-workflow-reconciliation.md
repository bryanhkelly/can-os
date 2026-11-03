# CAN OS UX-to-workflow reconciliation (initial code-backed pass)

**Source:** main snapshot reviewed 2026-11-03, `7d572dc9d3df8c7b2162fd688d9c4d34077c70b3`.
**Scope:** Source-code mapping; no authenticated deployed-browser verification. The workflow atlas is still proposed UX, not runtime authority.

## Experience principle

Launch = prepare a school; Run = today's and this week's real work; Sustain = term and annual improvements. Operating users land in Run. Onboarding remains a contextual task available from Run, never an involuntary route takeover. Each page should clearly distinguish *what is verified*, *what needs attention*, and *what could not load*.

## Reconciliation matrix

| Journey / atlas reference | Existing UX anchor | Observed gap | Treatment | Validation required |
| --- | --- | --- | --- | --- |
| Launch to Run / L20 | `src/routes/operations.index.tsx`; `src/components/operations/OperationsWorkspace.tsx` | Operations route could redirect users into Launch whenever a resumable launch existed. | **Patched** remove automatic redirect, preserve explicit School launches link. | Authenticated existing-school login and resume-launch navigation |
| Site administrator Run | `src/components/shell/workspace-navigation.registry.ts` | `site_admin` role home pointed to `/operations/launch`. | **Patched** home `/operations` instead; site leaders continue to `/site/day`. | Role and scope landing-page smoke test |
| Day operation / R01, R17–R18 | `src/components/operations/SiteDayPage.tsx` | Opening-status summary failure was swallowed, indistinguishable from zero blockers. | **Patched** loading / unavailable advisory with retry; hard server authorization unchanged. | Force opening-status query failure in browser, confirm warning and server safeguards |
| School-opening review / L18 | `src/modules/operations/school-opening.server.ts`; `src/domain/school-opening-decision.ts` | Atlas provisional authorization is not an implemented canonical capability. | **No backend patch** until domain design approved; do not infer provisional authority. | Review CAN approver actions and evidence handling |
| Family intake / L01 and L11 | `src/routes/church.apply.tsx`; `src/routes/guardian.apply.tsx` | Church partner intake and guardian applications are separate journeys. | **Map separately**; keep entry wording and handoffs understandable. | Complete both flows as church leader and guardian |
| Registrar admissions / L12–L14 | `src/routes/admissions.index.tsx`; `src/routes/admissions.intake.tsx`; `src/routes/guardian.admission-offers.tsx` | Admission decision, offer, placement, and student access are all present but span multiple screens. | **UX candidate** task-first application detail with clear next action and stage-by-stage visibility; reuse commands. | Guardian offer acceptance -> registrar activation -> student access |
| Parent daily / Run family | `src/routes/guardian.index.tsx` | Home fetches several independent feeds; some failures show warnings. | **UX candidate** separate Today and Getting Started tasks, distinguish unavailable from none, prioritize child context. | Parent with two children and partial outage |
| Teacher daily / Run teaching | `src/routes/teacher.index.tsx` | Class, grading, missing work and follow-ups exist but main CTA is generic My classes. | **UX candidate** top next scheduled class, start-teaching action, urgent follow-ups. | Teacher assigned multi-section schedule |
| Student daily / Run learning | `src/routes/student.index.tsx`; `src/components/student/StudentExperience.tsx` | Published assignment reading is present; ancillary support fetches may fail independently. | **UX candidate** Continue learning as dominant action, separate optional support. | Student with new assignment, submission and returned feedback |
| Site physical operations / R17, R18 | `src/components/operations/SiteDayPage.tsx`; `OnsitePickupPanel.tsx`; `OnsiteDayReconciliationPanel.tsx` | Attendance, pickup, supervision, closeout sit on one long screen; process ordering may be hard to follow. | **UX candidate** time-of-day subnavigation and contextual handoffs, without inferring custody from attendance. | Site admin with authorized and blocked pickup scenarios |
| Sustain / term + year | `src/routes/operations.insights.tsx`; `src/routes/operations.school-years.tsx` | Periodic tasks mixed with operations navigation. | **UX candidate** distinct Planning/Health section available without blocking Today. | Registrar and network oversight journeys |

## Scope and safety constraints

- The workflow atlas must link to existing command and reader symbols, not replace existing domain authority.
- An empty or unavailable snapshot is not operational success; show uncertainty in the relevant UX.
- School opening authorization, day readiness, physical presence, learning activity, and custody release remain separate facts.
- No direct client-derived grants or bypass of server commands.
- The proposed provisional authorization must remain disabled until separately implemented and reviewed.
- Preserve routes and existing deep links wherever possible; prefer changing entry and prioritization over duplicating modules.

## Next high-impact UX vertical slices

1. **Guardian enrolls child**: apply -> offer -> requirements -> registrar activation -> student and guardian first-day cards.
2. **Teacher runs a class**: next-class entry -> lesson -> assignments -> feedback -> student progress.
3. **Site runs a day**: readiness -> expected arrivals -> recorded presence -> custody-controlled pickup -> reconciliation.
4. **Church launches**: interest -> setup -> website -> families -> CAN review -> explicit transition to Run.
5. **Sustain**: weekly issue review -> monthly health -> term/year planning and reenrollment.

## Acceptance

For each journey capture the *first screen*, *next action*, *happy path*, *blocked path*, *resume path*, and *handoff screen* using authenticated personas. Map each failure to one of: UX-only patch / missing integration / missing authoritative capability. Do not mark a flow complete solely because its JSON or route validates.

**Current validation:** Static source review only. Build, typecheck, and authenticated E2E have not been run against this patch branch.
