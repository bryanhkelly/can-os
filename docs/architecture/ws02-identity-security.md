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

## Institutional issuer authority and academic staff delegation

Existing sensitive issuer approval functions delegate to
`canonical-sensitive-approvals.server.ts`, with the same restricted
`can_v30_sensitive_approval_writer` role, audit and independent reviewer
requirements. Requesting a capability is not granting it.

| Method | Route (under /api/v1/identity) | Authority |
|---|---|---|
| GET | /credential-issuer/mine | Own exact Site staff grant |
| GET | /credential-issuer/pending | Independent CAN credential reviewer |
| GET | /credential-issuer/approved | Independent CAN credential reviewer (includes expired approvals for revocation) |
| POST | /credential-issuer/requests | Direct verified non-demo Site Admin or Registrar |
| POST | /credential-issuer/decisions | Independent current reviewer; expiry required for approval |
| POST | /credential-issuer/revocations | Independent current reviewer |
| GET | /academic-staff/delegations?programId=... | Direct steward of the Program's CAN institution |
| POST | /academic-staff/delegations | Current direct CAN steward; approved service agreement and verified original employee |
| POST | /academic-staff/revocations | Current direct CAN steward; exact institution-owned assignment |

The issuer request locks the current grant and serializes open requests for that
grant. Duplicate requests return conflict, not a second approval. Reviewer
decisions remain separate from the requester by both Account and Person.
Issuer requests and approvals require a verified non-demo mailbox account,
not a private handoff or shared synthetic credential. No approval may
grant itself, grant a second account, or silently assign a privileged role.

The academic delegation commands now require the actual signed current CAN
session in the same transaction as the Program assignment write. The employee
must have a matching active canonical Person and original verified CAN
organization grant; no private or synthetic credential establishes this
institutional employee authority. Program responsibility never creates a
church-local Account grant, pupil access, or Section assignment. Existing
contract checks remain required. Lists are capped at 100 with a truncation flag.
The original independent reviewer queue semantics (101-row bound) are
unchanged; institutional reviewer jurisdiction and pagination remain
separate policy/scalability follow-ups.

## Learning session provenance

The transitional dual-cookie learner resolver now returns the native session ID
only from the exact native row already bound to the current CAN Person and
account by the canonical resolver. It never performs a second independent
session read for persistence. A CAN student or staff projection paired with
a native cookie cannot be used as a transitional adult instructional identity.
Direct CAN learning evidence is attributed to its own CAN session; delegated
owner sessions cannot record learner time-on-task as the learner. Ordinary
authorized owner delegation remains governed separately.

This is a narrower fail-closed session boundary, not full native cookie
retirement. Existing legacy reviewer sessions and historical native adult
learning-session references still require a separately verified migration.

## Native credential lifecycle and retirement evidence (2026-11-28)

Browser logout now atomically revokes both individually presented bearer
credentials by their own hashed secrets, writes security audit evidence, and
clears both secure HttpOnly cookies. Neither bearer establishes business
authority during logout. Duplicate cookie names fail closed before writes.
The native session cookie is a compatibility credential, not a second
interactive login. A failure rolls back both revocations and does not report
success. The Nest transport accepts exactly the expected two clearance
headers on logout and exactly one canonical CAN cookie on ordinary login.

The four remaining native issuance paths (linked Class recovery, reviewed
Class activation, noncredit self-registration and Course session renewal)
revalidate the direct current CAN grant within the write transaction.
The common issuer additionally locks the exact native learner account/grant
and original shared Account/Person linkage. Native activity refresh uses
the same current CAN transaction guard. No new Person is created.

Read-only database evidence from `pilot-acceptance-20261127`
(`br-solitary-art-arun91gj`), 2026-11-28:

- 20 shared Accounts, 313 shared session records, 21 active shared grants.
- Zero native Accounts, Persons, grants, sessions, noncredit links, consumed
  adult reviews with a native account, or self-enrollment claims with a
  native account. Zero active shared grant Person-anchor mismatches and
  zero mismatched Site ownership among grants joined to existing Sites.
- Eleven inspected identity tables enable and force RLS; none grant direct
  SELECT, INSERT, UPDATE or DELETE to authenticated. Actual read-only
  SET LOCAL ROLE authenticated probes denied direct reads of accounts,
  sessions, grants, people and the native session relation (SQLSTATE 42501).
- Dedicated login can_os_canonical_auth_app successfully entered the
  NOLOGIN/NOBYPASSRLS restricted reader role and executed both
  v301_can_staff_session_context and v301_canonical_session_context for
  an invalid digest, each returning zero records. This confirms negative
  reader behavior, not positive authenticated session or tenant RLS parity.
- Six remaining foreign keys target native accounts/grants, including
  three public dependencies: access_account_noncredit_principals,
  access_adult_learning_reviews, noncredit_self_enrollment_claims.
- Eight SQL routines still reference native account/grant/session tables:
  v301_assert_assessment_actor_session, v301_assess_approval_authority,
  v301_canonical_session_context, v301_create_objective_assessment_draft,
  v301_validate_achievement_award, v301_validate_credential_issuance,
  v301_validate_credential_revocation, v301_validate_noncredit_self_enrollment_claim.

Retirement order: first replace live native account links with independently
verified public Account/Person ownership; migrate learning claims and
review consumption without inventing identity evidence; migrate restricted
reviewer/assessment authority and the eight SQL dependencies; verify the
historical attribution model; then remove native minting, recovery, activity
and cookie paths after ordinary API acceptance. Retire empty compatibility
tables only after an explicit migration preflight and evidence-preserving
dependency check on the actual deployment database. Do not drop them merely
because this isolated branch has zero rows.

The main retirement script now inspects the real extracted service paths,
not outdated transport wrappers, and obtains count/dependency/security
evidence in a read-only repeatable-read snapshot. Production was not queried
or modified. Tests are authored, not executed in this source increment.

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

For the institutional scenario set `CAN_NEST_INSTITUTIONAL_QA_JSON` to a
reviewed-isolated-institutional-fixtures attestation with requesterEmail,
reviewerEmail, stewardEmail (distinct lowercase .test accounts already
provisioned under existing policies), programId, foreignProgramId,
employeePersonId, employeeRole, requesterSiteId and institutionId.
The staff grant must have no existing issuer approval; the current Program
must have an approved CAN-church service agreement and eligible original
employee without an active delegation; foreignProgramId must belong to a
different institution. Only the normal access request/verify endpoints and
local isolated mail outbox are used. The scenario mutates reviewed disposable
fixtures; use fresh fixtures for repeat execution and verify resulting audit
receipts. No fixture was provisioned or exercised by this source change.

Additional targeted tests:
```sh
npx vitest run tests/unit/credential-issuer-authorization.test.ts tests/unit/can-learning-cookie-boundary.test.ts tests/unit/learning-session-provenance.test.ts
npx vitest run tests/integration/program-site-authorization.integration.test.ts
```
Run the integration suite against the reviewed isolated database only.

## Release gates still open

- Run the actual build, HTTP tests, generated SDK type checks and isolated authenticated scenarios; verify audit receipts and repeat/concurrency behavior.
- Verify the complete Person lifecycle, roles/appointments and tenant RLS using restricted QA database connections and negative cross-tenant tests. No database migrations were applied in this slice.
- Inventory remaining institutional appointments (beyond credential issuer approval and Program staff delegation), reconcile native credential retirement and logout semantics, and migrate frontend callers before cutover.
- Exercise expired delegation with an approved expiry test fixture; never introduce a production clock or privilege bypass.
- WS11: migrate the actual frontend owner/access/session flows to generated SDK and remove replaced TanStack transport only after parity, including V6.1 UX.
- WS01/WS12: production deployment, origin/cookie proxy architecture, integration and release evidence. The API is still locally gated.

This is a source implementation increment, not a completed or deployed security migration. Do not merge to a release branch until the gates above are satisfied.
