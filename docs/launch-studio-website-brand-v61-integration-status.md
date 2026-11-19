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
- Read-only Purpose & Story candidate copy generated from the seven saved Site Information answers, including selected priorities and values. Written founding story, community need and future vision now contribute to editable website draft suggestions with per-field source labels. Raw Site Information records remain in their existing Site-scoped storage. Suggestions do not publish automatically.
- Purpose & Story now displays an italic authorization notice for preparing editable website and outreach drafts from the answers the operator provides. No new data store, marketing publisher, or consent gate is created. Actual Introduce distribution remains a separate workflow. The editor reviews final proposed copy before creating a shared preview or publishing.
- Template chooser shows seven lightweight, static structural SVG thumbnails, preserving one sandboxed iframe using the canonical HTML renderer for the large selected preview. The thumbnails are simplified structural diagrams, not pixel-perfect imports of the handoff's SVG screenshots.
- Removed non-V6.1 rounded corners from `SchoolBrandPreview` application surfaces. Emblem geometry remains part of brand artwork.
- The **existing** audited and revocable `LaunchPreviewSharing` flow is reused in the review step, with a single Review & Finish Share action. The shared Launch topbar offers Share in other modules. It creates immutable, unlisted, externally viewable Site preview snapshots through the existing Site metadata implementation and separate `/site-preview-share` reader, with no Site publication or enrollment.
- A duplicate sharing table, server API, route, and draft migration introduced during integration were completely reverted. There is **no** website sharing migration `0088` in this work.
- The canonical publisher and authorized publication panel now have a Prepare → Publish Site entry (parallel branch workstream). In Website & Brand, the main Publish button, section-block Publish button, and historical published-revision Restore action are all hidden from Establish. The standalone editor retains existing authorized publisher capabilities for compatibility pending a separately reviewed cutover.
- Website previews, including externally shareable fixed snapshots, now show selected **Programs & Audiences** as **Proposed · not enrolling** cards on the homepage and a dedicated Programs page. Cards derive from the canonical bounded planning-interest vocabulary and saved Site metadata, including intended delivery format, audiences, and possible timing, not invented Offerings or adopted Solutions. This preserves the existing renderer and does not create enrollment actions, tuition claims, accreditation claims or program-release records.
- Renamed the Site Information step to **Purpose & Story**, an optional source of identity and copywriting inputs, not a separate editor. Website & Brand keeps **Your Content** as the editable public-facing draft. A brand-new Site preview and editable first draft now use all seven answers where available; saved website revisions are never silently overwritten. The three written narratives contribute to suggestions and remain independently editable in Site Information.
- Updated existing template/preview DTO tests, added source-copy and disclosure/field component tests, and enrolled the new V6.1 components in the shared control-reuse lint contract; automated tests were authored but not run.
- Changed website setup and preview presentation to Site-first terminology; no unconditional assumption that an after-school, summer, or adult learning Site is a school.
- Nested Website Content layout editor now reports unsaved block edits; parent Save & Exit does not falsely claim success or discard a separately dirty channel configuration. Operators save those private blocks with the canonical existing action first.
- Clarified the difference between the authenticated private Preview link and the anonymous, revocable Share Preview link; website Review has one Share control, not a duplicated topbar/modal.

## Approved reuse for future Introduce implementation

- Purpose & Story answers remain in the existing Site-scoped source and now drive the editable Website & Brand first draft.
- The italic usage notice authorizes drafting website and future promotional materials; it does **not** send a campaign, publish the Site, or independently authorize any public claim.
- Introduce currently routes to an honest placeholder, so actual promotional asset generation and distribution were **not** implemented as part of this website integration. When Promote is implemented, it should consume the same Site Story source and saved Program intent through a single reviewed editorial projection. Do not fork the Story model or use brand tokens as the source of marketing claims.
- An operator must review outbound wording and explicit sending recipients/permissions when outreach workflows are enabled.

## Required validation before merge/release

1. `npm run typecheck`, `npm run lint`, relevant Vitest tests, `npm run build`, authenticated Playwright/browser tests. No passing CI is asserted; GitHub Actions runs were not available for the investigated heads. Test that nested content-layout draft changes prevent a misleading parent Save & Exit and that neither nested Publish nor published-revision Restore is available in Establish.
2. Netlify PR deployment was **skipped because account build usage was exceeded**, not because an app build/test actually ran. Fix build capacity before relying on deploy preview.
3. Browser-check all five steps, desktop/mobile templates, four independent disclosure panels, full palette selection, live font previews, save/resume and Site switching; compare generated thumbnails to supplied reference wireframes.
4. Verify save and conflict behavior with two editors, baseline immutability, source suggestion Apply/Restore and no private Purpose & Story answer leakage to anonymous previews. Verify the full proposed Site includes Programs & Audiences on Home and Programs pages (without enrollment or application actions).
5. Share link acceptance: authorized create/revoke, token non-disclosure after issue, expiry and no-expiry semantics, cross-Site isolation, revoked/closed Site, complete exclusion of private data and active enrollment actions. Shared link must display only a fixed public-safe snapshot, not latest mutable draft.
6. Shared Site-level brand authority and Introduce package brand token consumer contract are **deferred by explicit instruction**. Do not introduce duplicate brand source data or call this cross-module integration finished.
7. Full Site publication belongs to Prepare and now has its own branch UI. The non-Launch legacy editor still has its original scoped publisher pathway; a separate cutover decision remains before removing it. Confirm that public share preview never makes Program intent look like approved/enrollable content.

No changes to `main`, production database, live Site publication status or enrollment were made in this task.
