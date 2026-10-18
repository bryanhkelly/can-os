# CAN OS — current implementation snapshot

**Baseline reviewed:** `main` at `e23cac7` (2026-10-18), plus the academic/conference authorization follow-up included with this snapshot. Consolidation commit `8bdce69` was merged with the documentation baseline and pushed in `e23cac7`. Local automated results are recorded below; they are **not** a verified deployment, production acceptance, security audit, or assertion that remote CI has passed.

## Integrated source baseline

- The main branch includes the development changes associated with Phases 1, 2 and 3. Phase 1 PR #120 is marked merged by GitHub. The Phase 2 and Phase 3 implementation work was integrated via commits on `main`; PRs #121 and #122 were closed without GitHub reporting them as merged. Do not use those original PR states as instructions for future branching.
- `src/routes/` contains **65** TypeScript/TSX route source files, matching `docs/platform-route-contracts.json`. **Every route's verification, role journey, read boundary and write boundary remains `pending`.** Recording ownership is not acceptance. The separate fixture-coverage checker reports 58 route declarations; neither inventory is browser acceptance.
- Workspace entry uses server session grants (`src/routes/index.tsx`, `src/components/shell/WorkspaceNavigation.tsx`). Module-level authorization still requires code and negative-access tests.
- Existing student/teacher group routes now call canonical creation, consent, posting, moderation, session, RSVP and attendance commands. The old combined `study-groups.functions.ts` mutation module was retired; retained read projections in `study-group-queries.functions.ts` preserve existing page shapes. Isolated integration tests cover interest groups, consent, duplicate reports, moderation, RSVP-independent attendance, and session reschedule/cancellation.
- Admissions offer commands are present under `src/modules/enrollment/admissions-offer-service.ts` and related server functions; some paths still use `assertRecordWriteAllowed` or synthetic-prefixed compatibility names. Do not misreport them as uniformly provenance-neutral or production accepted.
- Calendar, learning, attendance, family, support, launch and Ask CAN modules exist. Presence of source modules is not proof of cross-role end-to-end completeness.
- Domain modules use shared audit/event/inbox writers, guarded by `scripts/check-mutation-hygiene.mjs`. Enrollment and learning attachments share private R2 signing and bounded object verification. Conferences, field trips and activities share source-aware calendar projection infrastructure; activity seasons still support multiple occurrences.
- Grade finalization/correction and placement prerequisites use versioned grade-scale policy, including custom passing labels and bounded extra-credit handling. Staffing statuses have a pending enum migration; its DDL was verified in a rolled-back isolated test transaction, not applied to production.
- Approved agent writes use the approval transaction. The Academic Domain API now shares a program-and-relationship predicate across student discovery and summary sections: missing/empty program grants deny visibility, supplied site/section lists restrict it, and teachers only see their assigned sections. Tests cover revoked relationships/assignments and approval-time loss of access.
- Conference booking/rescheduling no longer accept an optional enrollment-check switch. Both commands require explicit site/program grants, current guardian relationship, school enrollment and active section enrollment where applicable; direct-service regression tests cover denials and transactional rescheduling.

## Architecture versus known code gaps

**Target architecture:** synthetic fixtures behave like ordinary records through canonical product workflows, with an isolated environment and no test-specific UI or business engine.

**Observed remaining transition:** `src/modules/_demo/` guards and synthetic-prefixed admissions exports still exist. Multiple study-group page entry points remain as adapters to canonical commands, not separate mutation engines. Never remove protective guards without validating the authorization and data-isolation consequences. These are review targets, not a mandate to bypass safeguards.

`CAN_DEMO_WRITES_ENABLED` is fail-closed in `src/modules/_demo/demo-write-gate.ts` (`=== "true"`). The flag is not an authorization policy.

## Verification and release status

- Local verification on 2026-10-18: `npm test` passed **71 files / 350 tests**; `npm run test:integration` passed **27 files / 41 tests** using the protected isolated Neon runner. The latter includes negative academic-scope/relationship and conference-enrollment cases; it is not exhaustive authorization certification.
- `npm run typecheck`, `npm run build`, mutation hygiene, route fixture coverage and `node scripts/check-platform-route-contracts.mjs --check` passed locally after the merge and follow-up changes.
- Browser/Playwright cross-persona journeys, remote CI, live R2 configuration and production migration/deployment remain **unverified** in this continuation. No production migration or data modification was performed.
- All 65 route acceptance entries remain **pending**. The basic source-drift checker is separate from the stricter `--acceptance` gate.
- Sensitive student, medical, safety, payment and legal data require independent privacy/security review and operational acceptance. Do not infer readiness from documentation or a passing compile.
- Refer to [release gate](./synthetic-pilot-release-gate.md) for recorded evidence and its dated limitations, [security gates](./school-operations-security-gates.md), and [Neon test isolation](./neon-development.md).

## Remaining follow-up

- Generic Action resolution still needs complete domain/resource/relationship policy, not only capability and scope helpers.
- Remaining school-year/program-launch commands need evidence-parity review.
- Full authenticated route/deep-link and role-switch browser acceptance is pending.
- Production staffing migration requires existing-value preflight and controlled rollout. R2 malware/quarantine, retention and live bucket/CORS acceptance remain release gates.

## Updating this snapshot

Verify the current commit, confirm changes from the last baseline, inspect owning service and callers, update route contracts, then record test/CI/production evidence separately. Never carry forward a status label solely because it appeared in an archived sprint or phase report.
