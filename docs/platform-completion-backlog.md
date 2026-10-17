# Phase 1 → 2 → 3 execution backlog

Phase 0 release stabilization and Phase 4 release hardening are intentionally scheduled after Phases 1–3. Security checks protecting authentic data remain mandatory throughout.

## Phase 1 — platform convergence

- [x] Establish integration/capability/route inventory baseline.
- [x] Stop using URL/localStorage demo persona as the application navigation authority.
- [ ] Rename DemoNavigation and remove stale demo persona helper/tests once migrated.
- [x] Select active membership by verified grant ID (supports multiple grants with same role).
- [ ] Introduce verified active-account/site/program/child context shared across all routes.
- [x] Switch the operations workspace to canonical scoped Action listing and state changes; add authorization-checked assignee command without hard-coded IDs.
- [ ] Consolidate duplicate legacy operations service and migrate remaining consumers before deleting it; add complete action transition tests.
- [x] Remove local-only StudentQuickWins from active experiences route and require canonical Student Today input (no fallback sample student).
- [ ] Replace synthetic-gated quick-win and experience mutations with canonical student/support/calendar commands, maintaining verified authorization.
- [x] Remove `/demo-health` from the application routes; retain fixture diagnostics only in test tooling.
- [x] Replace showcase home with session-based workspace redirection.
- [x] Remove synthetic metadata dependency from recipient-scoped notification deep-link resolution.
- [ ] Unify notification center routes and remove guardian→student notification route shortcut.
- [ ] Remove local-only demo interactions from StudentExperience, not merely its fallback dataset.
- [ ] Verify typecheck, build, unit tests and role-switch browser journeys before closing Phase 1.
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
