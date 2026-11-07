# PX-B 09 — Visual design fidelity and church brand discovery: integration handoff

**Owner:** B; **branch:** `main`; **feature:** visual fidelity addendum to Workstream B, not a new site application.  
**Production hosting remains disabled without separate operator authorization.**

## Implemented source

- `src/domain/site-theme.ts`: one `SiteTheme` resolver for five finite editorial palettes (`signature`, `heritage`, `forest`, `copper`, `coastal`) and three allowlisted system typography pairings (`editorial`, `traditional`, `contemporary`), with WCAG contrast evaluation and safe fallback.
- `src/domain/site-local-content.ts`: optional `paletteId`/`typographyId` inside the **existing versioned** `SiteLocalBranding`, so historical revisions remain readable; existing 160KB metadata-free PNG, alt-text, ownership and child-consent gates remain intact.
- `src/modules/sites/site-website-preview.functions.ts`: exact enum validation at authenticated editor POST boundary. Arbitrary CSS, unknown palette IDs and font stacks cannot be submitted.
- `src/routes/site-website.tsx`: curated palette swatches and typography selector; no remote imports, script execution, or auto-application of source proposals. Existing publish/revision-restore/claim review remain authoritative.
- `src/domain/public-site-html.ts`: one responsive server-rendered editorial layout shared by public tenant route and private preview, site-first branding, approved hero artwork as an accessible image with overlay, split mission section, school-day/academic/enrichment sections, closing CTA when relevant, semantic headings, skip link, readable focus and mobile `details/summary` navigation without hydration. Long names have a conservative responsive type variant.
- `tests/unit/site-theme.test.ts`: all theme combination contrast, unknown token fail-safe, rendered CSS/escaping and suggestion-only test assertions.
- `scripts/capture-school-site-visuals.mjs`, `.github/workflows/px-b-visual-acceptance.yml`: reproducible screenshot capture for 3 **fictional only** schools at 1440/768/375/320 for Home, nav and an interior page, plus 1440 for all eligible pages. Checks horizontal overflow, scripts and skip links and uploads image artifacts.

## Branding proposal handoff to Workstream P

A type `ProposedChurchBrand` and `reviewSuggestedChurchPalette` helper are exported from `site-theme.ts`. Fields: `siteId`, `sourceUrl`, `analyzedAt`, candidate `hex/roleSuggestion/sourceEvidence`, optional heading/body font family with evidence, optional logo URL with `rights_unconfirmed`, and explicit suggested/accepted/modified/rejected status. The review helper **does not modify published branding**. This interface is a contract, **not** an implemented crawler, persistent proposal approval queue, extracted brand record or accepted import. P must reuse canonical Site-scoped audited commands and implement SSRF-safe bounded source collection before an integration agent surfaces side-by-side proposed brand choices.

The school currently offers **CAN Signature** and curated, manual alternatives. “Inspired by your church” becomes data-backed only when P provides an authorized, reviewed suggestion through the existing editor. External font-family names are text-only metadata; no downloaded font binary, remote CSS or logo is trusted by default. Approved school branding uses only finite token IDs.

## Visual acceptance evidence

- A baseline screenshot run at SHA `eb8280a0`: [PX-B visual screenshots](https://github.com/bryanhkelly/can-os/actions/runs/41665159740) produced **35 screenshots** (Heritage Academy, Modern Microschool, Community Enrichment School; 1440/768/375/320 as applicable), uploaded artifact `px-b-visual-screenshots`; checked 35/35 against horizontal overflow and script injection, all clear.
- Visual inspection found that the long fictional microschool name wrapped awkwardly through words at 320px; B adjusted the long-name font rule and reduced mobile hero padding at SHA `87cc3760`. Re-capture with latest source is required for final visual approval.
- Visual review identified the home-page image was duplicated in a story section; fixed, and the approved hero image now has a meaningful real `<img>` alternative text and overlay, instead of inaccessible CSS-only presentation.
- Reference package: Library yielded a **CAN School Sites** prototype `index(5).html` referencing `styles.css`/`config.js`/`app.js`, but the full CSS, companion JavaScript and approved side-by-side reference screenshots were not available as a verified complete package. **Do not claim visual parity.** Re-review live screenshots against the exact approved comps during integration.
- Screenshot fixtures explicitly do **not** represent verified churches, parents or schools, and intentionally omit identifiable child imagery. Photo crop/consent has separate source-level coverage but no fixture-photo visual parity claim.

## Validation and constraints

- Focused B unit workflows include nine files and fifty tests. After a visually driven iteration, a previous test run passed **49/50** and caught a homepage image accessibility/expectation mismatch, which B corrected with a real `<img>` and alt text. Verify the *latest* focused workflow result before completing acceptance.
- The full Vite build had a concurrent unrelated parsing error in `src/components/operations/OperationsWorkspace.tsx:161`, an unmatched JSX `</select>`, from the operations workstream. B did not overwrite concurrent C work. Owner or integration agent must repair then rerun build, typecheck and full browser acceptance.
- No schema migrations, changes to public host flags, DNS, production accounts, public application gates, new CMS, external scrape or React hydration were introduced.

## Final integration owner checks

1. P: add source references/SSRF-safe visual suggestions, site-scoped audit/review state, source provenance and accepted palette mapping through B's finite theme IDs. Do not auto-apply or hotlink source assets.
2. A/C/D: keep one canonical approved parent DTO. Populate hours, schedules, services, tuition, admissions/portal links only from verified source records, and do not fabricate conditional sections.
3. Verify final 1440/768/375/320 screenshots for each fixture and mobile navigation with keyboard/focus, image-rights behavior and reduced-motion settings, plus two-tenant host denial cases.
4. Compare actual captures to the **complete** Signature Template v1 comps when supplied; close any gaps before describing design parity or activating public hosting.
5. Resolve operations workspace build blocker and run full typecheck, build, all affected tests and explicit production release gate separately.

**Status:** B visual-theme implementation and source-only safety contract committed; screenshot evidence established; latest-code browser capture, full-repository build and reference-comparison gate are separate release/integration checks.

## Final focused verification and screenshot audit

- [Visual screenshot run `7bd90e51`](https://github.com/bryanhkelly/can-os/actions/runs/41665968060): **successful**; 35 screenshots across all three fictional brands and four viewport widths where applicable; browser-generated `report.json` confirms **0 horizontal overflow**, **0 scripts** and a present skip link in every capture. Artifact: `px-b-visual-screenshots`.
- Inspected actual 1440px Heritage and enrichment Home captures and 320px microschool Home captures. The initial microschool long-name screenshot visibly broke in the middle of words; the latest `7bd90e51` screenshot demonstrates readable lines, no midword line breaks, and working 320px layout. Hero photography remains dependent on explicit rights-cleared local assets; fixtures intentionally have no child photos.
- [Focused B workflow `7bd90e51`](https://github.com/bryanhkelly/can-os/actions/runs/41665967868): **50/50 tests passed** across nine files; its subsequent full build remained blocked by concurrently edited `OperationsWorkspace.tsx:161` parsing error. Do not describe full build as passed.

## Workstream B-09 commit inventory on main

`6b69cb71c4ff` theme resolver + proposal interface; `7f725c9e557d` local-content branding IDs; `43db1a9e02b3` authenticated token validation; `b0f23864a51a` editorial public renderer; `1b6ce416dcc8` visual review UI; `a8b6f2d0e3cc` legacy-content regression; `e66e90941d86` screenshot fixture capture; `0014d4dfbedf` visual workflow; `4a2a30bc326b` no-program and hostname status; `4d7f4edf074d` token/provenance tests; `8df52eb523f6` matching Playwright package fix; `023aedd92c82` focused CI coverage; `eb8280a05059` supported Ubuntu runner; `8adaa7f50e68` canonical CTA; `87cc37603f59` mobile long-name visual adjustment; `7bd90e5119dd` consented accessible photo hero; `43abe381a1a6` integration handoff.

No schema migration was introduced in B-09; no isolated Neon rehearsal was required for these application-level changes. Workstream P's source discovery, reusable media licensing, approved comp comparison and final release remain separate acceptance gates.
