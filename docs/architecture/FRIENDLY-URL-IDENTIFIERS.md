# Friendly and compact URLs

**Status:** PR #363 under release validation. Not deployed or validated end-to-end.

## Current scope (no historical URL service)

- Canonical UUID primary/foreign keys are unchanged.
- Current Organization and Site slugs render private workspace URLs at `/o/:organizationSlug/:siteSlug`. Site profile, Launch Studio and Website Studio are children.
- The resolver joins **current** Organization and Site rows and filters them through the effective signed-in Person's verified Organization and Site grants. Neither a slug nor a short UUID grants access.
- Organization and Site slug changes may invalidate old slug links. Historical aliases and canonical redirects are explicitly **out of scope** for this phase.
- Existing legacy UUID paths remain accepted by the compact path codec to avoid breaking active bookmarks. No migration of those links is required.
- UUID path and allowlisted query references use a reversible 22-character base64url encoding, not encryption or a share token.

## Deployment order and guards

1. Ensure the preceding SQL migrations (including 0105 Site Go Links, 0106 universal engagement, 0107 Go Links private-role hardening, 0108 lifecycle/evidence, 0109 reusable Site links, and 0110 explicit universal engagement RLS/role hardening) have been independently reviewed and applied on the chosen environment. Do **not** run automatic production migrations.
2. Run `npm run db:check:friendly-urls:deploy` using the exact deployment `DATABASE_URL`. The gate checks **all recorded migrations from 0100 through the current release tip**, not only Go Links; production was observed at 0099 on November 23, 2026. The read-only preflight checks the Neon project/branch, required tables, Go Link unique code index, enforced RLS on the Go Link and universal engagement tables, and no anonymous/authenticated direct SQL privilege. It fails closed.
3. Run `npm run deploy:cloudflare`, whose script includes this preflight before the Cloudflare build/deployment. **Cloudflare's Git-integrated builds are a separate deployment path that may bypass this command**; disable automatic production deployment or add an independently enforced equivalent gate at the Cloudflare deployment boundary. Do not infer safety from a GitHub build/check badge. Netlify production builds remain disabled by the repo's existing production ignore configuration.
4. Roll back application deployment to the last known good build if needed. The additive Go Link table migrations are not reverted automatically; rolling back the database is unnecessary for a code rollback.

## Authorization and sharing

- `scopedSiteRouteAccess` fails closed for absent/empty Site scope, cross-tenant grants and missing authentication.
- The server resolver queries current, indexed Site and Organization slugs after scope validation; downstream services independently enforce their existing permissions.
- Real database role acceptance must confirm the application owner role can query the current Site, and `anonymous` / `authenticated` roles have no direct SELECT on private Site tables or Go Links.
- Private workspace links require sign-in. Published website and Go outreach links are distinct; the latter are revocable and grant navigation only, never membership, admission or enrollment.
- Never automatically copy an authenticated private website preview as a public share link; public-safe previews require the dedicated expiring/revocable flow.

## Release acceptance

Exact-SHA TypeScript, unit/integration tests, production build, Cloudflare CI, browser deep-link tests, deployment-preflight checks against target DB, role-boundary verification and approval remain required. The migration commands are manual and production-protected.

## Shared destination contracts and user interface

- `src/domain/url-destinations.ts` is the typed constructor for supported user-facing destinations (current Site, Launch Studio, profile, Website Studio, Class, Action, assignment, published website, and /go link).
- `src/components/links/CopyLinkButton.tsx` standardizes clipboard behavior, audience labeling, sign-in disclosure and manual-copy fallback, rather than accepting arbitrary pasted URLs.
- `src/components/launch-studio/SiteLinkSharing.tsx` surfaces **Copy & Share** in the Launch Studio header. A public website link appears only when the authorized Site directory reports its publication as `published`.
- `GoLinkWorkspace` reuses CopyLinkButton for approved, revocable /go codes. The Site directory supplies a Copy profile link only when the caller independently granted profile navigation.
- Go Link management is available both directly from the Site's friendly URL at `/o/:organizationSlug/:siteSlug/go-links` and from the existing Introduce outreach workflow. The Site is the authoritative owner; the package relationship is optional. A private Site workspace URL is not a public invitation or a capability token.
- Dedicated private preview sharing remains a separate expiring/revocable server workflow. Do not interchange those token-bearing URLs with ordinary copy controls.

Focused acceptance: `npm run test:urls:unit` and `npm run db:check:journal`.

## Operational validation evidence (November 23, 2026)

- Verified read-only: the Neon `can-os` default/main database migration ledger has **101 records**, with the maximum recorded migration timestamp matching journal entry `0099_site_level_public_interest`. No migration beyond 0099 was confirmed applied.
- Verified read-only: direct `SELECT` on `public.sites` and `public.organizations` is denied to the `anonymous` and `authenticated` database roles. Production `neondb_owner` has bypass-RLS permissions; application authorization must continue checking effective Site and Organization grants independently.
- No `public.site_go_links` or universal engagement registry tables are present yet. The deployment preflight is expected to block. The `0110` release hardening extends the same explicit denial to universal engagement definition/version records.
- Retried CI and full-schema GitHub Actions: both failed before a runner was assigned (`runner_id=0`), with zero steps and `BlobNotFound` logs. No TypeScript or test result may be inferred.
- Separately compiled the Go target parser and UUID codec with the repository's strict TypeScript settings on a local isolated copy. Seven valid and nine invalid sample link cases passed. This is focused parser verification, **not** an exact-repository typecheck.
- Ran the Node release-gate tests in isolation: 5/5 passed. This is contract behavior verification, not an actual migrated-Neon acceptance test.
- Go Links creation accepts an internal Class, training release or enrichment link, a 22-character compact ID, or a canonical UUID. Absolute links must have the same origin as the app. Outbound navigation remains governed by the server's destination allowlist.

## Three linked services

For the managed Go Link capability, see [Link infrastructure: Manage, Resolve, Measure](./GO-LINK-PLATFORM-CAPABILITIES.md). It defines the link lifecycle, reusable destination registry, privacy-minimized outcome evidence and additive `0105` through `0110` migrations.

Public short-link copying requires a verified `CAN_ACCESS_PUBLIC_ORIGIN`; a staging or preview hostname is never silently distributed.
