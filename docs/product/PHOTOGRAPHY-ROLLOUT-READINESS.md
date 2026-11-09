# CAN OS — seven-template photography production readiness

Reviewed November 8, 2026. **Not authorization to start paid bulk generation.**

## Scope

Seven fictional school website templates, twelve independent image roles per
template: **84 original master images**. Source-image requirements:

| Role | Aspect | Minimum pixels | Usage |
| --- | --- | --- | --- |
| `hero` | 16:9 | 3840 × 2160 | homepage hero |
| `story_01`, `story_02`, `admissions` | 3:2 | 2400 × 1600 | story, admissions |
| `program_01..03`, `community_01..02` | 4:3 | 2400 × 1800 | programs/community |
| `portrait_01..03` | 4:5 | 1600 × 2000 | people and editorial details |

The master resolution and aspect ratio are validated before R2 promotion.
The downloaded media's *actual* bytes determine image MIME; don't label PNG
bytes as JPEG just because the canonical object key ends with `.jpg`.

## Previously prepared assets

The existing `CAN_OS_photography_named_staging.zip` contains 43 labeled
photographs, staged **locally, not confirmed in Cloudflare R2**. These counts
have been verified directly from the archived image dimensions:

| Template | Staged | Meets minimum pixels | Undersized | Missing |
| --- | ---: | ---: | ---: | ---: |
| Heritage Academy | 12 | 6 | 6 | 0 |
| Community & Faith | 12 | 12 | 0 | 0 |
| Modern Learning | 6 | 6 | 0 | 6 |
| Bright Futures | 6 | 6 | 0 | 6 |
| Summit Preparatory | 6 | 6 | 0 | 6 |
| Heritage Classical | 0 | 0 | 0 | 12 |
| Campus Life | 1 | 0 | 1 | 11 |
| **Total** | **43** | **36** | **7** | **41** |

The earlier fal.ai request history also showed **one Community and two Summit**
completions, but those outputs must be individually verified in R2, not
assumed uploaded. Avoid paying to regenerate these. Verify that staging assets
pass quality review, not merely their pixel dimensions; some scenes are similar
and the Campus/Historical template heroes had overlap in earlier samples.

After reusing all 36 qualified staged files, the unmatched inventory is up to
48 assets (7 undersized replacements + 41 missing), **before** deducting
additional validated fal.ai outputs. Do not use staged files as published
school-owned photos; they are fictional illustrative template samples.

## Current R2 ingestion and generation controls

`CAN_TEMPLATE_PHOTOGRAPHY_GENERATE=true`: process existing result IDs,
read-only fal history, image bytes, validation, and R2 imports.

`CAN_TEMPLATE_PHOTOGRAPHY_SUBMIT=true`: armed for new paid requests **only after the one-time R2 cleanup is durably complete**.

`CAN_TEMPLATE_PHOTOGRAPHY_BULK=true`: enables remaining roles **only after the fresh Summit pilot is verified in R2**.

Each newly authorized paid submission stores its provider
`request_id`, `response_url` and state. Subsequent operations retrieve the
returned `images[0].url`, download and verify actual image bytes, upload to
the private `can-os` R2 bucket, then confirm the target object. Failed
downloads/uploads back off and do not incur another generation charge.
The importer also checks fal.ai's stored request history for previously paid
media, including alternate Summit outputs.

The canonical public-preview route is:
`/template-photo/<template>/<role>`.

The status API is:
`/template-photo-status?template=<template>`.

Never publish a template photo as a real school's actual campus, enrolled
student or staff image.

## Responsive display — implementation, not yet activated

The master images are original-resolution R2 objects. Additional viewport
sizes are *transformations*, NOT extra fal.ai generations.

Cloudflare native Images binding, in Wrangler as `images.binding=IMAGES`,
supports output WebP `/template-photo/<template>/<role>?w=<width>`.

| Placement | Allowed requested widths | HTML sizes |
| --- | --- | --- |
| Full-width hero | 640, 960, 1280, 1920, 2560, 3840 | `100vw` |
| Interior editorial photo | 480, 800, 1200, 1600, 1920 | viewport-dependent, max 1100 CSS px |
| Three-column mosaic | 320, 640, 960, 1280 | viewport-dependent columns |

The browser picks the optimal source from `srcset`/`sizes` for its viewport
and device-pixel ratio. WebP transformation does not make a distinct creative
crop. On mobile, CSS `object-fit:cover` may crop a 16:9 hero too tightly;
verify faces, focal points and text safe areas at 320, 375, 768, 1440 and
1920 CSS pixels before activation. If necessary, approve per-template
focal-point positioning or an art-directed mobile crop; resizing alone
does not fix composition.

Cloudflare Images transformation billing is **separate** from fal.ai billing;
unique parameter/source combinations incur billable transformations.
The responsive flag remains `CAN_TEMPLATE_PHOTO_RESPONSIVE_ENABLED=false`
until a real original and `?w=640` WebP variant are verified in production.
Netlify does not have the Cloudflare-only Images binding; its implementation
must remain functional without emitting responsive query variants until its
delivery equivalent is added.

## Slot coverage

The existing public-site renderer covered 10/12 template roles. Additional
`program_03` (Academics creative exploration) and `portrait_01`
(Student Life/student perspective) sample placements are now implemented.
`CAN_TEMPLATE_PHOTO_EXTRA_SECTIONS_ENABLED=false` keeps these extra
illustrative sections hidden until the full library has been verified, avoiding
broken preview images. Actual public-school sites remain governed by school
approved media.

## Cost envelope

fal.ai Nano Banana 2 is approximately **$0.16 / 4K generation** (verify account
pricing before launch). Generating all 84 from scratch would be about **$13.44**
before retries; up to 48 unmatched slots would be about **$7.68**, and already
paid/recovered and staged-qualified images can lower the amount further.
Budget for quality rejections, service costs and Cloudflare Images
transformations separately. Current account credit and R2 readiness have not
been independently verified.

## Mandatory release gates before enabling paid bulk

1. Confirm no new paid submissions are running, and read-only reconciliation
   identifies all previously paid fal.ai images without duplicate charges.
2. Upload the 36 dimension-qualified staged originals into the existing
   private R2 bucket with their expected 7-template/12-role paths; perform
   visual review and verify MIME and aspect ratios, not only file count.
3. Get at least one already-generated Summit or Community hero from R2 with
   an HTTP 200 media response and the expected image dimensions. The R2 probe
   and status route must report actual read/write health.
4. Verify a real R2-backed `?w=640` WebP variant with Cloudflare Images
   binding. Then enable responsive HTML `srcset` and check the five viewport
   widths and high-DPI rendering for every template.
5. Run `npx vitest run tests/unit/template-photo-cron.test.ts
   tests/unit/template-photo-responsive.test.ts
   tests/unit/template-photo-preview-roles.test.ts
   tests/unit/photo-binary.test.ts`, `npm run typecheck` and
   `npm run build:cloudflare`. Resolve all failures.
6. Run `node scripts/check-template-photo-library.mjs` against production.
   For the seven completed heroes, add `--require-heroes`. For the final
   library, use `--require-complete --check-responsive`. This script is
   read-only; it does not call the fal.ai POST endpoint.
7. Confirm the available fal.ai credit/budget and delivery per-template quota.
   The production flags are now armed, but the Worker must enforce the completed R2 reset checkpoint, verified fresh Summit hero, maximum of two in-flight requests, and no new charges after any rejected job. Monitor the 7×12 status
   matrix until 84/84 and inspect website previews.

### Verification limitation

The connected browser automation account still reported a negative TinyFish
balance during this review even after the user said funds were added; fal.ai
billing and that separate browser-service wallet are not the same account.
Cloudflare production deploy status and actual R2 object content therefore
remain unverified. Neither code commits nor mock tests prove a live upload.

## Active campaign controls (Nov 9, 2026)

The GitHub main configuration now arms the production campaign following
R2 cleanup. Check the live `campaign.ready` count (out of 84), `inFlight`
count (maximum two), and `rejected` count on the production status API.
If Cloudflare has not deployed the latest main commit, no new paid runs
should be assumed. The 3 original fal.ai requests remain the only
user-confirmed completed generations until the live dashboard changes.
