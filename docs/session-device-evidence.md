# CAN OS: session, device and learning evidence

Committed to GitHub main. Database additions on Neon main / neondb:
- `drizzle/0079_session_device_evidence.sql`: access sessions and coarse device metadata, advisory account security signals, education session evidence levels, site equipment register and device policies.
- `drizzle/0080_session_device_retention.sql`: one-row maintenance lease, no user-data deletions.

## Security controls

Access context is resolved from server-issued opaque sessions. Browser-provided client IDs and User-Agent labels never establish identity or device attestation. Account-scope activity checks and absolute expiration continue server-side. Shared-device sessions have a server-enforced five-minute idle limit in addition to browser-side logout and cross-tab cleanup.

Authentication captures approximate device/browser/OS. IP capture requires `CAN_SESSION_IP_COLLECTION_ENABLED=1` and the trusted Netlify Functions runtime `getContext().ip`. All inbound IP headers are ignored. Outside the runtime or without opt-in, IP is null. No geolocation or persistent fingerprinting.

`/account/sessions` displays active sessions and bounded security observations; it never returns raw IPs or browser client IDs. `/canonical/lab/devices` provides authorized Site-level inventory, ownership, status, and policy records. Managed-device assessment restrictions remain policy-only until verified hardware attestation and the appropriate assessment gates are implemented.

Learning events carry evidence_level `client_observed`; client playback and room pairing never imply authoritative attendance, assessed mastery, credit, or certification. Offline observations already use bounded, deduplicated tab-scoped queues.

## Data privacy and retention

`CAN_SESSION_DEVICE_RETENTION_ENABLED` defaults OFF. After approved deployment configuration sets it to `1`, the existing authenticated Netlify `/api/jobs` maintenance job runs the following at most once per 24 hours, in a single transaction:
- Scrub public and canonical session IP fields older than 30 days.
- Purge advisory security signals older than 90 days.
- Leave academic outcome and attendance evidence unchanged.

Setting the flag without an approved privacy retention policy or confirming the scheduler is not sufficient; validate the app deployment first.

## Release verification

Unit assertions cover spoofed-header rejection, coarse User-Agent handling, no inferred attendance, and a disabled-by-default retention job. The comprehensive integration and Playwright tests still need a functioning CI/build environment. GitHub Actions may return startup_failure before tests launch. Do not claim a production deployment or a passing build until confirmed.

## Production activation

For the Netlify production deploy set `CAN_SESSION_IP_COLLECTION_ENABLED=1`, `CAN_SESSION_DEVICE_RETENTION_ENABLED=1`, and a secret `CAN_JOB_SECRET` for scheduled maintenance. The currently published build must include the session/retention code. Environment variables only affect the next published deploy. Confirm the deployed commit is current and inspect the authenticated /api/jobs response; neither setting runs in a previously published build.
