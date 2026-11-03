# PX-B — School experience and publishing handoff

**Branch:** `main`  
**Owner:** Workstream B — experience and publishing  
**Scope:** PX-010–PX-029  
**Status:** Agent B code and focused CI verified; ready for integration. Full product/release acceptance **not** complete.

## Implemented

1. **Website reservation and launch:** inspected canonical Site provisioning and first Program launch. `provisionNewSitePublicationDraft` and `ensureExistingSitePublicationDraftForLaunch` already create/reuse one private draft in the same audited transaction. No parallel CMS or address-creation path was added. Existing launch website UX distinguishes private draft, marketing approval, reachability and separate admissions/invitation controls.
2. **Church storytelling:** additive optional fields `churchHistory`, `communityOutreach`, `schoolVision`, `leadershipWelcome`, `localTraditions` in the existing revisioned Site local-content contract. The editor now uses direct prompts, bounded inputs, rights/consent-checked artwork, existing revision restore and protected-claim review. Legacy revisions are normalized safely. No new registrar grant or AI service was introduced.
3. **Premium responsive shared renderer:** server-only editorial typography, responsive mobile navigation, accessible headings/forms/alt text/focus styling, safe theme choices, conditional sections and truthful application-status wording. No client hydration, arbitrary HTML/JS, custom page tree or tracker. Existing metadata-free, bounded inline PNG restriction remains.
4. **Pages:** the shared presentation system renders `/`, `/about`, `/academics`, `/student-life`, `/school-day`, `/admissions`, `/contact`. `/tuition`, `/families`, `/faq` exist but appear **only** when the institutional parent DTO supplies an approved public display claim. Empty sections have no navigation entry or public page.
5. **Public isolation:** exact GET page/metadata allowlist and Netlify rewrites to a standalone `/published-site/$page` server handler, with origin Host verification, published-Site lookup, site-scoped projection, no shell/session data, no forms in previews and existing POST `/inquiry` / `/apply` unchanged. All other tenant paths and methods fail closed.
6. **Private preview:** editor **and registrar launch website step** have per-page selectors with form-inactive, sandboxed `srcDoc` rendering from the same presentation template. The launch step retains optional planning-only cards clearly marked as suggestions, not public approval. Local church edits and official program data remain separately sourced.
7. **SEO:** page-specific titles/descriptions, conditional canonical URLs, draft noindex, published-host-scoped `robots.txt` and `sitemap.xml`, generated only after a published Site lookup and only for eligible pages. Host isolation and hosting feature flag are retained.

## Important interfaces

- `src/domain/public-site-paths.ts`: shared allowlisted page/metadata paths.
- `src/domain/public-site-html.ts`: `PublicSitePage`, `availablePublicSitePaths(page)`, `renderPublicSiteHtml(page,{path,makeRequestId})`; optional `parentInformation` is a `PublicParentSchoolProfile`, never church-editor-managed.
- `src/modules/sites/site-public-catalog.server.ts`: published site projection now forwards `projectApprovedParentInformation` to the renderer.
- `src/modules/sites/site-website-preview.server.ts`: same DTO in editor; returns `previewPages` in addition to the backwards-compatible `previewHtml`.
- `src/routes/published-site.$page.ts`: GET-only route. Public tenant edge rewrites exact allowlisted paths here.
- `src/modules/programs/launch-website.functions.ts` + `src/components/operations/LaunchWebsiteStep.tsx`: authorized registrar launch path returns `previewPages` alongside `previewHtml` for page-by-page planning.
- `docs/platform-route-contracts.json`: route ownership record added.

## Verification and evidence

Focused unit coverage has been added/updated for legacy church fields, protected claims, escaping, page availability, metadata, origin routing, method denial and preview form inactivity. The dedicated [PX B school website contract workflow](https://github.com/bryanhkelly/can-os/actions/runs/41661810751) **passed on SHA `ac63eecd43e4a0f44ba3ae120d0ff8525efd33c0`**: six focused test files / 40 tests passed and the client/server Vite production build completed. This validates the source-level B contract at that SHA, not live hosts, external publication, or the full CI pipeline. Re-run after any integration edits.

The existing generic CI had successful build and its three admissions-specific test files passed (50 tests); it subsequently failed `npm run typecheck` with pre-existing concurrent errors in `enrichment-catalog.server.ts` (nullable `endsAt`) and `teacher.index.tsx` (possible undefined). These are **not evidence** that all B tests passed. All failures should be reconciled at latest HEAD.

## Integration owner tasks

- Re-fetch `main` before changing shared files and avoid overwriting concurrent C/D work.
- Wire newly approved C jurisdiction/service/schedule fragments and D admissions facts into the canonical parent DTO, *only* with validated `canDisplay` claims; do not substitute setup selections for evidence.
- Review schedule specificity for seven-day programs and weekends; current school-day page does not claim an exact timetable without such approved data.
- Confirm latest focused PX-B CI, full typecheck, unit/integration tests, source/route contract checks, browser/mobile/accessibility tests and two-tenant host boundary tests.
- On an isolated disposable Neon database, exercise new-Site and first-existing-Site provisioning, editor/revision/revoke behavior, multiple Site isolation and academic authorization transitions.
- Keep `CAN_PUBLIC_SITE_HOSTING_ENABLED` OFF in production. Wildcard DNS/TLS, live tenant reachability, production security, privacy and SEO indexing remain independent release-owner gates.
- Consider moving authenticated media uploads into a vetted storage pipeline in a later slice; current 160KB metadata-free PNG inline restriction was intentionally not relaxed.
- AI copy polishing intentionally deferred: no existing approved service pattern was used.

**Do not equate code merged to `main` with verified production readiness, legal opening authority, or deployment.**

## Follow-on B slice

The registrar launch preview now supports every populated page rather than home only (PX-017), using the same server-only renderer and preserving sandboxed, inactive forms. Focused CI was expanded to cover the launch preparation and preview component; verify [the latest PX-B run](https://github.com/bryanhkelly/can-os/actions/runs/41662666470) after it completes. This change does not enable live hosting, modify authority, or add a CMS.

## Latest concurrent-build result (follow-on)

The [expanded PX-B workflow at `687e4728`](https://github.com/bryanhkelly/can-os/actions/runs/41662666470) completed **46/46 focused tests passing across 8 files**, including registrar launch preview. Its build failed due to an **unrelated concurrently edited file**, `src/components/operations/OperationsWorkspace.tsx:161`, with a Vite `Unterminated regular expression` around an unmatched JSX `</select>`. This file belongs to the operations workstream; its owner/integration agent must reconcile it on current `main` rather than Agent B overwriting concurrent changes. A previous isolated PX-B build passed at `ac63eecd`. Re-run full build once the operations owner repairs JSX; do not mark the latest build green until then.
