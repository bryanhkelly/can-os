# CAN OS: session, device and learning evidence

Committed to GitHub main. Database additions on Neon main / neondb:
- `drizzle/0079_session_device_evidence.sql`: access sessions and coarse device metadata, advisory account security signals, education session evidence levels, site equipment register and device policies.
- `drizzle/0080_session_device_retention.sql`: one-row maintenance lease, no user-data deletions.

## Security controls

Access context is resolved from server-issued opaque sessions. Browser-provided client IDs and User-Agent labels never establish identity or device attestation. Account-scope activity checks and absolute expiration continue server-side. Shared-device sessions have a server-enforced five-minute idle limit in addition to browser-side logout and cross-tab cleanup.

Authentication captures approximate device/browser/OS. On the Cloudflare test Worker (`can-os.bryanhkelly.workers.dev`), IP capture requires `CAN_SESSION_IP_COLLECTION_ENABLED=1` and uses `CF-Connecting-IP` only at the trusted Worker fetch boundary. The address is passed through request-scoped context; arbitrary forwarded headers in server functions are not trusted. Outside that exact test hostname, Cloudflare IP collection fails closed. The separate Netlify runtime path remains available. No geolocation or persistent fingerprinting.

`/account/sessions` displays active sessions and bounded security observations; it never returns raw IPs or browser client IDs. `/canonical/lab/devices` provides authorized Site-level inventory, ownership, status, and policy records. Managed-device assessment restrictions remain policy-only until verified hardware attestation and the appropriate assessment gates are implemented.

Learning events carry evidence_level `client_observed`; client playback and room pairing never imply authoritative attendance, assessed mastery, credit, or certification. Offline observations already use bounded, deduplicated tab-scoped queues.

## Data privacy and retention

`CAN_SESSION_DEVICE_RETENTION_ENABLED` defaults OFF unless configured. For the Cloudflare test Worker, `wrangler.jsonc` now sets it to `1` and the existing Worker scheduled handler runs retention alongside, but independently from, photography. Its Neon lease permits cleanup at most once every 24 hours. Netlify's authenticated `/api/jobs` job remains a separate deployment path. Retention performs:
- Scrub public and canonical session IP fields older than 30 days.
- Purge advisory security signals older than 90 days.
- Leave academic outcome and attendance evidence unchanged.

Setting the flag without an approved privacy retention policy or confirming the scheduler is not sufficient; validate the app deployment first.

## Release verification

Unit assertions cover spoofed-header rejection, coarse User-Agent handling, no inferred attendance, and a disabled-by-default retention job. The comprehensive integration and Playwright tests still need a functioning CI/build environment. GitHub Actions may return startup_failure before tests launch. Do not claim a production deployment or a passing build until confirmed.

## Cloudflare testing activation

Active test hostname: https://can-os.bryanhkelly.workers.dev

- `wrangler.jsonc` enables `CAN_SESSION_IP_COLLECTION_ENABLED=1` and `CAN_SESSION_DEVICE_RETENTION_ENABLED=1` for the Cloudflare test Worker. The settings affect the deployed Worker only after a new deployment.
- `src/cloudflare-demo.ts` trusts Cloudflare's edge-provided `CF-Connecting-IP` only at the exact Workers.dev hostname and supplies it through request-scoped AsyncLocalStorage. The application cannot grant trust to arbitrary incoming X-Forwarded-For headers.
- `src/server.ts` reuses the existing one-minute Cloudflare cron. It calls the retention job with the Wrangler environment binding and creates a request-owned Neon connection. The database lease runs the actual cleanup at most once daily.
- The Worker requires the existing `DATABASE_URL` secret and an active deployment containing these changes. No Netlify `CAN_JOB_SECRET` is required to run the Cloudflare cron.
- Verify a real login, inspect the stored session's `network_observed_at` without exposing raw IPs to a browser, and confirm `session_device_retention_state.last_run_at` advances after the Worker cron executes. The presence of code in GitHub does **not** prove the live Worker has been updated.

## Netlify deployment (legacy path)

Netlify may continue to use `getContext().ip` and authenticated `/api/jobs` with `CAN_JOB_SECRET`. The previous Netlify deployment does not activate the new Cloudflare Worker code. Configure and test each environment separately.
