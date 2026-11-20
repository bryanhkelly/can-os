# Launch Studio V6.1 integration and acceptance inventory

**Scope:** `feature/launch-studio-v61-clean-cutover-20261118` (PR #348).
**Evidence level:** Source inspection and static contract checks. No live browser session, authenticated API/database test, or build has been claimed.

## One Site, one Launch Studio navigation

The `/launch/site` route uses one `LaunchSiteFrame`. The four stages are
Establish, Introduce, Prepare, Open. The stage sidebar remains outside each
module's center content and right guidance rail. The mobile menu uses the shared
`Modal` with native focus trapping, Escape/backdrop behavior, and return focus.
SPA navigation retains exact Site scope; the active stage re-expands on module change.

## Module-by-module contract

| Module | Implemented destination | Remaining boundary |
| --- | --- | --- |
| Establish / Site Profile | Site-scoped V6.1 editor and audited canonical Site commands | Authenticated Site/profile amendment acceptance |
| Establish / Site Information | Four internal steps and scoped revised Site metadata, private Story, explicit affiliation request | Live 390 px/keyboard/screen-reader review; prove private Story is not exposed in public projections |
| Establish / Programs & Audiences | Two-step V6.1 intent form, scoped revised canonical Site preferences and separate timing/audience controls | Live save/reload/legacy-upgrade and navigation acceptance |
| Establish / Website & Brand | Direct entry to existing `/launch/website` studio; exact selected Site and return to Launch | Live editor/save/preview/return path and publishing-role checks |
| Introduce / Promote | Site-scoped Marketing Package library, purpose-specific Story/intent suggestions, immutable Brand-pinned output and downloads | Sending/distribution and recipient management are not implemented |
| Introduce / Recruit Families / Learners | Reuses the same Marketing Packages and source projection, focused on interest invitations and program ideas; exact-Site handoff to existing consent-aware preopening family outreach with canonical Brand and editable Story suggestions | Site-level CRM is not implemented; interest invitation sending is separately registrar-authorized, not an automatic Marketing Package action |
| Introduce / Interest Events | Uses the same Brand-pinned Marketing Packages; an active invitation package or the canonical Site editorial suggestion can seed the editable title of an authorized Program-linked event | Generic pre-Program Site events and automatic marketing distribution are not implemented; the operator must create the event independently |
| Prepare / Invite Your Team | Existing exact-Site verified staff invitation/access workspace | Test verified role acceptance; no implicit appointment |
| Prepare / Program Catalog | Unified CAN-published Solution browser, exact-version saved-plan resume, and inline canonical Site configuration editor; learning-product selection remains part of governed Solution configuration | CAN app-admin Blueprint authoring/publishing UI remains separate and incomplete; run authenticated save/reentry, qualification, and enrollment acceptance |
| Prepare / Opening & Compliance | Existing authenticated compliance and canonical qualification review destinations | Site-specific evidence and jurisdiction review acceptance |
| Open | Governed institutional readiness and Site operations handoffs | No automatic activation, publishing, opening or enrollment |

**Boundary:** A planned landing is not a completed operational feature. No migration
or new parallel Blueprint/Program/Offering/Section source of truth was introduced.

## Design-system findings

- Reuses canonical `Button`, `Field`, `Select`, `Checkbox`,
  `WorkspaceShell`, `WorkspacePanel`, `WorkspaceNotice`,
  `ActionFooter`, `StatusBadge`, `GuidedSetupShell`, and `Modal`.
- Uses semantic color tokens, rectangular cards/controls and the shared layout.
- Maintains Site Information's four center-pane steps. The sidebar does not
  replicate those internal steps.
- Website editor and existing Program/service destinations retain their
  independently authorized workflows. The Launch route does not duplicate them.
- Normal module navigation is route-aware; the mobile drawer is an accessible
  modal rather than an untrapped overlay.

## Source-level check

A 24-point source inspection checked module coverage, route ownership, exact
Site readers, V6.1 components, modal navigation, private Story audit minimization,
revision locks, guarded Program discovery and no auto-opening claims. All 24
conditions evaluated true. These are **source predicates**, not tests of runtime
behavior or accessibility.

Added `tests/unit/launch-v61-module-handoffs.test.ts`, `tests/unit/launch-introduce-integration.test.ts` and
`src/components/launch-studio/LaunchStudioDestinations.stories.tsx` as regression
and visual-review surfaces. Their execution is not claimed.

## Release gates: still open

1. `npm run check:build-source-syntax`
2. `npm run typecheck` and `npm run build`
3. `npm run test -- tests/unit/launch-v61-module-handoffs.test.ts`
   plus focused Site Information and Programs & Audiences unit tests
4. `npm run lint` and `npm run test:design-audit`
5. `npm run build-storybook` / `npm run test:storybook` / representative visual review
6. Authenticated Site-admin and registrar journeys at 390, 768, 1024 and
   1440 px, keyboard/Escape/focus, screen-reader naming and 200% zoom
7. Real persisted create/reentry/save/unsaved-conflict/save-success-but-refresh-fails
   checks; multi-Site and unauthorized Site scope rejection; no cross-Site leak
8. Website draft/publication role separation; canonical Program adoption,
   Site qualification, opening and enrollment authorization gates
9. Deployed commit SHA confirmation and independent production acceptance

The Netlify deploy-preview provider has skipped builds due to the account's
build-usage limit, not due to a proven code-build failure. A CI status from
that provider must not be reported as a TypeScript/build result.

**Conclusion:** All eleven sidebar destinations now have intentional owned
navigation or implementation, but Launch Studio V6.1 remains **unreleased/
unaccepted** until executable gates pass. Planned modules remain explicitly
planned, not silently reclassified as complete.

## Follow-on source integration, 2026-11-19

Introduced one presentation-only `launch-introduce-v61.ts` configuration, routed all three Introduce modules through the existing Marketing Packages and Site Story/Programs/Brand services, removed the obsolete Introduce placeholder destinations and Storybook fixtures, and preserved permission-checked operational handoffs. No database migrations were run, no changes were made to main, and no build, browser, or deployment verification is asserted by this follow-on work.

Follow-on integration also enables the existing `purpose=interest` family invitation mode, with exact-Site Program filtering, editable saved Story/intent suggestions and the existing canonical family Brand resolver. The preexisting Program-linked Interest Events workspace now filters available Programs to its selected Site. This is application source work only; send/run and authorization tests remain pending.


## 2026-11-19 · Continued Launch product integration (source)

- Corrected Interest Events links to retain the actual Site ID and Program Catalog context. Verified that a selected Site filters the Event Program chooser; the selector now derives a valid timezone through the schema result.
- Fixed shared family-invitation form validation so the first submit checks contacts, subject, introduction and that the Program is among the current authorized Site/purpose choices.
- Prepare / Publish Site now allows authorized Site Admins to inspect status using draft-read authority, but independently evaluates the actual Site publisher assignment before exposing publication controls. Network-governed/local publisher approval remains separately checked.
- The authenticated Launch topbar Site preview now uses `readSavedBrandVersion` and `siteBrandPresentationIdentity` for the saved immutable Brand instead of treating legacy embedded website fields as the authoritative palette, fonts or media. The structural template still comes from the saved website revision. Rights/consent filters apply to both media slots.
- First-visit preview now uses the same saved Purpose & Story candidate/starter helpers as the Website editor, without persisting suggested copy or overwriting saved revisions. The read-only preview uses exact Site `program.read` authority; launch mutation capability is not necessary.
- Added or updated focused regression tests for navigation, invitation validation, canonical preview behavior and publication permission projections.
- No migrations, production commands or `main` changes have been made. Build, TypeScript checks, database acceptance, authenticated browser tests and actual network-delivery checks remain unexecuted.


## 2026-11-19 · Unified preview and event creation follow-up

- Corrected private website preview return links from invalid `step=preview` to the supported `step=review` and HTML-escaped query separators.
- Both full-page preview entry points now resolve the current saved Site Brand and display name without introducing a second identity store. The first-visit Website editor preview also uses the saved Brand even with no Site website-copy revision. A new regression test verifies this behavior.
- Both private preview entry points use the same `projectPlannedSiteProgramsForPreview` against saved Programs & Audiences; no new Offering is created.
- After a new Interest Event is created, the detail link uses the created event's actual Program rather than an unrelated earlier URL filter. Event Program changes validate the timezone and send timezone corrections to Establish / Site Profile.
- A saved event-invitation Marketing Package can now hand off its headline to the existing independently governed event creation screen, scoped by Site and package ID. With no usable package, the same Site editorial suggestion is available. No message distribution, event persistence or registration is triggered by the read-only prefill.
- Added source contracts and server-rendered component tests, but none have been executed. Netlify PR deploys are currently skipped due to account build-usage limits, which do not establish a compile failure.

## 2026-11-19 · Package-to-operation integration and failure recovery

- Recruit and Interest Events now share a single presentation configuration for their specific active-package handoffs. This carries an exact Site/Package reference, not copied canonical state.
- The existing family interest invitation form can start with a saved Package headline and message, with original text claim checks, email subject bounds, authorized Site/Program filtering, an explicit send confirmation and no imported contacts. New preopening interest batches and their delivery worker require a saved canonical Site Brand; this does not change legacy application sending.
- The Interest Event create route now refuses stale/cross-Site Site, Program and Package hints rather than selecting a sibling Site. Valid saved event Packages supply editable title and description. The existing Story/Program editorial projection is used only when no Package was explicitly selected.
- Event create retries preserve a stable request identifier across uncertain network outcomes and rotate it only after successful acknowledgment; the server continues to own idempotency and the independently governed calendar/event records.
- The Introduce package library disables new work until a saved Site Brand has actually been verified and offers an explicit retry when the status query fails.
- The Site-first private preview now links back to the authorized Launch overview, not a website editing role the viewer may not hold.
- Added test fixtures: `launch-interest-event-handoff.test.ts`, `launch-recruit-package-handoff.test.ts`, plus updated page contracts. No tests or builds were executed, and Netlify deploy previews continue to be blocked by usage limits.

**Acceptance still required:** TypeScript, unit/integration suite, V6.1 design-system lint, authenticated save/reload across Sites, controlled delivery tests and Playwright journey on an explicitly disposable migrated database. The user-directed order remains current-code integration, refinements, database, then main.

## Launch stage ordering: remaining Program vs Solution boundary

Establish / Programs & Audiences stores declared Site intent, **not** a concrete operating Program or approved Solution. Introduce can immediately author Site-level announcements and reusable family/event invitation Packages from that intent and the saved Brand. Actual family invitation sending and Interest Event creation currently use the canonical, independently authorized Program-linked services and require an eligible real Program row.

This is intentional fail-closed behavior but it means a brand-new Site with only broad intent cannot yet send invitations or create Program-linked events. Do **not** fabricate a Program, select an unrelated Site's Program, insert mock contacts, or create a second Site-level CRM to paper over the gap. Any fully pre-Program Site inquiry/event capability must be designed against the canonical public Site/Person/Event model at the later database-design phase, without equating Program intent to a Solution or opening enrollment.

The shared family invitation validator also rejects multi-line subjects, including CR/LF header injection, and package handoff checks original claims before limiting a subject to the provider's email bound. Event creation retains one idempotency key during uncertain retries; when an existing invitation-only event is recovered without its one-time RSVP token, the user is directed to the authorized explicit link rotation command instead of silently revoking shared links.


## V6.1 Launch Studio design-system realignment (November 19, 2026)

This pass repaired the missing object-property separators in the Prepare /
Funding & Admissions module, then applied the repository-approved V6.1
primitives and application patterns across the current Launch Studio route,
Website & Brand, Introduce Marketing Packages, Prepare, and Open handoffs.

- Shared `GuidedSetupShell` step navigation composes canonical `Button`
  instead of standalone native controls. Browser-visible steps remain local to
  their module, not duplicated in the Launch sidebar; visits do not imply saved
  or completed requirements.
- The global Launch sidebar activates at `xl` to preserve usable working
  width beside the context rail, and nested navigation links have 44px touch
  targets. The mobile menu retains the shared focus-managed `Modal`.
- Marketing Packages uses the same `Button` geometry as other V6.1 choices
  and an `ActionDialog` to confirm discarding unsaved changes.
- Website & Brand uses `ActionDialog` for reloading conflicted work and
  restoring historical revisions. Demo warnings, conflict recovery and
  unavailable storage now use semantic `WorkspaceNotice`, not local amber
  palettes.
- Programs & Audiences reuses `ActionFooter` and exposes an explicit
  reload-and-reconcile action after uncertain persistence.
- Catalog's existing governed planning links now compose shared
  `Button asChild` actions. Preview sharing uses semantic success colors.
- Strict ESLint scoped to the V6.1 Launch screens and embedded canonical
  planning components enforces shared form controls and semantic color
  utilities. It intentionally permits wrapping `<label>` for accessible
  full-card checkbox/radio selection, without permitting native form fields.
- `tests/unit/launch-v61-design-system.test.ts` adds TSX syntax, raw-control,
  geometry, semantic-color and key workflow checks across the Launch surfaces.
  `LaunchV61StepNavigation.stories.tsx` adds two- and four-step interactive
  examples. The Prepare story and shared Button route expectation were
  corrected to their current source contracts.

**Inspection only:** A source-level scan found no raw `button`, `input`,
`select` or `textarea` elements, unsupported rounded card utilities,
or hard-coded numeric Tailwind alert colors in the audited current Launch
components and direct website editor. This is not evidence of a successful
TypeScript compilation, running unit tests, rendered screenshots or accessibility
acceptance.

**Still required:** Execute `npm run typecheck`, `npm run build`, focused
and full unit tests, `npm run lint`, design-system inventory checks, Storybook
and authenticated Playwright journeys at 390/768/1024/1440px and 200% zoom.
Resolve PR #348's merge conflicts only after current-code integration and
database review. Preserve pending migrations and independent publication,
opening, safeguarding and enrollment gates. No change to `main` is part
of this design pass.


## 2026-11-19 · Prepare Solution select, save and resume integration

- **Ownership:** CAN app administrators own the published Blueprint/Solution
  definitions. Site administrators and registrars only create and revise
  Site-scoped *configurations*, never immutable Blueprint recipes. The existing
  restricted SQL `blueprint_author` role is a local configuration role, not
  permission to insert or publish `blueprints` or `blueprint_versions`.
  CAN-admin graphical Blueprint authoring/publishing is **not implemented** by
  this cutover and must not be represented as operational.
- **One operator catalog:** Prepare renders `SolutionCatalogV61` once. Published
  learning-product selection remains within the existing canonical configuration
  picker, rather than a second independent discovery panel. Saved Establish
  Program codes/vision can order suggestions but never establish qualification.
- **Version-pinned resume:** Operators can start a plan or reopen a saved draft
  for the selected published Blueprint version. Inline editor and catalog share
  `selectSavedSolutionPlans`; Site authorization and ownership remain enforced
  by server commands. Reopened records must match the exact Site and selected
  Blueprint version, and the editor does not overwrite CAN's published recipe.
- **Readback after writes:** Configuration create/save/submit uses existing
  revision-checked canonical mutations and reloads the authorized workspace
  before opening the saved revision. A successful write with failed readback
  is reported separately. Uncertain writes fail closed and ask for reload
  before another write, rather than creating duplicate configurations.
- **No new source of truth:** No new DB tables, provisioning changes, schema
  migration, enabling of enrollment, or changes to `main`.
- **Source checks:** Verified 12 of 12 scoped source invariants manually,
  including one catalog, exact-version resume, Site/version guards,
  configuration authorization, and fail-closed uncertain-write behavior.
  Updated source-contract and Vitest regression tests were committed but
  **not executed**. There is no evidence of passing TypeScript, build,
  Playwright, or authenticated database acceptance.

### Unclosed acceptance requirements

1. Run `npm run typecheck`, `npm run build`, `npm run lint`, and focused
   `tests/unit/canonical-blueprint-boundary.test.ts`,
   `tests/unit/launch-prepare-v61.test.tsx`,
   `tests/unit/launch-prepare-provisioning-contract.test.ts` and
   `tests/unit/canonical-blueprint-workspace.test.tsx`.
2. Exercise create → save → reopen → revise → submit → review under a
   disposable test Site, verifying saved revision identity, Site isolation,
   published-version pinning, and rejected stale/unauthorized requests.
3. Implement and separately secure the CAN app-admin Blueprint definition
   authoring, approval, and publishing experience before calling that capability
   complete. Do not grant Site configuration roles publishing privileges.
4. Keep Site qualification, specific Offering adoption, Class registration,
   website publication, and opening/enrollment authorization independently
   governed. Do not equate a saved plan with permission to operate.


## 2026-11-19 · Detailed Prepare implementation follow-up

**Reviewed actual code paths:** `/site/new` verified signup, `/launch/site`
routing, Establish Programs & Audiences, `SolutionCatalogV61`,
`CanonicalBlueprintWorkspace`, published-Offering adoption picker,
canonical Blueprint readers/mutations, scoped PostgreSQL roles, and
operator navigation. Code inspection only; not a successful build.

### Corrected in branch

- One operator navigation entry: Launch Studio → Prepare → Program Catalog.
  The older `/canonical/blueprints` authorized route remains for backwards
  compatibility, but its separate Site operator sidebar link is removed.
- Protected unsaved Solution edits with the shared navigation blocker and
  ActionDialog confirmation for within-catalog selection changes. A pending
  write or unreconciled save now blocks switching plans.
- Fixed starting a new plan to retain mandatory components, and cleared
  transient local-experience inputs between plans.
- Saved Offering intents for hidden/proposed Program components are preserved
  when the visible picker is edited, using one shared immutable merge helper.
- The picker now defaults to the Site's saved delivery preference, discards
  stale in-flight catalog responses after delivery/Site changes and unmount,
  and never infers operating or enrollment approval from search results.
- Saved Site Program references do not require redundant catalog revalidation
  when the operator edits other Site vision fields. **New** references still
  require live, Site-scoped published-reference checks.
- Added or updated regression tests for the above contracts. The tests have
  **not** been executed in an authenticated test environment.

### Remaining integration and acceptance gates

1. **First-party Site planning, corrected in source.** A verified CAN Site
   administrator or registrar now enters the private Solution catalog and
   configuration workflow using their existing CAN Site grant. The application
   rechecks the canonical public Site's ownership and lifecycle inside each
   planning transaction. No second operator relationship, native staff
   correspondence, or per-Organization SQL role is needed for first-party
   *planning*. The old scoped PostgreSQL role path remains for separately
   provisioned native or delegated operators and independent review.
   The actual `DATABASE_URL` role and its enforced RLS posture still require
   deployment verification: the new CAN application path uses the same
   server-side database connection and Site authorization pattern as Establish
   rather than the native `SET LOCAL ROLE` planning transaction.
2. **CAN app-admin Blueprint authoring.** Current UI supports Site-owned
   configuration against published recipes; it does not implement an
   independently authorized CAN-admin create/review/version/publish workflow
   for the published Blueprint definitions. The starter seed alone is not
   an administrator Studio or the full COGIC pilot solution catalog.
3. **Operational requirements/readiness.** The catalog currently projects
   recipe component keys and requirement modes. It does not yet integrate
   complete, jurisdiction-scoped staffing/facility/equipment/evidence
   requirements or independently verified readiness into one Prepare
   operator experience.
4. **Offering activation.** A saved and reviewed Solution remains a planning
   configuration. Operation selection, Deployment, approved published Offering
   adoption, Class scheduling, and learner registration still have separate
   owners and gates. No end-to-end newly created Site → enrollable COGIC
   Class acceptance is established.
5. **Executable verification.** Run focused Vitest, TypeScript, design-system
   checks, full build, and authenticated Playwright/role/RLS fixtures when
   a capable environment is available. GitHub PR #348 remains draft and
   nonmergeable; Netlify deploy-preview status is not proof of compilation.

**Release decision:** Implementation improved, but not accepted as a fully
provisioned, enrollable launch. Do not merge to `main` or alter production
schema on the strength of source-only checks.


## 2026-11-19 · Verified CAN Site grant is sufficient for private Solution planning

The previous fresh-Site authorization requirement was incorrect. In the
Launch Studio owner workflow, the authoritative verified CAN Site grant must
be enough to start private Solution planning. This branch now implements it
using the existing shared `public.sites` identity rather than manufacturing
native operator links or issuing a second staff account.

- `getBlueprintPlanningContext` authenticates the current verified CAN session,
  Person, Site Admin/Registrar grant, owning Organization, and verified email.
  It explicitly rejects demo delegation and grants only `blueprint.read`,
  `blueprint.configure`, and `program.launch.start`. A private server-side
  WeakSet marks this context; browser-supplied properties cannot opt in.
- Workspace, published reference catalog, published-Offering lookup, and
  configuration create/read/save/submit now verify the exact public Site
  and owning Organization and use this first-party CAN planning context.
  Saved versions cannot be transferred across Sites. Delegated native
  operators retain the existing purpose-bound PostgreSQL role path.
- Read-only review status/history for a Site's own plan uses the same verified
  Site owner. Independent `blueprint.review` decisions, Blueprint execution,
  actual Offering adoption, publishing, enrollment, and activation have *not*
  been granted by this change.
- Verified-email signup now binds an otherwise unbound CAN account to its one
  Person in the same transaction and explicitly creates an active Organization
  with a `planning` Site. This is not opening or accreditation authorization.
- Catalog error messaging no longer tells verified new Site owners to request
  manual operator provisioning.
- Regression tests cover CAN login, demo/unverified denials, exact Site and
  Organization scope, closed Site denials, immutable Person binding, and
  approval separation. The tests have been committed but not executed.

**Security/runtime acceptance:** Existing Neon main metadata reports
`neondb_owner` as `rolbypassrls=true`. The actual application database
credential was not inspected. Before merging, verify this first-party
planning path against the configured application role, with cross-tenant
negative tests, revocation, transactional ownership checks, and audit/event
persistence. A first-party application service authorization is *not*
evidence that restricted-role RLS was exercised. Do not conflate the
normal Site planning path with approval/deployment role provisioning.


## 2026-11-19 · Establish-to-Prepare Catalog and published COGIC package integration

- **Single authorization:** `exploreBlueprintReferenceCatalog` now uses the
  verified CAN Site planning context. A founder's existing authenticated Site
  administrator grant can browse published Program references in Establish
  and published Solutions in Prepare without a second canonical operator role.
- **Save-time integrity:** Adding a new Program reference inside
  `saveSiteProgramsAudiencesV61` now calls the same published-reference query
  inside the already authorized, revision-locked Site transaction. It does not
  open a nested catalog transaction or use an unrelated DB role. Previously
  saved/retired reference codes remain removable without requiring catalog
  availability.
- **Published operating details:** Site-facing Solution cards and editors now
  render whitelisted CAN-authored `componentSpec.description` text and explicit
  independent-review requirements. Raw unpublished/internal component specs
  are not exposed.
- **Published Solution product:** The existing `Blueprint.spec.offeringCode`
  is resolved to the latest active/published Offering version **owned by the
  same publisher Organization**. The linked product can be added as a
  version-pinned private proposal without requiring a current geographic
  availability decision. The existing availability-policy picker and all
  execution/review/enrollment gates remain independent.
- **COGIC pilot data observed:** Two active published pilot Blueprint versions
  and their twelve component definitions are present on Neon main. No
  published qualification fit policies or associated policy requirements were
  observed. Consequently the application must not infer Site readiness,
  regulatory eligibility or enrollability from the published product link.
- **Verification:** Source contracts (20/20 inspected assertions) and focused
  regression tests were authored and committed, but the new tests have not
  been executed in a functioning CI/build environment. GitHub Actions and
  the Netlify preview currently report failures without a successful build
  acceptance. Authenticated browser and RLS/role tests remain necessary.
- **Scope:** Feature branch only. No production writes, new schema, approval
  grants, website release or enrollment activation.
