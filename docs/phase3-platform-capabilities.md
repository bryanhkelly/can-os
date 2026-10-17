# Phase 3 — Platform capabilities (independent development)

> Draft integration work only. This branch is based on `phase1/platform-convergence-foundation`, with a draft PR targeted at Phase 1. Neither Phase 1 nor Phase 3 is verified or approved for merging. CI, tests and browser acceptance are deferred by request, not waived.

## Ownership and dependencies

| Slice | Phase 3 ownership | Depends on | Overlap avoidance |
| --- | --- | --- | --- |
| GF40 course registration | `src/modules/learning/course-registration.functions.ts`, `src/routes/student.courses.tsx` | Verified actor grants and enrolled student identity (Phase 1); active site/program/school-year/sections (Phase 2 GF3) | No edits to Phase 1 identity, shared navigation, schema or Phase 2 school setup services |
| Study groups | Consent, membership, RSVP, schedule/change/cancel, moderation | Phase 1 authorized group READ paths; Phase 2 roster visibility | Do not edit Phase 1 `study-groups.functions.ts` without coordinating |
| Calendar/conferences | Canonical cancellation/reschedule, participant visibility | Phase 1 scoped calendar, bookings, notifications | Avoid Phase 1 `calendar.functions.ts` and `school-experiences.functions.ts` until ready to coordinate |
| Activities/field trips | Eligibility, permissions, rostering, financial follow-up | Active student/program relationships and sensitive access grants | Distinct module changes; no new schema before shared review |
| Health/incidents/compliance | Restricted permission-aware lifecycles, profiles | Verified grants, privacy and retention policies | Treat as sensitive: no synthetic bypass, independent security review required |
| Ask CAN | Typed Ask/Do/Watch/Manage calls into authorized domain commands | Stable Phase 1/2 contracts and Phase 3 lifecycle services | Do not duplicate commands or write around canonical APIs |

## Implemented slice — GF40: course change request and registrar decision

- Removes `fixture: gf40` and `synthetic` as mandatory business-state gates. Existing fixture requests can follow the same rules if their canonical ownership and scope checks pass. New requests carry only operation, student, academic-year and enrollment identifiers plus a non-authorizing origin label.
- Requires the signed-in student to be actively enrolled in the relevant program and year when requesting the change. Validates the section belongs to the authorized site/program and serializes same-student/same-section requests with a transaction-level advisory lock to reject concurrent duplicate pending changes.
- Locks the registrar decision Action, checks the registrar capability, program/site/organization scope, the Action's actual student owner, and the academic year, school and program on approval. No request metadata may be treated as authority by itself.
- Rechecks deadline and active program enrollment at approval. Approved adds flow through the existing transactional `activateSectionEnrollment`, which enforces capacity, finalized-grade prerequisites, term credits and scheduled-section conflicts and assigns published assessments.
- Records request/decision audit entries and domain events in the same transactions as writes. Existing student/guardian decision notices and add/drop/withdrawal enrollment events remain.
- Removes invented `synthetic:true` metadata on withdrawal, preserves prior enrollment metadata, and makes the course UI reflect configured deadlines, prerequisites and known consent requirements.
- **Fail closed:** when `guardianApprovalRequired` is configured for an add, the student can submit an ordinary pending request, but registrar approval is refused until an eligible guardian approves through the authenticated decision route and no eligible guardian has an outstanding decline. No fixture flag can satisfy this authorization.

## Implemented slice — GF40 guardian consent and registrar review

- Added a session-authorized guardian course approval queue at `/guardian/course-approvals`, reachable from the family's existing permissions surface, and a registrar review queue at `/operations/course-requests`, reachable from registrar course policies.
- A student now submits an ordinary course-add Action when school policy requires guardian permission. The same transaction notifies guardians with current `canManageEnrollment` authority; no fixture-only code path or extra schema is needed.
- Guardian decisions are appended to canonical `consent_records`, keyed by the request Action ID and signed by the verified guardian person. Evidence binds the subject student, course, academic year, account and session; writes also append audit and domain event records and notify the student. Guardians may revise their decision until the request closes.
- The registrar review view shows authorized requests, active program membership, deadline status and guardian-consent readiness. Registrar approval re-verifies the *latest* still-valid decisions from currently authorized guardians under the same Action row lock. A declined guardian blocks the change; at least one approval and no current declines are required.
- Registrar course policy editing now exposes/preserves `guardianApprovalRequired` instead of silently resetting it during updates. The student UI offers consent-required requests and displays the guardian path.
- The pure resolver `course-guardian-consent.ts` is shared by the view and the transactional command so the consent conditions do not drift. No changes to Phase 1 or Phase 2 owned services, Drizzle models or migrations.

## Implemented slice — GF26 study group collaboration

- Added separate authenticated commands in `src/modules/study-groups/canonical-{membership,sessions,moderation}.functions.ts` plus a relationship-scoped read projection in `canonical-workspace.functions.ts`. These use the existing tables and do not modify Phase 1's `study-groups.functions.ts` or its student/teacher routes.
- Added `/groups` as an **interim unified student/teacher entry point**, linked from the Phase 3-owned student course page. Teacher directory integration with Phase 1 navigation remains pending. Only assigned teachers may create groups attached to an active section they teach.
- A student can request membership only with active enrollment in the group's site/program and, for course groups, section. The request uses a row lock, the canonical membership record, guardian-owned consent Actions, notifications, audit and domain events. Existing left/declined memberships can be re-requested without preserving an old Action decision.
- The `/guardian/study-group-consent` page now calls the canonical consent handler and requires explicit guardian acknowledgment. This handler confirms the verified guardian relationship, active enrollment and pending membership, and records a versioned signed `consent_records` decision associated with the membership. Each eligible guardian must approve before a facilitator can admit the student.
- Teacher decisions verify current group facilitator identity, active section assignment, student enrollment, current authorized guardians, matching consent Actions **and** signature evidence, and group capacity while holding the group row lock. The same record drives member visibility and future session access. Leaving deactivates membership and cancels unfinished guardian Actions.
- Teachers can create, reschedule and cancel sessions; student RSVPs require an approved group membership and an uncancelled future session. Both `study_group_sessions` and its existing `calendar_events` source row change in the same transaction; attendance recording is teacher-scoped. Members receive calendar/session notifications. Cancelled sessions cannot receive RSVPs or attendance.
- Approved members can create group posts and submit content reports; reporting makes a moderator-owned canonical Action with a deadline. Only the assigned facilitator can retain/hide the reported post and close the moderation Action; the reporter receives a result notification. Unapproved students cannot read posts or sessions through this new projection.
- Teacher group review, attendance entry, discussion and moderation and approved-student RSVP/discussion are available under `/groups`. The Phase 1 legacy `/student/study-groups` and `/teacher/study-groups` remain intact, with demo write gates, until their callers and nav contracts can be replaced without conflict.

**Important release constraints:** K–12 groups currently require an enrollment-authorized guardian for every student, and every such guardian must consent. Schools must review custody, age-of-majority and consent policy before use. Legacy group sessions without a canonical calendar source are treated as unavailable for RSVP/cancellation in this new surface. Phase 1's calendar intentionally excludes study-group events from broad feeds to prevent leaking restricted groups; a membership-aware calendar read must be added before claiming shared calendar integration. No CI, tests, typecheck, browser acceptance or DB migrations have been run.

## Known remaining gaps / not release-ready

1. Guardian course-add decision path and configurable policy control are implemented, but the format and legal sufficiency of guardian consent evidence require school/legal review before deployment. The current flow intentionally requires one approval and no active declines; multi-guardian and custody-specific policies may demand stronger rules.
2. Transcript-grade interpretation, credit accounting after withdrawal and policy-specific refund handling need authoritative school rules; `W` remains provisional enrollment metadata.
3. Registrar course-change review now uses a dedicated scoped view over the canonical Actions table. It must eventually be linked into the Phase 2 operations workspace navigation after coordinating route and menu ownership; no duplicate workflow state was created.
4. The section allocator already enforces capacity, conflict, prerequisite and credit rules on **add**, but cross-workflow placement (Phase 2) and acceptance testing are prerequisites before relying on those guards in production.
5. Phase 1 must pass its authorization/route acceptance gate; Phase 2 must establish active academic configuration and student roster guarantees.
6. CI/build/typecheck/integration/browser testing have deliberately **not** run. Guardian/registrar workflow, group moderation/capacity, Action locking, consent ordering and real cross-persona permissions remain unverified; this PR is implementation evidence, not production certification.
7. Retire the Phase 1 demo-gated study-group mutation handlers and reconcile the existing /student/study-groups and /teacher/study-groups screens only after Phase 1's route contracts stabilize. Do not expose two competing live write lifecycles to production students. Add the /groups link to the authorized teacher nav when coordinated.
8. Moderation escalation SLA, safeguarding oversight for abuse reports, session calendar membership visibility, and legal guardian-consent rules require security and school-policy review before enabling real student data.

## Integration sequence

- Keep this as a draft PR against `phase1/platform-convergence-foundation` to isolate Phase 3 file diffs. Phase 1 continues advancing while Phase 3 is developed; the branches currently diverge, so synchronize/rebase after the Phase 1 integration boundary is stable, and review any new conflicts before a change to the PR base. Do not merge this branch into main independently.
- Align with Phase 2 school/year/section topology once GF3 is stable. No migration or release action is included.
- Complete legal/school consent policy review, official transcript consequences, guardian notification deep links, teacher group navigation and replacement of legacy study-group routes when their Phase 1 owners are stable. Follow with cross-persona acceptance before a production release.
