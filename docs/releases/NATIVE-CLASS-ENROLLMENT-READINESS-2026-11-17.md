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
- Publication rejects invitation/approval when their required intent schema or
  approval lifecycle constraint is missing.
- The canonical base intent SQL must be followed by the additive adult approval
  lifecycle SQL; the latter separates reviewer decision from learner admission.
- A read-only QA script can enforce schema presence via
  `--require-enrollment-intents` without mutating data.

## Confirmed test01 database blocker

Project `sweet-hall-62441909`, branch `br-bitter-feather-ar0u63x7`
(`test01`) was read-only inspected on 2026-11-17:
`class_enrollment_invitations`, `class_enrollment_approval_requests`,
`class_enrollment_transfer_requests`, and
`class_enrollment_repeat_authorizations` were all absent.
There were zero Class fixtures. No migration, seed or acceptance write was run.

## Still required for full enrollment feature completeness

1. **Guardian/youth native Class placement:** Map the verified existing
   guardian/student Person identity to canonical Persons without assuming
   matching IDs across schemas. Preserve guardian-consent and school authority,
   age gates, child protection and eligibility, with separate authorization.
2. **Cross-Class transfers:** Destination eligibility and consent, stable dual-Class
   locking, source Course Attempt closure, destination Course Attempt creation,
   audit and rollback must occur in one authorized transaction.
3. **Completed repeat:** Independent completion-outcome authorization, proof
   binding, expiry and one-time consumption; never resurrect a closed Enrollment.
4. **Delivery notifications:** Verified recipient bridge, outbox consumer,
   deduplication and retries for invitations, approvals and enrollment transitions.
5. **QA and release:** Apply reviewed migrations to an isolated approved database
   branch only. Confirm forced RLS, least-privilege grants, schema parity, roles,
   negative guardian impersonation tests, retries, contention and one-hour plus
   four-session pilot journeys. Run build/typecheck/unit/integration/browser
   checks and prove zero unintended production writes.

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
