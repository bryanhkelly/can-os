# Agent reminders: deployment and release gate

## Deferred resource reminders (P0-01)

`platform/scheduling/reminders.ts` persists `deliverAt` and a caller-scoped stable
idempotency key in `scheduled_reminders`; it does not create a visible notification.
The caller's transaction must also commit its authorized business command, audit
and domain event before reporting the reminder as scheduled. Reusing a key with
different content is a conflict, not a second reminder.

Review migration `0073_scheduled_reminders.sql` before deployment. It has not been
applied to a live database by this change. Deploy the migration before code that
uses the queue. The existing authenticated `/api/jobs` maintenance worker dispatches
due rows every five minutes on Netlify. A reminder can be delivered after its due
instant; the schedule is not an exact-time service-level guarantee.

Dispatch uses the database clock and `FOR UPDATE SKIP LOCKED`. Notification creation
and the delivered receipt commit together. A failed delivery rolls back to a
savepoint and persists exponential backoff (60 seconds initially, capped at one
hour); eight failures leave an inspectable `failed` row. A crashed transaction
releases its locks and leaves no partial delivery. This is an in-app guarantee,
not an email/SMS delivery guarantee. Monitor the job's `scheduledReminders` result
and terminal queue failures; there is no automatic terminal-failure escalation
for this resource-reminder queue yet.

Conference reminders target 24 hours before the appointment. A request inside
that window is already due and is eligible for the next worker run, not an inline
send. Authorized booking cancellation and rescheduling cancel or update pending
reminders in the same booking transaction. Delivered notifications remain history.
Cancellation racing with a committed delivery cannot retract that delivery.

Focused local evidence: `reminder-worker.test.ts` applies the actual migration in
disposable PGlite and tests future timing, rollback after notification insertion,
backoff, repeated dispatch, stable-key conflicts, cancellation and rescheduling.
Disposable-Neon concurrency and production scheduler execution remain unverified.

## Implemented
- Persistent in-app watch alerts and conversation follow-ups
- Queued external deliveries with PostgreSQL claims, lease recovery, exponential retries (up to five), authorization and current-condition rechecks
- Repeat reminders with per-watch intervals and maximums
- Weekly in-app academic digests created from Ask CAN with explicit approval
- Guardian delivery history, channel/reminder settings, quiet hours, and revocable SMS consent
- Twilio Verify phone confirmation and optional SMS provider support
- Independent subscription event receipt/reconciliation after the GF1 event handler completes
- Terminally failed delivery records automatically escalate to canonical operations Actions
- Ask CAN conversation history reload and refresh while open

## Interest-event RSVP email

Migration `0074_omniscient_hulk.sql` adds attendance evidence to event
registrations and the anonymous family-email delivery queue. RSVP submission
creates a confirmation and only the future 24-hour / 2-hour reminders in the
same transaction as the registration. The confirmation includes a portable
iCalendar attachment. Check-in or no-show is an authorized, audited command;
its follow-up email is queued for the event end (or immediately when already
ended). These are adult contact records and do not create a Person, student,
application, admission decision, or enrollment.

The five-minute authenticated `/api/jobs` worker sends via Resend outside the
registration transaction. Delivery rows use stable provider idempotency keys,
two-minute leases and bounded exponential retries (up to five attempts).
`interestEventEmails` reports accepted, failed and cancelled rows; provider
acceptance is not inbox delivery. Demo-tenant external email is suppressed.
Monitor terminal `failed` rows; automated escalation and provider-delivery
webhooks are not implemented for this queue.

Focused local evidence: the interest-event worker and attendance tests apply
the actual migration in disposable PGlite. Migration `0074` has **not** been
applied to Neon. The configured `TEST_DATABASE_URL` failed the protected
FullFlow branch identity check; production and other branches are not valid
substitutes. Applying it requires a verified, approved nonproduction target and
the repository's branch-specific migration guard.

## Environment
- `DATABASE_URL`: Neon connection configured for the intended deployment
- `CAN_JOB_SECRET`: required by the scheduled maintenance endpoint
- `RESEND_API_KEY` and `CAN_NOTIFICATIONS_FROM_EMAIL`: verified sender for email
- `TWILIO_ACCOUNT_SID`, `TWILIO_API_KEY`, `TWILIO_API_SECRET`
- `TWILIO_VERIFY_SERVICE_SID`: provisioned Twilio Verify service
- `TWILIO_MESSAGING_SERVICE_SID` (preferred) or `TWILIO_FROM_NUMBER`
- `CAN_ACCESS_PUBLIC_ORIGIN`: canonical HTTPS application origin

SMS is **off by default**, and the user must complete phone verification and actively consent. A Twilio messaging account, region-specific registration, sender approval and opt-out compliance are required before real SMS is enabled.

## Migrations
Review and apply `drizzle/0013` through `drizzle/0016` only to the intended environment. Never use production as a disposable integration test database. Drizzle journal and schema snapshots are committed for reproducible generation.

## Verification commands
```sh
npm ci
npm run typecheck
npm test
npm run build
npm run db:generate
node scripts/run-integration-tests.mjs subscription-delivery
```
For database tests use `TEST_DATABASE_URL` pointing to a disposable Neon branch and `CAN_TEST_DB_WRITES_ENABLED=true`. Review the existing integration script's safety gates before running.

## Delivery guarantees and limitations
- **In-app:** transactional insert and uniqueness prevents duplicate watch deliveries.
- **Email:** provider acceptance is recorded and a stable idempotency key is submitted to Resend. Acceptance does not prove inbox delivery.
- **SMS:** accepted Twilio API requests are recorded; downstream handset delivery requires a separate verified status callback. Twilio Messaging API does not provide the same documented idempotency semantics as Resend, so an ambiguous timeout following provider acceptance may require additional reconciliation.
- **Quiet hours:** external email and SMS dispatch is deferred until the end of the recipient's local quiet period; in-app records remain available.
- **Push and external agent webhooks:** intentionally not enabled until channel-specific authentication, subscription consent and endpoint verification are implemented.
- **Digest schedule:** uses an explicit default 19:00 local time confirmed by the parent and supports only in-app delivery today.
- **Policy:** authorization is re-evaluated at execution. Parent relationships revoked before dispatch suppress queued delivery.

## Outstanding production gates
1. Run typecheck, build, unit tests and disposable-Neon integration tests and resolve any failures.
2. Test Resend/Twilio sandbox acceptance and ambiguous-timeout behavior.
3. Add signed provider delivery-status webhooks and SMS STOP reconciliation. Terminal delivery failures already create operations Actions.
4. Add message volume quotas, per-account abuse protection, delivery monitoring and retention policies.
5. Validate notification content, consent and privacy procedures with real-school compliance reviewers before enabling real family data.
