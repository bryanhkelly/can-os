# WS11 — Frontend SDK cutover

Integration target: architecture/api-first-nestjs. This branch is not a deployment target.

## Initial consumer cutover

| React consumer | Generated API operation | Prior transport |
| --- | --- | --- |
| Access page (email link request) | POST /api/v1/access/request | POST /access/request |
| Personal registration | POST /api/v1/access/register | POST /access/register |
| Site creation request | POST /api/v1/access/site-signups | POST /site/new |

All three call the shared generated SDK through src/lib/api/browser-access.ts. No retry or fallback to the prior endpoint. Existing React/V6.1 controls and acknowledgement behavior remain in place. Legacy server handlers are deliberately retained for other callers until parity and consumer inventory are verified. The HTML token verification and demo sign-in submission still use the existing redirect-based flow; do not replace it without proving redirect, cookie, and handoff equivalence.

## Build and review

From a checkout with supported Node 24, install the root locked dependencies and API dependencies (use the API lock when available). Run:

    npm ci
    npm --prefix apps/api install
    npm run api:sdk:prepare
    npm run test:api-first:frontend
    npm run typecheck
    npm run design:source
    npm run build

Use npm run dev:api-first or npm run build:api-first after dependency installation. Generated schema is intentionally not committed; build agents must generate it before any root source checks or build. The root install alone does not install apps/api dependencies. Integrate this prerequisite with WS01 before merge.

## Required cutover gates

- Reviewed same-origin ingress for /api/v1; do not expose a new cross-origin service or weaken session/Origin enforcement. Existing API write configuration only supports isolated QA.
- Generate from the actual API build, compile both SDK and React application, and verify dependency lock and source revision.
- Browser tests against the reviewed isolated environment: real and synthetic access request, registration, Site signup; 400, 429, 503, malformed response, missing ingress, duplicate submissions, navigation, cookie and account isolation. Never replay a failed command via legacy transport.
- Confirm old route consumer inventory and remove superseded business handlers after successful parity. Preserve HTML navigation where appropriate, not parallel business logic.
- Integrate remaining domain adapters and TanStack Query using membership-scoped keys and cache reset on identity or impersonation changes. Do not cache credentials or mutations. SSR needs explicit reviewed server-side transport and session forwarding.
- Run both pilot journeys and V6.1 visual/accessibility checks before release.

Status: initial source cutover; no deployment or runtime parity claim.

## Second increment: authenticated frontend foundation

- Shared SDK commands for membership selection, explicit session activity and logout (including shared-device idle sign-out). No RPC fallback.
- HTTP status classification reuses existing client error codes/messages; never display remote problem titles or arbitrary exception details. Only an explicit 401 triggers expiry recovery for activity.
- Verified workspace cache keys include Person, grant, role, organization, Site, Program and owner delegation. Pending queries are cancelled and caches cleared when the session changes; membership switching still performs a full document navigation. These keys are available for new domain query consumers, not yet used by every existing screen.
- Prevent cross-tab handoff listeners from rebroadcasting the same event. Do not record idle activity from polling, focus or synthetic browser events.
- Full workspace session read remains on its original reader because the current REST session projection omits names, Sites, Programs, activeContext and student preferences. Device registration and HTML verification/return recovery also remain pending. Coordinate with WS02 rather than weakening or duplicating the contract.
- Unit tests: `npx vitest run tests/unit/frontend-sdk-session.test.ts` after dependency installation. Run source cutover tests, API SDK type checking and actual browser session tests before merge.
- Shared-device sign-out still requires server revocation; network failures cannot establish that a server session is revoked. Test failed revocation and cross-tab races before release.

This increment changes frontend code only. No changes to production, authorization policy, database schema or integration branch. Runtime verification remains outstanding.
