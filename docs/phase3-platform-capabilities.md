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
- **Fail closed:** when `guardianApprovalRequired` is configured for an add, the student request button is unavailable and server request/registrar approval are rejected pending real guardian-consent capture/verification. The UI makes this limitation explicit; do not override with a fixture flag.

## Known remaining gaps / not release-ready

1. Guardian approval evidence and a verified guardian decision path must precede approvals for sections that require it. Registrar policy UI currently does not expose that flag, although the canonical policy table supports it.
2. Transcript-grade interpretation, credit accounting after withdrawal and policy-specific refund handling need authoritative school rules; `W` remains provisional enrollment metadata.
3. Pending-request UI is not yet linked into the canonical Operations Action queue with a dedicated, registrar-only program view; registrar decisions remain on the course page.
4. The section allocator already enforces capacity, conflict, prerequisite and credit rules on **add**, but cross-workflow placement (Phase 2) and acceptance testing are prerequisites before relying on those guards in production.
5. Phase 1 must pass its authorization/route acceptance gate; Phase 2 must establish active academic configuration and student roster guarantees.
6. CI/build/typecheck/integration/browser testing have deliberately **not** run. This PR is implementation evidence, not production certification.

## Integration sequence

- Keep this as a draft PR against `phase1/platform-convergence-foundation` to isolate Phase 3 file diffs. Coordinate and rebase onto Phase 1 after its review; do not merge this branch into main independently.
- Align with Phase 2 school/year/section topology once GF3 is stable. No migration or release action is included.
- After permission and consent modeling is agreed, complete the guardian approval and official transcript consequences in a separate, reviewed Phase 3 slice.
