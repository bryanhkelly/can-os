# CAN OS Website Studio

**Status:** Canonical product and ownership contract. Source identifiers were verified on `main` on November 7, 2026. A route or implementation file does **not** establish completed browser, database, accessibility, public-hosting, or production acceptance.

## Product experience

After an authorized Site Admin creates the minimal Site profile, **Build Website** in the full-page Launch Hub should open the canonical Website Studio **directly** for that exact Site. The experience should produce a distinctively designed school website, not require the user to understand internal publications, CSS, content DTOs or Program ownership.

Site Admins are the final local authority over Site-owned identity, website copy and draft design **within** CAN institutional, licensing, privacy, identity/relationship, safeguarding and reviewed-claim rules. Independent academic credentials, Program approval, advertised funding and opening authorization remain outside local website publication authority.

The Studio must be resumable. A private saved draft, an authorized published Site page, a publicly reachable HTTPS site, and an eligible admissions entry point are **four different states**.

## Six-step authoring experience

1. **Welcome and sources.** Explain the generated website, draft/review outcomes and optional existing church/school website or social links. A third-party URL is reference information, not automatically approved content.
2. **Template.** Select one of the five separate structural website systems. This is not a set of palette-only variations.
3. **Visual identity.** Choose controlled color palettes, heading/body font options and Site identity without accepting arbitrary CSS or remote untrusted style input.
4. **School photographs.** Provide approved school-owned media in a folder-first flow; preview placements and withhold media without adequate rights/subject release. See [School Website Media](WEBSITE-MEDIA.md).
5. **School story.** Edit verified, local welcome, vision, mission, community and leadership content. Protect official academic, legal, tuition, admissions and institutional claims from unreviewed edits.
6. **Review and finish.** Preview the current proposed draft at desktop and mobile sizes, explicitly save with revision conflict protection, then publish only through the authorized Site workflow and any required independent reviews.

A Site with no available address may require a **single explicit preparation step** before editing, not an unrelated interstitial or a six-step dead end. Existing Site reentry should return to usable template/design work. User Back and exit controls must preserve the selected Site and unsaved changes; invalid Site IDs must not quietly select another school.

## Five website identities

The current source catalog `src/domain/public-site-templates.ts` defines:

| Template ID | Name in source | Intent |
| --- | --- | --- |
| `heritage` | Heritage Academy | Timeless academic editorial |
| `community` | Community & Faith | Warm people/community story |
| `modern` | Modern Academy | Bold, contemporary and information-first |
| `bright-futures` | Bright Futures | Bright, welcoming family orientation |
| `summit` | Summit Preparatory | Immersive aspirational storytelling |

These five layouts use ordered content sections and template-scoped static styling, not separate publisher databases. **Naming reconciliation:** earlier product briefs used *Modern Learning*; current code calls the template *Modern Academy*. The desired public label needs an explicit product decision before changing it. Do not create duplicate template IDs to paper over the discrepancy.

`src/domain/site-theme.ts` defines finite template, palette, typography and font choices. The editor must use the allowlisted catalog and keep chosen structural layout independent of the palette and typography. The website design system is distinct from CAN OS's internal workspace theme. See [Design Authority](../design/README.md).

## Canonical data, security and publishing

- The **Site** owns the public address and its local website identity. Academic Programs and their approval are separate CAN-controlled records.
- Reuse the same authorized editor and local content versioning for `/launch/website` and ongoing `/site-website`. Use Run → Settings after launch; do not duplicate the editor to serve one route.
- Drafts stay private. `src/modules/sites/site-local-content.server.ts` reads only published local revisions for the live public Site and preserves bounded revision history for authorized editors.
- An authorized local content publication is transactional, revision-checked and audited. Protected claims must follow independent review and must not be inserted by website templates, imported copy, media classification or user-supplied URLs.
- Published page HTML must use the canonical public-safe Site/Program projection and shared renderer, not student/guardian private information.
- Public host reachability requires separate HTTPS/DNS/TLS verification. In-app published status alone does **not** imply public reachability, functioning inquiry/admissions or authority to operate a school.

## Current implementation pointers

- Studio route: `src/routes/launch.website.tsx` delegates to the same Website Home as `src/routes/site-website.tsx`.
- Layout catalog: `src/domain/public-site-templates.ts` supplies five finite structures.
- Theme constraints: `src/domain/site-theme.ts`.
- Local revisions and policy: `src/domain/site-local-content.ts`, `src/modules/sites/site-local-content.server.ts`.
- Public renderer and publication workflow: `src/domain/public-site-html.ts`, `src/modules/sites/site-publication.server.ts`.
- Site media: `src/modules/sites/site-media-folder.server.ts`.
- Launch context: `src/components/launch-studio/SchoolLaunchHub.tsx` and [School Launch and Run](LAUNCH-AND-RUN.md).

These paths are implementation pointers, **not** proof that all six steps, templates, breakpoints, permissions and external hosts have passed real-user tests.

## Required acceptance

Test creating a Site stub; opening the Studio directly from Hub and Settings; all five templates with genuinely distinct composition; palette and typography persistence; draft save/reload/unsaved changes/Back; wrong-Site and unauthorized publishing denials; review-required claims; media rights and revocation; publish versus preview; exact Site and Program separation; mobile/desktop layout; and independent HTTPS reachability. Use an isolated database, record the exact commit and scope of observed results, and mark everything else unverified.

## Operational and historical references

- [Public Site publication contract](../site-public-publishing.md)
- [Tenant-hosting release checklist](../public-tenant-hosting-release.md)
- [School Website Media](WEBSITE-MEDIA.md)
- [Historical Website Studio implementation handoff](../archive/2026-11-fullflow/delivery-evidence/website-launch-studio-implementation.md) (dated PR status; not current implementation authority)
