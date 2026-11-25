# Release 11232026: reconciliation and security acceptance

## Evidence collected November 23, 2026 (Pacific)

- Main reconciliation: merge commit 80052c829e02789877103540526ddc0f9466d692 includes both missing main commits without losing release-specific changes.
- Privacy-gates reconciliation: 58b3d6f69248590d8130902fa04c9a46cecf5777 incorporates the previously separate 0110 migration and CI changes.
- Production Neon main: migrations 0100–0110 have exactly one journal row each and exact SHA-256 matches to reviewed source. No duplicate timestamps in that window. No changes made to production.
- Nine inspected identity, tenant and engagement tables have enabled and forced RLS. Neither anonymous nor authenticated has direct SELECT/INSERT/UPDATE/DELETE on any of those nine tables. This is catalog evidence, not end-to-end application isolation evidence.
- Production: zero active platform_owner grants, zero active grants whose Site belongs to another Organization, zero malformed delegation records and zero Go Link requests missing a fingerprint.
- Hardened session resolution, owner-only management, expired delegation, personal-identity Act as and Site membership scoping. A new additive 0111 migration replaces nullable CHECK predicates and corrects the delegated grant FK. 0111 is source only, not production-applied.
- Found and repaired literal escaped newlines that commented out the preview creation transaction and error handling.
- PR #364 reported mergeable true and zero behind main on the inspected head ae56a0f8524e40760e2d7fc3ad5522e3e607d9fc.
- GitHub Actions on that head returned eleven failures. Four inspected jobs (CI, Cloudflare release gate, FullFlow static gate and full-schema) returned null steps. There is no evidence of a successful runner, compiler or test execution. Do not label them code failures or passes without job diagnostics.
- Actual local headless Chromium attempts at /release-fingerprint and an example /go path were blocked by the environment (ERR_BLOCKED_BY_ADMINISTRATOR). No live browser pass asserted.

## Required acceptance on exact final SHA

1. Use a disposable, explicitly authorized Neon test branch. There were ten existing project branches; the earlier new-branch request hit the branch quota. Do not delete recovery branches without approval. Apply the complete journaled chain through 0111 on the isolated test database, check hashes, FK behavior, invalid null records and client permissions. No direct production SQL edits.
2. Run npm ci, npm run typecheck, npm run lint, npm run build, the unit and integration suites, and the Cloudflare release gate. Verify the full-schema workflow executes.
3. With the guarded environment from playwright.config.ts, run npm run test:e2e:release-security. It exercises real anonymous Go rendering, lifecycle, signed sessions, two separate tenants, malformed membership, View as, explicit return and expired mutation denial. Synthetic writes only on the attested test branch. Also run the existing school-website and full-flow suites.
4. Provision a verified non-demo Platform Owner with a separate verified approver and a recorded ticket using scripts/provision-platform-owner.mjs. No self-approval or fabricated Person. Validate real owner login, scoped grants and revocation, Act as, protected reviewer denial and original actor audit attribution in a guarded rehearsal. Older direct audit writers remain a review item.
5. On the approved deployed host run npm run test:e2e:live-go. Supply CAN_LIVE_PREVIEW_CODE only for a dedicated revocable test preview link. Never share real preview codes in test logs or commits. Verify the release fingerprint separately, and verify preview revocation after issuing the test link. No forms submitted by the live smoke tests.
6. Only after isolated migration, tests and review: authorize production 0111 rollout. Run npm run db:check:friendly-urls:deploy against the actual deployment connection. Do not merge or deploy with failed or absent validation.

## Remaining scope

This release is not approved for production. Database privacy catalog checks do not prove every server-side domain command enforces tenant isolation, and a committed test is not a passing test. COGIC pilot publication and professional reviewer approvals remain outside this hardening change.
