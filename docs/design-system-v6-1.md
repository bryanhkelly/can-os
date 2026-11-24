# CAN OS V6.1 — Complete Product Design System

**Status:** Approved visual direction; shared implementation kit in PR #265
**Visual authority:** V6.1 refined student dashboard (after V5 typography restoration).
**Implementation authority:** This repository's shared React/Tailwind components and Storybook.
**Scope:** All CAN OS personas, modules, dashboards, user flows, record pages, school launch and operational workflows.

### Local student and classroom implementation

The refined student dashboard now composes shared panels, shortcuts and calendar
over authorized Student Today, assignments, class progress, finalized report cards
and school experience readers. Optional reader failures remain visible per panel.
The photographic asset came from the supplied reference; there is no fabricated
editorial publishing service.

The supplied V6.4 classroom reference is adapted in
`ClassroomWorkspace`, `ClassLessonOutline`, `ClassroomMediaStage`,
`ClassroomLessonTabs` and `PrivateLessonNotes`. These reuse shared Button, Modal,
WorkspacePanel, notices, semantic tokens and authorized workspace navigation.
The collapsed sidebar remains available on mobile; expansion uses a native modal
drawer with restored focus. The ordinary session/context/error controls stay
available, without adding another header navigation toggle.

Student class cards and dashboard class actions enter `/classes?section=...&tab=lessons`
directly. Existing enrolled `/student/courses?section=...` overview links hand off
to that same focused classroom instead of rendering the former overview page.
Explicit classwork and grades/feedback views retain their scoped records and use
the focused classroom shell; `view=catalog` remains the registration workspace.
Students opening `/classes` with a Section and no tab start on lessons. Teacher
and guardian default views are unchanged. Behavioral acceptance remains deferred.

Recorded content uses the existing video authorization/player and immutable
publisher lesson release. The supplied `can-os-v6-4-sidebar-rail.html` now drives
the compact metadata/header, rectangular media stage/footer, native video controls
plus ten-second seek and playback-speed buttons, lesson outline/progress, and
Overview/Transcript/My notes/Discussion tabs with actual assignment next steps.
Direct HTTPS recordings render immediately in the focused classroom, without
autoplay; embeds and private signed URLs retain explicit loading. Lesson-specific
recordings take precedence over class-wide resources. The stage and information
tabs remain visible when no publisher lesson exists, with honest unavailable
transcript/notes states. The first uncompleted published lesson is selected on
entry when no explicit lesson ID is provided; navigation never marks it complete.
Transcripts are optional published lesson text with a
publisher draft-editor control. Notes are scoped to the current actor, Section,
course version and lesson; guardians and other identities cannot read them through
these APIs. Revision conflicts preserve the editor draft. Audit and domain events
record note identity/revision, never note text; these events have lifecycle handling
and no new notification policy. Shared demo identities share their private-note
records; the UI states this explicitly. No notes use localStorage.

Live classes use teacher-managed external HTTPS meeting links, not embedded
mic/camera simulations. Scheduling creates a canonical ScheduledOccurrence and
CalendarEvent transactionally using the Site timezone. Calendar remains the
rescheduling/cancellation owner. Link edits require assigned-teacher and calendar
authority, exact event/occurrence scope, and expected-link conflict checks;
source-owned events remain managed by their owning workflow. Meeting URLs are
excluded from guardian classroom DTOs. Lesson discussions deep-link to authorized
canonical threads and retain existing teacher moderation/student responses.

Migration `0069_classroom_lesson_notes` and its schema snapshot are generated
locally only; **this classroom implementation has not applied the migration or
deployed it**. Notes persistence requires applying that migration to an
explicitly authorized database. Behavioral/database/browser/security acceptance
is deferred at the user's request; typecheck/build results are integration evidence
only. Storybook includes focused classroom lesson and unavailable-content examples.

At the user's explicit demo-data request, the assigned Riley teacher added a CC0
flower-video playback example to English Literature through the ordinary class
supplement command. It is a class-wide recording, not publisher instruction.
The Jordan student was restored and its native video reached readyState 4 with
controls enabled and no video error on localhost. This was a manual workflow
operation, not automated test-suite or release acceptance.
The current live classroom was also inspected as Jordan. Playback controls
synchronize metadata already loaded before hydration; manual footer interactions
changed speed to 1.25x and clamped seeking to the recording's 5.055-second end
and back to zero. The no-lesson notes editor remained disabled. This does not
verify notes persistence or complete visual fidelity.

For the populated classroom demonstration, the authorized institutional publisher
created English Literature version 2 through Curriculum: an original three-lesson
close-reading unit with syllabus, readings, learning targets, structured practice,
accessible descriptions of the silent CC0 recording and its resource link.
Launch Studio created `ENG-CR-01`, English Literature · Close Reading, with Riley
assigned; the original English Literature Section and its pinned release were
not changed. Riley added class assessments, a discussion and a welcome announcement.
This is a short demonstration unit, not a complete credit-bearing curriculum.
The course editor validates incomplete resource URLs as draft errors rather than
throwing during the publication-readiness render.
School-year settings expose the existing authorized schedule-creation form under
"Add another instructional schedule" when schedules already exist; adding one
does not replace existing schedules. For this demonstration, the user approved
a separate Monday 15:30-16:15 America/Los_Angeles schedule for `ENG-CR-01`.
The new class registration policy is non-credit with a November 10, 2026 add/drop
deadline. The term-credit limit and guardian-permission setting were not increased
or relaxed. At the user's explicit request, Jordan requested withdrawal from the
original English Literature class and the registrar approved it; this is a
withdrawal retaining W notation, not a backdated drop.
After the new timetable was assigned through the audited lifecycle command,
Jordan's placement into `ENG-CR-01` succeeded without increasing the credit limit.
The student registration view showed the original class as withdrawn with W
notation, eight active classes and seven current credits. The populated student
classroom showed three lessons, honest 0/3 self-reported progress, lesson reading,
targets, practice, the assignment next step and the published recording description;
the native video reached readyState 4 with controls and no playback error.
Notes persistence remains unverified and the notes migration remains unapplied.

Recorded integration checks for this classroom slice:

- `npm run typecheck` passed.
- `npm run build` passed for client and server.
- `npm run build-storybook` passed after separating media presentation from
  route-supplied server command bindings.
- Focused ESLint passed with no errors; the broader changed-shell check retains
  one pre-existing effect warning in `WorkspaceNavigation`.
- `node scripts/check-platform-route-contracts.mjs --check` passed:
  113 source routes, 113 recorded, zero issues.
- `git diff --check` passed. No classroom behavioral/database/browser test
  suite was run; those acceptance checks remain unverified.

## Component architecture and adoption policy

CAN OS V6.1 uses three layers of **one** design system, not three competing libraries.

| Layer | Ownership | Existing examples | Rules |
| --- | --- | --- | --- |
| 1. Primitives | `src/components/ui/`, theme tokens and layout foundations | Button, Input, Select, Modal, Table, Field, PageFrame | Own geometry, focus, semantics and shared style. Feature UI must use these rather than styling equivalent native form controls. |
| 2. Application patterns | `src/components/workspace/`, `src/components/workflow/`, shared form and directory composition | DirectoryTable, FilterBar, PageHeader, FormSection, FormActions, WorkflowProgress, RecordHeader, StatusBadge | Own responsive composition, empty/error/loading states and reusable interactions. Remain domain-neutral; do not query databases or implement permissions. |
| 3. Feature components | Feature-specific folders and modules | EvidenceUploader, class roster, enrollment forms, blueprint workflows | Own domain-specific fields, presentation and commands; compose Layers 1 and 2. Authorization and business transitions remain server-owned. |

**Roster composition:** `RosterList` in `src/components/workspace/` owns row spacing,
accessible list labeling, secondary information, action slots and empty state
for school Section, Site Admin and native Class rosters. The feature supplies
only rows already authorized by its owning reader. It does not fetch or redact
people, change enrollment, merge lifecycle models, or override course/credit
assessment authority. Native roster pagination and actions remain native;
Section/academic gradebook actions remain Section-owned.

**Status and history composition:** `StatusTimeline` in
`src/components/workflow/` renders authorized, source-owned status history
with semantic timestamps, optional status badges and explicit empty states.
The noncredit completion review now uses it for formal completion decisions and
credential issuance/current-validity records. The source services determine
ordering, supersession, issuer validity and access; visual timelines do not
infer transitions, manufacture audit history or expose additional records.
`DashboardTimeline` remains the simpler scheduled-event widget and is not
a substitute for an authoritative workflow history.

**Additional adopted surfaces (November 2026):** The independent assessment
review workspace now composes shared Select, Textarea, Checkbox and Button
primitives instead of styling native controls in its route. The watch delivery
history view composes `StatusTimeline` with source-owned queued timestamps,
provider acceptance, retry information and authorized recovery links.
It does not infer delivery from provider acceptance and never presents a
receipt as an enrollment or completion decision. Storybook documents
populated/empty workflow histories; no new persistence or lifecycle
service was introduced.

**Blueprint and Section lifecycle status (November 2026):** Independent
Blueprint review queues, Launch Studio review readouts, and Section lifecycle
operations now use the shared `StatusBadge` and square-corner panels.
Blueprint configuration approval is not operating authorization. The
latest-decision reader remains authoritative for current approval; the separate
`readCanonicalBlueprintReviewHistory` endpoint reads real append-only
configuration review decisions, original rationale, evidence references and
timestamps for one exact Blueprint version. It applies the same Blueprint
read capability and database role, verifies the Blueprint's current Site scope,
limits pages to 20 records and caps page indices. Launch Studio composes the resulting history with `StatusTimeline`,
explicit loading/errors and previous/next controls. No historical decisions
are synthesized from the latest status. School Section enrollment transitions
remain owned by the Section lifecycle service and retain their independent
reason, transfer, capacity and audit checks.

**Native Class learner lifecycle (November 2026):** The native enrollment
card composes the shared `StatusBadge`, `Select` and `Checkbox` primitives
for its current participation state and transfer form. Withdrawal, transfer,
attestations, seat release and learning history remain owned by the native
Class enrollment service. The existing learner enrollment-history feed is a
list of source participation records, not an audit trail of every transition;
do not present it as event history without a distinct authorized source.

### Canonical native controls and reuse contract (November 2026)

**The design system already owns the native elements.** Do not introduce another
Button/Input/Select/Label implementation in a feature. Native HTML is an
implementation detail of `src/components/ui/`, not a competing option for
feature pages. Every Site, Launch Studio, classroom, guardian, facilitator,
admissions and operations surface follows the same ownership rules.

| Native behavior | Canonical V6.1 owner | Feature use |
| --- | --- | --- |
| Action or link-styled action | `ui/button.tsx` (`Button`) | Use `Button` and `Button asChild` for a real link. Only one primary action per view. |
| Text, email, number, date, file inputs | `ui/input.tsx` (`Input`) | Wrap in `Field` for labels, descriptions, required and error presentation. |
| Select menu / multiline text | `ui/select.tsx`, `ui/textarea.tsx` | Compose with `Field` rather than per-feature styles. |
| Checkbox or radio | `ui/choice.tsx` | Use `Checkbox` / `Radio`; preserve an accessible label and fieldset where appropriate. |
| Label, validation, managed forms | `ui/label.tsx`, `ui/field.tsx`, `ui/form.tsx` | Reuse `Label`, `Field` and the existing React Hook Form adapter; do not clone markup per module. |
| Dialog and tabular data | `ui/modal.tsx`, `ui/table.tsx` | Compose the shared primitives; use `WorkspacePanel`, `ActionDialog`, `DirectoryTable` as the higher-level patterns. |

**Style ownership:** `src/components/ui/control-styles.ts` is the single
source of shared focus-ring, disabled-control, validation and field-surface
classes. The controls still own their meaningful differences, such as textarea
resizing, check/radio appearance, button loading and select sizing.
Changes to these shared behaviors propagate to all existing consumers.

**Enforcement:** `can-os-design/no-native-feature-controls` applies to every
production JSX route and feature, including newly added files. It permits only
static hidden form inputs and a native wrapping `label` whose sole interactive
descendant is a canonical `Checkbox` or `Radio`. The actual primitive
implementation files are exempt. Native `dialog` is owned by the shared
`Modal` primitive. The rule does not ban semantic native `form`, `fieldset`,
`legend`, `video` or other elements that are not duplicate form controls. Its unit tests verify both exceptions and regressions.
`npm run lint` and the source-level V6.1 audit are independent enforcement
routes. Storybook is the interactive catalog; browser and visual QA remain
separate release gates.

**Shared action composition:** `FormActions` and `CreateAction` compose
`Button` instead of duplicating Radix slots or hand-copying button classes.
A slotted `Button asChild` preserves the child link and its navigation props.
When disabled or pending, it announces `aria-disabled`, removes sequential
keyboard focus, and prevents user navigation without emitting the invalid
HTML `disabled` attribute on an anchor.

**Managed form accessibility:** `FormField`, `FormItem`, `FormControl`
and `FormLabel` enforce their required React Hook Form context, preserve
control-specific and form-level descriptions in `aria-describedby`, and share
one generated label/control ID. Incorrect composition throws an explicit
developer error instead of rendering an inaccessible orphan label.
Unit tests cover composed forms, missing context and descriptions.

**Build-time dependency guard:** `scripts/check-component-boundaries.mjs`
runs `sharedUiImportViolation` against aliased and relative imports in all
V6.1 UI, workspace and workflow sources. Primitives may depend on peer
primitives, never on features. Shared patterns may compose peer patterns and
primitives, never feature components or server commands. A single existing
thin shell session-context import in `DashboardHome` is explicitly
documented as a narrow exception rather than allowing arbitrary shell
dependencies. The pure dependency tests are included in `test:design-audit`.

**Cross-feature form pattern adoption (November 2026):** Existing
`WorkspacePanel`, `ActionFooter`, `Field`, `Button` and `EmptyState`
components now compose the reviewed forms for Class video uploads and resource
links, admissions inquiries and family invitations, guardian enrollment form
signing and registrar decisions, interest-event creation, school setup and
extended-season drafts. Launch Studio Site Profile, learning-environment
preparation, Program Discovery and native Offering adoption review also use
the same patterns. No new feature-specific Button, form footer or panel
abstraction was introduced. Each workflow retains its original command,
authorization boundaries, eligibility, validation and state ownership.

**Step navigation adoption:** `ActionFooter layout="step"` owns the
border, spacing, and back-versus-save alignment for Launch Studio's Site
Profile, Site Information, Programs & Audiences, and Marketing Package wizard.
The feature supplies actual Back, Save & Exit and Continue commands, preserving
its own validation, approval and publication gates. `LaunchDraftButton` uses
the native shared `Button.loading` treatment instead of maintaining a second
pending label implementation.

**Additional form migrations:** Teacher Class requests, learning-goal sharing,
guardian relationship verification and the physical classroom directory all
compose `ActionFooter`. Room-to-Class assignment uses the canonical `Field`
and `Select` association rather than a custom-styled select inside a label.
The cross-feature source tests lock these reuse contracts, and the scoped
duplicate-form-action lint error covers the newly migrated modules.

**Named form-component coverage:** The production `*Form.tsx` component
family now uses the shared action patterns, including guardian applications,
Class scheduling, provider recording uploads, teacher follow-ups, student goal
reviews, and evidence decisions. The guardian application no longer maintains
its own pending spinner beside `Button.loading`. The source-level test
discovers all current and future named forms and checks every submitting form
for `ActionFooter` or `FormActions`. ESLint treats duplicated native submit
rows as errors for `src/components/**/*Form.tsx`, while other legacy
surfaces remain visible as warnings pending migration.

**Route-level adoption:** Messages, school-family alerts, curriculum creation,
guardian enrichment and health updates, field trips, and platform adult-learner
identity review now use the same `ActionFooter` patterns with the shared
`Button.loading` behavior. Field-trip proposal and invitation forms now use
`Field`-associated `Input`, `Textarea`, and `Select` primitives instead
of locally styled label-wrapped controls. The scoped lint error and source
contract tests protect these seven additional routes. Their data access,
eligibility checks, confirmation steps, review authority, and writes remain
feature/server owned.

`can-os-design/no-duplicate-form-actions` reports a local `div` or
`footer` directly wrapping a submit `Button` inside a form. It runs
as an adoption warning across production JSX, and is an **error** for the
migrated feature modules. A header toolbar, filter row, non-submit
action or composition using `ActionFooter`/`FormActions` is not prohibited.
The narrow detection intentionally does not claim to recognize every
possible duplicated UI; cross-feature rendering tests and browser review
remain complementary checks.

**Shared navigation ownership (November 2026):** Use
`DetailNavigation` with `SectionTab` for exclusive record views, `PageNavigation`
for known forward/back links, `DirectoryPagination` for known totals,
`DirectoryWindowPagination` for bounded server windows without a total, and
`WorkspaceLinkNavigation` for a compact group of related destinations.
`WorkspaceLinkNavigation` accepts `surface="panel" | "plain"` and owns the
accessible navigation landmark, V6.1 spacing and panel tokens. Feature
components still own their destination links, authorization and navigation
eligibility. The reusable cursor pager accepts `previousLabel` and
`nextLabel` for contextual wording without inventing an unavailable total.
Do not use a record tab to present independent destinations or reuse a page
navigator for active view selection.

**Reporting table ownership (November 2026):** Use `Table`, `TableCaption`,
`TableHeader`, `TableHead` (column header), `TableRowHead` (accessible
`th scope="row"`), `TableBody`, `TableRow` and `TableCell` from
`src/components/ui/table.tsx` for source-reconciled evidence tables.
`Table` owns the focusable horizontal scroll region; feature panels own
disclosure limits, server filtering, reporting scope and the data itself.
Use `DirectoryTable` for record lists with sorting, permitted actions,
selection or pagination. Reuse the low-level table family for fixed-column
reporting and source metadata rather than adding directory affordances.
The current migrated read-only screens have **ten tables** across
Noncredit Network, Native Class, Noncredit Pilot, Noncredit Provider,
facilitated-impact reporting, workflow transitions, and student rubric views.

`can-os-design/no-native-feature-tables` warns across production TSX and
is an error for the seven migrated reporting, workflow and rubric components. Complex legacy
gradebook and assessment grids are not silently converted: retain their
functional behavior until interaction, keyboard and source-of-truth
acceptance is available. Storybook reports/table fixtures include mobile,
tablet, desktop and dark-mode views, but they cannot count as reviewed
screenshots until actually executed, inspected and recorded in
`docs/verification/v61-visual-evidence.json`.

**Dependency direction:** `ui` does not import features; shared
`workspace` and `workflow` patterns compose `ui`; feature-specific
components compose those layers. Server authorization, identity, evidence,
approval decisions and mutations never belong in primitive controls.

**Reuse before invention:** For any new feature surface, look for an existing pattern
before creating a new table, filter row, status display, stepper, form layout or header.
Extend a shared pattern only when the behavior is genuinely reusable across multiple
domains. Do not introduce duplicate names such as `DataTable` beside the existing
`DirectoryTable` without a concrete migration and deprecation plan.

**Dependency direction:** Features depend on shared patterns and primitives;
patterns depend on primitives. Shared components must not import feature components.
Server-side authorization, data ownership, audits and lifecycle transitions must
never migrate into presentation components merely to enable reuse.

**Design enforcement:** `scripts/check-design-system.mjs` now enforces shared FilterBar composition and square geometry in the directory patterns. `DirectoryPage` delegates search, supplemental filters and view toggles to `FilterBar` while preserving its public API. Directory sort and pagination remain controlled by feature owners. The checker also checks
canonical primitives, shared shell geometry and evidence ownership. A governed
feature-control manifest additionally checks migrated evidence upload controls for
shared Button/Input/Label imports, prohibited raw native controls and rounded
utility classes. Add feature components to the manifest as they migrate. CI should
run the checker alongside lint, typecheck and component/story tests. This is an
incremental adoption gate, not a claim that all legacy feature UI has been migrated.

**Review criteria:** Shared-pattern changes require keyboard and accessible-label
coverage, narrow/mobile layout checks, loading/empty/error state examples and
at least two concrete feature use cases before extraction. Feature owners retain
their own permissions and domain-specific tests.

## 1. Non-negotiable design decisions

1. **Fonts:** DM Sans is the UI font; Instrument Serif is the editorial heading font. Long-form labels, tables, buttons, and metrics use DM Sans; restrained page and section headings may use Instrument Serif. Avoid the overbold compressed V6 presentation.
2. **Palette:** CAN demo-new: white, cool-gray canvas, navy text and restrained blue interactive states. **Color has meaning.** Neutral for regular values/drafts; blue for actions/focus/navigation; green for verified success; amber for actual attention; red for danger/blocked conditions. Always pair color with text.
3. **Corners:** Strictly rectangular, zero radius. No rounded cards, pills, modals, inputs, avatars, or tabs. Use borders/spacing before shadows.
4. **Density:** Generous negative space, compact record titles, small labels and readable 12–14px operational text. Primary information should appear in the first viewport. Do not repeat a large intro banner on every workflow.
5. **Photography/art:** Editorial wallpaper is a managed marketing placement (verse, holiday, campaign, local events), **not** role-themed school photography. The wallpaper can be expressive while operational UI is neutral. It lives on home dashboards, not record-detail pages.
6. **Architecture:** A single frontend design system, not a second router, library, CMS or set of workflow records. Routes and server functions own data, role scope and allowed mutations.

## 2. Canonical foundation and token ownership

| Contract | Code location | Intended use |
| --- | --- | --- |
| Main theme, geometry, fonts, semantic colors and density | `src/styles.css` | Every component; scoped brand override supported |
| Font loading | `src/routes/__root.tsx` | DM Sans, Instrument Serif, JetBrains Mono |
| Brand contrast | `src/design-system/brand-theme.tsx` | Validated local-brand accents, never operational semantics |
| Canvas selection/rendering | `src/domain/editorial-campaigns.ts`, `src/components/student/DailyCanvas.tsx` | Home-dashboard editorial wallpaper |
| Buttons/forms | `src/components/ui/` | Button, Input, Select, Textarea, Checkbox, Radio, Field, Modal |
| Panels/metrics/status | `src/components/workspace/` | WorkspacePanel, StatCard, StatusBadge, QueryState, Notice |
| Navigation | `src/components/shell/` | Authorized role navigation, topbar, context switching, Ask CAN |
| Reusable workflows | `src/components/workflow/` | GuidedSetupShell, SplitReviewShell, WorkflowWorkspace, WorkflowProgress, UserFlowMap |
| Component catalog | `src/**/*.stories.tsx`, `.storybook/` | Visual/behavioral examples and accessibility checks |

The application and `.storybook/preview-head.html` load the same font families.
Use `can-editorial-primary` and `can-editorial-secondary` for wallpaper actions;
their contrast and keyboard focus are independent of dark or site-brand tokens.
Entity-card styling leaves display layout to utilities so directory cards retain
their flex-column layout and aligned footers. Site Today retains its
server-gated Onsite day shortcut alongside the compact operating-area navigation.
The Storybook browser-test config runs the same Tailwind plugin as the catalog
build so layout and accessibility assertions exercise generated utility styles.

### Canonical color tokens

| Purpose | Light value | Usage |
| --- | --- | --- |
| Application canvas | `#f6f8fb` | Behind content, no status implication |
| Card/surface | `#ffffff` | Panels, tables, forms |
| Ink | `#101d39` | Main typography and values |
| Muted ink | `#52627c` | Help, sublabels, timestamps |
| Stroke | `#e2e8f0` | Neutral borders |
| Primary blue | `#1769ef` | Primary CTA, focus, navigation, active links |
| Verified success | `#16845b` | Confirmed positive outcomes only |
| Attention | `#b86b00` | Required review/deadline risk |
| Danger | `#c93232` | Confirmed blocking/critical problems |

Never use brand hues to infer review, authorization, enrollment, learning mastery, compliance or opening permissions. Dark and site-branded themes retain meaningful semantic contrast.

### Layout and type contract (enforced)

Every authenticated page sits on one grid. Alignment is a property of the tokens and
primitives, not of individual pages, so a page cannot drift out of line.

| Token (`src/styles.css`) | Value | Owner |
| --- | --- | --- |
| `--topbar-height` | 4.5rem (4rem compact) | Top bar **and** sidebar brand block; their bottom borders form one line |
| `--sidebar-width` / `--sidebar-collapsed-width` | 15rem / 4.5rem | `.can-shell` grid column; `data-sidebar="collapsed"` selects the narrow column |
| `--page-gutter` | 1rem → 1.5rem (≥640px) → 2.5rem (≥1280px) | Top bar inline padding, page frame padding, Home hero padding |
| `--page-pad-top` / `--page-pad-bottom` | 1.5rem → 2.25rem / 3rem | First line of every page |
| `--content-reading` / `-standard` / `-wide` / `-dashboard` | 48 / 64 / 80 / 94.375rem | Right-edge limit only; frames are left-aligned (`margin-inline: 0`) |
| `text-3xs`, `text-2xs`, `text-section` | 0.625 / 0.6875 / 1.625rem | Micro labels, eyebrows, dashboard section titles |
| `tracking-eyebrow`, `--eyebrow-color` | 0.16em, workspace accent ink | `.can-eyebrow` |

Primitives (`src/components/workspace/page-frame.tsx`): `PageFrame` is the only
workspace `<main>`; `PageHeader`, `PageEyebrow` (`.can-eyebrow`) and `PageTitle`
(`.can-page-title`) own the page title block. `WorkspaceShell`, `RecordHeader`,
`WorkflowWorkspace` and `DashboardHome` compose them. As a result the switcher in
the top bar, every eyebrow and every H1 start at `sidebar width + gutter`.

**Home contract.** The shell generates the first navigation item, **Home**
(home icon, `/home`), for every role
(`workspace-navigation.registry.ts`); no other item may use the home icon. Role
homes use `DashboardHome` **without** a `title`, so the H1 is the shared greeting
("Good morning, Avery."). Role context goes in the eyebrow. Pass `title` only for
non-home dashboards (for example a site record). Eyebrows name the section; the
"CAN OS" brand appears only in the shell.

`/home` renders the dashboard for the verified active membership, using the same
authorized domain readers. Role-named dashboard URLs (`/student`, `/operations`,
`/teacher`, `/guardian`, `/coach`, `/counselor`, `/network`, `/network-steward`,
and `/site/day`) are not aliases or redirects. Their workflow subpages remain
available; the student and operations layout roots return not found on an exact
visit. Home navigation and membership switching always use `/home`. A student's
explicit non-Today sign-in preference still selects that workflow from `/`.

**School context: switcher, profile and Today.** The workspace switcher answers
"which school am I working in?"; pages never ask the user to pick that school again.
For school administration (Site Admin, registrar) the **School profile** nav item
(`/sites`) opens `/sites/$siteId/profile` directly when the active membership has one
school, and lists schools only when it genuinely spans several. The profile is the
school's stable record — identity, address, contact, programs with authoritative
enrollment, and links to the workflows that own each part (school setup, school years,
website). Every active school member may open the profile and reads the same facts.
It edits nothing in place, shows no placeholder figures, and hides management links the
viewer is not granted (school setup and school years need registrar authority; website
publishing needs its own publisher grant). **Site Today**
(`/sites/$siteId`) is the daily operating view: a drill-in from Home, highlighted as Home
in the sidebar, never a second navigation destination for administration roles.

**Sidebar collapse.** The desktop collapse/expand control is the first element in the
sidebar brand bar (far left, before the wordmark), labelled "Collapse navigation" /
"Expand navigation" with `aria-expanded`. Collapsed navigation keeps every destination
as an icon link with an accessible name and tooltip. The choice is a presentation-only
`localStorage` preference restored after hydration. On mobile the left-most top-bar
button opens the navigation drawer. Sidebars and navigation drawers contain navigation
only; the top-bar workspace switcher is the single shell surface for active role and
school context.

**Page header actions.** The header lays out title → subtitle → actions. A module's
principal creation entry point is `CreateAction` (`create-action.tsx`): one large blue
button with a plus icon, wrapping a `Link` to a dedicated create page. Other header
links use `secondaryActionClassName` (outline); never style them as primary. One
`CreateAction` per page.

**Primary-action restraint.** Blue (`bg-primary`) is for at most one or two decisive
commands per page, normally the `CreateAction` and a form's submit. Repeated per-item
commands in lists and feeds ("Mark as read", "Book", "Add period") use `outline` or
`ghost`, never the default variant.

**Dedicated create pages.** Creation happens on its own route (for example
`/operations/school-years/new`, `/groups/new`), never as a form embedded
above or beside the directory. Use a non-nested TanStack route
(`<list>_.new.tsx`) so the list layout does not wrap the form. Compose the form from
`FormSection` (titled `<section>` per group of related fields, two-column field grid
from `sm`) and `FormActions` (submit first, then Cancel as a quiet link back to the list
with the same scope search). Guard dirty forms with `useUnsavedChangesGuard`; after a
confirmed save, call its `release()` and navigate to the saved record (list anchor or
detail route). Pages that cannot create explain why with a notice instead of a disabled
form. All live in `form-page.tsx`; see `form-page.stories.tsx`.

**Record sections.** A record page (for example My School, a school year) leads with the
record's identity as the H1, then `DetailNavigation` for its sections, held in a `tab`
search parameter. Each tab is a `SectionTab` (`workspace-panel.tsx`) with an explicit
`current` flag and typed `link` options; it forces exact route matching, because the
router's default partial search match would also mark a tab without search params
("Overview") as current on every tab. Exactly one tab is current — see
`section-tabs.stories.tsx`. The Overview tab shows bounded previews (three items per
section, or summary cards of value + label linking to the owning tab) with "View all N
…" links; long lists in a tab are grouped (for example by month in `<details>`).

**Counted copy.** Counts agree with their number: "1 term", "3 classes", "1 lesson
has". Use `plural()` and `agree()` from `@/lib/format`; never write "class(es)" or
"item(s)".

**Directory to record.** When a list selects a record through the URL, render the record
first: a scoped "All applications"-style return link (preserving filters, stage and page)
and the record heading with `tabIndex={-1}`, focused on selection. Do not render the
directory overview above the selected record. Below `sm`, directories use stacked rows
(identity, status, context, next action) instead of compressed tables; tables return at
`sm` and up.

Enforcement (`npm run lint`):

- `can-os-design/no-raw-page-structure` (error) — `<main>`/`<h1>` only in the primitives, public signed-out pages (`index`, `access.verify`, `church.apply`, `family.join`, `schools.new`) and stories.
- `can-os-design/no-arbitrary-type-values` (error) — no `text-[…]` sizes, `tracking-[…]` or numeric `leading-[…]`; use tokens.
- `can-os-design/no-brand-prefixed-labels` (error) — no "CAN OS ·" label prefixes.
- `can-os-design/section-tabs-only` (error) — links inside `DetailNavigation` render through `SectionTab`.
- `can-os-design/no-repeated-primary` (error) — no default-variant `Button` rendered per item inside `.map()`; an inline edit `<form>` within the item is exempt.
- `can-os-design/no-parenthetical-plurals` (error, all of `src` except tests) — no "(s)"/"(es)" copy; use `plural()`/`agree()`.
- `scripts/check-design-system.mjs` — the layout tokens exist and the shell reads `--topbar-height`, `--page-gutter` and `.can-shell`.
- `tests/unit/workspace-navigation.test.ts` — Home is first for every role, and exactly one link is `aria-current`.
- `src/components/shell/ShellAlignment.stories.tsx` (`npm run test:storybook`) — measures that the sidebar divider equals the top bar bottom, and that the switcher and H1 left edges are equal on standard, wide, Home and demo-notice pages. `CollapsibleSidebar` asserts the far-left toggle, the 4.5rem collapsed column and the H1 position in both states.

## 3. Implementation-ready page templates

| Pattern | Use cases | Code / stories |
| --- | --- | --- |
| Role Dashboard | Student, teacher, family, site leader, registrar, CAN HQ | `DashboardLayout`, `DashboardPanel`, `DashboardShortcut`, `DashboardProgress`, `DashboardTimeline`, `DashboardPreviewList`, `DashboardMediaTile`; `dashboard-layout.stories.tsx`, `dashboard-widgets.stories.tsx` |
| Directory | Sites, staff, students, applications, programs, classrooms | `DirectoryTable`, `EntityCard`; `record-layout.stories.tsx` |
| Master/detail Explorer | Admissions and action triage without deeply buried selected record | `MasterDetailWorkspace`, `MasterDetailListItem`; `master-detail-workspace.stories.tsx` |
| Entity Record | Selected student, applicant, site, teacher, action, program | `RecordHeader`, `RecordLayout`, `DetailNavigation`; `record-layout.stories.tsx` |
| User / Business Workflow | Admissions, enrollment, approvals, school setup, opening, staffing | `WorkflowWorkspace`, `WorkflowProgress`; `workflow-workspace.stories.tsx` |
| Process / User Flow Map | Cross-persona handoffs, decisions, conditional branches, exception paths, business-process documentation | `UserFlowMap`; `user-flow-map.stories.tsx` |
| Step-based Setup | Application, site config, jurisdiction details, school year | `GuidedSetupShell`, `Field`, `Button` |
| Dedicated create page | Create school year, create study group, other "New …" commands | `FormSection`, `FormActions`, `useUnsavedChangesGuard`; `form-page.stories.tsx` |
| Split Review | Registrar intake, evidence review, publication approvals | `SplitReviewShell`, `StatusBadge`, `ActionDialog` |
| Checklist/Readiness | Program launch, institutional approval, evidence gaps | `PrerequisiteChecklist`, approved-domain requirement DTOs |
| Async / failure | Loading, no results, forbidden, retry, saved-but-refresh-failed | `QueryState`, `EmptyState`, `WorkspaceNotice`, `MutationFeedback` |

### Template: role dashboard

- Editorial wallpaper displays a campaign, a verse, or an evergreen message.
- Four or fewer meaningful quick actions below/overlap wallpaper, with real destinations and named labels.
- Primary column: **resume or act**, then bounded queues and details.
- Context rail: calendar, next events, approved announcements, recent activity.
- Bottom: community, programs, resources, long-tail discovery.
- At mobile widths, stack primary before context rail; keep CTAs reachable.
- No fixture grades or simulated availability, attendance, opening authorization, or statistical improvement.

### Template: record / applicant detail

- On navigation from a directory, record identity, status and next action must be in the initial viewport.
- Preserve scope, filters and return position in URL state.
- Tabs represent *different aspects of one record*, not separate independently created records hidden below dashboards.
- In master/detail, set `mobileMode="detail"` when the route URL selects a record, so its details appear immediately instead of being buried under the queue. Set `mobileMode="list"` when no record is selected.
- Attach evidence, activity history, reviewer and audit context only from authorized DTOs.
- Unrelated creation panels belong on create routes or dedicated dialogs, never above the selected record.

### Template: user flow / process diagram

- Label **actor, trigger, task, decision, exit, success, failure and owner**.
- Use ordered stages for understandable responsive rendering; decision branches and exception paths require explicit destinations in domain flow specs.
- Treat `UserFlowMap` as visualization/documentation, not state orchestration.
- The owning service remains responsible for available transitions, capability checks, evidence, audit and idempotency.
- Use `WorkflowWorkspace` for an *actual task*; `UserFlowMap` to explain an *end-to-end process*.

### Template: guided setup / review

- Do not equate *configured* with *authorized*, *published* with *approved to open*, or *accepted offer* with *enrolled*.
- Show current stage, blocking prerequisites, owner and actionable next step.
- Never make a fake approval button: present it only from actual server-granted capability.
- Retain drafts, validation state, save/retry/reconciliation, and an audit trail. No duplicated command on failed refresh.

## 4. Editorial Canvas contract

The base `DailyCanvas` supports audience, campaign label, headline, supporting text, verse, image, schedule, priority and primary/secondary actions. The resolver has stable audience/default precedence. Every role dashboard may use this shared presentation.

**Not yet included:** Approved image asset registry, institutional editor, rights tracking, role/site/network publishing control, scheduling database, review approvals, historical revisions, delivery auditing and cache-invalidation strategy. These require an explicit authorized product slice; do not mistake local fallback campaigns for a production campaign CMS.

**Operational exception:** Safety and closure notices must derive from the canonical safety/operations service and remain prominent, separately accessible and unblocked by editorial scheduling. Site Today currently shows its actual operating decision above the wallpaper. It is not permissible to bury site-opening blocks beneath promotion art.

## 5. States, responsiveness and a11y

Every component and page must show: initial, loading, empty, error, forbidden, read-only, actionable, pending, validation error, successfully completed, saved-but-refresh-failed. Applicable components also need destructive confirmation and restored-focus state.

- Keyboard: native controls and semantic anchors, logical order, visible 2px ring.
- Accessibility: WCAG 2.2 AA as a minimum; accessible names, contrast, semantic tables, real form labels, non-color indicators, 200% zoom, 390px and 1440px comparisons.
- Reduced motion respects preferences; no unnecessary hero animation or visual noise.
- Background artwork requires sufficient contrast with all overlaid text, mobile focal crop and a readable fallback.
- Dense tables scroll within a labeled region and preserve sort/filter state.
- Do not surface sensitive student-family data to viewers outside verified relationships and scope.

## 6. Operational rules for adoption

1. **Do not copy UI code into a route** to change its look. Add or extend a variant in `src/components/ui`, `workspace`, or `workflow`.
2. **Do not create a new state store** to support a page pattern. Use existing TanStack server functions, Query, route loaders and URL state.
3. **Preserve institutional semantics:** one source of truth for identity, grants, admissions, programs, evidence, safety, audits and school opening.
4. **One component change must cascade.** Verify a site, student, family and registrar screen whenever changing tokens or workspace foundations.
5. **Every reusable component gets a Storybook story** showing representative states and at least one accessible interaction.
6. **No decorative color** for neutral metrics. Use icon + label for genuine attention, success or danger.

## 7. Storybook reference catalog

Launch with `npm run storybook`.

- **V6.1 foundations / Visual grammar** — fonts, palette, no-radius surfaces, actions, statuses and metrics.
- **V6.1 templates / Role dashboards** — student and site leader compositions, wallpaper, shortcuts, panels and context rail.
- **V6.1 templates / Directories and records** — site portfolio and dedicated applicant detail.
- **V6.1 templates / Master detail explorer** — application review queue with first-viewport details and URL-backed selection.
- **V6.1 templates / Dashboard widgets** — lessons/progress, assignments preview, class timeline, editorial tiles, and missing-data behavior.
- **V6.1 templates / User and workflow flows** — admissions and school launch workspaces.
- **V6.1 templates / Process and user-flow maps** — cross-role school launch and student assignment journey.
- **Foundations / Dedicated form page** — `FormSection` groups and the `FormActions` submit/cancel footer, with play tests.
- Existing **Foundations**, **Workflows**, **Persona layouts** and **Student/Daily canvas** — retained production components and regression examples.

## 8. Required validation before merge

Run from a checked-out branch using pinned package-lock:

```bash
npm ci
npm run typecheck
npm run lint
npm test
npm run build
npm run build-storybook
npm run test:storybook
```

Inspect representative screenshots at 390, 768, 1024 and 1440 pixels; compare approved V6.1 screenshot for visual quality. Include browser tests of Student, Guardian, Teacher, Site Leader, Registrar, Network Admin and Demo Switcher. No merge on failing design regressions.

### Local integration evidence (2026-11-03)

Applied PR #265 at `e383c4aef095a021f167c18de6650f886f5019e7` to the
uncommitted local worktree based on `98750e55088ba345809b9d219966a701eb028b38`,
preserving unrelated existing edits. No commit, remote merge, migration or
business-data write was performed.

| Check | Local result |
| --- | --- |
| `npm run typecheck` | Passed |
| `npm test -- --maxWorkers=2` | 520 files, 3,527 tests passed; the earlier concurrent run timed out in event-registry, which also passed on isolated retry |
| `npm run build`, `npm run build-storybook` | Passed |
| `npm run lint` | Passed with warnings, zero errors |
| Route contracts and shared component inventory | 113/113 routes, zero issues; 234 component files checked |
| Targeted V6.1 Chromium interaction/axe stories | 23 tests passed across eight files |
| Additional 390 x 844 interaction/axe run | 17 tests passed, including disabled document controls and light/dark/site editorial actions |
| Built-template viewport checks | 96 checks passed: eight templates at 390/768/1024/1440 px in light/dark/site themes; loaded DM Sans, no page overflow, flex cards and mobile selected-record visibility |
| Local `/access` browser check | HTTP 200; rendered controls use DM Sans and zero radius |
| Full Storybook suite, initial run | 114 passed, four failed in unchanged stories: guardian application error wording, evidence review error wording, and two top-bar stories lacking router context |

Follow-up: all four Storybook blockers are resolved. Error stories now assert
the existing sanitized fallback messages and retained drafts instead of raw
exception diagnostics. Top-bar stories use an in-memory TanStack router.
The demo-information notice has a keyboard-operable X button; closing it
restores focus to the workspace switcher without hiding session errors.

- Full Chromium Storybook interaction/axe suite: **31 files, 121 tests passed**.
- Focused mobile browser checks at 390 x 844: **24 tests passed**, including
  keyboard dismissal, demo-school dismissal with a session error still visible,
  and redisplay after changing demo workspace.
- Shared notice/design unit checks: **27 tests passed**.
- Typecheck, focused ESLint, application build, Storybook build, route contracts
  and component inventory: **passed**.

The local Storybook gate is now **green**. Authenticated per-role journeys,
screen-reader review, 200% zoom, approved-reference visual comparison and
Chromatic approval remain **unverified**. This evidence does not authorize a
production release or certify product-wide route migration.

### Navigation and data table reuse (November 20, 2026)

**Related destinations** compose `WorkspaceLinkNavigation` with an explicit
accessible label. **Selected route sections** compose `DetailNavigation`
with `SectionTab` and one explicit `current` selection. A feature remains
responsible for authorization, route parameters and search state. It should
not duplicate the shared nav geometry or create a second selection model.
A record's main views and its inner sections may be separate labeled
navigation regions, as in the unified Class workspace.

**Tabular data** use `ui/Table`, `TableCaption`, `TableHeader`,
`TableBody`, `TableRow`, `TableHead`, `TableRowHead` and `TableCell`.
`DirectoryTable` remains the higher-level pattern when sorting,
selection, row actions and pagination apply. Complex keyboard-operated
grids such as the teacher gradebook retain their domain interactions
while reusing semantic table primitives and a labeled focusable scroll
region. Do not replace evidence/report tables with `DirectoryTable`
solely to achieve visual consistency.

Verification source, Storybook interaction cases, viewport matrix,
and outstanding authenticated visual approval are tracked in
`docs/verification/v61-navigation-table-acceptance-20261120.md`.
These are not a claim that fresh branch screenshot approval has passed.

## 9. Scope boundaries

This PR provides the **complete shared design foundation and reusable implementation templates**, not a claim that every route has been migrated. Product-wide route migration must proceed through the checklist in `docs/design-system-v6-1-migration.md`, with business flows owned by their existing services.

Avoid representing the cross-route template inventory as completed functionality. See `docs/design-system.md` for existing component architecture and the original source-of-truth conventions.

## Canonical multi-step and selectable-card contract (November 21, 2026)

Internal guided workflows use `GuidedSetupShell` and its `GuidedSetupProgress`
presentation for two, four, six or other step counts. The hosting page,
Program interests, website branding, and Marketing Package flows must not
create local button-based step rows. The global Launch Studio journey sidebar
is a **different navigation level** and retains its own navigation semantics.

All single- and multiple-choice **cards** use `SelectionCard` from
`src/components/workspace/selection-card.tsx`, with `kind="radio"` for one
choice and `kind="checkbox"` for multiple choices. Layout, marker placement,
selected/neutral/disabled surfaces, focus and typography are owned by that
component. Feature modules provide only title, supporting detail, optional
illustration, selection state and authorized change handlers. `compact`
affects density, not the underlying layout. Inactive-but-previously-selected
choices must still be visible, with their authorization restrictions and a
separately guarded removal operation where permitted.

This applies to Site Information, Programs & Audiences, Brand Identity,
website wireframes, visual identity palettes, published Solution selection,
school-model selection, enrollment lab audience selection and pickup
authorization choices. Normal tab/view/preview toggles and record lists are
not form choice cards and must not be converted merely because they use
`aria-pressed`.

`can-os-design/no-custom-guided-selections` now errors on ad hoc
internal-step buttons and card-like pressed buttons in production JSX.
Its unit tests distinguish proper global journey navigation and
small toolbar toggles. Shared card state examples are maintained in
`selection-card.stories.tsx` and two-, four-, and six-step progress examples
are maintained in `LaunchV61StepNavigation.stories.tsx`.

Verification requires **all** of source/lint, TypeScript, focused
unit/Storybook interaction tests, and visual inspection on desktop/mobile
(including active, disabled, checked, keyboard focus and overflow states).
A green source/lint result alone is not a completed visual audit.

## Governed selection patterns and Storybook review

Use `SelectionCard` for choices requiring explanatory context (its compact variant for secondary choices), `SelectionChip` standard for curated topics, and compact for dense taxonomies. Chips are controlled toggles with native Button focus and aria-pressed; the feature owns limits, validation and persistence. Use Checkbox/Radio for conventional form choices and StatusBadge for noninteractive status. Do not recreate chip styling in feature pages.

Compact chips use square corners, 28px minimum height, 12px text, 8px horizontal padding and 6px group gaps. Standard chips use 36px minimum height and 14px text. Both use semantic tokens and reserve selection-icon space to avoid layout shifts. Storybook: Workspace / Selection Chip and Workspace / Selection Patterns. Launch Studio / Shape / Audiences uses the production AudienceIntentFieldsV61 component with offline fixtures, not a replica of its field markup. Navigation and writes are disabled in that review harness.

Review light, dark and validated Site brand themes at 390, 768, 1024 and 1440px. Capture empty, typical, dense, disabled and error states where relevant. Run npm run build-storybook, npm run test:storybook and npm run design:inventory; use the existing npm run test:visual when Chromatic is configured. A committed story is not proof of a passing test or accepted visual baseline. New page stories must compose production presentation components with deterministic fixtures and must not call live Site services.

## Governed data visualization foundation (V6.1)

Data visualization is a shared application-pattern capability under `src/components/workspace/`, not a parallel theme or a feature-specific chart library. `ReportChart`, `ReportDocumentView`, `ReportMetricComparison` and `ReportDateFilter` are the public presentation contracts; Recharts is private to `report-chart-plot.tsx`. No direct library or adapter imports in feature code.

- Neutral analytical marks use `--report-series-1..4` in the canonical light/dark theme. All four marks contrast at least 3:1 against both canvas and card, and categorical charts distinguish solid, diagonal, dot and crosshatch textures plus textual legends and full tables. Site branding never changes analytical series identity or assigns operational status. Series positions are stable for the supplied ordered categories; use the same ordered metric IDs for repeated comparisons.
- The single neutral series is for bars, trends and nested stage comparisons. Stacks and donuts require reconciled disjoint categories. Funnel stage bars require source-proven nesting. No gradient, decorative status color, animation, inferred conversion or missing-value imputation. Percent plots use a fixed 0–100 scale; compact axis labels never replace exact formatted values.
- Reuse DashboardPanel editorial headings (Instrument Serif), DM Sans axes and values, square marks/panels, shared EmptyState/WorkspaceNotice/QueryState, Table, and a single read-only tooltip surface. The plot adapts to measured container width; duplicate display names retain distinct IDs. Tooltip/plot are supplementary pointer visuals. Legends, source explanations and exact tables remain available without pointer or chart JavaScript. Missing values and measured zeros stay distinct.
- Interactive views retain the accessible table if plot loading/rendering fails. Print presentation and browser print use tables rather than relying on a color/SVG rendering or lazy module. Print review does not issue a PDF, snapshot or publication approval. No client-side learner detail or authorization change.
- Storybook: **V6.1 foundations / Data Visualization / Charts**, **Period comparison**, and **V6.1 templates / Reporting / Impact review**. Review at 390, 768, 1024, 1440px in light, dark and validated Site themes, including four-series texture, dense, missing, zero, empty, invalid, long-label, large-number and print cases. Actual browser/visual acceptance is required; the existence of a story is not acceptance. Sequential color scales are deferred until an actual governed heatmap or choropleth contract exists; do not repurpose category colors as magnitude gradients.

Nested dark theme scopes explicitly resolve analytical axis, grid, separator and hover aliases against their active semantic tokens. Print scopes use the canonical light reading palette and allow long tables to paginate with repeated headers. Explicit print review includes metric definitions expanded. Browser print of an interactive view is not a substitute for the explicit print review or a disclosure-approved report artifact.

### Analytical contracts and reusable presentation

- Use `report-value-format.ts` for report numbers. Counts require nonnegative safe integers; percentages are 0–100; USD values are dollars (not cents); hours, minutes and ratio values retain source units. Compact notation is plot-only. Invalid/unavailable values are not zero. Percentage-point changes and relative changes are different; a zero prior denominator has no relative change.
- Categorical charts can declare a complete, stable `seriesOrder` family (up to four IDs), retaining reserved slots across filtering/reordering. Unknown or duplicate family identities fail validation. Unconfigured legacy charts retain positional styling; do not claim cross-chart stability without an explicit family. Numeric comparison charts may declare a common `axisMax` only when it cannot clip any authorized mark; percentage axes always use 0–100.
- `ReportMetricCard` composes StatCard and accepts source-provided freshness and exact metric definition metadata. `ReportTargetAttainment` composes DashboardProgress with neutral analytical ink; actual attainment can exceed 100%, but the visual bar is capped and labeled. `ReportRankedComparison` composes DashboardPanel, Table and Button, preserves unavailable values, uses one shared scale and emits only IDs from its supplied bounded authorized rows.
- Provider Site comparison filters the same already-authorized cohort rows, cards and chart. It does not navigate or acquire additional permission. An unavailable prior selection no longer silently broadens the report. Cross-organization drilldown still requires an independently authorized reader and source-defined dimensions. Never compute distinct-person totals by adding Site aggregates.
- Storybook: V6.1 foundations / Data Visualization / Analytical components, Reserved series slots and Fixed shared axis. Browser and screenshot acceptance remain mandatory.
