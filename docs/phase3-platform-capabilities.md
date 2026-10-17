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

## Known remaining gaps / not release-ready

1. Guardian course-add decision path and configurable policy control are implemented, but the format and legal sufficiency of guardian consent evidence require school/legal review before deployment. The current flow intentionally requires one approval and no active declines; multi-guardian and custody-specific policies may demand stronger rules.
2. Transcript-grade interpretation, credit accounting after withdrawal and policy-specific refund handling need authoritative school rules; `W` remains provisional enrollment metadata.
3. Registrar course-change review now uses a dedicated scoped view over the canonical Actions table. It must eventually be linked into the Phase 2 operations workspace navigation after coordinating route and menu ownership; no duplicate workflow state was created.
4. The section allocator already enforces capacity, conflict, prerequisite and credit rules on **add**, but cross-workflow placement (Phase 2) and acceptance testing are prerequisites before relying on those guards in production.
5. Phase 1 must pass its authorization/route acceptance gate; Phase 2 must establish active academic configuration and student roster guarantees.
6. CI/build/typecheck/integration/browser testing have deliberately **not** run. The guardian/registrar workflow, Action locking, consent ordering and real cross-persona permissions remain unverified; this PR is implementation evidence, not production certification.

## Integration sequence

- Keep this as a draft PR against `phase1/platform-convergence-foundation` to isolate Phase 3 file diffs. Coordinate and rebase onto Phase 1 after its review; do not merge this branch into main independently.
- Align with Phase 2 school/year/section topology once GF3 is stable. No migration or release action is included.
- Complete legal/school consent policy review, official transcript consequences, guardian notification deep-link integration with the Phase 1 notification router, and cross-persona acceptance in a separate, reviewed Phase 3 slice.
