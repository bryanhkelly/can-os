# Friendly Site URL identity

**Status:** Implementation on a draft feature branch. Acceptance and production rollout are not verified.

## Contract

- Database UUID primary keys and foreign keys remain authoritative. User-facing URLs are lookup aliases, not authorization or access tokens.
- Friendly Site paths are namespaced as `/o/:organizationSlug/:siteSlug`, with `/launch`, `/website`, and `/profile` subpaths.
- `organizations.slug` is globally unique. `sites.slug` is unique within its Organization. The pair, not Site slug alone, identifies a friendly Site address.
- Launch Studio resolves the pair from the authorized `listLaunchOptions` result. The other friendly routes call `resolveAuthorizedSiteRoute`, which validates the pair against an authenticated, verified organization/Site grant scope before returning the UUID.
- Every destination invokes its pre-existing resource reader/permission checks. A valid path or a returned UUID never grants capability to operate, edit, publish or impersonate.
- Existing UUID routes remain available. Do not rewrite, mutate or rekey domain IDs as part of this URL change.
- The `/o` namespace prevents ambiguous root route collisions and should not be used for public website or external access tokens.

## Security and privacy

- Keep personal identifiers, student names, access tokens and sensitive records out of readable slugs.
- Site slugs are discoverable identifiers. Their opacity must never be relied on for access control.
- Share/preview links must continue using separate, authorized, revocable, expiring random tokens.
- Failure for unknown or unauthorized Site slugs must not expose an unscoped list of sites.
- Ensure no cross-organization Site slugs resolve to records outside the signed-in scope.

## Deferred work, not certified by this implementation

1. Add a governed, immutable routing-alias history and redirect policy before promising durable friendly bookmarks across Site or Organization slug renames. The current code uses mutable canonical slugs.
2. Extend friendly or independent opaque public identifiers to the remaining application routes (Classes, applications, actions, specific enrollment records and direct previews), keeping private domain authorization unchanged.
3. Perform exact-SHA typecheck, Cloudflare build, source/route-contract checks, unit tests, multi-tenant browser smoke tests, deep-link reloads, accessibility/navigation regressions and security checks.
4. Define URL redirect and canonical-link strategy for old UUID links, recognizing that internal links may still lead to UUID URLs in modules not yet migrated.

No live database migrations or automatic redirects to a newly renamed slug are included in this release.
