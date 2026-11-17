# Valor single-login, Blueprint approval and credential authority acceptance

**Date:** 2026-11-17
**Repository:** `bryanhkelly/can-os`, branch `main`
**Database:** Neon `test01`, project `sweet-hall-62441909`, branch
`br-bitter-feather-ar0u63x7`
**Production:** No changes. No issuer or learner credentials enabled.

## Verified on the isolated database

| Gate | Evidence | Result |
|---|---|---|
| One CAN Site Admin login projects to one canonical staff Person/Site | `accept-can-staff-restricted-auth-test01.sql`, 23 statements | PASS |
| Revoked CAN session and staff membership denied | Same fixture | PASS |
| Independently revoked Person/Site identity link denied | Same fixture | PASS |
| Immutable one-Person account rejects a conflicting second Person grant | Same fixture, updated for current trigger | PASS |
| Blueprint author restricted to Valor Site and cannot review | `accept-valor-blueprint-roles-test01.sql`, `author_scope_pass=true` | PASS |
| Independent Blueprint reviewer cannot author or see foreign Site evidence | Same fixture, `reviewer_scope_pass=true` | PASS |
| Author submits, separate reviewer approves, execution creates planning-only Deployment/adoption | Same fixture, `blueprint_planning_pass=true`, 20 statements | PASS |
| Blueprint synthetic fixture fully rolled back | Read-only owner postflight: 0 configurations, 0 versions, 0 reviews, 0 execution batches, 0 deployments | PASS |
| Credential issuer approval, expiry, account binding, revoked session and revocation | `accept-sensitive-credential-issuer-test01.sql`, 26 statements | PASS |
| Credential authority fixture fully rolled back | 0 synthetic accounts, 0 active issuer approvals, 0 approved Site links or person links after tests | PASS |

The Blueprint restricted role used was
`can_v301_blueprint_acceptance_app`. It switched to the exact
`can_v30_blueprint_author_11110000000040008000000000000001` and
`can_v30_blueprint_reviewer_11110000000040008000000000000001`
purpose roles. The default general app login was not silently granted either
purpose. The reviewer and author used different canonical Person IDs.

`scripts/acceptance/run-valor-blueprint-roles-test01.mjs` provides a
repeatable execution gate requiring explicit test opt-in, matching test01
project/branch for **both** database connections, a separate restricted QA
login, all three positive assertions and independent rollback cleanup.
The existing `scripts/check-canonical-v301-blueprint-flow.mjs` remains the
broader canonical Blueprint integration acceptance, not a parallel product
implementation.

## Source findings and fixture repair

The new immutable CAN account Person constraint rejects an active second
Person grant at INSERT time. The older SSO acceptance fixture expected
the conflicting grant to insert and subsequently cause canonical authorization
denial. That assumption became stale and caused a test failure. The reviewed
`accept-can-staff-restricted-auth-test01.sql` now asserts the database
constraint rejects the conflicting grant, while legitimate access remains
unchanged. The updated fixture passed.

## Unverified, release-blocking checks

1. **Browser single sign-in:** No authenticated Playwright run was possible
   in this execution environment: no checked-out application, test web server,
   or restricted browser test credentials were available. None of the SQL tests
   are browser evidence, and a shared public Valor demo login is never suitable
   proof of verified canonical staff identity.
2. **Real organization/Site identity links:** `test01` currently contains
   zero approved public-to-canonical Site links, zero durable verified
   CAN-to-canonical Person links, zero active CAN Site Admin grants and zero
   CAN credential reviewer grants. Positive SSO used rollback-only synthetic
   identities and links, not unapproved durable production mappings.
3. **Blueprint reviewer one-login parity:** The current
   `getCanonicalCommandContext` permits CAN SSO for Site Admin and Registrar
   but still requires native authentication for independent Blueprint
   reviewers. The restricted SQL reviewer acceptance proves separation of
   authority, **not** a single interactive CAN login for the reviewer.
4. **Runtime application build:** No exact-SHA `npm ci`,
   `npm run build:cloudflare`, `npm run typecheck`, or browser trace was
   produced by this connector-only validation. Source checks do not replace CI.
5. **Credential artifact lifecycle:** Issuer approval SQL acceptance passed,
   but no actual certificate or badge was issued, delivered or revoked through
   a signed-in application. `CAN_CREDENTIAL_ISSUANCE_ENABLED` must remain OFF.
6. **Production:** Schema and real identity provisioning, independent reviewer
   setup, application role permissions and authorized release migration are
   not covered by these tests; no production changes were made.

## Repeatable commands

From an actual isolated QA checkout with reviewed test-only credentials:

```bash
# Source and functional tests after installing project dependencies:
npm run typecheck
npx vitest run tests/unit/valor-blueprint-one-login-acceptance.test.ts
npm run build:cloudflare

# Database acceptance: explicit isolated test01 owner and distinct QA role.
APP_ENV=test CAN_VALOR_BLUEPRINT_ACCEPTANCE=1 \
  TEST_DATABASE_URL="$TEST_DATABASE_URL" \
  CAN_CANONICAL_TEST_APP_DATABASE_URL="$CAN_CANONICAL_TEST_APP_DATABASE_URL" \
  npm run db:test:canonical:v301:valor-blueprint-roles

# Requires independent deployment and real verified non-demo test users.
# Browser test remains a separate release gate; do not substitute SQL results.
```

**Release decision:** Database-bound P0 assertions passed on `test01`.
**End-to-end CAN-account browser and production capability: NO-GO until
the remaining conditions are satisfied.**
