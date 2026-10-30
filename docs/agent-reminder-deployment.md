# Agent reminders: deployment and release gate

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
