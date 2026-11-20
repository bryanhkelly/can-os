# Introduce: shared immutable-Brand Marketing Packages V6.1

**Branch:** feature/launch-studio-v61-clean-cutover-20261118

## Implemented
- **Promote, Recruit Families / Learners, and Interest Events all use one Site-scoped Marketing Package library.** `launch-introduce-v61.ts` provides only module-specific labels, purpose filters, and handoffs. It does not add a new data store, Brand reader, prospect CRM, event source, or enrollment authority.
- Promote offers all four editorial purposes; Recruit focuses on interest invitations and program ideas; Interest Events focuses on event invitations. Existing saved packages remain reusable and Brand-pinned across modules. Module changes remount the editor so unsaved working state cannot leak between destinations.
- The Launch route loads the same authorized `listSiteMarketingPackagesV61` and `readSiteMarketingSuggestionsV61` for all three. Optional suggestion failure is reported separately instead of hiding saved packages. Package read failure shows an explicit retry state, not a fabricated empty library.
- Recruit's handoff now opens the **existing preopening interest invitation** mode for the exact selected Site. That service already supports consent-aware adult interest invitations for eligible developing Programs, retains the saved Site Brand through `readSiteFamilyBrand`, and applies independent registrar/Program/Site authorization. The invitation editor starts with the same Site Story/Programs editorial suggestion and requires an explicit send confirmation.
- Interest Events uses the existing Program-linked event service. A saved, active **event-invitation Marketing Package** can now hand its editable headline directly into event creation, with exact Site and package ID validation. When no package is selected, the create screen may suggest a title from the same Site Story and Programs & Audiences projection. The operator still supplies the Program, confirmed date, time, location, and description; no event is created or distributed by the marketing module.
- The focused modules do not imply a new Site-wide prospect CRM, marketing distribution service, or event store.
- Promote is a Site-scoped, server-authorized package library and four-step content workflow: Menu, Audience, Messages, Collateral & Assets.
- Operators can create, save, reopen, duplicate, archive and restore editable Package drafts. **Only unreleased drafts can be permanently deleted**; Packages with generated releases are archived to preserve immutable audit and download references.
- Dedicated site_marketing_packages table (migration 0088) with revision checks, exact Site/organization ownership, actor attribution and append-only audit metadata. Marketing Package records now select a canonical immutable Site Brand version through migrations 0089/0090.
- Four purpose-specific starters read the same private Site Information Purpose & Story choices and Programs & Audiences intent saved in Establish. The builder proposes an audience and editable message, without publishing private narrative answers or inventing approved offerings.
- Saved Website & Brand copy is offered as a separate explicit suggestion. Existing package edits and released assets never change automatically.
- Flyer, handout and social SVG templates have format-specific V2 layouts; social releases retain a complete text caption. Generated SVG artwork can also be downloaded as PNG through the browser, from immutable output bytes.
- The existing V6.1 LaunchSiteFrame, WorkspaceShell, ActionFooter and form primitives are reused. A controlled `MarketingPackageWizardV61` presents all four Menu/Audience/Messages/Collateral steps, and `MarketingPackageReleaseHistoryV61` presents frozen releases, downloads and comparisons. `MarketingPackagesV61` remains their one lifecycle controller.
- Collateral & Assets displays a large live visual preview beside the format picker. The authorized POST preview service calls the exact same Site artifact renderer used by immutable releases, using the package's saved Brand version (or the current saved Brand for a new package) and current unsaved copy. SVG layouts are displayed as images; email HTML is isolated in a sandboxed iframe. Previewing creates no artifact, publication, or distribution record.
- No Brand: show a clear Establish handoff. No authorized durable public URL: explain why a QR card cannot be previewed. Protected claims: show a review message rather than rendering promotional output.

## Source acceptance for the three-module integration
- Added `tests/unit/launch-introduce-integration.test.ts` and updated Launch Studio source-contract tests.
- Removed the former Recruit and Interest Events placeholder destination registry entries, plus Storybook fixtures that pointed to them.
- This integration is **committed only to the feature branch**; authenticated execution, build and end-to-end tests are not claimed.

## Not implemented (outside this slice)
- Server-generated PDF exports, independent promotional-email sending, and a fully unified R2 media-library asset store. Initial SVG collateral, browser PNG conversion, complete downloadable Package Release ZIP bundles, and HTML email generation with immutable release snapshots are implemented in source but remain runtime-unverified.
- A Marketing Package-specific audience/contact CRM, recipient import, opt-out subscription management, campaign sending and scheduling. The **existing** authorized family-invitation service handles its separate, consent-aware preopening interest and application workflows; it is not replaced or duplicated by Marketing Packages.
- Creation of public interest forms or enrollment claims.
- No pretend asset thumbnails, send metrics, delivery status or fake public links. The live collateral preview uses the exact production SVG/HTML renderer, with typing debounced. Material previews use the real SVG/email templates; native email sending is still out of scope.

## Integration boundary
Package records remain mutable while their selected canonical Brand version is explicit. Artifact releases capture immutable output, Brand version, message, template and asset provenance. Publishing the website is not required. Direct sending remains a separately authorized capability. A Site website does not need to be published to author a private package.

## Authorization and lifecycle
- Use a verified server session and assertSiteSetupScope for each read and mutation; a URL Site ID is not authorization.
- Mutations use database transactions, package-row locking, revision checks and audit metadata that excludes private message bodies.
- Statuses are draft or archived only. Ready, delivered, published, exported, or enrolled are not inferred from completion of a wizard page.
- Delete is permanent only for an **unreleased** draft Package. Once any immutable release exists, deletion is blocked and archive is the supported lifecycle, even if no actual email was sent.
- A database without migration 0088 fails explicitly. Do not silently persist packages in generic Launch drafts or browser local storage.

## Updated Brand and media contract

- No Marketing Package owns Brand colors, typography, logo or marketing-only media assets. Its selected immutable `brandVersionId` is applied by the shared Site Brand resolver.
- Immutable output manifests capture actual rendered files and asset identity/checksums, while the mutable Package remains independently editable.
- `src/domain/site-media-rights.ts` supplies common public-media eligibility for Brand identity PNGs and existing approved R2 Site photographs. Those providers retain distinct storage and exact Site access boundaries. There is no second image-upload interface in Introduce.
- Saved Package releases are preserved across later Brand changes; operators explicitly select a newer saved Brand, then deliberately generate another complete Package Release.
- The approved Site publication and enrollment process stays separate. Unpublished Sites can create appropriately labeled introductory materials but cannot print an unauthorized temporary share-preview QR as a durable destination.

## Required before enabling live usage
1. Review and apply migration 0088 in the authorized environment, including scope and RLS behavior.
2. Run TypeScript, lint, unit and authenticated Site-grant tests including cross-Site denial, source-derived suggestions, concurrent revisions, template geometry and downloaded PNG bytes.
3. Test full four-step create/edit/duplicate/archive/delete interaction and keyboard accessibility, plus real preview refresh on format/Brand/content change. Exercise missing-Brand, protected-claims and unavailable-QR states.
4. Verify the canonical Brand resolver, initial SVG/HTML collateral renderer and immutable release snapshots, then add production print/PNG/ZIP exports and separately authorized distribution.

Changing these components does not apply a migration or modify a production database.

## Interest Events Site-scoping correction
The existing Program-linked Interest Events workspace now filters its Program chooser by the exact Site from Launch Studio and never submits a Program belonging to a different selected Site. A dedicated regression test covers multiple authorized Sites and empty Site scope. The server remains authoritative.

## Continued integration: saved-package operational handoffs

- An active, saved interest-invitation Package has a direct, exact-Site handoff to the existing family invitation screen. The subject and introduction are editable; no recipient, consent, or Program authorization is inferred from the Package. The full saved headline and message are screened for protected claims before any email-subject shortening.
- An active event-invitation Package has the same configured handoff pattern into the existing Program-linked Interest Events creation screen. Both the headline and description are editable starting points; date, timezone, location, registration and authorization still belong to the event service.
- Invalid, archived or cross-Site package references fail rather than silently substituting a different Site's package or editorial content. Interest Event requests also reject mismatched explicit Program selections.
- The new Interest Event form retains its server idempotency request key after uncertain delivery failures and rotates it only after an acknowledged create.
- Brand-before-marketing is enforced at the new-package UI and canonical preopening family invitation queue **and** delivery boundaries. A failed Brand read can be retried in the library; application invitations retain their separate institutional authorization. Emails sent through the existing family service use the current saved Site Brand, while separately generated immutable Marketing Package releases keep their selected Brand version.
- The Site-first private preview returns to Launch Studio for authorized registrar readers; the separately authorized Website & Brand preview returns to its Review & Finish step.
- Focused loader tests now exercise package references, multiple Sites, eligibility, protected claims and preservation of family invitation consent boundaries. These tests have been added but cannot be reported as passing until a real test run.

This update also extracted the controlled wizard and immutable release-history presentation, and incorporated the current main canonical-schema work into the **feature branch only**. It did not apply migrations or change live distribution systems or `main`.
