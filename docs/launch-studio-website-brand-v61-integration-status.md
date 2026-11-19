# Website & Brand V6.1 integration status

**Branch:** `feature/launch-studio-v61-clean-cutover-20261118`
**Source:** `CAN_OS_Website_Brand_V61_Complete_Implementation_Package(1).zip` and canonical CAN OS V6.1 design system.

## Implemented (feature branch only)

- One existing canonical website editor, displayed through `/launch/website` and `/site-website`; five steps with compatible historical step links.
- Shared Launch Studio sidebar, guidance rail and common `ActionFooter`.
- **Save & Exit** follows the established Site Information pattern: use immutable website-draft revision command, keep unsaved edits on failure, and navigate only after successful persistence and loader refresh. Step 5 saves a private draft, not a public Site release.
- **Brand UI is website-local only.** Shared Site-level Brand Direction infrastructure and Introduce token integration are intentionally out of scope for this pass and remain owned by their other workstreams.
- Shared V6.1 `DisclosureSection` pattern with independent expansion, keyboard-accessible buttons, rectangular panels and Storybook fixture.
- `WebsiteVisualIdentityStep` extracted from the route: Colors (all 13 approved palettes); Typography (live font stacks resolved by `resolveSiteTheme`); Wordmark & Logo; Imagery.
- Reused `WebsiteArtworkField` for logo and hero imagery. Existing strict PNG conversion, rights and child-consent rules remain in the authoritative Site data model.
- `WebsiteCopyField` extracted from the route: individual website fields retain their canonical baseline, optional candidate, Apply and Restore Original actions.
- Read-only Site Story candidate copy generated exclusively from Site Information's saved enumerated priorities and values. Private founding story/narrative, contact details and community-need free text are not copied or returned to the editor as source data. Suggestions never overwrite edits or publish automatically.
- Template chooser shows seven lightweight, static structural SVG thumbnails, preserving one sandboxed iframe using the canonical HTML renderer for the large selected preview. The thumbnails are simplified structural diagrams, not pixel-perfect imports of the handoff's SVG screenshots.
- Removed non-V6.1 rounded corners from `SchoolBrandPreview` application surfaces. Emblem geometry remains part of brand artwork.
- The **existing** audited and revocable `LaunchPreviewSharing` flow is reused in the review step, alongside its presence in the shared Launch topbar. It creates immutable, unlisted, externally viewable Site preview snapshots through the existing Site metadata implementation and separate `/site-preview-share` reader, with no Site publication or enrollment.
- A duplicate sharing table, server API, route, and draft migration introduced during integration were completely reverted. There is **no** website sharing migration `0088` in this work.
- Existing Site website publisher command remains for the standalone editing route. In Launch Studio Review, the publish action is hidden; moving all publishing UX to Prepare is a separately planned cutover, **not** implemented here.
- Updated existing template/preview DTO tests, added source-copy and disclosure/field component tests; automated tests were authored but not run.

## Required validation before merge/release

1. `npm run typecheck`, `npm run lint`, relevant Vitest tests, `npm run build`, authenticated Playwright/browser tests. No passing CI is asserted; GitHub Actions runs were not available for the investigated heads.
2. Netlify PR deployment was **skipped because account build usage was exceeded**, not because an app build/test actually ran. Fix build capacity before relying on deploy preview.
3. Browser-check all five steps, desktop/mobile templates, four independent disclosure panels, full palette selection, live font previews, save/resume and Site switching; compare generated thumbnails to supplied reference wireframes.
4. Verify save and conflict behavior with two editors, baseline immutability, source suggestion Apply/Restore and no private Story leakage to anonymous previews.
5. Share link acceptance: authorized create/revoke, token non-disclosure after issue, expiry and no-expiry semantics, cross-Site isolation, revoked/closed Site, complete exclusion of private data and active enrollment actions. Shared link must display only a fixed public-safe snapshot, not latest mutable draft.
6. Shared Site-level brand authority and Introduce package brand token consumer contract are **deferred by explicit instruction**. Do not introduce duplicate brand source data or call this cross-module integration finished.
7. Full Site publication belongs to Prepare. The non-Launch legacy editor still has its original scoped publisher pathway, and the Plan/Prepare UX cutover must be handled in its own workstream.

No changes to `main`, production database, live Site publication status or enrollment were made in this task.
