# Launch Studio 2.0: Site-first onboarding and program activation

Status: proposed product / engineering design, updated 2026-11-14. This document is not an implementation or browser acceptance result.

## Governing principle

Start with a Site, not a menu of school / center / program / network launch templates. The initial interaction is a Site establishment or selection journey. Ask about supported modes of delivery, optional network affiliation, and only then programs. For CAN OS product classification, a Site is a **school** if and only if its selected/active educational offering includes a grades 6–12 curriculum. There is no separate school-type choice, school incorporation check, or school-facility requirement for this label. A Site without a grades 6–12 curriculum is not shown as a school. The presence of a grades 6–12 curriculum determines UX classification and enables school-specific academic flows; it does NOT by itself grant legal authority to operate, award credits/diplomas, enroll minors, publish offerings, or satisfy jurisdictional requirements. Those are independently governed operational authorizations. Sites can concurrently deliver school and non-school programs.

Site establishment, Program/Offering definition, and Site-specific delivery / deployment remain separate independently governed lifecycles. A Site may support multiple Programs and a Program may be delivered at multiple Sites. Reuse canonical Organization, operation, Site, Blueprint, Offering, deployment, cohorts/sessions and enrollment releases. Do not create duplicate 'launch records' as sources of truth.

## Primary operator journey: five steps

1. **Your Site.** Ask for Site name and responsible organization, select an existing authorized Site when possible, and establish a minimal new Site identity only with proper authority. Gather geography and contact information appropriate to the proposed delivery model. Do not publish a website, create a Program, assert a legal school status, or imply a Site is qualified at this step.
2. **How will you deliver learning?** Select **Physical**, **Digital**, or **Both**. This expresses the Site's intended capabilities, not a permanent restriction on Program delivery and not a cohort/session modality. Physical requires facility details and facility qualification for relevant offerings. Digital requires technology, content access, service/support and privacy readiness, but does not create a fictional street address. Both supports separate in-person and online enrollments, capacities and sessions. Investigate and represent a true digital-only operating context without fabricating a physical Site: existing canonical independent noncredit enrollment releases use site_id=NULL. Validate the canonical site_kind / relationship model before any schema migration.
3. **Network affiliation (optional).** Show existing verified network relationships, an invitation/code entry, 'Find a network', and 'Operate independently'. A code is a request or invitation to establish a relationship; it never by itself grants a membership, enrollment privilege, program adoption, branding, funding entitlement, or Site approval. Review and independently authorize network ties and roles. If no affiliation, allow the user to proceed normally. Some networks may supply governed programs, site standards or onboarding questions once membership is actually approved.
4. **Your Programs.** Show (a) approved offerings available to this operator/Site, including network programs if verified, (b) programs already adopted by this Site, (c) independent CAN catalog offerings, and (d) request/create a new Program or Blueprint where authorized. Configure exact Site(s) or independent digital delivery, cohorts, sessions, capacity, facilitators, consent and enrollment windows. Do not conflate an educational Blueprint (recipe), published Offering (approved product), deployment (where/how delivered), or an enrollment release (registration authority). Selecting a grades 6–12 curriculum is the sole trigger for school classification in CAN OS. It exposes school-specific academic preparation, admissions and applicable regulatory/safeguarding workflows; it does not confer their approval. Youth programs trigger applicable safeguarding.
5. **Readiness and activation.** Generate specific tasks based on the Site, delivery modes, intended participants, programs, operating relationships, location and network requirements. Separate Site qualification from Program review, adoption, deployment, public publication and enrollment release. Where independently authorized, activate the first delivery and transition to Site operations. A successful Site onboarding does not mean any Program is approved or open for enrollment.

Guidance is progressive: avoid an up-front giant requirements form. Save partial progress at each step. If a person already operates a Site, Launch Studio opens its Site context and starts at delivery / programs without recreating the Site or restarting its qualifications.

## Post-launch returns

- Site workspace: facilities, delivery capabilities, team, equipment, site safety/qualification, site settings, multiple program deliveries.
- Program workspace: approved Offering/Blueprint, delivery, cohorts, rosters, attendance, assessments, completion, reporting.
- Network workspace: relationships, governed catalogs, delegation and cross-site aggregates (restricted and authorized).
- Existing operating Sites go to Run by default; Site setup remains accessible in Settings. Launch a new Program from Run without repeating Site creation or network onboarding.

## Network and privacy guardrails

Network affiliation is optional; an unaffiliated provider must be fully functional. Network invitations/codes are scoped, expiring, verifiable relationship proposals, not bearer authorization. A favorite Site is not membership, and membership is not automatically a Program license. Network program distribution requires separate Site/operator adoption approvals and scoped data-sharing rules. National network impact reports default to approved aggregates; identifiable local records require separately granted scope.

## Product model and example

A church establishes 'Barton Community Learning Center' once, selects Both, submits a COGIC invitation code, and (after verified authorization) sees eligible national offerings. It chooses the four-week digital skills course, selects a Site facilitator, four dated sessions, capacity and a registration release; readiness requests only requirements applicable to the program, audience and location. Later the same church can add summer learning or a different course without creating a second Site, retaking unrelated surveys or reentering network affiliation.

A standalone operator follows the identical journey and chooses 'Operate independently'. A digital-only provider can configure an online delivery relationship without asserting a physical facility. A national network administrator's provider program publishing experience is a distinct authorized workspace, not another first-step Site creation choice.

## Source map (reviewed on main)

- Current entry is school-oriented: src/components/launch-studio/LaunchStudioEntry.tsx
- School Hub: src/components/launch-studio/SchoolLaunchHub.tsx, src/domain/school-launch-hub.ts
- School profile creation: src/components/launch-studio/CreateSchoolProfile.tsx
- Canonical site-specific Blueprint workspace: src/routes/canonical.blueprints.tsx
- Site qualification diagnostic: src/routes/canonical.lab.site-qualification.tsx (not a fully proven applicant workflow)
- Noncredit publisher: src/routes/programs.noncredit.enrollment.tsx
- Noncredit identity and delivery rules: docs/product/NONCREDIT-SELF-ENROLLMENT.md

The legacy school Site identities and canonical v3.0.1 accounts/roles are not interchangeable. Do not bridge Site selection from legacy Launch into canonical authoring by client supplied IDs. Verify exact authenticated canonical authority, Site/operation relationship and reviewer separation.

## 6.1 design requirements

Start with 'Establish your Site' or 'Continue with an existing Site', not a grid of launch types. Use rectilinear controls and cards, concise explanatory text, progressive disclosure and step navigation. Step labels: Your Site / Delivery / Network / Programs / Get Ready. If affiliation is optional, make 'Continue independently' a first-class choice rather than a hidden skip. Clearly differentiate 'Site saved', 'Network pending', 'Program approved', 'Site qualified' and 'Registration open'. Show an actionable specific next step rather than a fake aggregate green Launch status.

Website & Brand, campaigns, events, communications and reporting remain available shared capabilities, not universally required gates or automatic redirects. Do not redirect Site creation straight to Website Studio.

## Implementation sequence

P0. Replace the school-first Launch landing with authorized Site selection/creation and five-step stateful navigation; preserve old routes until replaced and tested.
P0. Add delivery capability selection with supported canonical physical/digital/both semantics; do not modify production DB before validating site_kind and independent delivery.
P0. Add optional independently verified network invitation/request UI and existing relationship selection. Do not grant authority from a code alone.
P0. Connect program selection to canonical approved offerings, Blueprint authoring where authorized, Site adoption/deployment, session/cohort scheduling and enrollment release. Make actual readiness conditional.
P0. Launch-to-Run handoff and post-launch 'Add a program' on the same Site.
P1. School academic/admissions/opening requirements triggered only by the presence of a grades 6–12 curriculum, with independent approval checks; no school-type selection.
P1. Network-assisted catalogs, multi-Site rollout and aggregate impact reporting.
P1. Optional brand, marketing, events and outreach modules.

## Acceptance

- An independent physical Site can complete onboarding and add an authorized adult course without school setup.
- A mixed physical/digital Site supports separately governed on-site and online deliveries.
- Digital-only onboarding does not fabricate a physical address or forced facility approval.
- A network code cannot independently issue grants, membership or adoption; authorized approval makes appropriate catalog access visible.
- An independent operator completes the flow without a network code.
- An existing Site adds a second program without Site recreation or irrelevant repeated checks.
- A Site becomes a school in CAN OS when a grades 6–12 curriculum is added; removing it from the active curriculum set (subject to existing student/record obligations) removes school classification without deleting historical academic records.
- A school adds an afterschool program without relaunching the school.
- A single approved national Offering can be adopted by multiple eligible Sites with separate release capacities, sessions and reporting.
- Cross-Site and cross-Person requests are denied by server/database authorization; author cannot self-review.
- Missing reader access, inactive membership or unavailable services fail closed, not 'Ready'.
- Browser Back, draft reload, multi-Site switching and in-flight edits never silently change Site or Program context.

Release gates: exact-main source SHA, typecheck/test/build, test01 canonical migration/security checks, real role-scoped browser E2E and deployed SHA verification. This specification does not claim those checks have passed.

## Multi-select program and curriculum discovery

On Step 4 (Your Programs), allow multiple selected program formats (afterschool, summer/breaks, training, enrichment) and grade-band academic tracks (6–8, 9–12); schedule tags (weekday, weekend, evening, flexible) and audiences (youth, adult, senior) are not mutually exclusive. Never use a single-select program-type enum to represent all three dimensions. Senior is an adult-oriented audience descriptor; actual age eligibility belongs to the versioned enrollment policy. Multiple audiences may be served by the Site, but enrollment eligibility is checked separately for each Offering/release.

Introduce user-facing multi-select **Curriculum approach** and **Content focus** chips after program/audience choice, with options conditional on context:

- Approach examples: standards-aligned / college-prep, classical, project-based, competency/mastery-based, Montessori/self-directed, inquiry-based, personalized/adaptive. These are combinable descriptors and do not independently imply accreditation, academic level or approval.
- Content focus examples: core academics, STEM/robotics, arts/humanities, digital skills/AI, career/technical, financial literacy, health/wellness, languages/ESL, faith/biblical studies, leadership/life skills, civics/service, literacy/numeracy. STEM and CTE are **content focus/pathway** terms even if marketing catalogs sometimes call them approaches.
- Keep religious affiliation / network editorial identity separate from curriculum approach or accreditation. An independent or nonsectarian Site must not inherit denominational content based solely on a network code.
- Preserve curriculum publisher, license, rights, course level, target audience, jurisdiction approvals, instructional delivery and grade/credit classification as distinct validated attributes, not mere tags.

Use these choices to filter/rank **existing published Blueprint versions and approved Offering versions**, including rights and verified network visibility. The engine must not mint new Blueprints automatically for every chip combination or imply that a matching reference item is a deployable offering. Allow multiple independent Blueprint/Offering selections, each with a separate Site adoption and readiness review. Keep the site classification rule: only the presence of an actual grades 6–12 academic curriculum (not an afterschool audience of that age or selecting the 'core academics' focus chip) enables the CAN OS school experience. The existence of such a curriculum never substitutes for independent academic, safety, operational or jurisdictional approval.

UX: grouped multi-select rectangular chips (6.1), selected state with visible checkmark, clear-all per group, selection summary and suggested matches. Permit zero optional approaches/focus selections with a broad catalog default; do not require a one-to-one taxonomy match to discover legitimate programs. Derive readiness and program registration from final authorized records, not chip state.

Current source note: `src/domain/blueprint-configuration.ts` includes `blueprintProgramModelDraftSchema` with `kind`, `gradeRange` and `deliveryModel`, but no first-class approach/focus taxonomy. The `blueprintEditorialIdentityKeys` (including `classical_humanities`) are editorial branding/identity, **not** a curriculum taxonomy. Canonical `blueprint_versions.target_kind` supports offering / operation / composite. Any normalized taxonomy schema change must be explicitly designed, versioned, migrated on test01 first and regression tested; don't reinterpret editorial identity as curriculum choice.

Acceptance: select several program formats, audiences, approaches and content focuses; review ranked candidates and distinct adoption intents; remove one chip without deleting already-authorized offerings or enrolling anybody; school experience only when actual 6–12 academic curriculum is selected; no unauthorized network items in matches.
