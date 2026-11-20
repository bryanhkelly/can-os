# Global authentication and Launch Studio green checks (November 20, 2026)

## Behavior
All CAN OS application pages are **protected by default**. The only exceptions are specifically registered anonymous entry, family-verification, published website, preview-sharing, discovery, engagement, enrollment-discovery, and application pages in `src/domain/auth-route-policy.ts`.

- Initial SSR/navigation: the root loader performs a current workspace-session read before rendering a protected route. If not authenticated it redirects to `/access?returnTo=<url-encoded-local-path>`, preserving path and query.
- Browser navigation: `ProtectedRouteAuthGate` checks protected routes and refreshes the server session on client page transitions. It shows the sign-in redirect when the verified session is missing.
- Session expiry: `WorkspaceSessionProvider` observes the existing 60-second refresh, trusted activity 401 response, revoked session handoff, and five-minute shared-device idle logout. These now send the user to the login route with a validated return URL instead of dropping the destination.
- After successful login: existing `safeAccessReturnTo` and `accessLandingPath` return to the target path, with server-side per-route authorization still independently enforced. Where the browser has a fragment, the client redirect retains it; HTTP server redirects cannot see fragments.
- Authentication failures are different from authorization denial, network outage, missing event, or server exception. Do not treat the latter as signed-out.
- Explicit user Sign Out still navigates to login without an automatic return-to-the-same-private-page request.

## Public pages explicitly retained
`/access/*`, `/site/new`, `/church/apply`, `/family/join`, `/family/interest`, `/interest-event`, `/landing/*`, `/next/*`, `/explore/*`, `/enrichment/*`, `/learn/enroll`, `/site-preview-share`, and `/published-site/*`.

Public does **not** mean unrestricted data. Host-based website routing, preview bearer token expiry/revocation, assessment enrollment, applications, invitations, learner/guardian identity, Rate Limits, and organization/site grants are separately governed by existing server handlers.

## Green completion checks
The Launch Studio sidebar on desktop/mobile and Overview stages receive a scoped `LaunchModuleCompletion` derived in `src/domain/launch-module-completion-v61.ts` from the **authorized Site** and independently read `LaunchOverviewEvidence`.

- **Site Profile:** established Site identity (name/slug/timezone, owner, saved identity revision)
- **Site Information:** both hosting and environment saved
- **Programs & Audiences:** explicitly saved intent
- **Website & Brand:** saved immutable Site Brand and website draft
- **Publish Site:** official website publication status is `published`

When a source is unavailable, it is not complete. Merely visiting a route, creating marketing drafts, creating a Solution draft, freezing a draft for independent review, or claiming readiness is **not** a completion/approval grant. Other Prepare/Open/Introduce modules remain unmarked pending the relevant authoritative completion indicators; no false green readiness badges.

The Establish stage gets a check only when **all four** of its submodules have verified saved completion. Other stages require all modules to be verified; none are implied from a planning-only record. Saved updates are reflected on the next authorized Launch Studio route load.

## Verification still required
- Run `tests/unit/global-auth-redirect.test.ts`, `tests/unit/launch-module-completion-v61.test.ts`, and existing workspace/launch navigation unit suites on the exact branch.
- TypeScript typecheck and Cloudflare build on the exact candidate SHA, and authenticated browser smoke tests for signed-out, timed-out, revoked, multiple-role, wrong-Site, returnTo query, client-side navigation, and interrupted network scenarios.
- Test that approved public routes remain usable without CAN OS credentials.
- Compare green checks to saved and unsaved Valor launch records; verify failures never show complete.
- No deploy or Neon mutation was performed for this change. Existing CI/Netlify failures must be diagnosed independently and cannot be called passing checks.
