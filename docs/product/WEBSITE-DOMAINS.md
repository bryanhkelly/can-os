# School websites — default and custom domains

## Operator contract

Every school Site gets one unique default CAN OS address, derived from its canonical Site publication slug: `https://<school-slug>.<CAN_PUBLIC_SITE_DOMAIN>` (for Valor: `https://valorschool.can-os.com`). This is an **assigned address**, not proof of DNS, TLS or live website reachability. It remains attached to the Site independently of a later custom domain. School Profile displays the assigned default hostname and the publication status; live dashboard links to Website & Domain settings.

School administrators open **School Dashboard → Website & domain** or **School Profile → Manage website & domains** to see the assigned default URL, the approved-content status, custom domain state and a server-originated external HTTPS check. Never advertise `/published-site?site=...` on Workers as a public URL: it is intentionally restricted to loopback local preview; query string tracking parameters must not bypass this security boundary.

## Current implementation vs infrastructure

The existing public website renderer is host-based, requiring an approved `site_publications` row, the canonical domain, host authorization, secure content routing, and deployment flag `CAN_PUBLIC_SITE_HOSTING_ENABLED`. The current host-routing integration in `netlify/edge-functions/site-host-gate.ts` is Netlify-specific. Cloudflare Workers now has a gated, host-isolated route dispatcher in `src/cloudflare-demo.ts` (default disabled), but still needs runtime configuration, Cloudflare hostname binding, DNS and TLS acceptance. Do not enable `CAN_PUBLIC_SITE_HOSTING_ENABLED=true` in `wrangler.jsonc` until infrastructure acceptance. The underlying server handlers must receive the matching hostname and flag; a live URL also requires the actual wildcard route, certificate and publisher approval.

The server's **Check live website** command performs a bounded, HTTPS, tenant-identity-checked request; it does not change publication state. It should return `live` only for valid deployed public HTML. The domain settings view may say *content published*, *hosting not configured*, or *unreachable* — never *live* solely because a DB row says published.

## Custom domains — gated rollout

Optional customer-owned domains require a separate reviewed implementation, and are explicitly **not connected** in current settings. Before allowing input or saving a domain as attached, build:

1. A canonical domain binding record scoped to `site_id`, with uniqueness over normalized hostname, ownership challenge, status (`pending`, `verified`, `tls_pending`, `active`, `suspended`), certificate status, last verified timestamp, primary designation and audit trail. Reject reserved/platform hostnames and other schools' domains.
2. A host-only, fail-closed mapping in the edge and origin runtimes. Never select a Site by arbitrary `siteId`/query parameter or trust `X-Forwarded-Host`.
3. An explicit verified-ownership challenge (DNS TXT or comparable provider-approved verification), independently verified against DNS before starting certificate issuance. Never take over an existing hostname or automatically modify third-party DNS.
4. Automated certificate provisioning/renewal with verified health checks, revocation and unique hostname attachment. Gate primary selection on publication approval, tenant match, HTTPS and successful external reachability.
5. A canonical primary URL selection: keep the default domain reachable and redirect non-primary eligible hosts to primary with consistent path handling, preventing redirect loops. No indexing of draft/preview URLs.
6. Acceptance against an isolated test tenant: unknown domain 404, foreign domain denied, no private apps under public hosts, valid public pages and approved inquiry flows, status transitions, DNS loss, renewal failure, cross-site collision and rollback.

**Release note:** A repository change cannot by itself create Cloudflare DNS, wildcard certificate, or custom hostname enrollment. The Cloudflare worker includes host routing but deployment and DNS/TLS bindings remain external. Domain rollout must remain HOLD until the infrastructure is deployed and validated. This document does not authorize production DNS/TLS changes or assert that Valor is reachable.

## Cloudflare release procedure for the current CAN OS origin

CAN OS administration currently uses `https://can-os.bryanhkelly.workers.dev/access?returnTo=%2F`. Preserve that address; do not assume an `app.can-os.com` origin or place public school websites on the same authentication origin.

For first-level school hostnames, `valorschool.can-os.com` is the canonical intended default, but **not live until the domain is verified and routed**. Unlike `workers.dev`, a `can-os.com` wildcard requires an owned, active Cloudflare zone. Production release is subject to all of the following:

1. Verify control of the authoritative `can-os.com` DNS zone in the intended Cloudflare account. If the domain is not owned/active, choose an owned school-websites domain and update `CAN_PUBLIC_SITE_DOMAIN` deliberately; do not claim or point at an unrelated domain.
2. Add proxied `*.can-os.com` DNS and verify a suitable certificate covering first-level school subdomains. Bind a wildcard **Worker route** (not a single-host Worker Custom Domain) such as `*.can-os.com/*` to the existing `can-os` Worker. Protect reserved hostnames with more-specific routes if necessary.
3. Confirm the published Worker bundle includes the hostname-only dispatcher from `src/cloudflare-demo.ts`. Enable the server-visible `CAN_PUBLIC_SITE_HOSTING_ENABLED=true` **only after** DNS, route, certificate, and tenant isolation preflight succeed. Keep `workers_dev=true` for the platform's existing login address.
4. Check `https://valorschool.can-os.com/`, `/academics`, `/about`, and `/?utm_source=chatgpt.com`: they must render this Site's own reviewed public content over HTTPS. `/access`, `/home`, `/_serverFn`, and `/?site=other-school` must not render private routes or switch tenants.
5. Independently check a second published school, one draft/unpublished Site, an unknown subdomain, and the application login at `can-os.bryanhkelly.workers.dev`. Use the existing authenticated **Check live website** command and verify each public URL from a separate network before calling it live.
6. Roll back by disabling public hostname routing if DNS/TLS or cross-tenant checks fail; the `workers.dev` application route must continue to work. Never change database publication status simply to address an infrastructure outage.

Allowlisted marketing query parameters may accompany public **GET page** URLs; they are not tenant selectors, authentication tokens, or invitation state. Local `/published-site?site=...` remains loopback-only and should never be linked as a deployed public school URL.

**Current acceptance:** No verified Cloudflare domain connection or certificate from a connected Cloudflare account is available in this workflow. Do not assert that Valor or any other `*.can-os.com` public hostname is working until the operational steps above are completed.
