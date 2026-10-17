# Phase 1 development handoff — Platform Convergence

**Branch:** `phase1/platform-convergence-foundation`  
**Draft review:** [PR #120](https://github.com/bryanhkelly/can-os/pull/120)  
**Merge policy:** Do not merge into `main` without explicit authorization.

## Implemented source boundaries

The Phase 1 branch now contains the verified-grant navigation and school/program selection foundation; child-scoped guardian academics, attendance and admissions; authenticated enrollment readiness, admission offers and capacity; staff/student canonical Action workflows and resource-aware notifications; calendar read isolation, guardian conference booking and same-series rescheduling; teacher gradebook, assessment/rubric management, student assignments and drafts; grade finalization/corrections, program-scoped report cards and protected transcript issuance; support referrals and outreach; authenticated teacher/student study-group membership, guardian consent, plain-text group conversation, content reports and facilitator moderation; and school-scoped staff invitation/grant protections.

Enrollment documents use an **opt-in** `CAN_R2_LIVE_UPLOADS_ENABLED` server-side flag and separate demo flag. The server checks application requirements and active role/program/site/guardian relationships, accepts PDF/JPEG/PNG, verifies object size/type/signature using private R2, and records versions/review/audit. Learning/attendance uploads likewise verify scoped private objects before association, and download links are restricted and short-lived. The public bucket must remain private. See `docs/cloudflare-r2-enrollment.md`.

## Integration boundaries for parallel Phase 2 and Phase 3 work

- **Phase 2:** Owns the canonical group-session creation, RSVP, attendance, rescheduling and cancellation workflow, and any downstream calendar/notification propagation. Four existing legacy study-group session mutations remain gated and explicitly reject authentic group records. Do not duplicate the Phase 1 group membership, consent, post or moderation API implementations.
- **Phase 3:** Owns additional platform capability modules and their dedicated APIs; coordinate schema and file migrations rather than modifying the same Phase 1 auth and document boundaries independently.
- **Do not merge or cherry-pick** the same code paths from multiple draft PRs. Rebase/reconcile against the eventual approved Phase 1 integration commit after validation.

## Unresolved release/acceptance gates

1. CI, TypeScript build, unit/integration tests and multi-role Playwright/browser journeys are **deferred per user instruction**. No passing test or production-readiness claim is made.
2. The 58-route `docs/platform-route-contracts.json` inventory matches the current route-file count but all per-route role/read/write acceptance records remain pending.
3. Security/negative-access tests must cover original grant revocation, multiple-school contexts, changed guardian relationships, former staff, denied R2 access, stale enrollments and idempotent Actions.
4. Live R2 must not be enabled until malware scanning/quarantine, orphan upload cleanup, retention/legal hold, privacy/security review, bucket CORS, signed URL behavior and rollback have been verified in an isolated environment.
5. Transcript issuance currently fails closed if a record mixes credit issuers; accredited transfer-credit attribution needs its own approved model.
6. Backward-compatible synthetic-prefixed API exports remain intentionally available until client/cross-branch consumers have migrated; remove only after reference auditing and tested parity.

**Status:** Substantial feature development is committed, but Phase 1 is not acceptance-complete and is not merged to `main`. Do not silently reclassify deferred tests as passed.
