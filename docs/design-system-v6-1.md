# CAN OS V6.1 — Complete Product Design System

**Status:** Approved visual direction; shared implementation kit in PR #265  
**Visual authority:** V6.1 refined student dashboard (after V5 typography restoration).  
**Implementation authority:** This repository's shared React/Tailwind components and Storybook.  
**Scope:** All CAN OS personas, modules, dashboards, user flows, record pages, school launch and operational workflows.

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

## 3. Implementation-ready page templates

| Pattern | Use cases | Code / stories |
| --- | --- | --- |
| Role Dashboard | Student, teacher, family, site leader, registrar, CAN HQ | `DashboardLayout`, `DashboardPanel`, `DashboardShortcut`, `DashboardProgress`, `DashboardTimeline`, `DashboardPreviewList`, `DashboardMediaTile`; `dashboard-layout.stories.tsx`, `dashboard-widgets.stories.tsx` |
| Directory | Sites, staff, students, applications, programs, classrooms | `DirectoryTable` (`presentation="standard" \| "banded"`), `EntityCard`; `directory-table.stories.tsx`, `record-layout.stories.tsx` |
| Master/detail Explorer | Admissions and action triage without deeply buried selected record | `MasterDetailWorkspace`, `MasterDetailListItem`; `master-detail-workspace.stories.tsx` |
| Person / Student Profile | Student 360, teacher/member profile, staff counseling record | `ProfileIdentity`, `ProfileMetricBand`, `ProfileRecordLayout`, `profileTabClass`; `ProfileRecordLayout.stories.tsx` |
| Entity Record | Selected student, applicant, site, teacher, action, program | `RecordHeader`, `RecordLayout`, `DetailNavigation`; `record-layout.stories.tsx` |
| User / Business Workflow | Admissions, enrollment, approvals, school setup, opening, staffing | `WorkflowWorkspace`, `WorkflowProgress`; `workflow-workspace.stories.tsx` |
| Process / User Flow Map | Cross-persona handoffs, decisions, conditional branches, exception paths, business-process documentation | `UserFlowMap`; `user-flow-map.stories.tsx` |
| Step-based Setup | Application, site config, jurisdiction details, school year | `GuidedSetupShell`, `Field`, `Button` |
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

### Template: banded directory

Use `DirectoryTable presentation="banded"` for class lists, rosters, staff, programs, or other collections where repeating a full card for each record wastes space. The wide (roughly 64–72px) horizontal bands use neutral alternating surface tones, substantial vertical padding, strong separators, meaningful secondary labels, and actual row-specific links. Optional `selectedRowKey` highlights the current record without changing its permissions. Sorting, pagination, query states, and labeled table scroll remain owned by the existing `DirectoryTable`.

Use `presentation="standard"` for compact tables with many columns; use `EntityCard` for visual content with distinct actions; use `MasterDetailWorkspace` for operational queues where the selected record is part of the same task surface. **Do not tint each row with arbitrary status color.** Put a labeled `StatusBadge` in the appropriate cell only when the source record warrants it.

### Template: student and people profiles

The approved profile screenshot establishes **one identity-first card**, with photo, school/grade or staff context, genuinely reviewable status, and a compact four-column metric band. Below it: a URL-backed section navigation strip and a two-column content layout with meetings, related links, and next actions on the right.

- Canonical React primitives: `src/components/profiles/ProfileRecordLayout.tsx` (`ProfileIdentity`, `ProfileMetricBand`, `ProfileRecordLayout`, `profileTabClass`).
- First implementations: `/staff/students/$personId` (Student 360) and `/profiles` (person, teacher, school-connected member). Staff student directory uses `DirectoryTable presentation="banded"`.
- Student 360 sections: About, Academics, Courses, Activity, Attendance, Support & priorities, Family. These are backed by the current authorized `getStudent360` data.
- Right rail: calendar and staff inbox links, actual record context, and contextual actions when authorized. **Meeting bookings are not present in the current student-360 DTO, so the page does not fabricate meetings or display pretend appointment times.**
- No GPA, credits, transcript, counselor assignment, graduation-track percentage, pathways, application/enrollment state, private interventions, or feedback scores unless the specific authoritative services provide them with appropriate role and relationship checks. Add these as separately gated tabs/sections in a later read-model expansion.
- Preserve every existing staff authorization boundary: teacher sees only students/sections they teach; support/counselor site scope; no medical/discipline/private note exposure through the profile route.
- Keep operational detail and evidence in owning workflows; profiles aggregate **authorized read views**, not new approval or mutation commands.
- At mobile widths stack content ahead of the contextual rail, make the tab strip scrollable, and avoid a duplicate page title.

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
- **V6.1 templates / Person and student profiles** — student counselor, teacher and minimal person profile reference designs.
- **V6.1 templates / Master detail explorer** — application review queue with first-viewport details and URL-backed selection.
- **V6.1 templates / Dashboard widgets** — lessons/progress, assignments preview, class timeline, editorial tiles, and missing-data behavior.
- **V6.1 templates / User and workflow flows** — admissions and school launch workspaces.
- **V6.1 templates / Process and user-flow maps** — cross-role school launch and student assignment journey.
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

## 9. Scope boundaries

This PR provides the **complete shared design foundation and reusable implementation templates**, not a claim that every route has been migrated. Product-wide route migration must proceed through the checklist in `docs/design-system-v6-1-migration.md`, with business flows owned by their existing services.

Avoid representing the cross-route template inventory as completed functionality. See `docs/design-system.md` for existing component architecture and the original source-of-truth conventions.
