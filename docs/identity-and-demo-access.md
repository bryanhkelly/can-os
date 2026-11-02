# CAN OS identity, session, authorization and tenant demo access

## Tenant architecture (FullFlow local redesign)

Valor is an ordinary canonical Organization/Site tenant, not a separate workflow engine. Account/person grants no longer carry `is_synthetic`. Historical migrations and optional fixture provenance metadata remain historical evidence, not authorization. Ordinary accounts retain one-time email links via Resend, which is a transport provider, not session authority. Restricted Valor accounts use the explicit fixed-code access path described below.

## Required boundaries

1. **Account**: durable local user ID with verified email and status. Email is a login credential, not the primary person ID.
2. **Person**: school domain identity; may be connected to an account and multiple enrollment/employment/guardian relationships.
3. **Membership/grant**: verified account-to-person relationship, scoped site/organization/section access and capability grants. No grant is derived from a browser-selected persona.
4. **Session**: server-created, opaque, random, expiring and revocable credential, stored only as a hash at rest. Send cookie as HttpOnly, Secure, SameSite=Lax, scoped to the application origin. Regenerate on login. Protect mutations from cross-site requests with same-origin and CSRF checks.
5. **Active context**: choose only from the session's assigned roles/people/scopes; server resolves this from DB on every request (or short-lived cache with invalidation). Role switching never grants new capabilities.
6. **Demo account switching**: the canonical Valor admin registrar membership may select only enabled, active, supported Valor account/person grants. Recheck admin and target authority on every request; no facilitator or mirrored grants.
7. **Authorization**: one server-only `getCommandContext(request)` and `withAuth(capability, resourceResolver)` boundary for reads and writes. Validate relationship to each resource, not just capabilities.
8. **Data protection**: prohibit real person, medical, legal, payment and student records until authentication, scoping, auditing and privacy review are complete. In shared public demo, explicitly label all synthetic data and expect visitors' changes to be visible to others.
9. **Audit**: log effective account/person/grant/role, session owner when delegated, resource, action, correlation ID, timestamp and outcome on consequential mutations; enforce append-only history at DB level. A shared demo code does not identify the individual human visitor.
10. **Demo identity access**: the approved `@valorschool.demo` accounts sign in with `000000` locally or on Netlify production, without demo-access flags. These shared accounts are intentionally public and must remain confined to Valor's synthetic tenant; they do not identify the human visitor. The database must already contain their active canonical grants, and `CAN_ACCESS_TOKEN_PEPPER` must be configured to issue sessions. Operator provisioning still requires literal `CAN_DEMO_FIXED_ACCESS_ENABLED=true` and development/test mode. `CAN_DEMO_WRITES_ENABLED` is retired; domain authorization, business invariants and transactional evidence apply to every tenant. External email/SMS is suppressed for Valor; R2 retains separate tenant-classified deployment switches.
11. **Future authentication**: interface `verifyIdentityCredential(request): Promise<{ accountId: string } | null>` is replaceable by a future auth provider. Services depend on account/person/context, never on Resend or provider-specific claims.

## Local startup and checkout authority

FullFlow is the authoritative connected checkout. Its `npm run dev` command
loads its own ignored `.env.local`, preserves explicit shell overrides, checks
the database and stable session key, and verifies the dedicated nonproduction
FullFlow Neon branch before starting. `npm run dev -- --check` performs those
checks without starting a server. It never provisions accounts on login or
automatically repairs data. Netlify production configuration remains separate.

The older sibling checkout has a different applicant model; it is not an
alternate source for FullFlow identity code. FullFlow's prospective-family
email verification and guardian-application workflow remain unchanged.

Approved demo grants must match the canonical account ID, person ID, expected
role, Valor organization and Valor site, not merely an email ending in `.demo`.
Login, context resolution and admin switching recheck these bindings. Changing
an approved email onto another account/person does not grant shared-code access.
Authentic accounts continue to use their normal email-verification flow.
These boundaries prevent shared demo identities from selecting foreign grants;
they cannot certify the authenticity of text entered into the demo tenant.
Operators must keep Valor's contents synthetic and keep real records elsewhere.

Verification returns generic `401` responses for rejected credentials or
unavailable memberships, and `503` with `Retry-After` for configuration,
database or transactional audit failures. Infrastructure failures log a safe
stage only, never raw errors, SQL, email addresses, tokens, codes or connection
strings. Such failures are not recorded as incorrect-credential attempts.

## Session-management hardening: initial inactivity limit (FullFlow)

The first session-management bite reuses `access_sessions.updated_at` as the
last **meaningful** session interaction timestamp. Session creation initializes
it, an approved role selection also updates it, and an explicit signed-in
interaction can advance it. This is an incremental schema-free change: it is
**not** a complete activity journal, device record or learning-session metric.

- **Server-enforced:** all calls to `getCommandContext` require an unrevoked,
  enabled-account session with absolute expiry in the future and
  `updated_at` strictly later than **30 minutes ago**. An idle expired
  session must sign in again; it cannot be revived by an activity POST.
- **No passive extension:** GET `/access/session`, the 60-second workspace
  polling, focus, navigation load and visibility alone must **never** change
  the idle timestamp.
- **Active use:** the signed-in workspace sends `POST /access/session` with
  `{ "kind": "activity" }` only after a trusted visible-document pointer or
  keyboard interaction (throttled to at most once/minute on the client).
  The existing same-origin POST check applies; server reauthorizes account,
  current grant, expiry and current idle state, then conditionally updates
  the server timestamp. This doesn't extend the fixed 12-hour absolute expiry.
- **Privacy/meaning:** a browser interaction is adequate as an inactivity
  *signal*, but is not evidence of student attendance, engaged learning or
  actual human identity, and is not copied into the academic event log.
- **Next focused bites:** a distinct `last_activity_at` column plus device
  inventory, remote session revocation, user-visible timeout warning and
  preservation of unfinished drafts. Before using this with real student
  records, verify actual expiration and cross-tab behavior in a signed-in
  browser against an isolated test database.

## Account session inventory and remote revocation (FullFlow bite 3)

`/account/sessions` is a self-service, account-wide security view. It calls
`GET /access/sessions` using the current verified session, lists at most 100
**currently usable** sessions, identifies the present session and shows each
sign-in time, last interaction and fixed expiration. It does not invent device
names, browser identifiers or geographic locations, and does not return stored
secret hashes, IP addresses or raw credentials.

- `POST /access/sessions` is same-origin only and accepts strictly validated
  `{ "kind":"one", "sessionId":"<uuid>" }` or `{ "kind":"all" }` commands.
  The client cannot select an account/person/role or broaden the scope of revocation.
- The server conditionally updates only matching
  `access_sessions.account_id` rows. Foreign/unknown/already revoked IDs
  produce a safe no-op without identifying another account's sessions.
- Revocation commits an account-owned audit record in the same transaction.
  Revoking the current session also clears its HttpOnly cookie. Other open
  tabs/devices will lose authorization on their next server request.
- Both student and administrator identities see their **own account sessions**,
  even if their account has memberships in more than one school. An organization
  operator cannot revoke another person's account sessions through this feature.
- A later bite may add device metadata collected at sign-in and stricter
  information-retention rules. Until then, the UI never claims device
  attribution it cannot support.
- Passing static tests are not a substitute for verifying multiple real
  sessions and cross-account denial against a disposable Neon branch.

## Security event attribution (FullFlow bite 4)

Authentication and session lifecycle successes now use a **typed, shared writer**
that persists records into the existing append-only `audit_events` table.
Covered events: `identity.session.started`, `identity.session.revoked`,
`identity.session.revoked_remote`, `identity.sessions.revoked_all` and
`identity.membership.selected`. Every recorded success includes its verified
account, person (or explicit null where unavailable), session, grant, effective
role and outcome. Login method is limited to known enum values. The audit
writer intentionally ignores arbitrary email, token, password, IP, browser
details and raw request payloads.

The generic `writeAudit(tx, commandContext, change)` path additionally includes
authenticated account/session/grant/role data **when available from the
server-verified command context**. Explicit user-supplied audit extras cannot
override verified attribution or the server request ID. Operations without a
verified user context continue to record their existing system-level evidence;
we do not invent an identity.

**Current limit:** This bite does **not** claim comprehensive failed-login
monitoring. Unassociated unknown-token attempts cannot be responsibly
attributed to a real account using the current audit schema. Failed passwordless
redemption, abuse control, attempt counting, structured unauthenticated
security telemetry and retention controls are distinct follow-on security tasks.
Do not store raw credentials or student work in the audit log.

## Anonymous authentication admission ceiling (FullFlow bite 6)

The two anonymous authentication endpoints have a database-enforced, **global**
emergency request budget. This is intentionally separate from the capped
failed-authentication *audit writer* described below:

- `POST /access/request`: **240 requests per 60-second window**
- `POST /access/verify`: **600 requests per 60-second window**

A single PostgreSQL row per route in `auth_request_rate_limits` tracks
`window_started_at` and `request_count`. An atomic
`INSERT ... ON CONFLICT ... DO UPDATE` resets the window or increments a
saturated counter so concurrent application instances share one cap. Both
routes check admission **before parsing credentials or querying accounts**.
Exceeding the cap returns `429` with `Retry-After` and `Cache-Control:
no-store`. When quota storage is unavailable or migration 0030 has not been
applied, these endpoints **fail closed with 503**, not with unlimited requests.

**This is deliberately NOT per-client abuse protection.** No reliable,
nonspoofable source IP, identity, or verified proxy signal is currently
available at the application boundary, so the gate does not trust
`X-Forwarded-For`, an arbitrary email, a browser cookie or a submitted token.
The budgets are **shared by everyone**; a malicious party could use up the
global budget and deny service to others. They must be tuned against real
legitimate sign-in rates and backed by **trusted Netlify/ingress-level
per-source rate controls** before deployment with real users. Limits protect
database/email cost but do not by themselves prevent distributed abuse.

**Deployment order:** Apply the committed
`drizzle/0030_anonymous_auth_request_budget.sql` migration to the target
environment **before** deploying the new endpoint code; otherwise legitimate
login attempts will receive 503. The migration contains no student data and
the counter table remains fixed in size (two rows under these handlers).

**Acceptance:** Unit tests verify SQL/upsert design, 429 responses,
fail-closed behavior, anti-enumeration and request/verify ordering.
Exercise concurrent admission, expiry reset, cross-instance persistence and
release migration ordering against an isolated database before calling the
deployment ready. Those database/browser checks are not established by static CI.

## Failed-authentication evidence (FullFlow bite 5)

The `POST /access/verify` rejection path records
`identity.verification.rejected` in the append-only `audit_events` table
through a best-effort writer. **No user or account has been authenticated
at this point.** The record intentionally uses `actor_person_id = NULL`,
a fixed anonymous authentication resource, `outcome = rejected`, and
a coarse method (email link versus local demo code). It never includes
email, challenge token/hash, password, request headers, IP or student data.
The HTTP error is generic and independent of whether the audit insert works.

To prevent unbounded anonymous audit writes, the writer obtains a **nonblocking
transaction advisory lock per authentication method**, checks a rolling
one-minute window using the existing resource index, and records at most 30
events per method per minute. It skips audit writes when busy or capped;
security dashboards must therefore interpret anonymous rejection counts
as **sampled/capped observations, not a complete count of attempts**.

**Important limit:** This caps **audit writes**, not incoming sign-in requests
or database queries. No claim of bot protection, per-network throttling, or
per-account verification-failure lockout is warranted. Real abuse controls
must be enforced at a trusted ingress/edge with a verified source-identity
policy before accepting production traffic. Never trust a caller-supplied
`X-Forwarded-For` header as a security boundary.

The existing per-account email-link issuance cooldown remains in place.
Successful auth lifecycle events retain separate verified identity attribution.

## Netlify per-client rate-limiting safeguards (FullFlow bite 7)

Two Netlify Edge Functions in `netlify/edge-functions/` declare code-based,
**Netlify-enforced client IP + domain** rate limits on the credential endpoints,
limited to POST requests:

| Route | Per-IP/domain limit | Global Postgres emergency ceiling |
| --- | ---: | ---: |
| `/access/request` | 20 per 60 seconds | 240 per 60 seconds |
| `/access/verify` | 40 per 60 seconds | 600 per 60 seconds |

This uses Netlify's own trusted edge request attribution; the application
does **not** trust `X-Forwarded-For` or parse the submitted email/token as
a source address. Each Edge Function returns without consuming the request body,
allowing the existing same-origin, global Postgres budget, atomic challenge and
audit gates to execute unchanged. Netlify's limits operate separately from
the application-side global limit; both are required.

**Verification required on deployment:** Netlify validates these rules during
**deploy post-processing**, not the local Vite build. It may not fail a deploy
for a broken rate-limit declaration. Review the Netlify deploy log and confirm
two valid published code-based rate-limiting rules for the named POST paths,
then run controlled over-limit requests in an isolated staging deployment.
Built-in rate limiting can begin blocking up to approximately 10 seconds
after a client crosses the threshold, so do not promise an instantaneous ban.
Ensure the current Netlify plan supports at least two code-based rules; on
plans with exactly two, these rules consume both slots.

**Limitations:** Clients behind shared campus or household NAT can share an IP
budget and experience temporary 429s. Determined attackers may distribute
requests across IPs. Do not log client IPs in CAN OS application audit, infer
student behavior from throttling, or claim that static CI proves Netlify's
published edge rules. Preserve application-wide database admission as a
backstop. Limits should be tuned using authorized, aggregated operational
measurements before real-student deployment.

## Passwordless flow

- Enter email; endpoint always responds generically (avoid enumeration).
- Rate-limit per IP, normalized email, and attempted challenge; cap sends and verification attempts.
- Generate high-entropy single-use code or token with a short expiration; persist only a salted/peppered hash and consumption metadata in Neon; invalidate superseded challenges.
- Deliver using server-only Resend API key and verified sender domain. Never log token or embed it in analytics.
- On redemption atomically consume challenge, check account status/grants, create server session, set secure cookie, and record login audit.
- Authenticate each request from session, not from query string, localStorage, or client-submitted actorId.
- Where anonymous shared demo access is allowed, give it an explicit limited demo principal and never pretend that principal represents an authenticated student or staff member.

## Valor demo sign-in

Valor demo accounts use `@valorschool.demo` and fixed code `000000` locally and on Netlify production, with no access flags, email delivery or implicit provisioning. Only the approved demo identities with active canonical Valor grants are eligible. Existing `.invalid` fixture aliases may be normalized by explicit provisioning, not promoted to arbitrary login identities. Demo redemption creates normal expiring, audited sessions but does not certify email ownership or a human person's identity.

### Demo school management

Use `alex.registrar@valorschool.demo` for the registrar workspace. Jordan, Riley,
Casey and Morgan retain their separate student, teacher, specialist and guardian
roles. Registrar access is scoped to the canonical demo Organization
`f1000000-0000-4000-8000-000000000002` and Site
`f1000000-0000-4000-8000-000000000003`, not an unrestricted network administrator.

Explicitly provision the registrar's account, organization membership and
institutional grants with:

```powershell
$env:NODE_ENV = "development"
npm run demo:provision-registrar -- --apply
```

The command provisions Alex and Demo Admin under explicit environment gates. It
normalizes the four recognized legacy source-account addresses in the same
transaction, after checking their fixed account/person/grant IDs, active status
and canonical tenant scope. It never replaces identities, reactivates revoked
grants or claims an address already owned by another account. Ordinary Programs
created within Valor do not need fixture provenance metadata.
It validates exact canonical tenant/person/account identities, refuses disabled
accounts or conflicting/revoked ordinary grants, and retires recognized legacy
facilitator/mirrored grants explicitly. It is transactional and retry-safe, with
bootstrap audit/outbox evidence only for changes. No account or grant is
provisioned implicitly during login. Do not run this against any live database
without separate authorization and a reviewed rollout.

The institutional site grant enables credential review, qualification-catalog
creation, teacher-policy publication, curriculum publication and opening-handoff
management. Existing registrar capabilities cover school years, admissions,
enrollment activation, capacity, attendance and staff administration. Resource,
scope, independent-review and workflow checks still apply; missing readiness
evidence must be completed rather than waived. Guardian signatures and offer
acceptance still require an authorized guardian context, not registrar authority.

### Demo Admin user switching

Sign in as `admin.demo@valorschool.demo` with the same demo code. Demo Admin
starts in a site-scoped registrar workspace. The top-bar **Demo user** selector
can switch to Jordan, Riley, Casey, Morgan or Alex and back to Demo Admin without
signing out. A persistent banner identifies the effective person and role.
Each switch performs a document navigation to discard the previous user's
mounted state and caches.

This is restricted tenant account delegation, not arbitrary production
impersonation. The canonical active admin registrar membership authorizes the
selector; every request rechecks admin authority, enabled target account,
active person and approved canonical exact-tenant membership. Revocation,
disabling an account or changing its identity binding denies existing delegated
sessions as well as new selections.
The effective account, person, capabilities and relationships are the selected
identity; `sessionAccountId` retains the admin session owner. Student selection
does not retain registrar permissions. Institutional verification, sensitive
custody/health operations and other independent-identity boundaries continue
to reject delegated sessions. Self-service session inventory and revocation
remain owned by the admin account, never by the selected account.

After changing the database connection or session configuration, restart the
development server with `npm run dev`; demo login itself needs no flags.
To validate provisioning, login, scope denials and transactional rollback on the
guarded disposable database, run
`node scripts/run-integration-tests.mjs demo-registrar`.

## Original implementation sequence (historical, not a live task list)

1. Add auth/session/one-time-challenge schema, scoped grants and idempotent synthetic fixtures.
2. Implement identity adapter + Resend magic code workflow with rate limits, challenge expiry, single use and cookie sessions.
3. Establish server-side context from authenticated session and choose authorized active membership.
4. Migrate every UI-facing server function from hard-coded fixture person IDs to scoped resource checks, including GET endpoints.
5. Backfill mutation auditing and DB immutability safeguards on audit/domain event history.
6. Implement clearly labeled restricted demo account switching.
7. Cover unauthorized reads/writes, role switches, multiple actors, guardian relationships, session replay, cross-user leakage and audit attribution with unit/integration/e2e tests.

## Current implementation boundary

The application derives workspace selection from server-issued session grants, never a browser-selected persona. Migration `0060_tenant_demo_access.sql` drops only `account_person_grants.is_synthetic`; it was applied on November 1, 2026 to the explicitly authorized nonproduction Neon `FullFlow` branch (`br-proud-pine-arfju8h2`). Postflight verified column absence and all 61 migration ledger/hash entries, with no pending migrations. The guarded preflight checks the known boolean column before 0060 and its absence afterward; exact-SHA migration authorization remains required. Application deployment and explicit legacy identity convergence remain separate, coordinated rollout steps. Identity provisioning and connected workflow/browser acceptance are unverified. Nothing here certifies production use or real student, medical or legal data.
