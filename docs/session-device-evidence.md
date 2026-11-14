# CAN OS: session, device and learning evidence

Committed to GitHub main. Database additions on Neon main / neondb:
- `drizzle/0079_session_device_evidence.sql`: access sessions and coarse device metadata, advisory account security signals, education session evidence levels, site equipment register and device policies.
- `drizzle/0080_session_device_retention.sql`: one-row maintenance lease, no user-data deletions.

## Security controls

Access context is resolved from server-issued opaque sessions. Browser-provided client IDs and User-Agent labels never establish identity or device attestation. Account-scope activity checks and absolute expiration continue server-side. Shared-device sessions have a server-enforced five-minute idle limit in addition to browser-side logout and cross-tab cleanup.

Authentication captures approximate device/browser/OS. Network IP is **disabled by default** and only captured when `CAN_TRUSTED_CLIENT_IP_HEADER` is configured to a verified provider header (e.g. `x-nf-client-connection-ip` or `cf-connecting-ip`) at an ingress that removes spoofable client copies. No generic forwarded-for trust or precise geolocation.

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
