# CAN OS V6.1 | Canonical Site Brand cutover

Branch: `feature/launch-studio-v61-clean-cutover-20261118`
Status: **Implemented in feature-branch source. NOT migration-applied, built, browser-verified or approved for merge.**

## Canonical ownership and resolved version

- `public.site_brand_versions`: authoritative append-only Site Brand configuration, exact Site scope, immutable revision and fingerprint. The configuration includes display name, Brand direction, approved palette and typography IDs, chosen font IDs, immutable logo/hero asset references and creator attribution. Brand edits create a new version only if canonical fields change.
- `sites.current_brand_version_id`: the one current saved Site identity. `saveSiteBrandVersion` checks the expected pointer, holds a Site lock, writes the new version and updates the pointer in one authorized transaction.
- `public.site_brand_assets`: bounded, immutable PNG objects with alt descriptions and rights/child-image consent. This implementation owns PNG uploads already supported by the Website editor; future R2/media-library unification must not change immutable asset IDs. Rights can be withdrawn without editing history.
- `readSavedBrandVersion(siteId, exactVersionId?)` is the one Brand reader/resolver for authorized callers. Version ID omission means current saved Brand, not the last published website. Its visual projection uses the approved finite Site palette and fonts. The CAN OS 6.1 administrative design system remains independent.
- `src/domain/color-contrast.ts` implements one WCAG contrast algorithm. `src/domain/school-brand-identity.ts` keeps identity artwork separate from the seven website wireframe IDs. Legacy type names remaining in render-prop contracts are not independent persisted Brand stores.

## Output ownership and lifecycle

- Establish / Website & Brand owns Brand editing and retains the existing Save & Exit controls. `saveSiteWebsiteAndBrand` writes independently versioned website copy and canonical Brand together in **one transaction**, with the original Site authority and optimistic concurrency checks. A website conflict or Brand conflict rolls back both. New website writes strip duplicated palette, typography, Brand direction and image data from the website content JSON. The standalone scoped website editor uses the same atomic command for reviewed local copy, while official Site publication remains in Prepare.
- Establish / Share Preview captures immutable public-safe website HTML and the exact current Brand version in an expiring/revocable unlisted link; planned Programs remain proposed and not enrolling.
- Introduce / Marketing Packages edits `site_marketing_packages` in place with optimistic revisions. The selected `brand_version_id` changes only by explicit action. An unpublished Site may create packages using saved Brand.
- `public.site_artifact_releases` freezes exact package revision, content, Brand version, asset manifest, template ID/version, rendered output and checksum. A separate `site_artifact_release_access` record controls withdrawal; output bytes are not overwritten.
- The initial renderer generates downloadable SVG flyers/handouts/social artwork, SVG QR cards when a durable public destination exists, and email HTML plus plain text. QR cards cannot point to short-lived preview links.
- Archive, not delete, a Package with released artifacts. Releases and historical Brand references remain queryable for audit. The server checks asset rights again before download.
- Prepare / Publish Site and explicit Republish pin Brand, approved website-copy revision and structural template. Later Brand edits do not change an existing public Site automatically. Enrollment remains independently authorized.
- Revoking a Brand image's rights also revokes outstanding shared previews for that Site, in addition to blocking affected immutable artifact downloads. Already-printed material cannot be recalled.

## Shared UI and release presentation ownership

- `src/components/launch-studio/WebsiteBrandIdentityStep.tsx`: controlled Brand direction, public display name and immutable saved revision. It does **not** own persistence.
- `src/components/launch-studio/WebsiteSiteContentStep.tsx`: controlled Purpose & Story-derived website copy and Site content layout. It does **not** own Site Brand or publication.
- `src/components/launch-studio/WebsiteVisualIdentityStep.tsx` and `WebsiteTemplateGallery.tsx`: existing colors, typography, image usage and structural template presentation.
- `src/routes/site-website.tsx`: editor state and single atomic save orchestration, plus preview/review handoff. No redundant brand editor or source.
- `src/components/launch-studio/MarketingPackageWizardV61.tsx`: Menu → Audience → Messages → Collateral & Assets, with controlled current content.
- `src/components/launch-studio/MarketingPackageReleaseHistoryV61.tsx`: immutable historic releases, downloads and comparisons, with no mutable local release document.
- `src/components/launch-studio/MarketingPackagesV61.tsx`: Package lifecycle controller and authorized service integration. All Introduce modules reuse this one package implementation.

## Connected database read-only inventory

The connected Neon CAN OS `main` branch was inspected **without applying changes**. At inspection: **9 Sites, 2 published Sites, 7 Sites without any branded website revision**. Both published Sites have an attributable published website copy with legacy Brand JSON. The canonical Brand and Marketing Package tables have not been created there. `scripts/acceptance/site-brand-backfill-preflight.sql` is a repeatable read-only source/attribution inventory for subsequent environments. Never manufacture creators or historical Brand choices for untouched Sites.

## Branch integration

Conflicting changes from `main` were reconciled into the Launch Studio **feature branch only** in merge commit `377f41c2ceee1fbeb0a649f28b614a619ed8c2df`. The five overlapping files involved canonical public-schema conversions and credential-issuer access UI. Existing V6.1 forms were preserved, and the latest main-owned canonical schema/verified grant fields were adopted. PR #348 changed from conflicted to mergeable. `main` was not updated by this integration.

## Migration / data cutover

1. **READ-ONLY INVENTORY FIRST:** inspect real production dependencies and whether prototype Brand fields are populated. Existing operational Site copy and audits must not be discarded.
2. `0089_canonical_site_brand_versions.sql`: creates the canonical Brand/media/release records and same-Site FKs. No production migration has been applied by this source-code commit.
3. `0090_brand_current_and_published_backfill.sql`: safely imports the latest saved and distinct published Site identities, using the latest attributable published website revision **even if its legacy Brand JSON is absent**. It looks back for available prior Brand choices, otherwise uses bounded defaults; it pins the exact published website copy revision and rejects incomplete published pointers. A Site with no historical website revision keeps a null Brand pointer until the first real, authorized Save. No historical Site-local content rows are deleted. Existing Marketing Package Brand pointers are backfilled when possible.
4. Verify counts, revision numbers, exact token values, image rights/alt metadata, existing published output, cross-Site references and package selected versions before any removal of old JSON keys.
5. Retire obsolete writers after conversion, not before. Only current Site Brand versions are authoritative; historical website revisions remain valid operational records.
6. **Do not run destructive SQL, apply migrations, or merge to main without DB read-only inventory and test gates.** No production tables were dropped in this turn.

## Website draft permission cutover

- V6.1 adds "site.website.draft.write" for exact Site-scoped Site Administrators and explicitly appointed website editors. It does not grant official Site publication.
- Network-governed Site Administrators can read and save private Site Brand/website drafts, while the existing independent publisher continues denying unauthorized public release.
- The editor still requires the active account grant, membership and Site-specific role assignment. Migration 0091 upgrades existing appointed website editor grants that already had local copy write authority. It does not grant any new academic, enrollment or network permissions.
- Apply and verify migration 0091 before enabling draft editing for previously appointed editors. Keep public copy review and Site publication independent.

## Remaining acceptance gates and limitations

- **Not verified:** TypeScript, lint/6.1 design checks, Vitest, full build, authenticated browser tests and screenshot comparison. No GitHub Actions run was available for this branch; Netlify account deployment checks have been skipped due account build usage.
- **Not implemented:** server-generated PDF, independently authorized promotional email recipient consent/suppression/verified-sender/scheduling/dispatch, advanced marketing, or a durable prepublication interest destination. Browser PNG conversion and complete immutable Package Release ZIP downloads are implemented in feature-branch source but not runtime verified. Email HTML generation does **not** imply sending authorization.
- **Media-library integration:** `src/domain/site-media-rights.ts` now supplies a single rights/subject-release decision for Site Brand images and the existing Site R2 Document media gallery/public proxy. The two image stores remain deliberately separate: small immutable identity PNGs and reviewed R2 Site photography, with no duplicate marketing upload workflow. Future unified immutable asset-reference support must preserve stored identities and authorization.
- **Prepublication QR destination:** a durable approved public-interest page is not yet available; QR generation correctly fails rather than printing an expiring review token.
- **Clean-cutover verification:** search the entire app for legacy Brand readers/writers, audit whether older immutable Site-local revisions contain past Brand snapshots, and ensure the production backfill safely converted every current and published Site before removing obsolete code or columns.
- **Hardening:** source regression coverage has been added for Site-scoped atomic Website & Brand saves, migration completeness, media-rights decisions and preservation of pinned v3 releases after v4 edits. Runtime execution, two-editor race tests, same-Site FK checks, published republish behavior and anonymous snapshot acceptance remain required before main.
- **Operational release policy:** generated email HTML is only a downloadable artifact. When sending is implemented, freeze the approved email release before scheduling and recheck recipient eligibility, suppression, and send authorization at dispatch.

Implementation boundaries are deliberately explicit: **one authoritative Brand version store, independently editable working documents, immutable output snapshots, and separate release/authorization decisions.**
