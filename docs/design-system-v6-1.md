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
website). It edits nothing in place, shows no placeholder figures, and hides links the
viewer is not granted (website publishing needs its own publisher grant). **Site Today**
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
`/operations/school-years/new`, `/student/study-groups/new`), never as a form embedded
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

## 9. Scope boundaries

This PR provides the **complete shared design foundation and reusable implementation templates**, not a claim that every route has been migrated. Product-wide route migration must proceed through the checklist in `docs/design-system-v6-1-migration.md`, with business flows owned by their existing services.

Avoid representing the cross-route template inventory as completed functionality. See `docs/design-system.md` for existing component architecture and the original source-of-truth conventions.
