# School Website Media: Source, Rights, Review, and Publication

**Status:** Canonical product requirements and source-observed implementation boundaries, inspected on `main` on November 7, 2026. The existence of code is **not** evidence of production enablement, browser acceptance, image-quality approval or validated guardian consent.

## Experience

A Site Admin should be able to provide school-owned photographs in one deliberate folder-upload step rather than selecting a hero photo for every webpage. The initial upload is optional, resumable and private. After ingest, CAN OS suggests a **cohesive whole-site composition** across hero, about, academics, student life, campus and family sections. The Site Admin previews the draft and can replace placements, correct metadata or withhold any image.

Missing or disallowed photographs must not block school setup or produce made-up school imagery. Use intentional non-photographic template artwork rather than pretending that a generic photograph depicts the host school. The act of uploading images does not publish a website or authorize school opening.

## Product boundaries

1. **Source:** The Site Admin selects an authorized local folder or submits files to a Site-scoped import. Persist the original source/provenance and preserve author/editor accountability.
2. **Private ingest:** Keep bytes private, limit upload scope and file types, verify storage object signature, and record a canonical Document plus audit evidence. Do not expose raw R2 keys, trust user-supplied HTML or allow network fetching of arbitrary file URLs.
3. **Rights and subject release:** Record copyright/license and consent review for **every proposed public image**, especially identifiable children. Metadata tags, uploads, a filename or a bulk attestation are not themselves independent evidence that a particular child has authorized release.
4. **Automated placement:** Use reviewed eligible images only. Any classifier suggests categories and crops; it must never infer permission, legal identity, school affiliation, staffing, facilities or accreditation.
5. **Preview:** Show the entire Site draft. Permit explicit replacements, removals, alternate text, and inspection of how the images will appear on mobile and desktop.
6. **Publish and revoke:** Require authorized Site content publication and institutional claim checks as applicable. Removing or revoking permission must stop future public exposure and invalidate affected placements or derivatives.
7. **Connections:** Google Drive, OneDrive and Dropbox folder connections are future integrations, not implied by having a local upload control.

## What the current source establishes

| Area | Evidence in source | Important limitation |
| --- | --- | --- |
| Input contract | `src/domain/site-media-folder.ts` accepts Site UUID, JPEG/PNG, bounded dimensions and **8 MiB maximum per file** | Schema existence does not certify upload UX |
| Server entry | `src/modules/sites/site-media-folder.functions.ts` exposes begin, finish, list, review and revoke operations with command context | Exact Site authorization is checked server-side |
| Storage | `src/modules/sites/site-media-folder.server.ts` prepares private R2 uploads and verifies the stored object before recording a Document | Controlled by `CAN_R2_SITE_MEDIA_UPLOADS_ENABLED=true`; the default is not assumed enabled |
| Categorization | `suggestSiteMediaTags` uses controlled folder and filename vocabulary | Not computer vision or legal consent verification |
| Composition | `src/domain/school-site-media-selection.ts` plans placements from reviewed, rights-approved Site media | Pure planner only; no publication authority |
| Public delivery | `src/routes/published-site.media.$assetId.ts` is a public-media route | Its authorization and cache behavior require execution/inspection to certify |

The server upload schema currently requires an explicit review request with `rightsConfirmed`, subject-release disposition, and attestation. **This is a workflow control, not a substitute for the appropriate release record or school policy.** Source-level flags and tests do not establish that production R2, CORS, storage permissions or public host routing have passed acceptance.

## Not yet established as released

- Durable provider-owned cloud-folder connections, resync, deletion reconciliation and token lifecycle.
- Image-content classification that proposes accurate placement and visual family.
- Complete photo-library curation or guaranteed photographic assets for all five school templates.
- Independent verification of guardian/student photo releases beyond the documented authorized review process.
- End-to-end isolated database, R2, publishing, revocation, mobile/browser and visual-quality acceptance.

Treat those as planned or unverified, not quietly implemented through mocks or interface fallback paths.

## Security and UX acceptance

Before enabling for real school sites, execute an authorized Site Admin happy path and unrelated-Site denial; object-type and size negatives; interrupted/resumed upload; document record/revision and audit checks; rights denial and revocation; removal from all public placements; image integrity and alt text; and five distinctly branded Site previews on desktop/mobile. Validate that a disabled feature flag produces an explicit unavailable state, never a misleading success.

Keep media handling separate from public academic claims, family recruitment, the institution's school-of-record authority and the legal opening decision.

## Related references

- [School Launch and Run](LAUNCH-AND-RUN.md)
- [Website Studio](WEBSITE-STUDIO.md)
- [Platform Capabilities](PLATFORM-CAPABILITIES.md)
- [Private R2 document handling](../cloudflare-r2-enrollment.md)
- [Public Sites and Admissions](PUBLIC-SITES-AND-ADMISSIONS.md)
- [Design authority](../design/README.md)
- [Historical folder-first media implementation handoff](../archive/2026-11-fullflow/delivery-evidence/implementation/SCHOOL_MEDIA_FOLDER_AUTOMATION.md) (source provenance, not current approval)
