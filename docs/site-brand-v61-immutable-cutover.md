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

- Establish / Website & Brand owns Brand editing, uses the existing Save & Exit, and persists website copy/wireframe separately in immutable Site-local content versions. New website writes strip duplicated palette, typography, Brand direction and image data from the website content JSON.
- Establish / Share Preview captures immutable public-safe website HTML and the exact current Brand version in an expiring/revocable unlisted link; planned Programs remain proposed and not enrolling.
- Introduce / Marketing Packages edits `site_marketing_packages` in place with optimistic revisions. The selected `brand_version_id` changes only by explicit action. An unpublished Site may create packages using saved Brand.
- `public.site_artifact_releases` freezes exact package revision, content, Brand version, asset manifest, template ID/version, rendered output and checksum. A separate `site_artifact_release_access` record controls withdrawal; output bytes are not overwritten.
- The initial renderer generates downloadable SVG flyers/handouts/social artwork, SVG QR cards when a durable public destination exists, and email HTML plus plain text. QR cards cannot point to short-lived preview links.
- Archive, not delete, a Package with released artifacts. Releases and historical Brand references remain queryable for audit. The server checks asset rights again before download.
- Prepare / Publish Site and explicit Republish pin Brand, approved website-copy revision and structural template. Later Brand edits do not change an existing public Site automatically. Enrollment remains independently authorized.
- Revoking a Brand image's rights also revokes outstanding shared previews for that Site, in addition to blocking affected immutable artifact downloads. Already-printed material cannot be recalled.

## Migration / data cutover

1. **READ-ONLY INVENTORY FIRST:** inspect real production dependencies and whether prototype Brand fields are populated. Existing operational Site copy and audits must not be discarded.
2. `0089_canonical_site_brand_versions.sql`: creates the canonical Brand/media/release records and same-Site FKs. No production migration has been applied by this source-code commit.
3. `0090_brand_current_and_published_backfill.sql`: one-time import of the latest saved and distinct latest published Brand into immutable versions, pinning existing published website identity, then backfilling existing Marketing Package selected versions. It does not delete historical Site-local content rows.
4. Verify counts, revision numbers, exact token values, image rights/alt metadata, existing published output, cross-Site references and package selected versions before any removal of old JSON keys.
5. Retire obsolete writers after conversion, not before. Only current Site Brand versions are authoritative; historical website revisions remain valid operational records.
6. **Do not run destructive SQL, apply migrations, or merge to main without DB read-only inventory and test gates.** No production tables were dropped in this turn.

## Remaining acceptance gates and limitations

- **Not verified:** TypeScript, lint/6.1 design checks, Vitest, full build, authenticated browser tests and screenshot comparison. No GitHub Actions run was available for this branch; Netlify account deployment checks have been skipped due account build usage.
- **Not implemented:** production PDF/PNG social/print exports, ZIP bundle, promotional email recipient consent/suppression/verified-sender/scheduling/dispatch, and advanced marketing. Email HTML generation does **not** imply sending authorization.
- **Media-library integration:** the first cutover uses immutable bounded PNG records; verify against the existing R2-approved media folder before future uploads expand beyond logos. The feature branch must not claim a fully unified media library yet.
- **Prepublication QR destination:** a durable approved public-interest page is not yet available; QR generation correctly fails rather than printing an expiring review token.
- **Clean-cutover verification:** search the entire app for legacy Brand readers/writers, audit whether older immutable Site-local revisions contain past Brand snapshots, and ensure the production backfill safely converted every current and published Site before removing obsolete code or columns.
- **Hardening:** test two editors racing to save Brand, same-Site composite FKs, expired/withdrawn media, two published releases with different Brand versions, explicit republish, and no markup/action leakage in shared public previews.
- **Operational release policy:** generated email HTML is only a downloadable artifact. When sending is implemented, freeze the approved email release before scheduling and recheck recipient eligibility, suppression, and send authorization at dispatch.

Implementation boundaries are deliberately explicit: **one authoritative Brand version store, independently editable working documents, immutable output snapshots, and separate release/authorization decisions.**
