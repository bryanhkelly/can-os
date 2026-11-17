# One account, My Activity and reliable outbound delivery | Main acceptance

Updated: 2026-11-17

This is an acceptance contract, not evidence that a connected production test
or migration has already passed. Use an isolated disposable test database with
synthetic people and an exact matching source/deployment commit. Never use
production minors, enrollment records, or real outbound recipients.

## P0: one real CAN Person, multiple explicitly granted capacities

Create one verified CAN account for one synthetic Person. Add independently
authorized, still-active memberships: account_holder, learner/student at Site A,
guardian of a different Person with a current academic relationship, teacher at
Site B, Site Admin at Site A, network_admin for Network C.

1. Authenticate **once** with the account's CAN session cookie. Verify active
   grant selection through `POST /access/session` with same-origin guard and
   no replacement credential. Reload between role switches.
2. Check that all grants on the real account resolve to the immutable
   `access_accounts.person_id`, including unaccepted/filtered grants. Introducing
   a conflicting active Person denies switching rather than silently relinking.
3. Confirm that each active role sees only its own capability set, verified
   Organization, Site, Program and Section scope. Site favorites and the UI
   Site selector do not confer access. Switching Site A to Site B does not
   reveal a sibling Site or create School/Program membership.
4. Guardian must be rechecked against the specific dependent and current
   academic or enrollment relationship. Removing a relationship revokes
   sensitive reads immediately without deleting its legitimate audit history.
5. Staff and network grants may not read another learner's personal activity
   just because they share a Site. Demo identity switching must remain
   separate and unavailable to normal real accounts.
6. Review native `education_v30` learner credential and staff-link access.
   A CAN login is not yet a substitute for a restricted canonical reader
   until the one-to-one principal link is verified and native session
   requirements are explicitly satisfied. Do not weaken the reader to meet
   a UI success criterion.

## P1: My Activity has source authority, not a second participation ledger

- The primary read remains `/learn/my-activity`; courses, school Sections,
  Programs, native Classes, calendar participation, enrichment and waitlist
  opportunities originate in their existing services.
- Run one Person with records at two Sites and in at least two capacities;
  check all six source cursors through terminal pages, partial-source outage,
  old withdrawal, completed training, and a child whose relationship changed.
- Follow links to teacher-graded assessments, transcript, guardian-attendance
  case, native Class session evidence and awarded noncredit credentials.
  Each destination revalidates its own permission. A historical row is
  NOT authority to open private lessons after withdrawal or revocation.
- An issued credential is governed by the original canonical award and
  revocation checks. A link is **not** evidence the restricted credential
  reader is enabled for a CAN-only session.
- Completion counts, attendance, registrations and grades come from original
  records. Never create a My Activity enrollment, Course Attempt, attendance
  assertion or credential merely to fill the dashboard.

## P1: durable events/outboxes and truthful delivery status

Existing source owners include noncredit waitlist email receipts,
school-family outbound deliveries, subscription watch deliveries, domain-event
worker, and other workflow-specific delivery mechanisms. Do NOT represent
all of these as one physical table until each producer/consumer has its own
migration and reauthorization acceptance.

- An invitation or completion transaction commits its domain state and
  durable event/receipt atomically; no network send occurs inside the same
  DB transaction.
- Under a provider timeout, worker crash, duplicate tick or lease loss, a
  stable receipt identity is reused, with pre-send authorization and original
  resource state rechecked. A worker that loses ownership cannot finalize
  a stale receipt.
- Noncredit operators at the exact authorized provider/Site/release can
  page through source-owned receipt metadata, see pending, retry scheduled,
  provider-accepted, failed, expired and suppressed statuses, and explicitly
  queue a safe retry of a failed still-live invitation with an audit reason.
- Accepted provider requests **do not prove** inbox delivery or that a
  participant accepted a seat. Requeued retries **do not prove** the send
  happened. Expired, withdrawn, accepted or obsolete invitations are never
  retried by this operator action.
- Verify subscription and school-family alert queues independently, including
  delivery status and manual escalation. Their worker integration is not
  replaced by the noncredit operator panel.

### Main source changes

- `src/domain/membership-switch-policy.ts` and
  `src/modules/identity/passwordless-access.server.ts`
- `src/modules/learning/my-activity.functions.ts` (existing read model),
  `src/domain/activity-evidence-navigation.ts` and
  `src/routes/learn.my-activity.tsx`
- `src/domain/notification-delivery-state.ts`,
  `src/modules/enrollment/noncredit-delivery-operations.functions.ts`,
  `src/components/enrollment/NoncreditDeliveryRecoveryPanel.tsx`

### Focused source tests and remaining release gates

Run `npm run typecheck`, `npm run lint`, `npm test`, and:

```bash
npx vitest run tests/unit/one-account-cross-capacity.test.ts tests/unit/activity-evidence-navigation.test.ts tests/unit/notification-delivery-state.test.ts
npm run test:enrollment:unit
npm run test:classes:unit
npm run test:classroom:unit
```

Then perform the isolated full-browser user journeys and queue-worker crash,
timeout and permission-revocation cases. Source commits and mocked unit tests
alone are not proof of one-login end-to-end completion or live delivery.
