# Website & Brand V6.1 integration status

**Branch:** `feature/launch-studio-v61-clean-cutover-20261118`  
**Source handoff:** `CAN_OS_Website_Brand_V61_Complete_Implementation_Package(1).zip`, specifically `MD/02_Canonical_Integration_and_Cutover.md` and `MD/03_Acceptance_Test_Plan.md`.

## Implemented in this branch

- Single canonical `/site-website` editor reused by `/launch/website`, with five stages: Brand Identity, Choose Wireframe, Visual Identity, Your Content, Review & Finish.
- Older bookmarked six-stage query values map to the current five-stage presentation.
- Launch entry shares the V6.1 `LaunchSiteFrame` instead of rendering an independent nested global sidebar.
- Six curated brand directions with optional keyword-based recommendation using a saved Site Story, without forwarding private Story answers in the website loader.
- An optional `brandDirectionId` field on the existing revisioned `SiteLocalBranding` payload, server-validated along with legacy palette, font, template, copy and artwork fields.
- Canonical seven site templates remain the authoritative structural renderer. The wireframe chooser presents grayscale thumbnails on the left and a large center preview with an optional styled example.
- Visual Identity incorporates the former photos step, uses the existing school wordmark, curated palette/fonts and rights/guardian-consent media editor.
- Existing authenticated preview, revision-checked draft save, protected-claim review and separate publish actions remain the sole backend controls; no duplicate editor database was added.
- A first-time private draft must include Brand Identity; historical drafts without the new optional field can still load.
- New domain tests cover finite directions and normalization, though the tests have not been executed.

## Unfinished acceptance gates (do not describe as complete)

1. **Shared Site-level Brand Direction authority:** A brand choice currently persists inside the existing website draft, **not yet** as the required independently versioned, audited and authorized `sites.metadata` source. Implement the canonical scoped source and reconciliation before claiming cross-tool reuse in Promote, Recruit, Interest Events, emails or other tools. Preserve editor choice versus algorithmic suggestion, revision/actor and Site Story source revision. Do not silently promote a website-only revision into Site authority.
2. **Website copy suggestions:** No new governed candidate-copy generation service was introduced. Existing Site-created starter copy and reset controls remain. Do not add a working Regenerate button until it can return a read-only candidate and apply only the explicitly selected field.
3. **Custom colors:** Only finite curated palettes can be saved. A custom-color preview requires an explicit server persistence decision and contrast and publication checks; do not accept raw CSS strings.
4. **Exact design acceptance:** Current wireframe previews render through `renderPublicSiteHtml` instead of checking the handoff's seven separate SVG wireframes into the repository. Confirm visual fidelity against the supplied desktop and mobile PNGs. Check 13 palette displays, six font pair experiences, and independent expanded panel behavior.
5. **Runtime and security validation:** No local repository build, full TypeScript check, Playwright acceptance, persistent database preview/draft exercise, two-editor conflict check or cross-Site authorization test has been completed. GitHub returned no checks or workflow runs on the branch head when inspected. This is **not** a passing CI result.
6. **Production release:** Nothing in this integration authorizes school opening, academic/admissions claims, public publication, an unreviewed child image, a database migration, or a deploy. The branch has not been merged to `main`.

## Before merge

Run `typecheck`, lint, affected unit tests, app build, responsive/browser tests, rights/consent and RLS-capability checks. Verify the latest saved private website preview, unsaved in-memory preview and published website are distinct. Test Site changes and stale-link normalization; ensure unrelated onboarding remains operational. Finish the shared Site Brand Direction authority and any requested candidate-copy service, then evaluate against the ZIP's twelve browser acceptance scenarios.
