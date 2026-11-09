# CAN OS — Reversible R2 photo-folder cleanup

Reset ID: `2026-11-09-template-photo-refresh`.

## Purpose

Remove stale, generated fictional school photography and its persisted
fal.ai/cron job state before the next **84 master images** are requested.
R2 keys do not represent real filesystem directories; each prefix below
names only object keys in the private `can-os` bucket.

## Strictly scoped old prefixes

1. `school-template-previews/v3/` (generated JPEG/PNG/WebP, and the
   preceding generation's internal `_archive` variant images)
2. `school-template-production/v1/` (known image job JSON, cursor,
   old R2 probe and fal history state)
3. `school-template-production/pilot-summit-20261108/` (old Summit pilot)

Only known role/key patterns are deleted. Unknown objects cause a persistent
`blocked` state: do not expand the prefix deletion to circumvent the guard.
The following are **not** deleted: `school-template-previews/v1/`,
`school-template-previews/v2/`, real school media, unrelated `can-os` data,
the separate maintenance marker, and previously archived material.

## Safe automatic cleanup

Wrangler variables are currently configured for this specific one-time reset:

- `CAN_TEMPLATE_PHOTO_RESET_ONCE=2026-11-09-template-photo-refresh`
- `CAN_TEMPLATE_PHOTOGRAPHY_SUBMIT=false`
- `CAN_TEMPLATE_PHOTOGRAPHY_BULK=false`
- `CAN_TEMPLATE_PHOTO_RECOVER_HISTORY=false`

The Worker scheduled handler (once per minute) processes up to **four
objects per tick**, using this order for each original:

1. Get the object and its metadata from R2. Reject files larger than 25 MB.
2. Copy the *actual bytes* into the separate private archive:
   `school-template-photo-archive/2026-11-09/<original-key>`.
3. Read that backup back from R2, compare full bytes to the original.
4. Delete the original key, and confirm the original is missing.
5. Update the durable progress marker:
   `school-template-maintenance/2026-11-09-template-photo-refresh.json`.

A completed marker prevents the reset from running again, so once new assets
arrive they are not deleted. Missing/failed backups stop deletion. The active
R2 probe now lives under `school-template-maintenance/`, outside the cleared
job-state folder. Old fal.ai result history cannot repopulate v3 during the
fresh-start configuration.

**The dashboard screenshot from Nov 8 confirmed an original Community hero
at `school-template-previews/v3/community/hero.jpg`**. It is intentionally
archived and removed from the live v3 key as part of this reset, but remains
recoverable from the maintenance archive.

## Verify before restarting generation

Open any of:

- `https://can-os.bryanhkelly.workers.dev/template-photo-status?template=community`
- `https://can-os.bryanhkelly.workers.dev/template-photo-status?template=summit`

The `photoReset` section must show `phase:"completed"` with `copied`
and `removed` counts. All seven template statuses should temporarily report
`generated:0` once the reset is complete (until newly generated assets
arrive). `newSubmissionsEnabled` must be false.

The R2 dashboard must show the three old prefixes empty, their contents under
`school-template-photo-archive/2026-11-09/`, and no unexpected keys.
The read-only CI command is:

```sh
node scripts/check-template-photo-library.mjs --require-reset
```

### Important limits

The reset code is committed to GitHub, but an authenticated Cloudflare
deployment and live scheduled executions must occur before R2 is actually
clean. Code commits alone are not proof of deletion. A `running` status means
the batches are still being processed. A `blocked` status requires a human
review of the unexpected file or archive mismatch before any further deletion.
If the status route still has no `photoReset` field, the new Worker code
has not been deployed.

The reset does **not** submit new fal.ai requests. Do not turn on paid bulk
submission until the `completed` marker and 84-photo readiness checks are
verified. Resetting the active v3 source makes demo preview images temporarily
unavailable until the new library is populated; published school-owned media
is unaffected.
