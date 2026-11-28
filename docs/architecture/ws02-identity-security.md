# WS02 — Identity & Security

Integration target: `architecture/api-first-nestjs`. Feature branch: `api-first/ws02-identity-security`.

## Authority boundaries

- Authentication remains the existing canonical passwordless account/session service. The REST API must not create a second account, Person, role, grant, or authentication credential model.
- Business authority is the current server-resolved Person, effective grant, capability and resource scope. No client-supplied actor or role establishes authority. A Site grant must not expand to other Sites.
- Original Platform Owner management is an independent policy. The owner cookie, mailbox eligibility, original account/Person and current original owner grant are rechecked. Delegated authority never authorizes original-owner management.
- Expired delegation denies ordinary business reads and writes until explicit return. Only legacy workspace session recovery may read the original owner projection to render recovery controls.
- Logout is same-origin, JSON and idempotent. It revokes only the session identified by the presented opaque cookie (even if effective authorization is unavailable). No role or Person is required to revoke a bearer. Missing or already-revoked cookies can be cleared safely. A database failure is not reported as successful logout.
- All existing protected-review, synthetic eligibility, private credential, membership and tenant rules remain in their canonical services. The current native-session bridge is not retired or changed by this slice.

## HTTP operations

| Method | Route (under /api/v1) | Authority |
|---|---|---|
| GET | /owner/delegation | Original owner; including expired delegation |
| GET | /owner/delegation-targets?search=... | Original undelegated owner |
| POST | /owner/delegation | Original undelegated owner; current eligible target; reason |
| POST | /owner/delegation/return | Original owner; explicit confirmation; repeat-safe |
| POST | /owner/private-credential-recovery | Original undelegated owner; existing credential policy; reason and confirmation |
| POST | /access/logout | Same-origin presented session revocation; no effective-role dependency |

New routes have strict input/output schemas, explicit OpenAPI operation IDs, cookie security documentation and standard problem responses. Credential recovery returns a one-time raw code only to the independently authorized owner; responses are no-store.

## Staff administration and membership lifecycle

The five local registrar/Site Admin operations now use a common transport-neutral
service, `staff-admin.server.ts`. Existing TanStack functions delegate to this
same service; they are retained until frontend SDK parity is established.

| Method | Route (under /api/v1) | Authority |
|---|---|---|
| GET | /staff/sites | Exact Site or organization grant scope |
| GET | /staff/people?query=... | Scoped canonical Person directory (50 results) |
| GET | /staff/accounts | Scoped accounts, grants and readiness |
| POST | /staff/invitations | Current direct registrar or Site Admin; exact Site, local roles only |
| POST | /staff/grant-state | Current direct registrar or Site Admin; eligible local grant only |

Both write transports revalidate and lock the current CAN session and grant
inside the transaction. This deliberately disallows impersonated grant changes
(including Act As): access provisioning and revocation require a direct
authorized administrator. Existing private credential policy and synthetic
credential eligibility remain unchanged, including prior automatic synthetic
invitation approval; this is not a new demo-only business endpoint.

Canonical account-Person anchors and Site ownership constrain directory reads,
invitation acceptance and restoration. The invitation acceptance command locks
the exact inactive grant and rechecks its immutable issue/acceptance events,
so a stale invitation cannot restore a previously revoked grant. Revocation
invalidates existing sessions using the affected direct or delegated grant;
restoring a grant cannot revive those bearers. Repeated unchanged grant state
operations do not duplicate grant state audit events. The login service locks
the selected current grant during session minting.

Staff account directory paging remains a scalability follow-up; the existing
legacy response shape is preserved. Further independently governed
institutional role appointments and native session consolidation are not part
of this local staff slice.

## Verification

With the existing reviewed isolated checkout and Node 24 dependencies installed:
```sh
npm --prefix apps/api test
npm --prefix apps/api run build:canonical
npm --prefix apps/api run sdk:generate
npm --prefix apps/api run sdk:check
node scripts/architecture/check-http-api-wiring.mjs
npx playwright test --config playwright.nest-identity-api.config.ts
```

The identity config inherits the existing exact-revision, isolated QA branch and disabled external provider gates. Positive signup QA requires `CAN_NEST_SIGNUP_QA_JSON`. Positive owner QA additionally requires `CAN_NEST_OWNER_QA_EMAIL` (an explicitly reviewed existing owner on the isolated QA database, not a reserved test/demo mailbox) and `CAN_NEST_OWNER_QA_JSON` containing attestation `reviewed-isolated-owner-fixtures`, targetGrantId, targetPersonId, targetSiteId, targetOrganizationId, protectedGrantId and targetSearch. Target is an existing eligible site_admin grant; protected grant is an existing non-actable membership. No new privileged fixtures may be created via test endpoints. Login uses only the normal HTTP access request and verify endpoints with the isolated local outbox. Missing fixtures skip positive scenarios; skipped tests are not acceptance evidence.

The staff lifecycle scenario additionally requires `CAN_NEST_STAFF_QA_JSON` with attestation `fresh-isolated-staff-invitation`, registrarEmail, foreignRegistrarEmail, staffEmail (fresh mailbox), siteId, foreignSiteId, organizationId and foreignOrganizationId. All three mailboxes are distinct lowercase .test addresses; the two existing administrators must have direct exact-Site grants in different organizations. The scenario exercises normal invitation, login, retries, scope denials, revocation, restoration and replay via HTTP only. Verify that invitation and grant audit evidence exists using the existing governed database acceptance workflow.

## Release gates still open

- Run the actual build, HTTP tests, generated SDK type checks and isolated authenticated scenarios; verify audit receipts and repeat/concurrency behavior.
- Verify the complete Person lifecycle, roles/appointments and tenant RLS using restricted QA database connections and negative cross-tenant tests. No database migrations were applied in this slice.
- Inventory remaining identity/role/staff and native-session endpoints; reconcile native credential retirement and logout semantics before cutover.
- Exercise expired delegation with an approved expiry test fixture; never introduce a production clock or privilege bypass.
- WS11: migrate the actual frontend owner/access/session flows to generated SDK and remove replaced TanStack transport only after parity, including V6.1 UX.
- WS01/WS12: production deployment, origin/cookie proxy architecture, integration and release evidence. The API is still locally gated.

This is a source implementation increment, not a completed or deployed security migration. Do not merge to a release branch until the gates above are satisfied.
