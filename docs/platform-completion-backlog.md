# Phase 1 → 2 → 3 execution backlog

Phase 0 release stabilization and Phase 4 release hardening are intentionally scheduled after Phases 1–3. Security checks protecting authentic data remain mandatory throughout.

## Phase 1 — platform convergence

- [x] Establish integration/capability/route inventory baseline.
- [x] Stop using URL/localStorage demo persona as the application navigation authority.
- [ ] Rename DemoNavigation and remove stale demo persona helper/tests once migrated.
- [ ] Introduce verified active-account/site/program/child context shared across routes.
- [ ] Replace synthetic-only operations queries/actions with canonical Action services; remove hard-coded person IDs.
- [ ] Consolidate live and demo student components and reads.
- [ ] Remove or protect `/demo-health`; migrate diagnostics to staff-only operations.
- [ ] Replace showcase home with appropriate authenticated start route.
- [ ] Unify notification center and remove guardian→student notification route shortcut.
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
