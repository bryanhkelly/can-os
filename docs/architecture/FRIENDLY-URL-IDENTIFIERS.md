# Friendly and compact URLs

**Status:** Draft PR #363. Not deployed or validated end-to-end.

## Current scope (no historical URL service)

- Canonical UUID primary/foreign keys are unchanged.
- Current Organization and Site slugs render private workspace URLs at `/o/:organizationSlug/:siteSlug`. Site profile, Launch Studio and Website Studio are children.
- The resolver joins **current** Organization and Site rows and filters them through the effective signed-in Person's verified Organization and Site grants. Neither a slug nor a short UUID grants access.
- Organization and Site slug changes may invalidate old slug links. Historical aliases and canonical redirects are explicitly **out of scope** for this phase.
- Existing legacy UUID paths remain accepted by the compact path codec to avoid breaking active bookmarks. No migration of those links is required.
- UUID path and allowlisted query references use a reversible 22-character base64url encoding, not encryption or a share token.

## Deployment order and guards

1. Ensure the preceding SQL migrations (including 0105 Site Go Links and 0106 private-role hardening) have been independently reviewed and applied on the chosen environment. Do **not** run automatic production migrations.
2. Run `npm run db:check:friendly-urls:deploy` using the exact deployment `DATABASE_URL`. The read-only preflight checks the Neon project/branch, required tables, Go Link unique code index, RLS, and no anonymous/authenticated direct SQL privilege. It fails closed.
3. Run `npm run deploy:cloudflare`, whose script includes this preflight before the Cloudflare build/deployment. Netlify production builds remain disabled by the repo's existing production ignore configuration.
4. Roll back application deployment to the last known good build if needed. The additive Go Link table migrations are not reverted automatically; rolling back the database is unnecessary for a code rollback.

## Authorization and sharing

- `scopedSiteRouteAccess` fails closed for absent/empty Site scope, cross-tenant grants and missing authentication.
- The server resolver queries current, indexed Site and Organization slugs after scope validation; downstream services independently enforce their existing permissions.
- Real database role acceptance must confirm the application owner role can query the current Site, and `anonymous` / `authenticated` roles have no direct SELECT on private Site tables or Go Links.
- Private workspace links require sign-in. Published website and Go outreach links are distinct; the latter are revocable and grant navigation only, never membership, admission or enrollment.
- Never automatically copy an authenticated private website preview as a public share link; public-safe previews require the dedicated expiring/revocable flow.

## Release acceptance

Exact-SHA TypeScript, unit/integration tests, production build, Cloudflare CI, browser deep-link tests, deployment-preflight checks against target DB, role-boundary verification and approval remain required. The migration commands are manual and production-protected.
