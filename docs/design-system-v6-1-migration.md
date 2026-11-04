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

## 10. Recommended implementation slices
Each slice should be its own small PR after design-system merge, not one giant UI rewrite.

1. Student home fidelity with real data and editorial wallpaper.
2. Admissions applicant and operations Action first-class record detail.
3. Site portfolio and Site Today operational hierarchy.
4. Teacher and guardian role dashboards.
5. School launch guided flow and readiness.
6. Domain-specific pages, reporting, School Life and editorial publishing.

**Definition of system-ready:** all shared contracts, tokens, stories, tests and migration guides are present and CI is green. **Definition of product-migrated:** individual real routes pass the ten acceptance conditions above; the former does not imply the latter.
