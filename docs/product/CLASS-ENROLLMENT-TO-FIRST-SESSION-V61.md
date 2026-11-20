# Enrollment-to-Class activation | V6.1 native Class integration

Source branch: feature/launch-studio-v61-clean-cutover-20261118

## What is implemented

- The original Class Offering publication and Class enrollment services are authoritative. An approved Program, Solution, Course or visible Class alone **does not** enroll a learner.
- Native Class lifecycle outbox facts now produce **idempotent, source-owned email delivery receipts** in public.class_participant_deliveries. Business commands do not send email inside their transaction.
- ClassEnrollmentCreated / ClassEnrollmentAssigned / ClassGuardianEnrollmentCreated: verified recipient receives enrollment welcome. If dated Sessions already exist, attach a multi-VEVENT calendar REQUEST. Self-paced Classes receive the welcome without fabricated meeting times.
- ClassInvitationIssued: invitee receives a limited-life invitation to the existing /class journey, **not** an enrollment, seat reservation or implicit consent.
- ClassSessionScheduled: currently enrolled participants receive the newly scheduled Session as a calendar REQUEST.
- ClassSessionScheduleChanged: send a CANCEL for the original, immutable Session UID and a separate REQUEST for the replacement, if it remains future and active. Never retarget the old Session or silently create duplicate attendance.
- Future Sessions more than 24 hours away enqueue a 24-hour reminder. The reminder is suppressed after withdrawal or Session cancellation.
- Native adult participants use current canonical account grants, verified email and nonrevoked identity. Minor participants are sent to the independently verified enrolling guardian, rechecked against current guardian authority and a verified CAN guardian grant. No arbitrary account lookup by matching address.
- Current learner may export upcoming Sessions on demand from My Classes; this is an authenticated, one-time ICS snapshot (not a calendar subscription).
- Exact-Site native Class operators can see participant count, upcoming Session count and provider-accepted/failed/pending/suppressed delivery receipts without learner contact details.
- Resend's accepted status is clearly labeled provider-accepted. It does not prove inbox delivery, reading, RSVP, attendance or Class activation.

## Existing owners, not new systems

Program / Solution / Offering / Course / Class / Session have their existing governed source. The shared event journal, resend transport, outbound lease/retry worker, V6.1 workspace controls and verified identity services are reused. The new table stores only transport receipts and contains no email addresses, consent records, classroom links, or copied enrollment rows.

## Migration and operational gate

**Apply drizzle/0093_class_participant_delivery.sql and its journal entry to the matching database before running this code.** No automatic Neon production migration or deployment is performed by committing code.

Required verification, against a disposable schema at the exact commit:

1. Run npm run typecheck.
2. Run npx vitest run tests/unit/class-calendar-invitations.test.ts tests/unit/interest-event-delivery.test.ts tests/unit/class-participant-delivery-contract.test.ts.
3. Run npm run check:class-architecture and npm run build:cloudflare.
4. Acceptance: create a published native Class with authorized Site and enrollment, add four timed Sessions, enroll an independently reviewed adult, observe one welcome/ICS; change Session 2, observe cancellation+replacement; verify that a withdrawn learner receives no future Session mail.
5. Acceptance: verify guardian enrollment with correct recipient, unverified email suppression, invitation expiry, closed Offering, disabled account, demo Site, retry/idempotency, provider failure, and operator health visibility.
6. Test against Gmail, Outlook and Apple Calendar. Validate DTSTART/DTEND/UID/SEQUENCE handling and that no two calendar events coexist for an original cancelled Session.
7. Confirm the scheduled job actually runs with database and Resend credentials, and reconcile provider receipts. Do not call mail "delivered" merely because Resend accepted it.

## Deliberately separate next integrations

- Noncredit **independent Course registrations** use NoncreditSelfEnrollmentCompleted and learner Course Attempts, not ClassEnrollmentCreated. Their own registration confirmation and facilitated cohort calendar should reuse the email/ICS dispatcher primitives, without manufacturing a native Class Enrollment.
- Institutional family admissions and Section schedules remain in school/guardian workflows and require their own independent authorization and communication consent.
- Email preference controls, verified provider webhooks, and a revocable authenticated calendar subscription feed should be planned separately. This implementation sends event-driven operational email, not marketing opt-in campaigns.
- Launch Studio Open should surface only the independently authorized enrollment release and existing Class operator workspace. Do not imply enrollment availability solely from an approved Program/Blueprint/Solution.

No build, database migration, outbound email, deployment or end-to-end acceptance is certified by this source commit alone.
