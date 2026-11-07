# CAN OS Website & Brand Studio

**Status:** Canonical product and ownership contract. Source identifiers were verified on `main` on November 7, 2026. A route or implementation file does **not** establish completed browser, database, accessibility, public-hosting, or production acceptance.

## Product experience

After an authorized Site Admin creates the minimal Site profile, **Website & Brand** in the full-page Launch Hub should open the canonical Website & Brand Studio **directly** for that exact Site. The experience should establish a single school-specific brand and distinctively designed hosted school website, not require the user to understand internal publications, CSS, content DTOs or Program ownership.

Site Admins are the final local authority over Site-owned identity, website copy and draft design **within** CAN institutional, licensing, privacy, identity/relationship, safeguarding and reviewed-claim rules. Independent academic credentials, Program approval, advertised funding and opening authorization remain outside local website publication authority.

The Studio must be resumable. A private saved draft, an authorized published Site page, a publicly reachable HTTPS site, and an eligible admissions entry point are **four different states**.

## Six-step authoring experience

1. **Welcome and sources.** Explain the generated website, draft/review outcomes and optional existing church/school website or social links. A third-party URL is reference information, not automatically approved content.
2. **Website design.** Select one of seven separate structural website systems. This is not a set of palette-only variations. The selected design also defines the starting brand language.
3. **School brand.** Preview a unique school wordmark generated from the actual school name and selected design. Select controlled color palettes and heading/body fonts, optionally apply the design's suggested pairing, and download the generated SVG wordmark. No arbitrary CSS or untrusted SVG is imported.
4. **School photographs.** Provide approved school-owned media in a folder-first flow; preview placements and withhold media without adequate rights/subject release. See [School Website Media](WEBSITE-MEDIA.md).
5. **School story.** Edit verified, local welcome, vision, mission, community and leadership content. Protect official academic, legal, tuition, admissions and institutional claims from unreviewed edits.
6. **Review and finish.** Preview the proposed hosted site at desktop and mobile sizes. Save template, typography, palette, Site story and artwork together with revision conflict protection. Publishing remains separate and uses the authorized Site workflow and any independent reviews.

A Site with no available address may require a **single explicit preparation step** before editing, not an unrelated interstitial or a six-step dead end. Existing Site reentry should return to usable template/design work. User Back and exit controls must preserve the selected Site and unsaved changes; invalid Site IDs must not quietly select another school.

## Saved draft and authenticated full-page preview

Website drafts are immutable revisions in `site_local_content_versions` with
status `draft`, not public Site publications. Migration
`drizzle/0077_website_private_drafts.sql` extends the historical status
constraint to permit `draft`; it must be applied to the intended database
through a verified migration procedure before saving can succeed. Deployment
of application code alone cannot repair an unmigrated database.

The Studio distinguishes three rendered states:
- **Preview unsaved changes:** an editor-only, non-persisting scoped preview of
  the current in-memory form, never a claimed saved revision.
- **Latest saved private design:** the latest Site version (including a draft),
  available in the editor and through `GET /website-preview?siteId=...&page=...`.
- **Published hosted Site:** only locally published copy and independently
  approved claims; it does not automatically inherit private draft edits.

The full-page preview uses the exact same email/code session and active Site
grant as CAN OS. The server checks the Site ID, current membership, exact
Site editor/admin role, capability and relationship, re-reading the saved
revision per request. Unauthenticated sessions return to the existing sign-in
flow; wrong-Site and unauthorized access fail closed. Sharing a preview link
does **not** create an invitation or grant access; separately invited reviewers
need their own authorized Site editor account. There are no anonymous access
tokens, application forms, indexed pages or publication side effects.
Internal navigation stays inside the authenticated Site-specific preview, and
headers require private/no-store and noindex. Saved previews remain
unavailable until the first draft has actually committed.

Do not treat the repository migration as evidence of a live Neon migration,
or a successful unit test as a browser acceptance run on Cloudflare.

## Shared Site-owned brand

The Website & Brand Studio uses the existing Site versioned local branding
record; it does not create a second school brand database or an alternate editor.
The Site Admin remains final local authority within existing review rules.

- A school-specific monogram is derived from the canonical Site name rather than
  carrying the sample name or placeholder logo included with each ZIP prototype.
- The selected website design and approved palette/font tokens drive the editable
  wordmark preview. The wordmark export is a locally generated, escaped SVG with
  safe fonts, no embedded scripts and no external dependencies.
- The same Site-derived monogram appears in each of the seven hosted website
  mastheads. The visual language differs intentionally across the seven designs.
- Switching templates preserves the school data and previously chosen branding.
  **Apply recommended brand** is an explicit action that updates palette and
  typography, not an automatic reset of an administrator's choices.
- Email-header concepts may be displayed privately in the brand preview, but
  no email messages are sent and no landing or survey pages are published by
  this module. Recruiting and publishing those experiences are separate work.
- The ZIP's fictional-school logo files are design references, not automatically
  approved logos or school-owned media. Any future imported school logo needs
  explicit rights and sanitization checks before publication.

A private saved brand is not authorization to operate, a public school website,
a published admissions CTA, or an approved claim.

## Seven hosted-school website identities

The Website Builder controls the **public school website only**, not the internal
CAN OS dashboard, the Launch Hub or school operating surfaces. The seven supplied
static design studies inform the visual architecture; public facts still come from
the existing reviewed Site/Program projection and canonical publisher.

| Saved template ID | Design | Defining public experience |
| --- | --- | --- |
| `heritage` | Heritage Academy | Academic journal with masthead, folio and split cover |
| `community` | Community & Faith | Neighborhood poster, human-centered story, photo notes |
| `modern` | Modern Learning | Dark digital workspace with persistent sidebar and bento |
| `bright-futures` | Bright Futures | Oversized expressive type, round portrait, playful cards |
| `summit` | Summit Preparatory | Cinematic cover, expedition spine and narrative chapters |
| `classic` | Heritage Classical | Collegiate crest, formal academic layout, three pillars |
| `campus` | Campus Life | Editorial school journal with photographic story mosaic |

The existing IDs remain stable; the public Modern label follows the design
source's *Modern Learning* naming. `bright-futures` retains its persisted ID
despite the archive's shorter `bright` folder name. `src/domain/site-theme.ts`
is the finite template allowlist. The seven structures, styles and shells are
implemented in `src/domain/public-site-templates.ts` and rendered by the
canonical `src/domain/public-site-html.ts`.

All seven use the same ten authorized public page paths: Home, About, Academics,
Learning Model (`/school-day`), Student Life, Families, Admissions, Tuition &
Aid (`/tuition`), FAQ and Contact. A route appears in the live navigation only
when the school has the corresponding eligible public facts. The private gallery
uses explicitly fictional samples to demonstrate all ten pages and both desktop
and phone layouts. The sample media is not published as real school photography.
The Site Admin's saved template, local content, selected fonts and palette
persist independently.

The seven HTML prototypes and brand-kit imagery provided as reference material
are not themselves authenticated applications or verified school media. Do not
ship their demo-only contact forms or unreviewed academic claims. The approved
CAN OS forms and publishing gates remain authoritative.

## Canonical data, security and publishing

- The **Site** owns the public address and its local website identity. Academic Programs and their approval are separate CAN-controlled records.
- Reuse the same authorized editor and local content versioning for `/launch/website` and ongoing `/site-website`. Use Run → Settings after launch; do not duplicate the editor to serve one route.
- Drafts stay private. `src/modules/sites/site-local-content.server.ts` reads only published local revisions for the live public Site and preserves bounded revision history for authorized editors.
- An authorized local content publication is transactional, revision-checked and audited. Protected claims must follow independent review and must not be inserted by website templates, imported copy, media classification or user-supplied URLs.
- Published page HTML must use the canonical public-safe Site/Program projection and shared renderer, not student/guardian private information.
- Public host reachability requires separate HTTPS/DNS/TLS verification. In-app published status alone does **not** imply public reachability, functioning inquiry/admissions or authority to operate a school.

## Current implementation pointers

- Studio route: `src/routes/launch.website.tsx` delegates to the same Website Home as `src/routes/site-website.tsx`.
- Layout catalog: `src/domain/public-site-templates.ts` supplies seven finite structures.
- Theme constraints: `src/domain/site-theme.ts`.
- Local revisions and policy: `src/domain/site-local-content.ts`, `src/modules/sites/site-local-content.server.ts`.
- Public renderer and publication workflow: `src/domain/public-site-html.ts`, `src/modules/sites/site-publication.server.ts`.
- Site media: `src/modules/sites/site-media-folder.server.ts`.
- Launch context: `src/components/launch-studio/SchoolLaunchHub.tsx` and [School Launch and Run](LAUNCH-AND-RUN.md).

These paths are implementation pointers, **not** proof that all six steps, templates, breakpoints, permissions and external hosts have passed real-user tests.

## Required acceptance

Test creating a Site stub; opening the Studio directly from Hub and Settings; all seven templates with genuinely distinct composition; palette and typography persistence; draft save/reload/unsaved changes/Back; wrong-Site and unauthorized publishing denials; review-required claims; media rights and revocation; publish versus preview; exact Site and Program separation; mobile/desktop layout; and independent HTTPS reachability. Use an isolated database, record the exact commit and scope of observed results, and mark everything else unverified.

## Operational and historical references

- [Public Sites and Admissions](PUBLIC-SITES-AND-ADMISSIONS.md)
- [Tenant-hosting release checklist](../public-tenant-hosting-release.md)
- [School Website Media](WEBSITE-MEDIA.md)
- [Historical Website Studio implementation handoff](../archive/2026-11-fullflow/delivery-evidence/website-launch-studio-implementation.md) (dated PR status; not current implementation authority)
