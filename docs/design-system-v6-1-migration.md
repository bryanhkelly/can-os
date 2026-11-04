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

- [ ] Compose `DashboardLayout` around current authorized Student Today DTO.
- [ ] Make wallpaper immersive at top of dashboard; personalized greeting; Scripture/campaign from approved editorial service.
- [ ] Add bounded quick actions: Continue Learning, Assignments, Schedule, School Life.
- [ ] Add resume-course panel with **real** published/allowed next lesson, progress and availability.
- [ ] Upcoming assignments: actual due date (site timezone), completion state, last saved state and deep link.
- [ ] Released grades only: honor grading policies, privacy and review gates; avoid synthetic trends.
- [ ] Right rail: interactive timetable, calendar and approved announcements, with accessible mobile stacking.
- [ ] School Life: published club, chapel, service and enrichment stories with approved image rights.
- [ ] Validate SSR loading, empty course, no upcoming assignment, unpublished grades, permission failure, small mobile.

## 3. Teacher and family dashboard
**Teacher:**
- [ ] Preserve teacher's section scope and grading services.
- [ ] Use role-specific wallpaper and quick links to Classes, Grading, Messages and Schedule.
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

## 5A. Student, teacher and member profiles — identity-first standard
- [x] Add shared profile identity header, compact metric band, section navigation, context rail.
- [x] Migrate staff student 360 and person profile to the shared presentation.
- [x] Preserve existing Student 360: finalized grades, attendance events, activity, open actions, referrals, insights, and guardians.
- [x] Add student Courses section and authoritative About summary; remove unneeded dashboard cards above record.
- [x] Convert staff student search to canonical banded table.
- [x] Add Storybook student counselor, teacher, and minimal profile templates, plus profile hierarchy unit tests.
- [ ] Integrate canonical meeting/session read projections when authorized source DTOs exist, with scheduling/communication gates.
- [ ] Build or reuse canonical GPA, earned credits, graduation pathway, transcript and enrollment read models when vetted by academic owners; do not calculate placeholders from incomplete sections.
- [ ] Add approved counseling interventions and private education support info with explicit case-access grants; preserve FERPA scoping.
- [ ] Extend to guardian child profiles, teacher personnel detail and site-leader people views after confirming distinct access scopes.
- [ ] Validate real route at 390, 768, 1024 and 1440 px with actual student data, tab deep links and accessible keyboard flows.

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
