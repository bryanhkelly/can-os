# Introduce / Promote: immutable Site Brand-connected Marketing Packages V6.1

**Branch:** feature/launch-studio-v61-clean-cutover-20261118

## Implemented
- Promote is a Site-scoped, server-authorized package library and four-step content workflow: Menu, Audience, Messages, Collateral & Assets.
- Operators can create, save, reopen, duplicate, archive, restore and permanently delete draft package content.
- Dedicated site_marketing_packages table (migration 0088) with revision checks, exact Site/organization ownership, actor attribution and append-only audit metadata. Marketing Package records now select a canonical immutable Site Brand version through migrations 0089/0090.
- Four purpose-specific starters read the same private Site Information Purpose & Story choices and Programs & Audiences intent saved in Establish. The builder proposes an audience and editable message, without publishing private narrative answers or inventing approved offerings.
- Saved Website & Brand copy is offered as a separate explicit suggestion. Existing package edits and released assets never change automatically.
- Flyer, handout and social SVG templates have format-specific V2 layouts; social releases retain a complete text caption. Generated SVG artwork can also be downloaded as PNG through the browser, from immutable output bytes.
- The existing V6.1 LaunchSiteFrame, WorkspaceShell, ActionFooter, and form primitives are reused.
- Collateral & Assets displays a large live visual preview beside the format picker. The authorized POST preview service calls the exact same Site artifact renderer used by immutable releases, using the package's saved Brand version (or the current saved Brand for a new package) and current unsaved copy. SVG layouts are displayed as images; email HTML is isolated in a sandboxed iframe. Previewing creates no artifact, publication, or distribution record.
- No Brand: show a clear Establish handoff. No authorized durable public URL: explain why a QR card cannot be previewed. Protected claims: show a review message rather than rendering promotional output.

## Not implemented (outside this slice)
- Production server-generated PDF/ZIP exports and a fully unified R2 media-library interface. Initial SVG collateral, browser PNG conversion, and HTML email generation with immutable release snapshots are implemented in source but remain unverified.
- Recipients, contact importing, consent, unsubscribe, marketing email delivery, scheduling.
- Creation of public interest forms or enrollment claims.
- No pretend asset thumbnails, send metrics, delivery status or fake public links. The live collateral preview uses the exact production SVG/HTML renderer, with typing debounced. Material previews use the real SVG/email templates; native email sending is still out of scope.

## Integration boundary
Package records remain mutable while their selected canonical Brand version is explicit. Artifact releases capture immutable output, Brand version, message, template and asset provenance. Publishing the website is not required. Direct sending remains a separately authorized capability. A Site website does not need to be published to author a private package.

## Authorization and lifecycle
- Use a verified server session and assertSiteSetupScope for each read and mutation; a URL Site ID is not authorization.
- Mutations use database transactions, package-row locking, revision checks and audit metadata that excludes private message bodies.
- Statuses are draft or archived only. Ready, delivered, published, exported, or enrolled are not inferred from completion of a wizard page.
- Delete is permanent for an unsent draft package (there is currently no distribution relationship to orphan).
- A database without migration 0088 fails explicitly. Do not silently persist packages in generic Launch drafts or browser local storage.

## Required before enabling live usage
1. Review and apply migration 0088 in the authorized environment, including scope and RLS behavior.
2. Run TypeScript, lint, unit and authenticated Site-grant tests including cross-Site denial, source-derived suggestions, concurrent revisions, template geometry and downloaded PNG bytes.
3. Test full four-step create/edit/duplicate/archive/delete interaction and keyboard accessibility, plus real preview refresh on format/Brand/content change. Exercise missing-Brand, protected-claims and unavailable-QR states.
4. Verify the canonical Brand resolver, initial SVG/HTML collateral renderer and immutable release snapshots, then add production print/PNG/ZIP exports and separately authorized distribution.

Changing these components does not apply a migration or modify a production database.
