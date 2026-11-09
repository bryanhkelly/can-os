# CAN OS — fal.ai template photography production

This pipeline is **developer controlled**, not a public school website feature. Never call image generation from the website renderer, from a Site Admin's ordinary website preview, or automatically when a school is created. Generation incurs charges.

## Secret

Cloudflare Worker environment: `FAL_KEY` stored as a **Secret**, not plain text. The repository must never contain its value. The key is read by `src/platform/photography/fal-generation.server.ts` only on the server. Installing a Cloudflare secret does not make it available in local terminal/Netlify deployments; use an independent secret in any additional runner that genuinely requires it.

## Production contracts

- `src/domain/template-photography-production.ts` defines the seven styles, 12 scene roles, exact filenames, dimensions and two sequential batches of six.
- `schoolPhotographyBatch(template, 1)` and `schoolPhotographyBatch(template, 2)` create complete photographic briefs; no generated composite sheets.
- `submitSchoolPhoto(template,role)` queues **one** Nano Banana 2 image with 4K output and JPEG format. Queue request IDs are returned for tracking.
- `schoolPhotoStatus(requestId)` polls an existing submission. `schoolPhotoResult(requestId)` retrieves its provider URL once complete.
- **None of these methods is exposed as a public HTTP route.** An operator-facing, authenticated, rate-limited production workflow with persistent requests, review and spend limits must be built before any paid submissions are enabled.
- A provider image URL is NOT a CAN OS template URL. Do not populate the active manifest until the actual file is downloaded, validated and uploaded to R2.
- The first paid test should be ONE Community & Faith hero. Confirm that a 4K result actually meets the required 3840×2160 pixels; the provider's '4K' parameter is not itself proof of exact pixel geometry.

## Completion requirements

1. Add persistent operator job records and spending controls (maximum requests per run, explicit cost approval, retry budget).
2. Add operator-only authentication/authorization separate from ordinary Site Admins.
3. Submit one hero and store its request ID; check status and retrieve result after completion.
4. Download only validated provider-hosted result URLs using an allowlisted endpoint, inspect pixel dimensions, quality and face/hand anomalies.
5. Assign exact role filename and SHA-256; record source provider/model/request ID.
6. Upload to the existing private R2 bucket under `school-template-previews/v2/{template}/{role}.jpg`; verify remote checksum, MIME and signed GET.
7. Review crops at desktop/tablet/mobile, then explicitly accept or regenerate.
8. Update `src/domain/template-photography-v2.json` using verified output facts and enable `CAN_TEMPLATE_PHOTOS_V2_ENABLED` only after missing-object checks. Do not enable prematurely.
9. Verify both Cloudflare and Netlify image routes and rollback behavior independently.

## Safety and integrity

Fictional sample imagery is labeled and may appear only in private website/template demonstrations; never silently publish it as a real school's campus or students. Never attach fal output to a Site's approved school media record. Avoid repeated faces or falsely claimed institutional experiences. All image generation remains opt-in and chargeable.

## Current status

Code for creating briefs and communicating with the fal.ai queue has been committed. No generation has been triggered, no charges have been incurred by this code change, and the configured key has not been tested from this environment. The v2 asset manifest remains staged; the uploaded 43-image package is not yet uploaded to the production R2 bucket.

## Scheduled production implementation — November 8, 2026

The Cloudflare Worker now contains a `scheduled` handler, registered by `wrangler.jsonc` to run every five minutes. The generation flag `CAN_TEMPLATE_PHOTOGRAPHY_GENERATE=true` is set in Wrangler configuration. This **does not mean that the live Worker has been deployed**.

The scheduled worker reserves each job in private R2 before a paid fal request, submits up to four new jobs per tick, checks existing queue jobs, validates downloaded JPEG dimensions and stores accepted outputs in `school-template-previews/v3/<family>/<role>.jpg`. A persistent cursor prevents traversing all 84 roles in one Worker event. Rejected and reserved records require operator inspection instead of automatically incurring further charges. The total planned library is seven templates × twelve roles = 84 independent images. Use `CAN_TEMPLATE_PHOTOGRAPHY_GENERATE=false` to stop submitting and processing jobs.

The private website image resolver points to `/template-photo/<template>/<role>` and prefers existing validated v3 objects, with narrow fallback for older sample assets; public school-owned media remains separate. A read-only route at `/template-photo-status?template=community` reports progress by template once code is deployed.

**Deployment is mandatory.** The Netlify site was confirmed running an older November 5 commit, and the Cloudflare public status URL showed the app's 404 page on November 8; neither observation constitutes a successful production deploy. Deployment requires an authenticated Cloudflare session or an authorized CI runner. Once deployed, verify the Worker has the `FAL_KEY` secret and the existing `CAN_R2_ACCOUNT_ID`, `CAN_R2_BUCKET`, `CAN_R2_ACCESS_KEY_ID`, and `CAN_R2_SECRET_ACCESS_KEY` secrets. Do not print secret values. Verify a real 4K hero R2 object and rendered template image before considering the process operational.

## November 8 — Summit Preparatory isolated production pilot

The current Cloudflare deployment configuration creates exactly **one** new billed image job:
`summit/hero` (requested JPEG, `4K`, `16:9`). It uses a fresh durable
reservation at `school-template-production/pilot-summit-20261108/hero.json`,
isolated from previous attempts. Worker cron runs once per minute. New
generation is submitted only when neither a verified R2 file nor an existing
pilot request exists. After submission, the Worker polls fal.ai, fetches
`images[0].url` from the completed result, persists that URL in the private
R2 job state, downloads the bytes from allowlisted HTTPS media hosts, validates
JPEG dimensions, uploads to `school-template-previews/v3/summit/hero.jpg`,
and verifies the R2 object before reporting `completed`.

Import failures preserve both the provider request ID and available asset URL
and attempt a bounded recovery up to eight times; they do **not** submit a
replacement image request. Bulk photo submission is disabled unless the
Cloudflare environment explicitly sets
`CAN_TEMPLATE_PHOTOGRAPHY_BULK=true`. Do not enable bulk before this pilot's
R2 asset and displayed preview are verified.

The GitHub workflow `.github/workflows/template-photo-pipeline.yml`
validates the mock submit→complete→R2→website lifecycle and Cloudflare build,
then polls the production Summit status and image routes. It has no fal.ai
secret and never makes a paid submission.

Production test URLs:

- `https://can-os.bryanhkelly.workers.dev/template-photo-status?template=summit`
- `https://can-os.bryanhkelly.workers.dev/template-photo/summit/hero`

Treat these routes, the GitHub Action result, and Cloudflare cron logs as the
source of verification. Committing code does not itself prove a live asset was
generated or uploaded.
