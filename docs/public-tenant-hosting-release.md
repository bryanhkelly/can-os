# Public tenant host release checklist (Agent I)

A Site's `published` database status does **not** establish that its address is reachable. Launch website preparation and the authenticated Site verification endpoint separately expose availability and diagnostics. Only a successful external HTTPS request returning recognizable CAN site HTML is reported as `live`.

## Operator setup

1. Set `CAN_PUBLIC_SITE_DOMAIN` to the approved root domain in both the server and Netlify Edge Function runtimes. It defaults to `can-os.com`; configure a domain without a scheme, port or wildcard. Both runtimes must use the exact same value.
2. Add `*.<CAN_PUBLIC_SITE_DOMAIN>` as a wildcard domain/alias to the actual Netlify deployment. Ensure Netlify has provisioned and activated a certificate that covers that wildcard.
3. Configure authoritative wildcard DNS for `*.<CAN_PUBLIC_SITE_DOMAIN>` to the verified provider-recommended target. Ensure dedicated reserved hosts such as `app` and `api` retain their intended records. Use provider documentation and account settings; this repository intentionally does not assume a DNS target or use credentials.
4. In the **server runtime** and **Netlify edge environment**, set `CAN_PUBLIC_SITE_HOSTING_ENABLED=true` only after wildcard DNS, TLS, and edge routing have been deployed. Keep disabled in environments without that infrastructure. Never expose provider API tokens in build-time client variables.
5. Deploy the application including `netlify/edge-functions/site-host-gate.ts`. Confirm it executes for tenant requests. Verify that unrecognized tenant paths and private routes return 404, while platform hosts continue their normal application routes.
6. Authenticate as a registrar with explicit Site publication grants. Reserve a valid unique Site address, review content, then publish. Academic program listings require separate CAN-controlled publication; this step is not academic approval, school-opening authorization, or admissions permission.
7. Verify using the server's site reachability check. Check from an independent external network as well; never accept a local preview or 200 from an unrelated domain as public reachability. Record the URL, timestamp, DNS outcome, TLS certificate coverage, returned HTTP status, and actual HTML identity. Recheck after certificate renewal or DNS changes.

## Diagnostic meaning

| State | What it proves | Next action |
| --- | --- | --- |
| `not_published` | No published Site address is available to the scoped actor | Review and publish the Site |
| `hosting_disabled` | Application runtime rollout flag is off | Complete provider DNS/TLS and deployment setup first |
| `unreachable` | The external HTTPS response was absent or did not match expected CAN HTML | Check DNS, TLS, edge routing, HTTP response, tenant publication and origin deployment |
| `live` | Server fetched recognizable CAN public HTML over HTTPS | Still validate inquiry/application transactions and ensure correct Site content |

A status of `unreachable` is **not** a definitive diagnosis of missing DNS or missing certificate: the underlying TLS and DNS error may be hidden by the runtime fetch API. Site-specific external verification is required to isolate the failure.

## Local public-site preview

With `npm run dev` or `npm run preview`, an authorized publisher can open a
published site's public rendering at `/published-site?site=<slug>` on the
current localhost origin. These local commands explicitly enable this preview
and the preview command binds to loopback. The selected Site must still have
an approved publication and is read through the normal public-safe catalog.
Local rendering is read-only: inquiry and application forms are omitted because
their POST routes require a verified HTTPS tenant origin. Test those submissions
on an approved configured host, not by bypassing tenant-origin checks.
`npm run preview` loads `.env.local`, preserving explicit shell overrides.
It uses the configured database without changing the existing development/test
branch guards; obtain authorization before persisting ordinary UI changes.
This does not enable query-based Site selection in production or on
non-loopback hosts. Draft content remains available in the authenticated,
sandboxed website draft preview.

## Local verification — November 3, 2026

With explicit authorization for synthetic-school changes on Main, the existing
fixed Demo Admin was reconciled in place to Site Admin using the gated operator
command. The first call changed only its role and institutional capabilities;
an identical retry reported no changes. No identity was duplicated.

Visible browser verification on `127.0.0.1:4173` signed in as that administrator,
approved the Synthetic Hybrid High School listing, approved the Site catalog,
and opened `/published-site?site=synthetic-bay`. After rebuilding and restarting,
refresh still showed Synthetic Bay Campus and its approved listing as standalone
HTML. An anonymous GET returned 200, no workspace shell or forms, and
`noindex, nofollow`; unknown and duplicate Site selectors returned 404.
This proves local rendering and persisted approval, not public DNS/TLS,
inquiry/application delivery, or production hosting readiness.

The subsequent reviewed Site Admin rename changed the canonical Site name to
**Valor School** and Site/public slug to `valorschool`, retaining publication.
The current local URL is `/published-site?site=valorschool`; anonymous verification
returned 200 after the rename, while `synthetic-bay` returned 404. This did not
rename the Organization or Program, register DNS or deploy hosting.

## Security acceptance checks

- Unknown or malformed tenant hostname: no Site information and no access to private routes.
- Wrong tenant: host must resolve exclusively to its canonical published Site, not a `siteId`, query parameter, forwarded host, or sibling's publication.
- Hosting disabled: no anonymous public tenant access, even if a publication exists in the database.
- Missing TLS certificate: do not label the URL reachable. HTTPS validation must not disable certificate verification.
- Church-owned editorial copy must not grant academic publication status, school-opening approval, or authorization to enroll.
- Family inquiry: accepted only for a currently eligible published academic offering and with appropriate consent/rate controls.
- Application handoff: permitted only for a separately authorized operating program, with email verification; no child record should be created from the public anonymous request.

## Rollout responsibility

This code does not provision DNS, Netlify domains, or certificates. These remain externally managed operations pending a verified provider API contract and separate authorization. This work must not touch production credentials, production databases, or the shared FullFlow database. The integration coordinator owns final deployed and isolated acceptance evidence.


## Required reproducible external acceptance

This is a **read-only** script, not a provider provisioning command. After the release operator has approved and provisioned the Netlify domain, wildcard certificate, environment variables and two separately published Sites, run from an independent network:

```bash
CAN_PUBLIC_SITE_DOMAIN=can-os.com \
CAN_PUBLIC_SMOKE_DOMAIN=can-os.com \
CAN_PUBLIC_SMOKE_TENANT_A=<published-slug-a> \
CAN_PUBLIC_SMOKE_TENANT_B=<published-slug-b> \
CAN_PUBLIC_SMOKE_UNPUBLISHED=<reserved-unpublished-slug> \
CAN_PUBLIC_SMOKE_UNKNOWN=<unused-valid-slug> \
CAN_PUBLIC_SMOKE_NAME_A="<distinct public school A name>" \
CAN_PUBLIC_SMOKE_NAME_B="<distinct public school B name>" \
node scripts/smoke-public-tenant-hosting.mjs
```

Supply **real test fixtures approved by the operator**; the script deliberately never publishes Sites or performs anonymous POST writes. It verifies two unique tenant identities, an unpublished Site, an unknown Site, isolated private routes, no redirects and correct HTTPS response content. It prints status, tenant identity evidence and exact checked origins without including private credentials. Archive the JSON output under the tested commit SHA and release ID. Check application/inquiry forms manually in an approved staging environment with synthetic consenting contacts and inspect that no unauthorized child records were created.

**Netlify/DNS/TLS operations:** Register `*.<CAN_PUBLIC_SITE_DOMAIN>` on the *same* Netlify site serving the application. Create the authoritative `*` wildcard DNS record pointing to the precise target Netlify displays for the attached domain; do not copy an arbitrary domain target from another deployment. Confirm explicit `app`, `api`, `www` and other existing records remain unchanged. Netlify domain configuration must show the certificate is active and covers the configured wildcard. Verify from a clean public client that the chain validates, SNI is for the exact tenant host and no HTTP downgrade or redirect is required. Do not use `curl -k`, insecure fetch, or forced Host-to-IP tests as evidence.

The **Netlify Edge Function runtime** and the **TanStack server runtime** each require `CAN_PUBLIC_SITE_HOSTING_ENABLED=true`; verify effective values in the deployment rather than assuming build-only environment variables propagate to edge. Check edge execution is enabled and that no bypassable function/route mapping overrides `netlify/edge-functions/site-host-gate.ts`. Check the public route sends `Cache-Control: private, no-store` and `Vary: Host`; do not cache a tenant response across hosts. Keep both flags off until the above domain/TLS routing acceptance has been approved.

**Negative and rollback evidence:** In a nonproduction deployment, set the hosting flag to false in *both* runtimes, redeploy and confirm published tenant hosts return 404, while the platform host continues serving its authenticated app. With the flag restored and authorized, confirm an unknown host and an unpublished published-address reservation return 404. Test a missing/untrusted certificate on an isolated *test* domain; the HTTPS probe must refuse `live`. If host routing, TLS or cross-tenant content fails, disable the edge and server rollout flags, redeploy and retest denial. Never remove a production DNS record or certificate as a test.

**Acceptance boundary:** A mock unit suite, a passing HTTPS GET, or a published DB row individually does not establish full hosting readiness. Real external evidence for both Sites, actual certificate coverage, denied routes, and independently approved DNS configuration is mandatory. No external origin has been tested by Agent I yet.


For a separately provisioned **nonproduction** disabled-host fixture, optionally set `CAN_PUBLIC_SMOKE_DISABLED_URL=https://<tenant-on-disabled-deployment>/`. The smoke checks for 404. For a separately provisioned invalid-certificate origin, set `CAN_PUBLIC_SMOKE_INVALID_TLS_URL=https://<approved-test-host>/`. The script accepts only an actual Node TLS certificate validation error; a DNS lookup error or timeout is not a passing TLS test. Neither fixture is created or changed by the script, and both are opt-in. Do not disable production TLS or production hosting to manufacture a passing negative case.


**Domain safety:** Routing and origin authorization accept only one exact tenant label beneath the configured `CAN_PUBLIC_SITE_DOMAIN`; the default remains `can-os.com`. The server and edge runtime values must match. The external smoke script requires `CAN_PUBLIC_SMOKE_DOMAIN` to match that configured value and requires distinct published school names. Changing the environment value alone does not provision DNS, Netlify routing or TLS; those still require independent operator approval and acceptance.


**Certificate evidence in automated acceptance:** The smoke script now establishes separate verified Node TLS connections with SNI to both published tenant hosts before HTTP checks. It records each verified peer certificate's SHA-256 fingerprint, subject, SANs and validity interval in the exact-SHA acceptance artifact. An invalid or unavailable certificate fails acceptance; this is evidence of the checked origin's certificate, not proof of Netlify account ownership. The read-only smoke also checks GET denial on `/apply`, `/inquiry`, and internal POST-only handlers. A successful GET denial does not replace the separate approved synthetic-contact POST/email safety test.
