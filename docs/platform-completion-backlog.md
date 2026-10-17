# Phase 1 → 2 → 3 execution backlog

Phase 0 release stabilization and Phase 4 release hardening are intentionally scheduled after Phases 1–3. Security checks protecting authentic data remain mandatory throughout.

## Phase 1 — platform convergence

- [x] Establish integration/capability/route inventory baseline.
- [x] Stop using URL/localStorage demo persona as the application navigation authority.
- [x] Replace DemoNavigation with WorkspaceNavigation and canonical route registry; migrate command palette and route tests from browser-local demo persona; delete obsolete component/tests.
- [x] Select active membership by verified grant ID (supports multiple grants with same role).
- [x] Expose active grant organization/site/program scopes from verified session endpoint to the workspace shell.
- [x] Add family-home child-specific deep links to academics and report cards; resolve requested child from the guardian's authorized roster, ignoring unauthorized IDs, with unit tests.
- [ ] Implement consistent site/program and remaining child context across every route, including attendance and admissions; validate downstream route scope on the server.
- [x] Switch the operations workspace to canonical scoped Action listing and state changes; add authorization-checked assignee command without hard-coded IDs.
- [x] Delete legacy synthetic-only operations service after replacing its route consumer.
- [x] Connect staff Action assignment UI to authorized per-site assignee directory and existing audited assignment command.
- [ ] Add integration tests for canonical action transitions, assignment and authorization (deferred by request).
- [x] Restrict owned student Action completion to known student workflow types and emit ActionResolved event.
- [ ] Verify Action owner completion guards and domain-event parity across both school and student workflows.
- [x] Remove local-only StudentQuickWins from active experiences route and require canonical Student Today input (no fallback sample student).
- [x] Remove fixture gating from authenticated student-owned action and display-preference commands.
- [x] Remove simulated calendar-status metadata command from school-experience service.
- [ ] Build canonical school calendar edit/reschedule/cancel commands with downstream propagation in Phase 2.
- [x] Restrict non-registrar school-experience calendar queries to site-level events, leaving section events to authorized student/teacher read models.
- [ ] Verify calendar visibility and office-hour child/site selection with multi-role tests.
- [x] Remove `/demo-health` from the application routes; retain fixture diagnostics only in test tooling.
- [x] Replace showcase home with session-based workspace redirection.
- [x] Remove synthetic metadata dependency from recipient-scoped notification deep-link resolution.
- [x] Provide one /notifications route for all authenticated people; redirect the legacy student URL and update guardian/global navigation.
- [x] Move recipient-scoped notifications into communication module and drop synthetic-specific function names and superseded student-only service.
- [ ] Tighten every resource-specific notification deep-link permission for cross-role data.
- [x] Replace local-only StudentExperience with canonical read-only student work/schedule/action projection and real workflow deep links.
- [ ] Verify typecheck, build, unit tests and role-switch browser journeys before closing Phase 1.
- [x] Align fixture manifest after removing `/demo-health` (previously blocked CI at route fixture coverage).
- [ ] Build machine-verifiable inventory for every route and data-flow acceptance gate.
- [ ] Audit all server functions for verified identity and per-record resource scopes.

## Phase 2 — connected school operation

- [ ] GF23/GF3 site/program/year/staff/section setup through active state.
- [ ] GF22/GF2 inquiry/application/offer/guardian response/activation/student visibility.
- [ ] GF1 learning cycle, missing work, intervention, late submission, grade propagation.
- [ ] GF4 expected attendance, guardian excuse, review, canonical metrics.
- [ ] Cross-persona tests against one shared synthetic school, family and staff dataset, isolated from authentic records.

## Phase 3 — existing feature completion

- [ ] Study group consent, RSVP, calendar cancel/reschedule and moderation.
- [ ] Registration approvals, conflict/prerequisite checks, roster and grade consequences.
- [ ] Teacher/student/guardian/coach/report-card experiences and course discussion.
- [ ] Activities, field trips, conferences, health, incidents, compliance and profiles: consolidate safely and complete applicable lifecycles.
- [ ] Ask CAN Ask/Do/Watch/Manage through the same typed domain APIs.
- [ ] Remove orphaned or redundant screens, services, navigation and state only after replacements pass equivalent tests.

## Deferred but not waived

Return to Phase 0 CI/migrations/release baseline and Phase 4 security/performance/operability certification after functionality convergence. Existing CI failures and unknown production authorization safety remain explicit blockers to any real-data release.
