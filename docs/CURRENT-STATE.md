# CAN OS — current implementation snapshot

**Baseline reviewed:** `main` at `94775e966ae9286ce562d1969628649d92663930` (2026-10-18). This is a source/documentation snapshot. It is **not** a verified deployment, production acceptance, security audit, or assertion that CI has passed.

## Integrated source baseline

- The main branch includes the development changes associated with Phases 1, 2 and 3. Phase 1 PR #120 is marked merged by GitHub. The Phase 2 and Phase 3 implementation work was integrated via commits on `main`; PRs #121 and #122 were closed without GitHub reporting them as merged. Do not use those original PR states as instructions for future branching.
- `src/routes/` contains **65** TypeScript/TSX route source files at this baseline. This documentation change reconciles `docs/platform-route-contracts.json` from 58 to 65 entries. **Every route's verification, role journey, read boundary and write boundary remains `pending`.** Recording ownership is not acceptance.
- Workspace entry uses server session grants (`src/routes/index.tsx`, `src/components/shell/WorkspaceNavigation.tsx`). Module-level authorization still requires code and negative-access tests.
- Canonical group-session creation, rescheduling/cancellation, RSVP and attendance commands are present under `src/modules/study-groups/canonical-*.functions.ts`. Older student/teacher group routes and legacy session behavior also remain; do not assume consolidation is complete.
- Admissions offer commands are present under `src/modules/enrollment/admissions-offer-service.ts` and related server functions; some paths still use `assertRecordWriteAllowed` or synthetic-prefixed compatibility names. Do not misreport them as uniformly provenance-neutral or production accepted.
- Calendar, learning, attendance, family, support, launch and Ask CAN modules exist. Presence of source modules is not proof of cross-role end-to-end completeness.

## Architecture versus known code gaps

**Target architecture:** synthetic fixtures behave like ordinary records through canonical product workflows, with an isolated environment and no test-specific UI or business engine.

**Observed remaining transition:** `src/modules/_demo/` guards, synthetic-prefixed admissions exports, and parallel legacy/canonical study-group routes still exist. Never remove protective guards without validating the authorization and data-isolation consequences. These are review targets, not a mandate to bypass safeguards.

`CAN_DEMO_WRITES_ENABLED` is fail-closed in `src/modules/_demo/demo-write-gate.ts` (`=== "true"`). The flag is not an authorization policy.

## Verification and release status

- This snapshot **does not claim** passing builds, unit tests, database integration, Playwright journeys, negative-access tests, or release acceptance.
- All 65 route acceptance entries remain **pending**. The basic source-drift checker is separate from the stricter `--acceptance` gate.
- Sensitive student, medical, safety, payment and legal data require independent privacy/security review and operational acceptance. Do not infer readiness from documentation or a passing compile.
- Refer to [release gate](./synthetic-pilot-release-gate.md) for recorded evidence and its dated limitations, [security gates](./school-operations-security-gates.md), and [Neon test isolation](./neon-development.md).

## Updating this snapshot

Verify the current commit, confirm changes from the last baseline, inspect owning service and callers, update route contracts, then record test/CI/production evidence separately. Never carry forward a status label solely because it appeared in an archived sprint or phase report.
