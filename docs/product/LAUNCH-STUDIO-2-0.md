# Launch Studio 2.0: launch schools, centers, programs, and networks

Status: proposed product / engineering design. Source reviewed on main, 2026-11-14. Not implemented or browser accepted.

## Principle

Launch Studio turns an authorized organization, location, and educational offering into an operating service. A school is one supported operation, not the root abstraction. Do not replace domain objects with a generic Launch object or conflate Site, operation, Program, Offering, Blueprint, Deployment, enrollment release, or network relationship.

## Entry experiences

1. Launch a school: a Site and school operation, academics, admissions, compliance and opening governance.
2. Launch a community learning center: local host/organization, qualified Site, age-specific safeguarding and insurance, programs, facilitated or online delivery.
3. Launch a program or class: select existing authorized organization, operation, and Site(s), then adopt an approved Offering and configure delivery/enrollment.
4. Roll out across a network: network publisher prepares governed content and eligible Sites opt in or receive appropriately delegated adoption; verify authorization per Site. No membership grants automatic Site authority.
5. Continue a saved launch or open an operating workspace.

Family, student, learner and staff onboarding are not operator-launch choices. Route them from an independent 'Join or participate' entry, school invitation, /learn/enroll or account home. One CAN account remains person-owned. A favorite Site never grants access.

## Milestones

1. Establish: determine actor authorization, choose existing or create minimal Organization/Site/operation as permitted; record legal vs hosting vs operator vs network roles; select launch goal and intended audience. Never fabricate a Program, Site permission or publication.
2. Design: select suitable versioned approved Blueprint, construct or adopt offering, choose modality, cohorts/sessions, completion policy, staffing, course/content and exact Site placement. School-specific academic structure appears only for school operations.
3. Prepare: versioned facility qualification and supporting documents, capacity/devices, protection for minors when relevant, insurance, accessibility, staff qualifications, reviewer decisions, regulatory eligibility, communications/website assets. Dynamic evidence gates based on jurisdiction, learner population and activity. An adult course does not need a K-12 school opening gate.
4. Activate: independently authorize deployment, adoption, public publication and enrollment release; configure exact session dates, registrations, consents, capacities and site placements; run preflight and open the appropriate operational dashboard. Website publication is neither sufficient nor always necessary.

Milestones are navigation, not one aggregate approval state. Independently authoritative status comes from canonical services; 'Unavailable' is never 'Ready'. Save draft buffers separately from domain mutations. Preserve exact Site, Program and role context, including on Back.

## Three-level workspace

Organization/network view: partnerships, governed blueprints, distributions, delegated Sites and consolidated reporting.
Site view: facility readiness, people, resources, on-site schedules, safeguarding, communication.
Program delivery view: approved Offering/deployment, cohort, session, enrollment release, participant roster, attendance and completion.

One Site may deliver multiple Programs; one Program may be delivered across multiple Sites. Network rollout must not replicate schools. Independent online delivery must not fabricate a Site. Reuse canonical organization, operation, Site, blueprint, offering, deployment, enrollment release and existing permissions.

## Canonical integration and migration

Current school launch entry: src/components/launch-studio/LaunchStudioEntry.tsx
School Hub and module definitions: src/components/launch-studio/SchoolLaunchHub.tsx and src/domain/school-launch-hub.ts
School stub creation: src/components/launch-studio/CreateSchoolProfile.tsx
Canonical Blueprint authoring: src/routes/canonical.blueprints.tsx
Site qualification: src/routes/canonical.lab.site-qualification.tsx (diagnostic, not a completed applicant workflow)
Production source for noncredit publisher: src/routes/programs.noncredit.enrollment.tsx
Enrollment release contract: docs/product/NONCREDIT-SELF-ENROLLMENT.md

Do not casually route legacy Site context into canonical Blueprint Studio: public-schema identity and canonical membership are separate and the bridge must be independently authorized. An existing school's legacy Hub must remain functional while corresponding modules are replaced with canonical-backed launch workspaces. Never redirect a live school from Run to Launch. Retire legacy module routes only after actual production replacement, tests and redirects.

## Proposed UI (design system 6.1)

Rectilinear cards and inputs, no decorative rounding, wallpaper hero only when useful; clear next action and real record-derived statuses. Landing offers launch goals and 'Continue launch'. Once authorized, header shows Organization / Site / Program context with switcher; left rail shows four milestones, center shows incomplete work and actions, right summary shows evidence, blockers and opening/registration readiness. Use 'school' only in school flows. Website & Brand is an optional workstream with independent publication state, not the default first step.

## Incremental implementation

P0: Canonical-aware Launch Studio home with launch goal routing, authorized context selection and separate participant onboarding. Preserve existing school paths.
P0: Community center setup with canonical Site/operation context, qualification, approved blueprint, site-adopted training, cohorts, enrollment release and run handoff.
P0: Site and program readiness computed from independent canonical authorizations; no global feature flags or simulated completion.
P1: School journey migrated to the shared milestone shell while retaining admissions, academics and opening gates.
P1: Network template rollout and Site-level adoption/delegation, reporting and repeatable program launches.
P1: Marketing, recruitment, website and event utilities as optional tasks, never preconditions for all activities.

## Acceptance matrix

- Standalone community center with adult training and no school.
- Existing church adds one approved training without creating another Site.
- School adds an afterschool or summer Program without relaunching itself.
- Network offers one program to multiple authorized Sites; unauthorized Site cannot activate it.
- One Site launches two different offerings with independent cohorts, room facilitators and registration releases.
- Independent online training with no physical Site.
- Young learners enforce applicable safeguards; adult-only delivery does not inherit irrelevant school admissions.
- Account favorite has no authorization effect.
- Reviewer cannot self-approve; Site author cannot see another Site; wrong-account legacy-to-canonical transition denied.
- Existing live school dashboard remains Run; setup available in Settings.
- Draft recovery, expired/closed sessions, missing data, denied browser access, and unavailable canonical readers fail closed.

Release gate: typecheck, tests, build, test01 migrations, role-isolated API and browser E2E and exact deployed SHA before calling production ready.
