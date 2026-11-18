# CAN OS V6.1 — Product-Wide Design Migration Plan

**Purpose:** Turn the V6.1 shared design-system PR into an executable implementation queue.
**Reference:** `docs/design-system-v6-1.md`, Storybook's `V6.1` groups, approved V6.1 student-home visual.

## 0. Merge gates / readiness
- [ ] Re-run CI typecheck, build, lint and all unit tests from current branch; no new failure.
- [ ] Run Storybook build, play tests, axe and screenshot review in light/dark/site-brand modes.
- [ ] Compare Student Home at 1440 and 390 px against V6.1 visual reference; confirm type, spacing, hierarchy and wallpaper crop.
- [ ] Verify 200% zoom, keyboard sequence, focus restoration, screen-reader naming, reduced motion and high-contrast semantics.
- [ ] Confirm staging admin/student/teacher/guardian/site/network render correctly with scoped data.
- [ ] Freeze approved tokens and forbid new persona-specific palettes.

## 1. Foundation — shared library
**Already included in PR #265:**
- [x] demo-new semantic tokens and V6.1 font pair.
- [x] square-corner global styling; radius tokens fixed to 0.
- [x] compact `WorkspaceShell`, `StatCard`, restrained `WorkflowIntro`.
- [x] `DashboardLayout`, `DashboardPanel`, `DashboardShortcut`.
- [x] `RecordHeader`, `RecordLayout`, `EntityCard`.
- [x] `WorkflowWorkspace`, `WorkflowProgress`, `UserFlowMap`.
- [x] roles and editorial fallback in `DailyCanvas`.
- [x] Storybook reference implementations of dashboard, record, workflow and flow map.
- [x] unit tests for core template semantics and accessible links.

**Next foundation hardening:**
- [ ] Test all components in site-brand and dark mode with brand contrast validation.
- [ ] Add automatic visual snapshots for V6.1 template stories in CI/Chromatic.
- [ ] Audit inherited global zero-radius CSS (including third-party popovers and browser controls) and remove redundant radius utilities over time.
- [ ] Stabilize font loading and SSR fallback to prevent layout shifts.
- [ ] Build a canonical `EditorialCampaignService` when publication workflow is in scope; do not simulate it through frontend fallback data.

## 2. Student dashboard — fidelity benchmark
**Owned by:** student experience and academic services.

- [x] Compose the refined shared dashboard primitives around current authorized Student Today DTO.
- [ ] Make wallpaper immersive at top of dashboard; personalized greeting; Scripture/campaign from approved editorial service.
- [x] Add bounded quick actions: Continue Learning, Assignments, Schedule, School Life.
- [x] Add resume-course panel with **real** published/allowed next lesson, progress and availability.
- [x] Upcoming assignments: actual due date (site timezone), submission state, saved-draft indicator and deep link.
- [x] Released grades only: honor finalized report-card access; avoid synthetic trends.
- [x] Right rail: schedule, shared date/month calendar links and authorized announcements, with mobile stacking.
- [ ] School Life: published club, chapel, service and enrichment stories with approved image rights.
- [ ] Validate SSR loading, empty course, no upcoming assignment, unpublished grades, permission failure, small mobile.

### Classroom implementation follow-up (V6.4 reference)

Implemented locally; this checklist records code scope, **not acceptance**:

- [x] Shared focused classroom composition, persistent icon sidebar, sidebar-owned desktop expansion and accessible mobile drawer.
- [x] Focus header and exit, hideable tools rail, published lesson outline, next steps and support links.
- [x] Reuse actual video playback/download authorization and published reading/practice; material/transcript/private-note/discussion tabs.
- [x] Optional publisher-authored transcript field and draft-editor control; published releases remain pinned.
- [x] Own private notes with canonical persistence structure, revision conflicts, retry-safe writes, transactional audit/events without note text and unsaved-navigation protection.
- [x] Teacher-managed HTTPS links on canonical calendar events; idempotent live-class scheduling, calendar rescheduling/cancellation, no simulated meeting controls.
- [x] Individual canonical discussion deep links; teacher authoring/moderation and student responses remain in their existing workspaces.
- [ ] Apply migration `0069_classroom_lesson_notes` to an explicitly authorized database.
- [ ] Execute behavioral, database, accessibility, responsive/browser and security acceptance; deferred at user request.

## 3. Teacher and family dashboard

The student's refined home composition now shares `DashboardHero` and
`DashboardHome` with teacher, guardian, registrar/Site Admin operations, Site
Today, onsite facilitator/staff/leader, specialist/counselor, denomination HQ
and CAN network steward homes. Wallpaper, overlapping four-shortcut navigation,
primary work and context rail have one implementation. Existing role readers,
mutations, filters, child selection and authorization remain route-owned.
Workflow and detail pages are not converted into home dashboards.

Teacher schedule moves to the context rail using its existing reader. Site and
onsite calendars use their canonical local date/timezone; other homes do not
manufacture calendar feeds or school timezones. Site operating decisions and
critical operations attention remain before wallpaper. The image is shared
editorial presentation, not a new campaign publishing service.

Validation for this presentation slice: 13 student/shared Storybook tests,
18 manual Playwright template checks (nine roles at 1440 and 390 px; four
shortcuts and no horizontal overflow), and 135 focused unit tests passed.
One older course-navigation test initially failed because its router mock lacks
`Navigate`; it was excluded from the focused rerun and remains unresolved.
Typecheck, client/server build, route and design inventories passed. Targeted
lint has zero errors and existing warnings. Authenticated role journeys remain
unverified; no session or database mutation was performed.

**Teacher:**
- [ ] Preserve teacher's section scope and grading services.
- [x] Use shared editorial wallpaper and role-specific quick links to Classes, Grading, Messages and Schedule.
- [ ] Show today-first schedule and queued student work before extensive summary reports.
- [ ] Ensure unavailable sections and unsaved drafts are not shown as success.

**Guardian:**
- [ ] Keep child selector and verified relationship permissions.
- [ ] Wallpaper is editorial only; enrollment or other required notices remain separate.
- [ ] Present Needs You, children, academic progress, attendance, conferences, approved announcements.
- [ ] Distinguish application, offered, accepted, placed and active enrollment.
- [ ] Accessible multi-child layouts; careful privacy across context switching.

## 4. Operational / church-site dashboard
- [ ] Authority-first: "Can this site receive students today?" immediately visible, source-derived.
- [ ] Critical staffing, pickup, health and safeguarding exceptions precede wallpaper.
- [ ] Use `DashboardLayout` only after decision and immediate action context.
- [ ] Site portfolio uses `EntityCard` with canonical name, organization and timezone; add real location, leader, program and counts only when authorized DTOs expose them.
- [ ] Move site affiliation and brand editing into site settings.
- [ ] Preserve church-partner scope vs CAN school's institutional academic and legal responsibility.
- [ ] Calendar includes Sunday and enrichment when configured; no auto-exclusion.

## 5. Admissions and selected-record UX
- [ ] Create first-class detail navigation for selected application; never bury it below the admissions command-center dashboard.
- [ ] Use `RecordHeader` + `RecordLayout` for application and action detail.
- [ ] Use `WorkflowWorkspace` only with *server-provided* stage/owner/next action.
- [ ] `SplitReviewShell` for evidence reviews, with independent approver permission.
- [ ] Preserve directory filter/sort/page and return location when moving to detail.
- [ ] Show household, required evidence, eligibility, placement, offers and enrollment as distinct concepts.
- [ ] Prevent optimistic or duplicated institutional transitions after refresh failure.

## 6. School launch and setup flows
- [ ] Adopt `GuidedSetupShell` for simple steps and `WorkflowWorkspace` for complicated cross-role approval.
- [ ] Show the actual next readiness blocker rather than assuming all saved programs should proceed to Website.
- [ ] Group legal, operational, academic, site information, staffing and publication requirements.
- [ ] Make state profiles and official external references available in-context; label evidence as draft/reviewed/approved.
- [ ] Enrollment, publication and opening have independent service gates.
- [ ] Distinguish configured versus authorized at every step.

## 7. Cross-role business processes
Use `UserFlowMap` for:
- [ ] Church inquiry → MOU → site launch → program approval → school opening.
- [ ] Family inquiry → application → evidence → offer → enrollment → placement.
- [ ] Student coursework → submission → grading → release → intervention.
- [ ] Site attendance → exceptions → guardian pickup → reconciliation → audit.
- [ ] Staffing assignment → qualification verification → onsite coverage → substitute.
- [ ] Editorial campaign draft → approve → schedule → publish → expire/rollback.
- [ ] Safeguarding incident → authorized responder → escalation → closure, without leaking private details.
- [ ] Field trips and enrichment → consent → attendance → pickup.
Every node needs **owner, decision, outcome, error path, system of record and authorized transition** in the implementation notes.

## 8. Directory and record migration
- [ ] Students: `DirectoryTable`, `RecordLayout`, authorized tabs, no sensitive-field leakage.
- [ ] Teachers: directory vs marketplace/recruiting distinguished; staff profile.
- [ ] Sites: portfolio plus dedicated site record (already improved by #265).
- [ ] Programs and academic years: consistent listing, readiness/detail and save feedback.
- [ ] Operations actions: selected detail should appear first with owner, due, evidence and authorized resolution.
- [ ] Reports and dashboards: source attribution, timestamps, definitions and explanations for all aggregations.

## 9. Component completion standards
For every route migration, assert:
1. Who/what and next action on first viewport.
2. Responsive at 390/768/1024/1440 and 200% zoom.
3. Keyboard, focus and semantic link/button structure.
4. Loading/empty/error/read-only/pending/reconciliation states.
5. No fake approvals, canned KPI trends or unauthorized details.
6. Interactive controls use shared primitives; all status colors semantic.
7. Route preserves search/filter/selection and back navigation.
8. UX review against V6.1 visual benchmark, not fresh aesthetic improvisation.
9. Add or update a corresponding Storybook story and regression test.
10. Server security and audit contracts unchanged.

## 10. Component-first rollout (supersedes page-first sequencing, November 17, 2026)

The implementation unit is **one shared component family and all of its appropriate consumers**.
Do not redesign a collection of pages independently. Domain-owned loaders, permission scopes,
record lifecycles and audit commands remain unchanged by presentation migration.

| Order | Component contract | Current shared-library work | Completion boundary |
| --- | --- | --- | --- |
| 01 | Button and actions | Canonical Button handles native-button loading, busy announcements and repeat-submit disablement; FormActions and ActionDialog consume it | Inventory and migrate independent action styling in remaining feature consumers |
| 02 | Field, Input, Select, Textarea and choice | EvidencePicker, EvidenceReviewForm and GradebookSectionSelector now use canonical Field/Select/Textarea; evidence native-control ban enforced | Continue form-component adoption by family, never auto-transform specialized native functionality |
| 03 | QueryState, EmptyState, WorkspaceNotice, MutationFeedback | Shared notice and empty surfaces are rectangular; feature readers still own loading/error/retry | Migrate remaining independent state messages while keeping saved-versus-refresh-failed distinction |
| 04 | Modal and ActionDialog | Confirmation submit now composes canonical loading Button | Retire duplicate confirmation UI only after keyboard/focus and destructive-action tests |
| 05 | StatusBadge, PrerequisiteChecklist, StatusTimeline | WorkflowPrerequisites reuses PrerequisiteChecklist; EvidenceHistory reuses EvidenceStatus/StatusBadge | Map semantic states using authoritative domain results, never inferred by UI text or color alone |
| 06 | FormSection, FormActions, unsaved guard | Shared FormActions composes loading Button | Standardize applicable create/edit workflows without collapsing validation or data ownership |
| 07 | DirectoryTable and pagination | Shared directory, bulk toolbar, known-count and unknown-total pagination are present | Tabular listings only; cards, gradebooks, matrices and personal timelines remain specialized |
| 08 | RecordLayout, EntityCard, navigation, evidence and workflow shells | Existing canonical components, Storybook examples and source contracts | Extract presentation only where equivalent semantics and two or more consumers exist |

### Component-first adoption increment: QueryState, notices, staffing and operational metrics

- `WorkspaceNotice` now supports a governed `attention` tone for an
  authorized write that succeeded but whose read model has not refreshed. This
  must not be represented as a failed command or a completed reconciliation.
  Its content wrapper supports block content without invalid paragraph nesting.
- `QueryState` uses the canonical Button's pending state while retrying.
- The Site director and Section facilitator workspaces share `SiteStaffingFeedback`
  and canonical Button/Field/Select controls. Their authorization, effective-dated
  assignments, optimistic concurrency and persisted refresh guard remain feature-owned.
- `OutboxHealthPanel` composes canonical `StatCard` for both event and
  school-family delivery counts, and uses `WorkspaceNotice` for unhandled events.
- Component tests, Storybook states and lint/checker rules cover these adapters.
  They are source-level changes, **not live-site or production acceptance**.

### Component-first adoption increment: institutional decisions and grading

- `SchoolOpeningReviewPanel` now composes V6.1 `Button`, `Field`, `Input`
  and `StatusBadge` for the authorized opening review, while preserving
  its independent institutional approval/suspension rules, configuration version,
  server verification and refresh recovery. The action handler additionally
  mirrors disabled conditions without treating client-side guards as authority.
- `SectionGradeFinalization` now composes `Button`, `Field`, `Input`,
  `Select`, `Textarea` and `WorkspaceNotice`, preserving distinct
  grading period selection, immutable finalization, per-student correction reasons,
  append-only correction history and the existing server command boundaries.
- Both components are in the source-level design-system checker and native-control
  ESLint manifest. Their existing test suites now target canonical controls,
  and the field catalog demonstrates controlled review/grade input states.
- A commit on `main` is **not** a passed build or live acceptance.
  Review/version/evidence tests must pass for the exact commit before release.

### Component-first adoption increment: form and confirmation action footers

- `ActionFooter` is the canonical presentation component for form and dialog
  action rows. `FormActions` and `ActionDialog` compose it instead of independently
  styling their action layouts. It does not own submissions, navigation, security or state.
- Dedicated forms preserve **submit first**, then the context-preserving Cancel
  link. Cancel is removed from the keyboard order and cannot navigate while a save
  is pending. Other disabled forms retain their normal Cancel navigation.
- Confirmation dialogs preserve **Cancel before Confirm**, initial focus on
  Cancel, native form validation, no backdrop dismissal, and disabled dismissal
  while the parent reports pending. The dialog's `pendingLabel` is customizable
  while `confirmLabel` remains the stable action label at rest.
- All current `ActionDialog` consumers in admissions offers, Insights,
  Operations, teacher conferences, student experiences, study groups and
  jurisdiction profiles supply contextual pending descriptions. Insights and
  Operations confirmation inputs now compose `Field` and `Textarea`; registrar
  institutional exit acknowledgment uses canonical `Checkbox` and `Label`.
- `tests/unit/v61-action-footer.test.tsx`, the TypeScript-AST adoption
  tests, and Storybook interaction coverage guard the reusable patterns.
  CI and authenticated end-to-end acceptance still need to pass for release.

### Component-first adoption increment: guarded confirmation and accessible form sections

- `ActionDialog` now holds a synchronous submission guard between the
  first confirmation event and the parent mutation's pending update.
  Duplicate clicks do not invoke the same confirmation twice; the guard resets
  after the dialog closes or a pending operation settles. The parent still
  owns authorization, command idempotency and persistence.
- `FormSection` supports `columns={1}` for evidence narratives and lengthy
  review fields while keeping the existing two-column layout by default.
  The optional description is associated via `aria-describedby` and supports
  semantic block content.
- `FormActions` retains a non-submitting, context-preserving Cancel link
  that is removed from keyboard navigation and whose click is prevented while
  the parent reports pending.
- Tests and interactive Storybook examples cover duplicate confirmation,
  reopen/reset, disabled pending navigation, semantic descriptions and
  one-column form layout. The shared-component checker enforces these
  composition contracts, not route-specific business rules.

### Component-first adoption increment: inline record actions

- `ActionFooter` now offers three presentation layouts: `form`,
  `dialog` and `inline`. The inline layout retains consistent button
  spacing and responsive wrapping without creating an HTML form or setting
  business rules.
- School-opening authorization, final-grade correction and Site director
  delegation compose the inline action footer instead of independent flex
  action rows. Each maintains its existing authorization and server mutation
  contract.
- Unit tests, Storybook and source-level checker rules cover this layout and
  its current consumers. In-flight duplicate confirmation prevention remains
  in `ActionDialog`, while inline mutation idempotency remains feature-owned.

### Component-first adoption increment: records and entity metadata

- `RecordHeader` is the single title, breadcrumb, status and action-header
  presentation. Record actions now have an accessible named group.
- `RecordLayout` is the canonical record page composition, with optional
  explicit labels for its related-context rail and historical activity region.
  `/centers/demo` now composes it while retaining synthetic planning-only
  status and the real `/class` navigation.
- `RecordFacts` provides a read-only, semantic `dl/dt/dd` contract for
  feature-owned record attributes, with responsive one-, two- and three-column
  variants. It replaces duplicate fact markup in Action details and
  enrichment offerings; it does **not** create metrics or infer missing values.
- `EntityCard` retains its full-card link or router-link adapter behavior.
  Its metadata container now supports semantic paragraphs and other block
  content without invalid nested spans.
- Storybook covers compact and three-column fact layouts and named
  record actions/context. Unit tests assert semantics, empty-result behavior,
  source adoption and rich-card HTML. The V6.1 checker guards applicable
  record consumers and was corrected to resolve source-root paths for existing
  route/dialog and class-roster manifests.
- Route loaders, entity permissions, enrollment status, site attribution,
  audit records and persistence are unchanged. Remaining legacy record facts
  should be migrated only where the semantics match this family.

### Component-first adoption increment: record facts across audiences

- `RecordFacts` now has `plain` (default) and `tiles` presentation variants.
  Tiles use V6.1 square surfaces for concise, read-only verification evidence,
  not analytics metrics. Labels, values and status meanings remain feature-owned.
- `EntityCard` is now also used by the public enrichment catalog. Every
  offering exposes one complete, keyboard-focusable card link through the
  router adapter instead of separate title and CTA links to the same detail
  route. Prices, availability, dates and publishing remain the catalog
  reader's responsibility.
- `npm run design:inventory` now counts `RecordHeader`, `RecordFacts`,
  `EntityCard`, `FieldTripFacts`, `ActionFooter`, `StatCard` and
  `WorkspacePanel` as canonical components, in addition to primitives.
- A single `FieldTripFacts` feature composition renders departure, return,
  deadline and fee for both authorized student and guardian projections. Consent,
  boarding permission and participant identity remain in the existing,
  separate audience-specific workflows and server contracts.
- The church request receipt uses single-column `RecordFacts` while preserving
  its explicit nonapproval language and follow-up information.
- The first supervised school-day handoff uses `RecordFacts variant="tiles"`
  for expected onsite, *planned* staffing and *observed* attendance. Future
  attendance is still presented as **Not yet observable**, not as a physical
  check-in or custody handoff. Its recheck uses the canonical pending Button.
- Component tests cover published/unknown trip fees and deadlines, and contracts
  keep the observed-versus-planned first-day boundary. Storybook demonstrates
  the shared trip display and record-evidence tiles. The source checker guards
  migrated components and V6.1 geometry without banning specialized legacy forms.
- No authorization, consent, billing, attendance event or persistence behavior
  was moved into the presentation layer. Build, lint and authenticated acceptance
  still must pass for the exact `main` SHA before release.

### Component-first adoption increment: canonical status and transport history

- `StatusBadge` is now used by the school operations field-trip record and
  participant permission display instead of locally styled status pills.
  Trip approval and a guardian's permission are displayed as **distinct
  states**. An approved trip does not prove permission to board.
- `AttentionQueue` composes shared `StatusBadge` and `EmptyState`.
  The supplied priorities retain their explicit critical/high/normal meaning;
  the component does not infer new urgency from missing dates or ownership.
- `CredentialDeliveryHistory` now adapts authorized academic credential
  transport records into the existing `StatusTimeline`. The statuses are
  **Pending**, **Accepted by provider**, or **Failed**. Provider acceptance
  is informational, never confirmation of receipt by a school or person.
  Original provider receipts, error text and requested-at timestamps remain
  visible without inventing events, altering ordering, or broadening access.
- The academic credential delivery route composes the shared history instead
  of maintaining duplicate list markup. Server-owned authorization, download,
  release consent and credential lifecycle logic are unchanged.
- `StatusTimeline` now displays each source timestamp with an explicitly named
  time zone, defaulting to UTC for deterministic server/client rendering.
  Authorized Site views can supply `timeZone` to show a verified Site-local
  clock time; the source ISO timestamp remains in the HTML `dateTime`
  attribute and events retain their original supplied ordering. Invalid source
  timestamps are labeled unavailable rather than guessed.

- Added tests for transport state semantics, empty history, priority tones and
  duplicate history prevention; Storybook shows accepted and pending transport
  states. The shared-component checker now guards these consumers.
- Changes are source-committed to `main`, **not** independently accepted
  by production CI until the existing runner failures are resolved.

### Component-first adoption increment: notification and delivery receipts

- `RecordedTime` is now the single timestamp display primitive used by
  `StatusTimeline`, account notifications, watch-delivery history and
  provider receipt records. All instants must include an explicit `Z` or
  numeric UTC offset; ambiguous local times and invalid zones are marked
  **Recorded time unavailable** rather than silently using the viewer's clock.
  UTC is the display default, and callers may specify a Site time zone.
- `DeliveryReceiptFacts` composes `RecordFacts` and `RecordedTime` for
  the original receipt ID, attempt count, created-at time and *optional*
  provider acceptance or scheduled retry time. These facts are shared by
  noncredit invitation recovery and school-family alert recovery. Provider
  acceptance is not evidence of mailbox or handset delivery.
- `NotificationFeed` now composes the shared empty-state and timestamp
  patterns while retaining its signed-in account's unread, dismissed, read
  and related-record actions.
- Both recovery panels compose `DeliveryReceiptFacts`, `Field`,
  `Textarea`, `StatusBadge` and `WorkspaceNotice` instead of locally
  duplicating receipt evidence, controls and messages. A successful retry
  command with a failed read refresh uses an **attention** notice rather
  than claiming the command itself failed.
- All retry, consent, status, authority, queue eligibility, external provider
  communication and idempotency rules remain server-owned. Components render
  the state returned by authorized readers and preserve existing recovery
  commands. Receipt evidence does not assert successful delivery.
- Source contracts, unit tests, interactive Storybook samples and the V6.1
  adoption inventory cover these components. Source-level verification does
  **not** replace CI, a real typecheck or authenticated live acceptance.

### Enforcement now applied

- `scripts/check-design-system.mjs` checks geometry automatically for **all**
  `src/components/workspace`, `src/components/workflow` and `src/components/evidence`
  TSX components, plus their existing component-specific ownership contracts.
- ESLint prohibits reintroduction of raw inputs, buttons, labels, selects and textareas
  throughout shared `workspace`, `workflow` and `evidence` component families,
  and in specifically governed feature consumers.
- `npm run design:inventory` emits an AST-backed adoption inventory grouped by component family
  and lists remaining raw-control consumers. It is diagnostic, not a compliance percentage.
- Storybook loading Button uses the actual `loading` API.
- Unit tests cover canonical Button loading/keyboard semantics, labelled selection,
  evidence review labels, status reuse and square geometry.

### Definition of component completed

1. One canonical ownership path, documented props and explicit exceptions.
2. All appropriate component consumers migrated or an inventoried exception retained.
3. Accessibility, keyboard focus, 390/768/1024/1440 responsive behavior and themed contrast validated.
4. Loading, error, empty, disabled, pending, conflict and saved-but-refresh-failed behavior covered as applicable.
5. Unit/Storybook regression evidence passing and checker/lint prevention of drift.
6. No changes to authorization, persistence, enrollment/evidence source, or audit semantics.
7. CI is green for the exact SHA before release acceptance.

**Important:** Source commits to `main` do not certify full cross-product migration or
production readiness. Route-level adoption beyond the governed consumer sets and
live authenticated acceptance remain separate tasks while CI gates are failing.

### Route-by-route source migration log (2026-11-17)

This rollout answers the requirement to **inspect and migrate every page** while
continuing to compose one V6.1 primitive/pattern library. Do not create a second
route-specific kit or change domain commands to make a page easier to style.

- Repository inventory: 180 route TSX files and 368 component TSX files
  (excluding `.stories.tsx`; test/spec TSX files may still be included).
- 28 routes are now protected by the route-level source-control manifest in
  `scripts/check-design-system.mjs`; 27 were edited during these source migration
  increments and `/access` already used the approved visible control patterns.
- All 28 source-gated routes were fetched and scanned from `main`: zero visible
  raw JSX form controls and zero legacy radius utilities in those route files.
  Authentication's native `type="hidden"` POST fields are intentionally excluded.
- This is **not** 28 fully accepted journeys. Imported feature components may
  still contain legacy presentation, and browser behavior, keyboard/accessibility,
  responsive and themed visual acceptance are not verified.
- `npm run design:routes` reports every route filename, URL, direct and
  transitive-source signals, and which paths are governed. Use `-- --json` for
  tooling. The source inventory must not label a page as production accepted.

| Audience | Source-gated pages |
| --- | --- |
| Authentication | `/access`, `/access/register`, `/access/verify` |
| Account | `/account`, `/account/sessions` |
| Discovery and learning | `/explore`, `/learn/enroll`, `/learn/my-activity`, `/student/settings`, `/student/assignments`, `/student/discussions`, `/student/courses`, `/class` |
| Family | `/guardian/students`, `/guardian/report-cards`, `/guardian/attendance`, `/guardian/enrichment`, `/guardian/field-trips`, `/guardian/course-approvals` |
| Staff and operations | `/teacher/discussions`, `/teacher/missing-work`, `/teacher/gradebook`, `/operations/insights`, `/operations/course-requests`, `/admissions`, `/admissions/families`, `/calendar`, `/platform` |

**Next inspection areas, page by page:**

1. `/classes` and imported native Class/classroom feature components: preserve
   roster identity, assessment scope, enrollment authority and media behavior.
   The `/class` route is source-gated, not browser accepted.
2. Calendar imported panels, attendance, Site Day, and operating workspaces:
   preserve date controls, calendar ownership, timezone semantics and incident access.
   The `/calendar` route is source-gated, not browser accepted.
3. Remaining Admissions and registrar workflows: preserve independent approval
   gates, evidence review and saved-but-refresh-failed states; `/admissions`
   itself has migrated controls, not fully accepted downstream flows.
4. Remaining `/launch`, school settings and site website feature components:
   align shells, dialogs, records and editors without duplicate setup models.
5. Remaining public, network, staff, teacher and student pages:
   retire legacy geometry and visual status variants only after feature inspection.

For each migrated page, require shared primitives/patterns, route-level
regression coverage, and a feature-component review; then typecheck, lint,
relevant tests and 390/768/1024/1440 visual/keyboard review on the exact SHA.
No GitHub Actions or Netlify dependency is assumed. **Typecheck, build, lint,
Storybook, and authenticated browser acceptance were not executed for this
source-only increment.**

 
### November 17 continuation: academic workflows and shared Launch Studio components

The following eight route-level sources were migrated and enrolled in the
automated V6.1 regression manifest: `/guardian/course-approvals`,
`/teacher/missing-work`, `/student/discussions`, `/student/courses`,
`/class`, `/admissions`, `/teacher/gradebook`, and `/calendar`.
They now compose canonical controls and rectangular geometry. None of their
authorization readers, domain commands, or persistence were intentionally changed.

The Calendar's native month-day action and the Gradebook's assessment grid
cells now use canonical Button while preserving their existing arrow-key event
handlers, focus/identification attributes and direct record navigation.
The checker includes explicit source guards for those keyboard contracts.
Specialized grids remain specialized; neither is rewritten as DirectoryTable.

Four shared Launch Studio components are now source-gated:
`CanonicalBlueprintWorkspace` (Blueprint configuration and reference choices),
`WebsiteTemplateGallery` (preview page selector),
`SiteInformationConfiguration` (context checkboxes), and
`SchoolLaunchHub` (square navigation link).
These edits reuse the already approved Input, Label, Checkbox and Select
primitives without replacing Blueprint ownership, reviews or activation gates.

**Verification boundary:** Source-level checks were performed against the
committed GitHub files. The checker was updated, but local Node execution,
TypeScript typecheck, build, Storybook/axe, keyboard browser interaction and
authenticated role journeys have **not** run on the latest main commit.
Do not mark these source-gated pages or components as production accepted.


### November 17 continuation: publisher and school operations

The route-level source manifest now contains **35 of 180** TSX route files
(as counted by the Git tree inventory). This is adoption *coverage*, not a
measured percentage of complete user journeys or visual acceptance. Direct
source checks on the newly changed routes and components found no unapproved
native visible controls or legacy rounded geometry.

The following seven route files joined the source gate after the previous
28-route increment:

| Route | Design system consolidation | Functional invariants |
| --- | --- | --- |
| `/sites/$siteId/publish` | StatusBadge, Button, Label, Checkbox, Textarea, notices and rectangular sections | Authorized publisher, approved-content gate, consent, revision and reachability verification unchanged |
| `/site-website` and the composing `/launch/website` | Rectangular website-editor surfaces and common publisher notices | Protected-claim hold, revision conflict, private preview and local publishing authority unchanged |
| `/canonical/blueprint-reviews` | Shared labels for evidence, decision and review rationale controls | Independent review, verified evidence and approval policy unchanged |
| `/operations/family-alerts` | Shared delivery-retry action and rectangular cards | Provider acceptance is not proof of delivery; retry eligibility unchanged |
| `/operations/teacher-marketplace` | Rectangular staffing workflow and shared existing primitives | Teacher engagement authority unchanged |
| `/sites/$siteId/parent-information` | Rectangular public identity review panels | Verified public identity and publisher review unchanged |
| `/operations/health-review` | Field, Textarea, Button, WorkspaceNotice, EmptyState, rectangular records | Independent verification confirmation and protected family health data unchanged |

Shared Launch Studio components additionally migrated:

- `BlueprintOfferingAdoptionPicker`, `BlueprintReferenceCatalogPanel`
  and `ProgramDiscoveryPanel`: canonical Label/Select.
- `SiteContentChannelEditor`: canonical Label/Checkbox.
- `LaunchWizardPage`: shared error notices and rectangular workflows.
- `LaunchSiteIdentityEditor`, `LaunchSiteAddressEditor`,
  `LaunchSiteContactEditor`: rectangular editors, preserving revision checks.

The design-system checker now guards these eight additional shared
components, and asserts that the route audit and route checker both
contain the same 35 source-gated pages.

**Next pages by priority:** `/operations/field-trips`,
`/operations/transfer-records`, `/operations/curriculum-marketplace`,
`/classes`, and remaining teacher/student/guardian and Site administration
workspaces. Inspect composed feature components and specialized interactions
before applying controls; do not blanket-rewrite every route.

**Verification still required:** Local TypeScript build/typecheck/lint, tests
and Storybook, keyboard/focus checks, 390/768/1024/1440 responsive screenshots,
theme and accessibility reviews, and authorized browser journeys on the exact
`main` commit. GitHub Actions and Netlify are not prerequisites for this
migration, and their known billing blocks must not be counted as code failures.
No database schema or production data was modified for these presentation edits.


### November 17 continuation: field trips, curriculum, transfers, and Class workspaces

The source-controlled route manifest now covers **46 of the 180 TSX route
files** identified in the Git tree (routes are not all equally complex).
Additional source-migrated pages this cycle:

| Workflow | Route | Canonical V6.1 adoption |
| --- | --- | --- |
| School trip operations | `/operations/field-trips` | Input, Label, Select, Textarea, Button, rectangular roster/permission records |
| Secure academic records | `/operations/transfer-records` | Select, Input, Checkbox, Label, Button, EmptyState, WorkspaceNotice |
| Curriculum packages | `/operations/curriculum-marketplace` | Button, Input/file, Checkbox, Label, Select, Textarea for licensing, Common Cartridge and OneRoster workflows |
| Guardian Class enrollment | `/guardian/native-classes` | Search, verified learner and Class selectors, guardian consent |
| Native Class operations | `/class/$classId` | Independent review reasons, assignment selectors, staff responsibility and attendance grants |
| Learner/teacher classroom | `/classes` | Resource download, lesson completion, private notes and teacher resource controls |
| Guardian study group | `/guardian/group-permissions` | Consent, actions, notice and empty state |
| Student assignment | `/student/assignments/$assessmentId` | Download buttons, response and attachment field labels |
| Student trip view | `/student/field-trips` | Rectangular trip records |
| Guardian admissions | `/guardian/admission-offers` | Rectangular offer/decision records |
| Family transfer requests | `/guardian/enrollment-changes` | Shared receiving-school select, explicit consent and request actions |

The curriculum feature components **also** migrated:
`CurriculumPdfPicker`, `OneRosterClassMappingFields`,
`CommonCartridgeValidationSummary`, `CurriculumCourseOutline`,
`StaffClassVideos`, `OneRosterStudentReconciliation`, and
`ClassVideoUploadForm`. Their source checks are included in
`scripts/check-design-system.mjs`, not only in route-level audit results.

Specific sensitive gates retained in the same workflows:

- Field-trip departure check-in requires current guardian permission;
  boarding and return transitions remain governed by the existing server
  commands. Trip creation is still a real `type="submit"` button.
- Transcripts still require the authorized registrar's selected official
  issuance, independently confirmed destination and secure-delivery record.
  Internal CAN handoff remains tied to the receiving application and
  guardian's approved release.
- Pack license adoption and external link uploads still require explicit
  rights acceptance. OneRoster cannot infer a student's CAN identity or
  enroll students based solely on external CSV identifiers.
- Class approval and repeat decisions remain distinct from learner
  placement and independently scoped staff/attendance responsibilities.
- Assignment autosave, attachment authorization and saved drafts retain
  existing business commands.

**Scope of verification:** Each newly changed route and imported shared
component was retrieved from `main` and checked for direct native visible
controls and legacy corner utilities. The manifest now source-gates 46
routes and the audit/checker membership is kept in sync. The resulting
application has **not** been proven fully V6.1 compliant: imported components
outside the documented subset, responsive layout, keyboard focus, screen
reader labeling, real role-based journeys, code compilation, Storybook and
visual testing require further validation. Do not treat source-gated routes
as live-production acceptance.

**Next priorities:** Resolve remaining legacy controls in
`/student/support`, `/guardian/watching`,
`/operations/jurisdiction-profiles`, the remaining curriculum editor,
and the imported classroom and administrative components. Confirm static
checks and live journeys on the same exact `main` SHA without relying on
currently billing-blocked GitHub Actions or Netlify.


### November 17 continuation: support, guardian preferences and operating setup

The source-level migration manifest now covers **60 route TSX files** out
of the 180-file Git tree route inventory. These are **source-adoption
gates, not 60 production-accepted workflows**.

Route coverage added in this increment:

| Area | Page | Source-level changes |
| --- | --- | --- |
| Learner support | `/student/support` | Shared student help request, staff referral, service schedule, support-plan, and stage-transition controls |
| Family watch instructions | `/guardian/watching` | Shared pause/resume/revoke controls, watch statuses, history refresh, and reminder settings |
| Policy intelligence | `/operations/jurisdiction-profiles` | Rectangular policy reviews, funding program forms, sources and independent verification |
| Curriculum authoring | `/operations/curriculum` | Shared next-draft Button and rectangular curriculum panels |
| Registrar rules | `/operations/course-policies` | Shared course capacity, credit, add/drop/withdrawal, prerequisites and guardian-approval controls |
| Guardian health | `/guardian/health` | Shared review refresh and pending-review notice; school-approved medical records stay authoritative |
| Interest events | `/operations/interest-events` | Rectangular event and RSVP workspace |
| Workflows | `/operations/workflows` | Shared connected-workflow dashboard now uses canonical actions, metric cards and notice/empty state |
| School record | `/student/my-school`, `/guardian/experiences` | One shared SchoolProfile and LiveSchoolExperiences presentation |
| School-year studio | `/operations/school-years`, `/operations/school-years/$yearId`, `/operations/school-years/new` | Canonical school-year record, calendar, scheduling and creation components |
| Launch | `/launch/school` | Canonical LaunchWizardPage and reusable launch configuration fields |

The following composed feature components were also directly migrated and
source-gated:

- `NotificationPreferences`: Input, Checkbox, Label, Button and WorkspaceNotice,
  preserving explicit verified SMS opt-in, revoke action, quiet hours,
  and refresh-failure retry.
- `ConnectedWorkflowsWorkspace`: StatCard replaces its local metric-card
  implementation; shared Button, WorkspaceNotice and EmptyState used.
- `SchoolProfile` and `LiveSchoolExperiences`: square shared panels,
  while preserving conference booking, rescheduling and cancellation.
- `NativeClassSessionsPanel`: canonical Input, Textarea, Label, Checkbox,
  and Radio for session schedules, readiness, audited reschedule and
  emergency room revocation; existing timezone and schedule commands retained.
- `NativeClassSurveyCampaignPanel`: canonical Select/Label for linking only
  approved local survey campaigns to a Class.
- `ClassSupplementForm`, `ClassTeacherPlanningPanel`,
  `ClassCreationRequestForm`: square compositional Class panels.
- `SchoolYearCard`, `SchoolYearRecord`, `SchoolYearCreateForm`,
  `SchoolYearScheduleEditor`, `SchoolYearScheduleSetup`, and
  `SchoolYearStudioWorkspace`: square panels with canonical controls.
- `LaunchConfigurationForm`, `LaunchProgramIdentityFields`,
  `LaunchDeliveryModelFields`, `LaunchHostAndProviderFields`:
  square Site/program fields and fewer legacy Input class overrides.

**Source verification:** New route and feature-component source lists were
fetched from GitHub `main` and scanned for native visible controls,
legacy corner classes and required shared components. The newest 14 route
files and 19 shared components all passed the direct source comparison.
The two checker/audit manifest sets were updated together, to cover
exactly 60 routes. No database records or schemas were touched.

**Release verification not done:** The local `npm run lint`, `npm run
design:routes`, TypeScript compiler, build, Storybook/axe, authenticated
journeys, keyboard/ARIA review, and responsive screenshots were **not run**
on this `main` snapshot. Existing GitHub Actions and Netlify billing
blocks are external operational restrictions, not proof of successful or
failed code validation.

**Continue page-by-page:** Audit composed Class and SchoolYear controls
beyond the guarded subset, then tackle remaining learner, parent,
admissions, operations, public and platform views. Do not infer
completion merely because a route imports WorkspaceShell.

### Migration audit architecture correction (November 17, 2026)

**This supersedes the manually maintained page/source-gate counts above.**
Prior references to a 60-route checker manifest describe an earlier
implementation, not the current migration mechanism.

The migration no longer maintains an allowlist of route filenames, required
JSX fragments or component counts, or duplicated checker/auditor manifests.
The two entry points now share one source-analysis module:

- `scripts/lib/v61-source-audit.mjs` discovers TSX routes and components,
  parses JSX and Tailwind string values with the TypeScript AST, recognizes
  deliberately hidden native POST fields, and follows component value imports
  through named barrel exports. Type-only imports are not rendered UI.
- `npm run design:routes` inventories the current routes and their composition.
  Use `npm run design:routes -- --json` for machine-readable results;
  `-- --strict` fails while any direct route/component source debt remains.
- `npm run lint` invokes the same source discovery and compares changed TSX
  files against the Git base. Any increase in an individual native-control
  category, rounded utility or new TypeScript parse error fails the check.
  Specify `V61_BASE_REF=<commit>` for a known base; the route reporter also
  accepts `-- --base=<commit>` and defaults to `HEAD^`.
- `npm run test:design-audit` provides AST and fixture-based regression tests
  for actual JSX nodes, hidden inputs, named barrel resolution and changes.

Additional pages require **no manifest edits**. Domain behavior belongs in
behavioral unit/integration tests, not literal JSX fragment assertions.
Older, specialist source contracts are temporarily retained until equivalent
behavior-based coverage replaces them; do not extend those lists.

A source-clean page is not automatically an accessible or production-accepted
workflow. Role scoping, loading/error states, responsive behavior and
authenticated browser journeys still need execution on an exact commit.
The new scripts and test suite are committed to main but have **not** been
executed end-to-end in this session.

### Next implementation pass: shared classroom components

The dynamically discovered audit continues without route-name or JSX-fragment
manifests. The V6.1 source analyzer now follows lazy `import()` dependencies
and checks parse diagnostics across application TSX, rather than assuming
that a visually clean route cannot compose legacy feature controls.

This pass applied shared control patterns to private facilitator sessions,
verified attendance, projector commands, lesson/session agendas, learner
surveys/assessment questions, public-safe questions, assisted-device practice,
learner companion responses, booking and rescheduling, joining and QR retry.
The reused components include Field, Label, Input, Select, Textarea, Checkbox,
Radio, Button and WorkspaceNotice. Existing domain commands and evidence
boundaries remain in the feature modules.

Source-only validation retrieved the 14 touched classroom/enrollment TSX
components from `main`. None contained raw visible button/input/select/
textarea/label elements or a legacy rounded utility at the source level.
This does not prove full type, visual, accessibility or browser acceptance.
No production database changes were performed.

Future work should improve remaining composed UI through the same reusable
controls, then run the AST audit and actual TypeScript/lint/component tests,
followed by authorized role journeys. Never introduce fixed route enumerations
or exact JSX source-text contracts as a substitute for behavior verification.


### Design checker consolidation (November 17 continuation)

The generic design-system checker is now the single entry point for
**source-level** V6.1 enforcement. The previous checks that matched exact JSX
fragments, page names, status copy and component-specific implementations
have been removed from `scripts/check-design-system.mjs`.

- It automatically discovers application TSX and follows component imports.
- It reports any TypeScript/JSX parse diagnostics.
- It enforces rectangular geometry across the stable shared component layers
  (UI, workspace, workflow and evidence), including newly created files.
- It rejects increases in each native-control category and rounded class
  when files are changed, including staged, unstaged and new files, and fails
  if CI cannot resolve its requested Git comparison base.
- Outstanding feature-level design debt remains inventoried instead of being
  disguised as a successful migration. `npm run design:routes -- --strict`
  remains the explicit full source-debt gate.

Domain authorization, grading, evidence and publication semantics must be
validated through the existing dedicated domain/unit/integration tests,
not exact string checks in a presentation script. No security or academic
business logic was changed by this checker refactor.

The design checker, the AST test suite, and the edited Class/assessment
components are on `main`. Full local lint, TypeScript compilation, test
execution and authenticated visual acceptance remain unverified in this
session.


### Native Class management and grading composition pass

The native Class manager now uses shared Input, Select, Checkbox, Label and
Textarea controls for authorized Program/Course discovery, Site and delivery
selection, Class terms, consent and enrollment configuration. Existing
server-owned activation, publisher/Offering scope and permissions were not
replaced or bridged into a parallel system.

In the grading and learning-support composition, the shared teacher grade
response queue, student goal author/reviewer forms, assessment resource
uploads, text-selection annotations, assignment conversations, completion
evidence review, provider instructional draft, follow-up actions, recorded
lesson navigation and noncredit completion review now use canonical 6.1
actions and fields with rectangular surfaces. These edits reuse existing
domain commands instead of rebuilding workflow logic.

The dynamic checker now derives its enforcement from all discovered
application source and shared component layers. It no longer contains
per-page JSX fragment manifests or custom source-copy rules. The source
audit test suite includes a generic shared-layer geometry fixture.

**Source-only verification:** All 12 changed Native Class/assessment/teacher
component TSX files were fetched from main and passed direct raw-control and
rounded-utility scans. This is not a substitute for typecheck, accessibility,
tests, visual comparison or role-based live acceptance. No production
database records or schemas were modified by these UI changes.


### November 17 continuation: publisher, attendance and admissions workflows

Source migration now covers the composing publisher authoring components:
`ProviderVideoUploadForm`, `PublisherCourseActivityEditor`,
`PublisherTeacherGuideEditor`, `PublisherPackComposer` and `CurriculumEditor`.
These now share Input, Select, Textarea, Label, Checkbox and Button rather
than recreating browser controls or radius/spacing styles in each feature.
Controls are tied to the existing publisher-owned drafts, immutable version
releases, enrollment permissions, protected teacher-only guidance and
publication approval. No alternate curriculum/publishing subsystem added.

`/staff/attendance` now uses shared form controls and semantic attendance
status Button variants for expected rosters, offline reconciliation,
corrections and independently reviewed guardian excuses. The queue and
attendance evidence commands were not changed.

Admissions capacity, intake and invitation routes now use shared notices,
empty states and outline action variants. The entire current 14-component
`src/components/admissions/` family is directly source-clean for raw
visible form controls and rounded geometry, including guardian-relationship
verification, intake decisions, capacity, invitation retries, public
interest and secure transfer transcripts. The transcript uses the canonical
accessible Table and still relies on the receiving school's exact
consent/issuer grant.

New code required no route manifest or JSX-fragment assertions. The
automatically discovered design audit remains the single source rule.

**Verification:** The 23 changed/reviewed publisher, operations, admissions
route and component source files were fetched from main; all passed direct
native-control, rounded-class and basic JSX tag-shape checks. This is **not**
the equivalent of TypeScript compilation, automated tests, visual or
accessibility acceptance. Those execution checks remain outstanding,
and no production database data or schema was modified.
