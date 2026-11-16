# Launch Studio 2.0: Site-first onboarding and program activation

Status: proposed product / engineering design, updated 2026-11-14. This document is not an implementation or browser acceptance result.

## Governing principle

Start with a Site, not a menu of school / center / program / network launch templates. The initial interaction is a Site establishment or selection journey. Ask about supported modes of delivery, optional network affiliation, and only then programs. For CAN OS product classification, a Site is a **school** if and only if its selected/active educational offering includes a grades 6–12 curriculum. There is no separate school-type choice, school incorporation check, or school-facility requirement for this label. A Site without a grades 6–12 curriculum is not shown as a school. The presence of a grades 6–12 curriculum determines UX classification and enables school-specific academic flows; it does NOT by itself grant legal authority to operate, award credits/diplomas, enroll minors, publish offerings, or satisfy jurisdictional requirements. Those are independently governed operational authorizations. Sites can concurrently deliver school and non-school programs.

Site establishment, Program/Offering definition, and Site-specific delivery / deployment remain separate independently governed lifecycles. A Site may support multiple Programs and a Program may be delivered at multiple Sites. Reuse canonical Organization, operation, Site, Blueprint, Offering, deployment, cohorts/sessions and enrollment releases. Do not create duplicate 'launch records' as sources of truth.

## Primary operator journey: five steps

1. **Your Site.** Ask for Site name and responsible organization, select an existing authorized Site when possible, and establish a minimal new Site identity only with proper authority. Gather geography and contact information appropriate to the proposed delivery model. Do not publish a website, create a Program, assert a legal school status, or imply a Site is qualified at this step.
2. **How will you deliver learning?** Select **Physical**, **Digital**, or **Both**. This expresses the Site's intended capabilities, not a permanent restriction on Program delivery and not a cohort/session modality. Physical requires facility details and facility qualification for relevant offerings. Digital requires technology, content access, service/support and privacy readiness, but does not create a fictional street address. Both supports separate in-person and online enrollments, capacities and sessions. Represent digital-only Sites without inventing a physical address. The canonical `sites.site_kind` already supports `virtual`, while independent online enrollment releases now allow an optional, authorized `site_id` as well as a provider-wide `NULL` Site. The release constraint was revised in `patch-noncredit-site-associated-online.sql` and applied to `test01`.
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

**Updated implementation:** The existing Site renderer still derives academic and enrichment cards from separately approved public-schema records. An additive `site_canonical_identity_links` table and a three-party Site identity review workflow now provide a narrowly governed, evidence-reviewed mapping into native v3.0.1. A canonical noncredit release is eligible for the corresponding website only after the mapping is approved, the Site itself is published, and the canonical release meets current enrollment checks. Both facilitated and Site-associated independent online releases are supported. No mapping is created from names or browser IDs.

**Release blockers:** GitHub Actions push runs for recent main commits reported `startup_failure` (not successful tests). No completed TypeScript/build/browser acceptance or production migration test has been observed. The `CAN_CANONICAL_CATALOG_ENABLED` environment gate remains present in existing catalog discovery and may block Blueprint references; it was not removed without verifying target DB roles. The selected network code is still an unsubmitted UI placeholder (not a grant).

**Next safe integration bite:** Add an explicit cross-schema Site mapping and independently governed native-release-to-public-catalog projection only after exact identity verification. Then add read-only publicly eligible noncredit release cards linking to `/learn/enroll?release=<approved release UUID>`, with a separate valid current Site publication and authorized privacy policy. Independently test withdrawn/expired/waitlisted releases, mismatched Sites/organizations and no unauthorized CTA before production.


## Enrollment website integration: reviewer-linked canonical Sites (2026-11-14)

Added to `main`, not production-accepted:
- `database/canonical/v3.0.1/patch-site-identity-links.sql`: opt-in public Site ↔ canonical v3.0.1 Site link with explicit requester, distinct independent reviewer, evidence reference and approval/revocation state. Unique UUID pair; no name-based matching or implicit association. RLS forced; no application write permission.
- Applied the new table and read-only policies to **Neon test01 only**. Read-only inspection verified `public.sites` has 2 rows, `education_v30.sites` has 4 and **0 UUID overlaps**. No identity link was approved. There are 2 published canonical noncredit releases in test01, one Site-facilitated and one independent online. Neither is currently attributed to a public Site.
- `src/modules/sites/site-noncredit-releases.server.ts`: canonical noncredit reader uses approved identity link only, exact facilitated Site, and the *existing* `readEligibleSelfEnrollmentReleases` checks (live adoption, policy, authorization, consent, status, capacity, time window and waitlist). It returns no private participant or provider internals. It skips unmigrated/unsupported or restricted database roles safely without creating an alternate enrollment bypass.
- `src/domain/site-noncredit-public.ts`: escaped, Site-branded eligible-release cards. An actual Register/Waitlist URL is constructed only for an independently eligible release and already configured canonical `CAN_ACCESS_PUBLIC_ORIGIN` (HTTPS). A link leads to the existing `/learn/enroll?release=...` endpoint, where final current eligibility and participant consent are checked again.
- The published Site catalog, Site-first private preview and existing Website Studio preview now use this *same* canonical release projection. The Site's existing brand/layout and legacy academic/enrichment listings are preserved. Real noncredit offerings, once identity-linked and approved, can appear without recreating the Site or its website. Proposed-interest chips never generate a live CTA.
- `tests/unit/site-noncredit-public.test.ts`: source-added checks for HTTPS origin validation, CTA eligibility, empty/missing link, waitlists, escaping and canonical HTML output. Unit execution is still unverified.

Important restrictions and explicit follow-up:
- There is **no automatic Site identity mapping**. The `/site-identity` workspace now supports a public-Site requester, native canonical Site-operator confirmation, and separate CAN institutional review, including audited revocation. A network code, matching name or common Organization cannot create an approved link. No test01 link has been approved.
- Production has not received the new schema; `test01` is the only database on which this change was applied. Mappings on test01 remain empty.
- The Cloudflare/Netlify published Site host must actually be reachable, Site publication must be approved, `CAN_ACCESS_PUBLIC_ORIGIN` must point to the deployed registration app, and the new code must be deployed. A configured domain is not verified DNS/TLS reachability.
- Native independent-online releases may now reference an authorized Site (`site_id` non-null) or remain provider-wide (`site_id=NULL`). The publisher and eligibility reader enforce current Site/operating relationships for linked releases, and the website adapter includes eligible linked online releases without requiring classroom participation. This is source-committed and the revised SQL constraint was applied to `test01`, not production.
- The currently provisioned `can_v30_public_site_app` and `can_v30_public_site_reader` test01 roles do not have both schema and catalog table grants. The adapter refuses projections for those roles; do not widen legacy database privileges automatically merely to show a marketing card. Validate the actual production `DATABASE_URL` role and a restricted read path before rollout.
- GitHub Actions push runs still report `startup_failure`. This does **not** prove that TypeScript, unit, build or browser tests pass; none was verified. Do not describe the full enrollment journey as production-ready.


## Integrated blocker resolution (2026-11-15): identity, delivery, deployment readiness

This section supersedes the older implementation/status snapshots above.

**Site identity (blocker 1):** `/site-identity` and `src/modules/sites/site-identity-links.functions.ts` implement three distinct actions: exact public Site registrar request with evidence reference, native canonical Site registrar/site administrator confirmation with current operator/host relationship, and a separate CAN institutional steward approval/rejection/revocation. Every change is audited. A mapping is neither an enrollment permission nor a school/program/site publication authorization. The new `patch-site-identity-confirmation.sql` is applied on `test01`; there are currently **zero** approved links. Real identity review is an operational step and cannot be fabricated by a migration or name match.

**Digital delivery (blocker 4):** A Site can be `physical`, `virtual`, or `mobile`. A current independent online noncredit release may include an authorized `site_id`, or remain unscoped with `site_id=NULL` for provider-wide online delivery. Facilitated enrollment still requires a Site and an authorized classroom relationship. The publisher, public catalog and website bridge use the new semantics; `patch-noncredit-site-associated-online.sql` has been applied to `test01`. A Site ID alone never grants an Offering license or release authority.

**Live launch/hosting (blocker 3):** `/release-fingerprint` reports the build-stamped checked-out Git commit, without runtime secrets. `verifySiteEnrollmentHandoff` checks the independently authorized Site's actual public HTTPS host response, the configured CAN enrollment app's live HTTPS destination, the matching expected/deployed source SHA, and at least one current Site-linked eligible noncredit release with a readable, approved identity link. The Site publishing UI shows each reason independently. A missing source SHA is `revision_unverified`, not success. An unreachable public host, unconfigured app origin, unavailable DB reader or empty canonical catalog cannot return `ready`.

**Still not accepted as deployed:** Production migration, real approved Site mappings, live DNS/TLS and application-origin verification, runtime reader grants, build/typecheck/test/role-scoped browser acceptance, and matching deployed commit. Existing GitHub Actions push runs have reported `startup_failure`; this is not a successful test result. There is no hidden environment-feature-flag activation for these new product interactions.

## Source review remediation (2026-11-15)

Review identified two P0 defects and release risks. The following changes were made **on main**, not verified in a completed CI run:

- **Website Studio preview P0:** `src/modules/sites/site-website-preview.server.ts` no longer accesses `noncreditReleases` before initialization, and the approved noncredit data is passed to the actual `previewPage` website renderer. The parent-information DTO no longer receives unrelated canonical release props.
- **Site identity RLS P0:** `patch-site-identity-restricted-writer.sql` installs a non-login `can_v30_site_identity_writer` with explicit, action-scoped INSERT/UPDATE RLS policies. The three existing request/confirm/review commands use `SET LOCAL ROLE` only around their own mutation statements, then restore the original role before audit insertion. The writer has no DELETE or BYPASSRLS. **On test01, verified:** the owner login can switch roles, `row_security_active` becomes true, writer has SELECT/INSERT/UPDATE but no DELETE, and current request action and actor settings remain available after the role switch. No live Site identities were created or approved; a full three-actor transaction acceptance is still required.
- **Bounded noncredit catalog performance P1:** Site identity lookup is followed by one canonical Site-filtered eligibility query and batched seats, releases and waitlist aggregates. This replaces up to 40 independently repeated eligibility queries on public pages. Current review still requires real performance testing under representative data.
- **Post-reveal UX:** the primary actions are now Customize website, Make programs enrollable, and Share/publish your Site where authorized. Canonical identity linkage, Blueprint Studio and school-specific readiness are grouped under Advanced setup. These continue to enforce their separate permissions; a click does not open enrollment by itself.
- **CI:** Checked GitHub Actions workflow runs that report `startup_failure` with zero jobs and a synthetic `BuildFailed` workflow path. The current `.github/workflows/ci.yml` includes build, TypeScript, tests, lint and migration checks, but none ran in the sampled failed starts. Separately, a Cloudflare Workers build check was reported failed on an earlier commit. Those provider-side run/build logs must be investigated before release.

**Acceptance journey still outstanding:** authenticated operator creates Site and previews its real website; independently verified native Site operator confirms the canonical relationship; independent CAN reviewer approves it; operator publishes a current Site-scoped virtual/physical noncredit release; adult completes current consent and enrollment; facilitator schedules a four-week cohort; Site operator sees only Site-appropriate roster and network reporting; subsequent Site revocation removes links without deleting historical enrollment. Include negative cases for cross-Site leakage, expired authorization, declined/revoked correspondence, release close, capacity and deployment mismatch. Do not promote this page to release-ready until the current deployed SHA and every check are independently recorded.

## Site-first entry and resumability consolidation (2026-11-16)

Source-only change: New visits to `/launch/school` (including `?step=school`) redirect to `/launch/site`. Exact Site selection and step are URL-addressable; Site preferences are read again on reload under the current authenticated authorization. Explicit inaccessible Site identifiers fail with recovery rather than falling back to an arbitrary Site. Existing Program-specific academic and readiness deep links stay in the established governed school workspaces. Bookmarked school-create URLs redirect to Site-first setup.

The Network step reuses the existing audited Site affiliation request and network HQ review workflow rather than a fake invitation-code field. Independent operators may continue without affiliation. The School Launch Hub retains its school-specific preparation work and links back to the unified Site-first setup. Interest chips still never create a Program, Offering, license, network grant or enrollment release.

**Release gate still open:** Typecheck, CI/build, role-scoped browser workflows and matching deployed Cloudflare SHA must pass before describing the live application as fully updated. Blueprint/Offering adoption, Site-qualified deployment, and real enrollment activation remain separately governed existing workspaces and are not yet one embedded journey.

## Main Site-first setup stage (2026-11-16)

The Site-first flow adds an explicit fifth stage, Launch setup, following a private website preview. This stage presents the current Site website state, Site-scoped saved Program launch records, and direct links to the actual authorized website editor, Site profile, school team, academic configuration, interest events, opening compliance, native Blueprint planning and noncredit enrollment preparation. It does not route through the legacy School Launch Hub or wizard. Each destination retains its own authorization, readiness and publication gates; a preview is not an operating permission.

The sidebar Launch link and new-school sign-in entry are wired directly to `/launch/site`. The former `/launch/school` and `/launch/hub/school` routes have **not yet been removed from the repository**, and full production deployment/acceptance is not proven. Do not describe the old implementation as retired until all deep links, old tests and its remaining academic wizard dependency have been migrated and removed.

## Site-first private preview framing bug fix (2026-11-16)

Diagnosis from the user-visible blocked iframe: The global Cloudflare Worker and Netlify Content Security Policy explicitly listed only YouTube/Vimeo in `frame-src`. Although the `/launch/site-preview` response already carried `X-Frame-Options: SAMEORIGIN` and `frame-ancestors 'self'`, the `/launch/site` **parent** did not allow embedding its own exact-origin private preview. Both global parent policies now add `'self'` to `frame-src`. The application-wide `X-Frame-Options: DENY` and `frame-ancestors 'none'` still prevent other sites from embedding CAN OS. The preview retains its private, no-store, noindex, read-only and same-origin restrictions. The Site-first UI also exposes a direct same-origin full-page preview link to diagnose an endpoint error without a blocked frame. These source changes require a successful Cloudflare deployment before affecting the live screenshot.
