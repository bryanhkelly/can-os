# Native Class enrollment readiness, 2026-11-17

## Release decision: NO-GO

Source code has moved forward on `main`; these are **not verified deployed capabilities**.
Do not advertise completion until migration, typecheck, CI, negative-authorization,
transaction, browser and authenticated test01 verification succeed.

## Implemented in source

- Adult self-enrollment creates one canonical Class Enrollment and Course Attempt under
  the shared Class-row seat lock and published consent.
- Exact-Site authorized direct adult assignment remains a separate command.
- Verified adult invitation issuance, expiry, decline and learner acceptance exist;
  publishers and Class managers now expose the method and issuance control.
- Verified adult approval request, expiry, independent exact-Site review and
  learner acceptance are implemented as distinct commands and UI.
- Approval decisions do not create Enrollments or Course Attempts. Consent and
  capacity are re-evaluated when the learner accepts. Reviewers must enter a reason.
- Publication rejects invitation/approval when their required intent schema,
  independently reviewed approval lifecycle, or canonical consent-method constraint is missing.
- CAN guardian sessions with independently verified canonical Person bridges can
  request approval for a current verified minor, accept new consent after
  exact-Site staff review, or withdraw guardian-created participation.
- Adult self-transfer between distinct published public Classes is transactional,
  with deterministic dual-Class locking, preserved source history, fresh target
  consent/capacity, new Enrollment/Attempt and audit evidence.
- Independent completion-outcome-based repeat authorizations are bound to exact
  prior completed Enrollments, expire after 30 days, and are consumed atomically
  by adult or guardian-authorized admissions.
- Migration order: `patch-native-class-enrollment-authority-ws2.sql`,
  `patch-native-class-adult-approval-lifecycle.sql`, then
  `patch-native-class-consent-methods.sql` for consent-bearing `self`,
  `invitation` and `approval` admissions.
- A read-only QA script can enforce schema presence via
  `--require-enrollment-intents` without mutating data.

## Confirmed test01 migration status

On 2026-11-17, Neon project `sweet-hall-62441909`, nonproduction
branch `br-bitter-feather-ar0u63x7` (`test01`) received the
four enrollment intent tables and the two follow-up constraints
for independently reviewed adult approval and consent-bearing Class methods.

Verified on that branch:
- Four intent tables with `ENABLE ROW LEVEL SECURITY` and `FORCE ROW LEVEL SECURITY`
- Four key uniqueness indexes, including one pending invitation/approval/transfer
  and repeat-outcome authorization identity
- Revised approved-request acceptance checks and independent reviewer constraints
- Revised `class_enrollments` consent check: `self`, `invitation`, and
  `approval` must have verified consent; assignment remains no-consent
- No production database schema or records were modified

These are structural checks, not authenticated positive/negative authorization
or runtime testing. **The branch still has zero native Class fixtures**,
so no end-to-end enrollments or Class Course Attempts have been proven.

## Remaining before shipping

1. **Authenticated QA journeys:** Seed only isolated synthetic, verified
   learner/guardian/staff/Classes/Sites. Prove all four methods, reviewer
   independence, invitation expiry, guardian revocation, last-seat contention,
   cancellation and fresh Course Attempt identities.
2. **CI and build:** Run typecheck, lint, Cloudflare build, native Class unit
   tests, route ownership and end-to-end browser tests against the exact
   `main` SHA. They have **not been executed or verified green** in this run.
3. **Notifications:** Canonical event stream is written, but outbound invitation,
   approval and transfer delivery/recipient mapping still lacks a confirmed
   canonical-to-CAN notification adapter and retry/dedup consumer.
4. **Additional operational variants:** Atomic adult self-transfer is implemented.
   Guardian-managed and staff-directed cross-Class transfers require separate
   scoped authorization; the family flow currently supports applying to a new
   Class and separately withdrawing the old one. Completed guardian repeats
   require independent repeat authorization.
5. **Database rollout:** Production application-role grants and migrations
   remain unapproved and unapplied. Do not assume test01 is production.

## QA invocation

```bash
CAN_WS2_QA_READ_ONLY=1 \
CAN_WS2_QA_PROJECT_ID=sweet-hall-62441909 \
CAN_WS2_QA_BRANCH_ID=br-bitter-feather-ar0u63x7 \
CAN_WS2_QA_DATABASE_URL='<explicit test01-only connection>' \
node scripts/acceptance/check-ws2-enrollment-readiness.mjs --require-enrollment-intents
```

**Do not apply these SQL files to production as a shortcut.**
The release gate remains blocked until schema and authenticated full-journey
acceptance evidence exists.
