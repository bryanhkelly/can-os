# Public tenant host release checklist (Agent I)

A Site's `published` database status does **not** establish that its address is reachable. Launch website preparation and the authenticated Site verification endpoint separately expose availability and diagnostics. Only a successful external HTTPS request returning recognizable CAN site HTML is reported as `live`.

## Operator setup

1. Add `*.can-os.com` as a wildcard domain/alias to the actual Netlify deployment. Ensure Netlify has provisioned and activated a certificate that covers that wildcard. Do not assume a certificate for `can-os.com` covers tenant subdomains.
2. Configure authoritative wildcard DNS for `*.can-os.com` to the verified provider-recommended target. Ensure dedicated reserved hosts such as `app` and `api` retain their intended records. Use provider documentation and account settings; this repository intentionally does not assume a DNS target or use credentials.
3. In the **server runtime** and **Netlify edge environment**, set `CAN_PUBLIC_SITE_HOSTING_ENABLED=true` only after wildcard DNS, TLS, and edge routing have been deployed. Keep disabled in environments without that infrastructure. Never expose provider API tokens in build-time client variables.
4. Deploy the application including `netlify/edge-functions/site-host-gate.ts`. Confirm it executes for tenant requests. Verify that unrecognized tenant paths and private routes return 404, while platform hosts continue their normal application routes.
5. Authenticate as a registrar with explicit Site publication grants. Reserve a valid unique Site address, review content, then publish. Academic program listings require separate CAN-controlled publication; this step is not academic approval, school-opening authorization, or admissions permission.
6. Verify using the server's site reachability check. Check from an independent external network as well; never accept a local preview or 200 from an unrelated domain as public reachability. Record the URL, timestamp, DNS outcome, TLS certificate coverage, returned HTTP status, and actual HTML identity. Recheck after certificate renewal or DNS changes.

## Diagnostic meaning

| State | What it proves | Next action |
| --- | --- | --- |
| `not_published` | No published Site address is available to the scoped actor | Review and publish the Site |
| `hosting_disabled` | Application runtime rollout flag is off | Complete provider DNS/TLS and deployment setup first |
| `unreachable` | The external HTTPS response was absent or did not match expected CAN HTML | Check DNS, TLS, edge routing, HTTP response, tenant publication and origin deployment |
| `live` | Server fetched recognizable CAN public HTML over HTTPS | Still validate inquiry/application transactions and ensure correct Site content |

A status of `unreachable` is **not** a definitive diagnosis of missing DNS or missing certificate: the underlying TLS and DNS error may be hidden by the runtime fetch API. Site-specific external verification is required to isolate the failure.

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

**Netlify/DNS/TLS operations:** Register `*.can-os.com` on the *same* Netlify site serving the application. Create the authoritative `*` wildcard DNS record pointing to the precise target Netlify displays for the attached domain; do not copy an arbitrary domain target from another deployment. Confirm explicit `app`, `api`, `www` and other existing records remain unchanged. Netlify domain configuration must show the certificate is active and contains `*.can-os.com` as a covered SAN. Verify from a clean public client that the chain validates, SNI is for the exact tenant host and no HTTP downgrade or redirect is required. Do not use `curl -k`, insecure fetch, or forced Host-to-IP tests as evidence.

The **Netlify Edge Function runtime** and the **TanStack server runtime** each require `CAN_PUBLIC_SITE_HOSTING_ENABLED=true`; verify effective values in the deployment rather than assuming build-only environment variables propagate to edge. Check edge execution is enabled and that no bypassable function/route mapping overrides `netlify/edge-functions/site-host-gate.ts`. Check the public route sends `Cache-Control: private, no-store` and `Vary: Host`; do not cache a tenant response across hosts. Keep both flags off until the above domain/TLS routing acceptance has been approved.

**Negative and rollback evidence:** In a nonproduction deployment, set the hosting flag to false in *both* runtimes, redeploy and confirm published tenant hosts return 404, while the platform host continues serving its authenticated app. With the flag restored and authorized, confirm an unknown host and an unpublished published-address reservation return 404. Test a missing/untrusted certificate on an isolated *test* domain; the HTTPS probe must refuse `live`. If host routing, TLS or cross-tenant content fails, disable the edge and server rollout flags, redeploy and retest denial. Never remove a production DNS record or certificate as a test.

**Acceptance boundary:** A mock unit suite, a passing HTTPS GET, or a published DB row individually does not establish full hosting readiness. Real external evidence for both Sites, actual certificate coverage, denied routes, and independently approved DNS configuration is mandatory. No external origin has been tested by Agent I yet.


For a separately provisioned **nonproduction** disabled-host fixture, optionally set `CAN_PUBLIC_SMOKE_DISABLED_URL=https://<tenant-on-disabled-deployment>/`. The smoke checks for 404. For a separately provisioned invalid-certificate origin, set `CAN_PUBLIC_SMOKE_INVALID_TLS_URL=https://<approved-test-host>/`. The script accepts only an actual Node TLS certificate validation error; a DNS lookup error or timeout is not a passing TLS test. Neither fixture is created or changed by the script, and both are opt-in. Do not disable production TLS or production hosting to manufacture a passing negative case.


**Canonical domain safety:** The current domain routing and origin authorization accept only `*.can-os.com`. The external smoke script now fails before network access when `CAN_PUBLIC_SMOKE_DOMAIN` differs from `can-os.com`, and requires distinct published school names. Supporting another domain requires an explicit coordinated domain-routing change and independent Netlify DNS/TLS approval; it is not enabled by changing a smoke-test environment variable.
