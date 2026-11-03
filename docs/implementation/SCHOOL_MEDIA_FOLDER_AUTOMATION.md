# CAN School Sites — Folder-first automatic media (approved product direction)

Status: implementation contract. Pure rights-gated placement planner committed; connector, ingestion, approval, storage and publisher UI are NOT yet integrated. This decision supersedes Unsplash discovery proposals. There is no Unsplash dependency.

## Experience

A church should **not** select a hero, academics, people, activities, About or campus photo individually during one-hour school setup. Ask once: "Where do you keep your school's photos?" Options should include an upload-a-folder control; integrations with connected Google Drive/OneDrive/Dropbox folders may follow only when provider authorization and change tracking are available. Offer "Skip for now." Make this step resumable. Do not ask for individual media selections unless the school voluntarily overrides the generated result.

After a folder is pointed/uploaded, show "We found N candidate photos; X need rights/consent review; Y are ready to use" and a private complete-site preview. Editors review the **website as a whole**, may replace an individual placement, or regenerate a coordinated set. Never imply publication from an import or preview.

## Single source of truth

- Canonical Site ID scopes every media source and object. Folder connections are source references, not arbitrary public website URLs. A URL string alone is insufficient for private cloud storage permissions.
- Store source kind, provider folder ID, owner grant reference, import cursor/revision, last indexed time, status, account authorization and a revocation tombstone. Never persist raw access tokens or browse arbitrary network URLs with public request credentials.
- Ingest into a Site-scoped object-storage namespace after an explicit user's permitted folder selection; store checksums, dimensions, MIME, provenance, licenses, owner attestations, consent, review status, alt text, responsive renditions and focal point. Never treat uploaded content as executable SVG/CSS/scripts or a trusted HTML fragment.
- Reuse existing document/object-storage, audit, capability and publication services. A separate website-assets namespace is acceptable; a second CMS, Site or Program store is not.
- Rescanning a folder updates a revision with idempotency, handles rename/delete/revocation and cannot silently republish a revoked photograph.
- The image-analysis classifier suggests tags, orientation, visual style, focal points and duplicate clusters. It does not infer rights, child consent, real staffing identities, campus ownership, regulated policies or institutional approvals.
- Images of identifiable children require an appropriate reviewed release. An uploaded folder does not establish that permission. Unclear images stay private; use an intentional design fallback.
- Use explicit accessibility alt text, approved browser-safe derivatives, predictable object-fit crops, and whole-site coordination (consistent light/color/composition). User can override the system without needing to crop/upload every page manually.
- Reuse the shared renderer and approved school content projections. Never claim a stock photo depicts that Site or its students/campus.
- Marketing publication, public host readiness and school-opening authorization remain independent.

## End-to-end implementation steps

1. **Onboarding:** one folder selection with standard multiple-upload fallback and provider-grant discovery if available. Keep the original source private; display authorization, sync and disconnect controls.
2. **Ingest:** authorized Site-scoped R2 staging with MIME signature verification, size limits, malware/image decode checks, orientation normalization, EXIF/GPS stripping, file deduplication and immutable source version IDs. No automatic public access.
3. **Classify:** automated image tags for academics/people/campus/activities/community; orientation, color temperature and image quality. Log analysis model/version and confidence; no invented captions.
4. **Rights and publication:** editor attests rights and obtains/records appropriate subject releases; independent institutional approval only where the image implies regulated facts. Publish only exact reviewed media revisions.
5. **Compose:** `planSchoolSiteMedia` selects from *approved* classified assets, favors topic and compatible crop and cohesive art direction, avoids repeated images, and produces an auditable preview plan with missing-slot fallbacks.
6. **Render:** shared image components serve reviewed optimized variants for hero, About, academics, Student Life, families, campus and people. Responsive srcsets, meaningful alt text and safe focal positions. No stale public images after revoke.
7. **QA:** prove Valor (classic navy/gold), Ridgeview (forest/sage), Harborlight (harbor burgundy/rose), an empty-media fourth school, and a multi-Program fifth school using exactly one renderer, with desktop/mobile and read-only preview parity. Review all links, placements, performance, rights and permissions.

## Definition of done

A new church can start a canonical school, point to one folder (or upload it), have the system create a coordinated, responsive multi-page draft without hand-selecting photographs, review rights once at the relevant asset/release level, and publish the website through the existing authority checks. Editing or revoking a source updates every placement reliably. Missing photos never block a legal launch process or result in false school imagery.

A green planner unit test or a reviewed visual comp alone is **not** end-to-end completion. Require persisted isolated DB/blob acceptance and browser review before enabling public-folder import for real tenants.
