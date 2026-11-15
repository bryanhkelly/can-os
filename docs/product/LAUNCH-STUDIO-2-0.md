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

## Time-to-first-website: the primary product outcome

The product's first aha moment is a **compelling, Site-specific website preview that already shows the educational experiences the operator wants to offer**, reached immediately after minimal Site information, delivery capability, optional network indication, and lightweight multi-select program/audience/interest choices. Do not make a full curriculum source selection, facility survey, staffing plan, website photo workflow, brand exercise, or every review a prerequisite to experiencing this preview.

### Progressive fast path

1. Establish/select Site and responsible Organization using current authorized identity, name and essential location/digital context.
2. Capture Physical / Digital / Both as intended Site delivery capabilities.
3. Optionally identify existing approved network association, submit network code/request, or Continue independently. A pending code must not prevent private preview; network-only brand and content are never presumed authorized.
4. Multi-select initial program formats, academic grade-band curricula, audiences and optional content interests using concise chips. Explain that selections are intentions, not published programs. Curriculum publisher/source, license and detailed pedagogy are later decisions.
5. **Generate private Site website preview immediately.** Use the Site name, authorized network branding if verified, an appropriate neutral default template, concise editable introductory copy, and clearly labeled **proposed** program cards. Use rights-safe media (or tasteful non-photographic placeholders) and no invented claims, fictional programs presented as real, fees, address, staff, dates or availability. If actual approved offerings are present, show them with their real publication eligibility.
6. Offer only three obvious next actions: **Customize website**, **Make programs enrollable**, **Share/publish Site** (last action shown only with independent Site publication permission). Existing six-step Website Studio becomes an *optional refinement workspace*, not a blocker before first visual payoff.

Site website identity should be created once; later adding a Program or Offering updates the same Site website's draft/catalog projection. An authorized Site operator can preview and confirm publishable program presentation; promotion of unapproved or unreviewed content into public pages must never happen silently. No duplicate CMS, site or program records.

### Readiness is not a single boolean

Distinguish:
- **Private preview ready**: authenticated Site editor can see their proposed site; no claims of enrollment or public reachability.
- **Site published**: public website has been independently approved; proposed offerings may appear as clearly labeled planned/interest only *if an authorized public-interest policy and consent path permit it*.
- **Enrollment open**: at least one specific approved Offering/deployment has a valid enrollment release and operational authorization, cohort/session/capacity/terms as applicable. Only those Offerings get a real Register/Apply CTA. School applications and noncredit registration remain distinct and existing server-owned flows.

Do not render a clickable Register CTA to a nonexistent application or enrollment release, nor infer enrollment permission from a visually finished website. The first private preview may display a disabled/annotated example CTA in design preview only; public site displays safe 'Coming soon' or approved interest CTA until registration can truthfully open. A Site can be public while zero Programs are enrollable and can be enrollable for one Program while another is still in preparation.

### Existing capabilities to reuse

- `src/modules/sites/site-public-provisioning.server.ts` creates Site/public-address draft reservations without publishing.
- `src/components/launch-studio/CreateSchoolProfile.tsx` currently sends a new Site to `/launch/website`; replace this orientation with the Site preview aha moment after lightweight program intentions.
- `docs/product/WEBSITE-STUDIO.md`: seven saved design systems, versioned draft, private preview, distinct publication stages, and authorized claims.
- `src/modules/sites/site-public-catalog.server.ts`: public site catalog independently checks Site publication and program eligibility.
- `src/modules/sites/site-publication.server.ts`: reviewed Site and Program public projection and publisher authorization.
- `src/routes/programs.noncredit.enrollment.tsx`: noncredit enrollment release publisher; live capacity, sessions and enrollment remain independently governed.

### Outcome and acceptance criteria

- An authorized local Site operator can see a polished, accurate private Site website after only essential setup choices and no mandatory six-step design wizard.
- Site creation does not force a school identity; website language/sections adapt to selected offerings.
- Multi-select categories create suggestions/plans, not new canonical Blueprints/Offerings or false claims of approval.
- Program addition is reflected in the **same** Site website's draft/authorized public projections without duplicating a Site or website.
- Program publication/release authorization alone controls real Apply/Register CTA, not website creation or network code.
- A previously published Site retains its existing design, operator revisions and address when new programs are introduced.
- Independent/no-network Site enjoys same first-website moment. Pending code cannot confer partner brand or exclusive catalog entitlement.
- Publish failures, pending permissions, unavailable restricted database reader and contradictory eligibility lead to explicit 'Not yet open', never fake enrollment.

North-star measurement: proportion of authorized first-time Site operators who reach a meaningful private website preview, then progress to their **first real enrollable offering**. Measure these as distinct funnel milestones; do not reward fake enrollment or fabricated publish states.

## Progressive program discovery: lightweight before website reveal, detailed afterward

Make the **first website reveal** the explicit dividing line between simple discovery and detailed setup.

### Pre-reveal Step 3: "What would you like to offer?"

Collect only broad, optional multi-select intent chips. Suggested short initial set: grades 6–8, grades 9–12, afterschool, summer/breaks, adult learning, senior programs. Keep this fast: no curriculum publisher/source, teaching philosophy, specific course selection, funding, room assignments, operating schedule, cohort dates or capacity questions. Let the user change choices later. These chips reflect **proposed interests**, not approved curricula or live programs. Selecting a grades 6–8 or grades 9–12 interest chip alone does NOT establish an active grades 6–12 academic curriculum or assert school readiness; school classification from a real selected curriculum is evaluated later.

Step ordering remains:
1. Your Site: minimal Site/Organization and physical/digital capabilities
2. Network: existing approved association, optional code/request, or continue independently
3. Your interests: lightweight program category chips
4. Website reveal: immediately generate an attractive **private preview** with accurate Site identity and clearly identified proposed experiences, and no invented real offering, enrollment date, approval, or public availability.

Do not create canonical Program/Offering/Blueprint records merely from interest chips. Store partial intent as a scoped resumable launch draft. Preview can combine authorized facts with explicit draft plans without publishing either. Avoid an early six-step website design wizard.

### Post-reveal: invite depth rather than require it upfront

Provide three prominent actions:
- **Build your programs**: refine multi-select dimensions (program format, curriculum grade bands, audience, curriculum approach, content focus), recommend actual published Blueprint/Offering versions, select curriculum source/license later, configure Site adoption/deployment.
- **Personalize your website**: open the existing seven-design Website & Brand Studio for brand, images, editorial content and approved marketing.
- **Prepare to enroll**: configure applicable qualification, staff, dates/cohorts, sessions, capacity, agreements/consents, independent approvals and real enrollment releases.

Each action enhances the *same* Site and preview. A user may return to explore without completing activation. The Site's public published catalog must draw from authorized release states and approved copy, not unreviewed intent data.

The aha moment is the early, beautiful, accurate preview. The second aha moment is selecting an approved offering and seeing the same Site website become genuinely enrollable. Measure both milestones separately.

### Product acceptance

- First preview from a minimal Site and 1–3 intent choices without selecting curriculum provider, school setup module, content or schedule.
- Return after browser reload; preserve a scoped draft and chosen Site.
- Revisit chips after preview; preview updates without recreating Site or overwriting customized content.
- No intent chip creates a Program or bestows school classification, legal authorization or a live Register CTA.
- Exact selected/approved Offering and separately authorized enrollment release produce the appropriate real enroll/apply affordance with current constraints.


## First code slice committed to main (2026-11-14)

Implemented in source, **not yet build/CI/browser-verified or deployed**:
- New operator path `/launch/site`, rendered by `SiteFirstLaunch`.
- Launch landing now prioritizes Site setup while retaining participant and legacy Hub routes.
- Authorized registrar can create or select a Site. New Site creation reserves a private Site-publication address, not a public webpage.
- Physical / digital / both and lightweight multi-select program interests; server-side private planning persistence in Site metadata with Site-grant checks and schema validation.
- Optional network code input explicitly *does not* verify or persist affiliation; independent operation remains available.
- Quick concept preview immediately after choices, clearly labeled private and not enrollable.
- Handoff links into actual existing Website & Brand Studio and legacy Launch Hub.
- Pure validation unit test added, but execution in CI is unverified.

Important gaps to finish before calling the requested full experience wired:
1. Make the quick Site concept preview use the canonical Website Studio renderer and saved Site draft rather than a standalone React approximation, while preserving preview vs publication distinction.
2. Introduce authorized invitation redemption and approved network association; remove temporary code-only input when real validation is available.
3. Connect selected intentions to Blueprint/Offering discovery and adoption, then Site deployment, session/cohort setup, enrollment releases, and approved live website cards.
4. Generalize the legacy school-labeled Launch Hub and website content/navigation based on actual academic curriculum and program presence.
5. Apply site-first readiness and integration tests; ensure generated route contract, TS compilation, build, role-isolated browser acceptance, active database and deployed SHA verification. No test or production deployment is asserted by this entry.


## Second implementation slice: real private renderer on main (2026-11-14)

Source commits (no claim of deployment or passing CI):
- `src/routes/launch.site-preview.ts` performs exact-Site authorization using a current registrar launch grant; renders the **same canonical public Site HTML engine** with the Site's real approved legacy academic/enrichment catalog and authorized current draft / published brand content. The endpoint is private, nonindexed, read-only and same-origin frameable, with forms disabled.
- `src/domain/site-first-preview.ts` adds an escaped, private-only `PROPOSED · NOT ENROLLING` section from the saved program-interest chips. This section is **never** part of anonymous published Site pages and cannot make a Program or enrollment release exist.
- `src/components/launch-studio/SiteFirstLaunch.tsx` now embeds this real renderer and offers Refresh Website, Build Programs & Offerings (the independently authenticated `/canonical/blueprints` workspace), Customize Website, and the existing Launch Hub. A canonical Site is explicitly reselected by the canonical account; a public-schema Site ID is never passed as if it were a native v3.0.1 grant.
- `src/modules/programs/site-launch-preferences.functions.ts` persists lightweight preferences and reserves a private web address for existing Sites in the authorized transaction.
- `src/components/shell/route-navigation.ts` and `docs/platform-route-contracts.json` now register `/launch/site` and `/launch/site-preview`.
- Unit tests added for escaping, private plans, preview banners, security headers and multi-select preferences.

**Verified by source inspection, not by execution:** The existing website engine already derives public academic and enrichment cards from independently approved legacy Program records; the private Site-first preview reuses those exact readers. The real public host still requires independent Site and program publication. The canonical v3.0.1 Blueprint/Offering/enrollment release model uses separate accounts/Sites and **has no independently authorized Site identity mapping to the public-schema website** in this implementation. Therefore a canonical noncredit release is not automatically reflected on the legacy public Site website yet. Bridging this requires explicit approved Site/organization identities and RLS-reviewed read models, not matching names or passing browser IDs. Avoid a blanket web link that implies an authorized Site Offering.

**Release blockers:** GitHub Actions push runs for recent main commits reported `startup_failure` (not successful tests). No completed TypeScript/build/browser acceptance or production migration test has been observed. The `CAN_CANONICAL_CATALOG_ENABLED` environment gate remains present in existing catalog discovery and may block Blueprint references; it was not removed without verifying target DB roles. The selected network code is still an unsubmitted UI placeholder (not a grant).

**Next safe integration bite:** Add an explicit cross-schema Site mapping and independently governed native-release-to-public-catalog projection only after exact identity verification. Then add read-only publicly eligible noncredit release cards linking to `/learn/enroll?release=<approved release UUID>`, with a separate valid current Site publication and authorized privacy policy. Independently test withdrawn/expired/waitlisted releases, mismatched Sites/organizations and no unauthorized CTA before production.
