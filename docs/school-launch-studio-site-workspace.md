# CAN OS — School Launch Studio and School/Site Workspace
Status: Product design specification · 2026-10-16
Scope: Additive specification. No implementation or completed workflow is implied.

## North star
A church, independent school, or local operator can create, configure, open, operate, improve, and expand a school of 1–1,000 students using one canonical operating foundation. Launch Studio and School/Site Workspace are two states of the same Organization → Site → Program lifecycle, NOT separate record stores or products.

## Existing foundations and source references
- Production: `src/routes/operations.launch.tsx`, `src/modules/programs/launch.functions.ts`, `src/modules/programs/gf3-service.ts`, `src/routes/operations.tsx`; see `docs/domain-model.md`, `docs/golden-flows.md`, and `docs/CURRENT-STATE.md`. The October 16 GF3 completeness assessment is historical; confirm current code and acceptance evidence before claiming completion.
- UX references, not production code: `academy-union-core/src/routes/_shell/launch-center.tsx` and `academy-union-core/src/routes/_shell/church-sites.$siteId.tsx`. Prototype site tabs: overview, local-director operations, partner operations, capacity, revenue, health, compliance, facilities, lab days, attendance, incidents, students, staff, priorities.
- Follow `docs/prototype-migration.md`: no localStorage workflow state, scripted AI evidence, fake audit history, church-only model, or persona-based production authorization.

## Product principles
1. Founder decisions before software configuration. First ask WHAT school to launch, for WHOM, WHERE, WHEN, and with WHICH resources; only then ask technical settings.
2. Financial viability, regulatory eligibility, academic quality, operational readiness, and enrollment demand are separate lenses. A progress percentage never overrides blockers or substitutes for a legal determination.
3. Launch configuration provisions real canonical objects; activation switches operating state without copying records.
4. One school can have multiple programs; one program may use onsite, live-online, and asynchronous instructional delivery concurrently at section-level granularity. Explicitly track program/site/academic/credit-issuing authorities.
5. Configurable for microschools, church-hosted academies, existing K-8 high-school extensions, independent K-12 schools, and supplemental service customers. Avoid mandatory functions that assume 100+ students or a church host.
6. Readiness claims must show evidence, owner, version, jurisdiction and approval; external approvals are never represented as automatic.
7. A site director sees today's actionable work before administration menus. Network and local leaders share records but see only authorized scope.
8. Replanning/expansion invokes the same modeling engine for a new school year, program, grade, cohort, facility or delivery arrangement.

## A. School Launch Studio
### Routes
- `/operations/launch`: authorized launch portfolio/list; new launch CTA; status, blockers, owner, target open date, and upcoming milestones. Preserve redirect/compatibility with current route.
- `/operations/launch/new`: guided draft creation; resumable, accessible wizard; validated steps and autosave.
- `/operations/launch/$programId`: launch HQ: summary; six sections; Needs You; evidence; scenario snapshots; decision log; activation readiness.
- `/operations/launch/$programId/scenarios`: compare educational and economic configurations.
- `/operations/launch/$programId/readiness`: categorized journeys/requirements/approvals.
These are proposed routes, not implemented routes.

### Six steps
1. **Vision**: independent school vs extension vs church academy vs microschool vs hybrid vs supplemental; grades, cohorts, target enrollment, jurisdiction and target opening year; owner/host/governing entity; facilities; identity/branding. Allow uncertainty and deferred answers.
2. **Model**: academic provider, credit issuer, accreditation context, academic calendar, schedule, hours onsite/week, section-level teaching model, onsite facilitators, remote teachers, room usage and optional shared CAN services. Surface ambiguous responsibilities for human resolution.
3. **Economics**: configurable tuition and aid assumptions, students by grade/cohort, utilization, staff FTE and loaded cost, instructional allocation, facilities costs, shared-service charges, host distributions, startup vs recurring costs, cash timing. Save named scenarios; show break-even and sensitivities, not fabricated guaranteed outcomes. Finance ledger is deferred; economics scenario is a planning artifact, never actual invoices/cash.
4. **Readiness**: parallel checklists for legal/regulatory, personnel qualifications, facilities/safety, background checks, technology, curriculum, academic records/credit and student services. Requirement definitions keyed to jurisdiction, program and operator characteristics with effective dates and provenance. External accreditation/licensing evidence reviewed manually by qualified owner.
5. **Enrollment**: publish inquiry/admissions offering, seats by cohort, tuition/communications and family readiness settings; connect to GF22/GF2, do not create parallel admissions records.
6. **Opening**: staff onboarding, academic year/calendar, sections, orientation events, drills/safety, guardian communications, launch rehearsal and authorized program activation. Activation gated by authoritative Journey readiness and permissions, not a frontend score.

### Launch HQ information hierarchy
Top: school identity, operator, proposed location, opening date, program scope, named launch owner, categorical readiness, blockers and one next recommended action.
Center: Needs You grouped by owner (School / CAN / Third Party), six phases, scenario selector, critical path, evidence review.
Right rail: enrollment interest/target, staffing plan, funds required and forecast (clearly modeled), activity log and messages.
Launch portfolio: expandable multi-school table with bulk filters; no fake “advance stage” button.

### New domain proposals (validate against existing schema first)
- `SchoolPlan`/ `LaunchPlanVersion`: draft assumptions and immutable approved version linked to Organization/Site/Program; changes auditable.
- `Scenario` + `ScenarioAssumption` + `ScenarioResult`: named, versioned, reproducible financial and service-delivery projections; assumptions separate from actuals.
- `DeliveryArrangement`: scope, receiving Program/Section, academic provider, instructor/facilitator, modality, location/online meeting, calendar pattern, staffing responsibility, billing allocation (planning first).
- `ServiceEntitlement`: which shared CAN services an org/program has, entitlement dates, limits, responsibilities and contract linkage; avoid embedding pricing in permissions.
- `RequirementEvidence`/ `RequirementDecision` if not already available: attachment, effective-date/version, verifier and history attached to existing JourneyRequirement; never duplicate Journey status.
First inspect existing `organizations`, `programs`, `journeys`, `documents`, and compliance schema; extend only where missing.

## B. School/Site Workspace
### Distinguish four contexts
- **Organization**: legal entity, governance, shared policies, financial responsibility, multi-site programs.
- **Site**: building/remote operational unit, schedule, rooms, facilities, onsite attendance, safety.
- **Program**: grade/educational offering, enrollment, academic authority, curriculum and sections.
- **Person workspace**: local director, teacher, guardian, network leader; composition driven by authorization, not separate stores.
Support a site with multiple programs and a remote program without a physical site.

### Routes
- `/schools` or `/sites`: scope-filtered institution portfolio, searchable.
- `/sites/$siteId`: site home / Today / Needs You with canonical indicators, exception queue, director briefing, program cards and quick actions.
- `/sites/$siteId/students`: enrollment, attendance, interventions, family coordination.
- `/sites/$siteId/academics`: program/section roster, delivery arrangements, teacher coverage, calendar.
- `/sites/$siteId/operations`: onsite schedule, arrivals, incidents, trips, communication and room usage.
- `/sites/$siteId/people`: staff, volunteers, qualification readiness and coverage.
- `/sites/$siteId/finance`: authorized planning/obligation view initially; actual subledger later.
- `/sites/$siteId/compliance`: requirements/evidence/action owners and expirations.
- `/sites/$siteId/facilities`: rooms, utilization, equipment, safety and inspections.
- `/sites/$siteId/planning`: forecast, next-year setup, expansions and scenario handoff to Launch Studio.
Use 8 navigable groups rather than 14 equal tabs; preserve deep prototype content behind subviews.

### Today screen
Header: school identity, timezone/date, owner, programs, enrollment count, operating status.
Top signals: expected/present attendance, current active students (clear measurement dates), open urgent actions, upcoming readiness expirations; missing data should display “Not available,” not zero.
Primary pane: time-ordered Today schedule + Needs You queue with human-readable explanation, owner, due date, evidence and exact authorized action target.
Secondary pane: staffing/room coverage, family messages, upcoming events, program health and growth planning.
Each metric drills into governed list; each alert resolves to a source record and an Action.
View modes: Today / This Week / School Year. Mobile prioritizes first three actions and attendance check-in; tables adapt, never hide critical fields without disclosure.

### Deep views and handoff
- Students & Families: admissions → activation → roster → support → report card/transcript; no duplicate student identity.
- Academics: section-level delivery, availability, teacher assignment, staff coverage, locally effective SchoolYear/Term/AcademicCalendar.
- Daily Operations: attendance, exceptions, room supervision, field trips, incidents, volunteers, chapel/service and family messages.
- People & Staffing: credentials, contracts/assignments and cross-school shared faculty capacity.
- Finance: forecast and tuition obligations; visibly separate cash received, approved funding, invoices and illustrative forecasts.
- Compliance: expiry/action/approval dashboard with sensitive-field gating.
- Facilities: capacity by time and program, room availability, online cohorts, physical inspections.
- Planning & Growth: invoke Launch Studio to add grade 9, expand to grade 10, alter onsite days, or open another site; version an approved change and provision next-year records only after confirmation.

## C. Canonical handoff / state machine
`Draft plan → Proposed plan → Launching Program → Ready → Active Program → Expansion proposal`.
- SchoolPlan and scenarios are planning artifacts, not official student/financial records.
- Existing GF3 `startProgramLaunch` creates canonical Program and Journey with transactional domain/audit events.
- Journey blockers and authorization gate `activateProgram`; activation is idempotent.
- School/Site workspace reads those same Program, Site, AcademicCalendar, Actions and Enrollment entities.
- Subsequent expansions reference existing Organization/Site and create a new Program or versioned SchoolYear configuration as appropriate; never duplicate families or teacher identities.

## D. Security, compliance, provenance
- Every query/mutation calls existing capability + scope + relationship checks server-side; client-selected site is not authorization.
- Distinguish private student/medical/discipline/finance scopes; require targeted grants and auditable reads where appropriate.
- Compliance templates are configurable, versioned and reviewed. Do not imply CAN grants government authorization or third-party accreditation.
- Host revenue shares and shared service billing are future finance modules; initial models are forecasts clearly labeled.
- No real student data in synthetic demo environment; follow release gates and Neon isolation guidelines.

## E. Delivery plan
**Wave 0**: Audit existing GF3, route/API/schema; map old 14 site tabs to new 8 groups; add clickable synthetic fixture acceptance map.
**Wave 1**: Launch portfolio + draft planning flow + editable launch HQ using existing GF3/Journey; site Today shell with real authorized read models and contextual Actions; empty/error/loading/audit paths.
**Wave 2**: Scenario engine, delivery arrangements, shared faculty coverage, evidence and critical path, capacity and readiness comparison.
**Wave 3**: Program provisioning, post-activation handoff, site deep workspaces, expansion/replanning; later financial subledger and CAN-level portfolio insights.

## F. Acceptance criteria and tests

The current bounded staffing implementation is described in
[Educational capacity: launch staffing](./educational-capacity-model.md#launch-staffing-and-qualification-coverage).
It connects scoped policy publication, server-enforced assignment, teacher class
visibility, instructional-window readiness, opening and Site Today through
canonical records. Its isolated automated evidence does not establish the full
Launch Studio or browser acceptance criteria below. Teacher profiles now provide
private evidence submission, and launch setup provides explicitly authorized
independent review. Explicitly granted catalog stewards can add basic shared
qualification definitions without editing existing entries or program policy.
Explicit institutional policy publishers can now publish future-dated
pre-opening revisions with complete requirement sets, reasons, confirmation and
version history. Earlier requirements retain their original instructional
interval; revised requirements can block opening without removing assignments.
Live storage acceptance, specialized catalog attribute authoring, active-program
policy changes and exception approvals remain outstanding.

New site-based openings now require an explicitly selected active site
registrar/operator. Program activation, the named operator's canonical handoff
Action, recipient notification and immutable evidence commit together.
The activation screen links to Site Today after success; the program no longer
disappears from the launch list without a destination. Site Today displays
pending and acknowledged receipt, the named operator, recorded opening instant
and section count, and links to current classes, school-year setup and operations.
It distinguishes live operational views from the historical opening record.

Only the selected recipient can acknowledge receipt, with a note and explicit
confirmation, after reauthorization against current site operator access.
Opening registrar and receiving operator may be the same person when eligible.
Generic Operations controls link to Site Today instead of offering reassignment
or resolution. Receipt does not gate the already-committed activation, replace
readiness checks, grant access or certify compliance. Existing active programs
without a handoff display an explicit unrecorded state, not invented completion.
Revoked-recipient recovery is now available in Site Today only to a scoped
registrar with an explicit institutional `program.opening.handoff.manage`
RoleAssignment capability, active Person and same-organization membership.
The command requires a pending handoff, an ineligible existing recipient,
an eligible replacement, an expected revision, reason and confirmation. It
locks the Action, rechecks authority on every invocation (including retries),
preserves the opening snapshot, records immutable previous/new ownership
evidence and notifies the replacement. The replacement must independently
acknowledge receipt. The previous recipient's existing notification remains
historical but no longer has a handoff deep link. Identical retries do not
duplicate evidence or notifications; stale or changed requests reject.
No access grants are created, no acknowledgment is fabricated, and recovery
does not change Program activation. Automatic escalation, external delivery verification, full
readiness-evidence review and broader director daily-operations acceptance remain
outstanding.

1. Create two synthetic school launch drafts under authorized organization, resume one after refresh, compare grade-9 scenarios without mutating current Site.
2. Forbidden organization/site/program launch and reads are rejected server-side; user cannot bypass with URL manipulation.
3. School founder selects an existing K–8 Site and creates a high-school extension; duplicate Site/Person/Household records are not created.
4. Readiness checklist supports Needs You / Needs CAN / Waiting on Third Party / Blocked / Complete with evidence, review and immutable audit events. Blocking items cannot be ignored even if completion count is high.
5. Activate program only after real Journey ready checks; failed/duplicate activation produces correct result and no duplicate event or calendar.
6. Active program appears immediately in authorized Site workspace with its source Program and SchoolYear data; no shadow-state migration.
7. Site director acknowledges an attendance or staffing Action; change persists after refresh and is reflected in site Today and related authorized role view.
8. Simulate a third-party shared teacher across two schools; each school sees only its sections/students; teacher gets aggregated authorized workload.
9. Site operating metrics define denominators, date ranges and data freshness; empty data never masquerades as a healthy school.
10. Expand an existing school into an additional grade or year without changing historical academic records or previously finalized scenarios.

## Non-goals of first implementation
Full accounting ledger, jurisdiction-by-jurisdiction legal guarantee, automated accreditation, automated ESA payouts, autonomous teacher hiring, real school data and fully autonomous launch approval.

## Design differentiator
The school founder does not buy six tools and hire six consultants before opening. CAN converts a proposed institution into a governed operating plan, then turns that plan into the same software the school uses each day.
