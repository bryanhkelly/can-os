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
