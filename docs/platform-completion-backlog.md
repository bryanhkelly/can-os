# Phase 1 → 2 → 3 execution backlog

Phase 0 release stabilization and Phase 4 release hardening are intentionally scheduled after Phases 1–3. Security checks protecting authentic data remain mandatory throughout.

## Phase 1 — platform convergence

- [x] Establish integration/capability/route inventory baseline.
- [x] Stop using URL/localStorage demo persona as the application navigation authority.
- [x] Replace DemoNavigation with WorkspaceNavigation and canonical route registry; migrate command palette and route tests from browser-local demo persona; delete obsolete component/tests.
- [x] Select active membership by verified grant ID (supports multiple grants with same role).
- [x] Expose active grant organization/site/program scopes from verified session endpoint to the workspace shell.
- [x] Add family-home child-specific deep links to academics and report cards; resolve requested child from the guardian's authorized roster, ignoring unauthorized IDs, with unit tests.
- [x] Show server-resolved site names and authorized program deep links in the workspace shell; do not treat UI selection as an authorization claim.
- [x] Wire site/program selectors into the operations Action queue and live readiness summary, validating both against the server-issued grant and program/site relationship.
- [x] Expand organization-wide grants to their owned sites without broadening site-specific grants.
- [x] Add child-specific attendance links from the family dashboard and resolve guardian attendance through relationship-scoped server queries.
- [x] Replace fixture-only attendance write gates for staff marking, guardian excuse submission, and staff review with verified role, roster, program/site and guardian relationship authorization at the relevant service boundaries.
- [x] Restrict active academic roster, guardian assignments and office-hour child eligibility to verified program IDs, in addition to site membership.
- [x] Resolve program and site selections as one server-authorized pair, and apply the selection to the canonical operations Action queue, launch readiness, registrar admissions list and family readiness.
- [x] Carry verified child context from guardian cards through attendance and admission-offer views.
- [x] Converge admissions seat-pool capacity reads/updates across authentic and fixture records, preserving occupied and held-seat protections.
- [ ] Review any remaining program/site selection requirements in insights, capacity and other retained operational pages.
- [x] Switch the operations workspace to canonical scoped Action listing and state changes; add authorization-checked assignee command without hard-coded IDs.
- [x] Delete legacy synthetic-only operations service after replacing its route consumer.
- [x] Connect staff Action assignment UI to authorized per-site assignee directory and existing audited assignment command; exclude student/guardian grants from operational assignees.
- [ ] Add integration tests for canonical action transitions, assignment and authorization (deferred by request).
- [x] Restrict owned student Action completion to known student workflow types and emit ActionResolved event.
- [x] Restrict student-owned Action completion to student grants and active program membership; write ActionCreated for student support requests and ActionResolved on completion.
- [x] Emit canonical ActionCreated/ActionResolved for authenticated missing-work follow-ups, support referrals, coach outreach and referral closure.
- [ ] Verify Action lifecycle event parity and cross-role behavior with deferred integration tests.
- [x] Remove local-only StudentQuickWins from active experiences route and require canonical Student Today input (no fallback sample student).
- [x] Remove fixture gating from authenticated student-owned action and display-preference commands.
- [x] Remove simulated calendar-status metadata command from school-experience service.
- [x] Move authorized personal-event creation and teaching-scoped assessment due-date changes off synthetic-only write gates.
- [x] Prevent site/section calendar memberships from revealing personal or explicitly participant-restricted events; bound guardian sections to authorized programs/sites.
- [ ] Build canonical school calendar edit/reschedule/cancel commands with downstream propagation in Phase 2.
- [x] Restrict non-registrar school-experience calendar queries to site-level events, leaving section events to authorized student/teacher read models.
- [x] Require explicit guardian child selection for office-hour booking; check guardian relationship and active enrollment at the appointment's site.
- [x] Repair guardian conference slot series identifiers needed by the reschedule picker; check published series, guardian-child relationship and active class/program enrollment again on reschedule.
- [x] Show only upcoming shared school-experience calendar items; apply Action program filters in Site Today before result limits.
- [ ] Verify calendar visibility and office-hour child/site selection with multi-role tests (deferred).
- [x] Remove `/demo-health` from the application routes; retain fixture diagnostics only in test tooling.
- [x] Replace showcase home with session-based workspace redirection.
- [x] Remove synthetic metadata dependency from recipient-scoped notification deep-link resolution.
- [x] Provide one /notifications route for all authenticated people; redirect the legacy student URL and update guardian/global navigation.
- [x] Move recipient-scoped notifications into communication module and drop synthetic-specific function names and superseded student-only service.
- [x] Redirect teacher-only notices into the canonical notification center and delete duplicate notification handlers.
- [x] Route operational Action notices only when the recipient still owns the Action within the active school and program grant.
- [x] Hide links into student, teacher and guardian screens when another workspace role is active.
- [x] Restrict admissions-offer and study-group notification destinations to active program/site grants and approved group membership, in addition to recipient identity.
- [ ] Audit remaining notification resource categories and target-route guards.
- [x] Complete verified program checks for teacher discussion locking and moderation, not only discussion creation.
- [x] Allow enrolled students to read course discussions independent of fixture metadata; preserve legacy route export until mutation consolidation.
- [x] Converge enrolled-student discussion posting and teacher discussion creation, locking and moderation on records independent of fixture markers; maintain verified section membership and relationship guards.
- [ ] Run deferred integration and authorization testing for discussion lifecycle before production release.
- [x] Replace local-only StudentExperience with canonical read-only student work/schedule/action projection and real workflow deep links.
- [ ] Verify typecheck, build, unit tests and role-switch browser journeys before closing Phase 1 (user deferred, so Phase 1 cannot be marked verified).
- [x] Align fixture manifest after removing `/demo-health` (previously blocked CI at route fixture coverage).
- [x] Capture 58 source route owners and pending read/write/role acceptance fields in docs/platform-route-contracts.json with a source-drift and acceptance checker.
- [ ] Run the route-contract checker and resolve all pending acceptance fields when verification is authorized.
- [x] Remove unconditional synthetic markers from shared domain audits and authenticated session audits.
- [x] Replace demonstration-only messaging write gates after restricting contact discovery to verified site/program relationships and thread participation.
- [x] Remove admissions/family-readiness fixture-only read filtering while leaving sensitive R2 demo-only document operations restricted.
- [x] Converge assigned-teacher gradebook and assessment creation, student missing-work queue and follow-ups, and support-referral/coach actions with verified student-school-program context rather than fixture-only gates.
- [x] Replace the staff support demo persona switch and fictional student with the verified active staff role and a selectable authorized student; provide a separate authenticated student help-request and action screen.
- [x] Constrain site-bound registrar administration to its original grant site rather than expanded organization read scopes: account/people listings, staff invitations and grant toggles; allow only staff roles in the staff invite command and require a school where the active grant is site-bound.
- [x] Replace student assignment role-preview and teacher controls with a student-only coursework, autosave, submission and feedback experience; teacher authoring/grading remains in /teacher/gradebook.
- [x] Accept authentic student assignment written submissions and drafts using verified active enrollment, school/program checks and audited state transitions; resolve missing-work Actions independently of fixture markers.
- [x] Restrict 13 study-group site queries and mutations to the member's permitted program or site-wide groups; retain demo write gates pending group lifecycle review.
- [x] Make teacher group creation select a verified site/program and require an active teaching assignment there; display only scopes projected from actual assigned sections.
- [x] Unblock authenticated student/facilitator study-group READS independently of demo write availability; label gated writes as unavailable rather than failing after click.
- [x] Validate student active enrollment on membership requests, group details, posts, facilitator approvals and session RSVPs; enforce current scope on leaving and linked-child guardian consent.
- [x] Keep study-group session metadata out of broadly visible school, Site Today and month calendar feeds until the calendar supports membership-aware study-group events.
- [ ] Converge remaining study-group membership, moderation, consent and session WRITE lifecycles after verifying school/program record ownership, audit events and guardian safeguards.
- [x] Extend attachment read/upload scoping to authorized programs; keep restricted R2 fixture-only mutation gates until complete document verification and storage review.
- [x] Remove the obsolete fixture-only write restriction from canonical teacher assessment creation, including published roster assignment and audit/domain events.
- [x] Add canonical teacher assessment publication, close, reopen, deadline changes, and latest-graded-attempt returns; expose controls in the authenticated teacher gradebook.
- [x] Connect standalone rubric grading UI to the canonical grading service instead of an alternative synthetic submission grader.
- [x] Tighten calendar month and shared School Experience program filtering, including student/teacher section visibility and teacher due-date changes; emit canonical calendar-change domain events when deadlines move.
- [x] Replace five legacy teacher assignment mutation implementations with compatibility adapters into canonical gradebook grading, rubric grading, creation, deadline/status changes and return-for-revision commands. They now share the same permission, audit and domain-event path.
- [ ] Remove deprecated compatibility export names after confirming no external integrations or tests depend on them.
- [x] Validate insight-created Action owners against an active staff grant at the specific insight school/organization, and notify an assigned owner inside the creation transaction.
- [ ] Complete remaining service-by-service authorization audit; fixture-only gates persist in study-group writes, document uploads and other unreviewed workflows.

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

- [x] Canonicalize authenticated office-hour booking and protect published availability and related section enrollment.

- [x] Guardian upcoming appointments and same-series rescheduling added; cancellation still pending.

- [x] Guardian appointment cancel button visible but disabled until lifecycle implementation.

## Phase 1 completion gate

Do not mark Phase 1 complete or merge its draft branch merely because feature commits exist. In addition to the unchecked items above, validate the route inventory, remaining synthetic-only write boundaries, school/program/child access for every affected server operation, Action lifecycle parity, and notification target permissions. Typecheck, build, multi-role integration and browser acceptance are currently deferred by the user, not waived; completion and production release must not be claimed until that validation is performed.
