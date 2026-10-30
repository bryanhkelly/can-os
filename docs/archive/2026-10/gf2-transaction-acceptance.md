# GF2 synthetic transaction safety

The admissions offer service must never mutate an application that is not explicitly marked `metadata.synthetic === true`. This applies to issue, guardian accept/decline, and enrollment activation, even when a caller has a command context with a seemingly valid capability. Synthetic identifiers are for this first development build only.

## Required integration scenarios (disposable Neon only)

1. For a synthetic application with a ready journey, issue an offer; reissue using the same key and assert the same offer ID.
2. Accept as a linked guardian; repeat acceptance and assert one decision, one event and one active response state.
3. Activate as registrar; repeat activation and assert one program enrollment; verify its status appears in both admissions and household readiness.
4. Attempt the same commands on a non-synthetic application and assert rejection before any mutation.
5. With two synthetic applications competing for one available seat, verify issuance concurrency permits only one valid reservation.
6. Verify acceptance by an unrelated guardian is denied.
7. Attempt activation before guardian acceptance or while blocking requirements remain; assert no enrollment.
8. Decline an issued offer; verify the fixed idempotency key cannot silently resurrect that declined offer.

To execute automated database tests, use `npm run test:integration` with `TEST_DATABASE_URL` directed at a disposable test branch and `CAN_TEST_DB_WRITES_ENABLED=true`. The current GitHub CI only runs unit tests, build and migration generation. Do not claim these scenarios passed until actual isolated-Neon execution is recorded.

## Follow-up

Implemented as `tests/integration/gf2-enrollment-lifecycle.test.ts`: a deterministic fixture harness (two synthetic households, one single-seat pool) exercising the existing service across all eight scenarios above, asserting canonical state, notifications, DomainEvents, and audit records. Executed and passing against a disposable Neon branch (`test01`, 2026-10-16). It replaces the former seeded-fixture lifecycle test, which required hard-coded demo UUIDs and a never-before-executed branch. Running this harness in CI against an ephemeral database branch remains open.
