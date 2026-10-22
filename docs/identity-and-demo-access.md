# CAN OS identity, session, authorization and synthetic demo access

## Product decision (2026-10-16)

CAN OS is a real multi-user application with a shared Neon-backed synthetic demo dataset. Demo access is passwordless using one-time email codes or links delivered by Resend. Resend is a transactional email provider, **not** an identity provider or session authority. Future production authentication plugs into the identity adapter without replacing resource authorization or application workflows.

## Required boundaries

1. **Account**: durable local user ID with verified email and status. Email is a login credential, not the primary person ID.
2. **Person**: school domain identity; may be connected to an account and multiple enrollment/employment/guardian relationships.
3. **Membership/grant**: verified account-to-person relationship, scoped site/organization/section access and capability grants. No grant is derived from a browser-selected persona.
4. **Session**: server-created, opaque, random, expiring and revocable credential, stored only as a hash at rest. Send cookie as HttpOnly, Secure, SameSite=Lax, scoped to the application origin. Regenerate on login. Protect mutations from cross-site requests with same-origin and CSRF checks.
5. **Active context**: choose only from the session's assigned roles/people/scopes; server resolves this from DB on every request (or short-lived cache with invalidation). Role switching never grants new capabilities.
6. **Demo impersonation**: optional, explicit, environment-gated facilitator grant separate from regular role switching. Only allow approved synthetic account targets. Persist acting identity and impersonator in audit events. Disable in real-data environments.
7. **Authorization**: one server-only `getCommandContext(request)` and `withAuth(capability, resourceResolver)` boundary for reads and writes. Validate relationship to each resource, not just capabilities.
8. **Data protection**: prohibit real person, medical, legal, payment and student records until authentication, scoping, auditing and privacy review are complete. In shared public demo, explicitly label all synthetic data and expect visitors' changes to be visible to others.
9. **Audit**: log acting person, authenticated account, effective role, impersonator (if any), resource, action, correlation ID, timestamp and outcome on consequential mutations; enforce append-only history at DB level. Avoid storing sensitive field contents in logs.
10. **Demo kill switch**: `CAN_DEMO_WRITES_ENABLED` must be explicitly true for synthetic mutations; restrict writes to an allowlisted synthetic dataset/tenant and provide facilitator-only reset with an audit record.
11. **Future authentication**: interface `verifyIdentityCredential(request): Promise<{ accountId: string } | null>` is replaceable by a future auth provider. Services depend on account/person/context, never on Resend or provider-specific claims.

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

## Passwordless flow

- Enter email; endpoint always responds generically (avoid enumeration).
- Rate-limit per IP, normalized email, and attempted challenge; cap sends and verification attempts.
- Generate high-entropy single-use code or token with a short expiration; persist only a salted/peppered hash and consumption metadata in Neon; invalidate superseded challenges.
- Deliver using server-only Resend API key and verified sender domain. Never log token or embed it in analytics.
- On redemption atomically consume challenge, check account status/grants, create server session, set secure cookie, and record login audit.
- Authenticate each request from session, not from query string, localStorage, or client-submitted actorId.
- Where anonymous shared demo access is allowed, give it an explicit limited demo principal and never pretend that principal represents an authenticated student or staff member.

## Local synthetic demo sign-in

In the existing access form, the six seeded synthetic email addresses reveal a code field and use the fixed code `CANOS-LOCAL-TEST` without email delivery in local development or test runs. Other addresses keep the standard email-link flow. Enable demo-code redemption explicitly with `CAN_DEMO_FIXED_ACCESS_ENABLED=true`; the server also requires `NODE_ENV` to be `development` or `test`. Production environments reject this sign-in path even if the flag is accidentally set. It only accepts the six allowlisted `.invalid` demo emails with an active synthetic grant, creates a regular audited server session, and does not mark the email as verified. Never use this code for real accounts or shared production access.

### Demo school management

Use `alex.registrar@can-os.invalid` for the registrar workspace. Jordan, Riley,
Casey and Morgan retain their separate student, teacher, specialist and guardian
roles. Registrar access is site-scoped to Synthetic Bay Campus in the existing
CAN Synthetic Demonstration School, not an unrestricted network administrator.

Explicitly provision the registrar's account, organization membership and
institutional grants with:

```powershell
$env:NODE_ENV = "development"
npm run demo:provision-registrar -- --apply
```

The command provisions both Alex and the separate Demo Admin. It loads `.env.local` and requires both
`CAN_DEMO_FIXED_ACCESS_ENABLED=true` and `CAN_DEMO_WRITES_ENABLED=true`.
It refuses production, missing/non-synthetic school scope, disabled accounts,
inactive/conflicting grants and non-synthetic existing records. It does not
reactivate revoked access. It is transactional and retry-safe, and appends
operator-bootstrap audit/outbox evidence only when provisioning changes data.
No account or grant is provisioned implicitly during login.

The institutional site grant enables credential review, qualification-catalog
creation, teacher-policy publication, curriculum publication and opening-handoff
management. Existing registrar capabilities cover school years, admissions,
enrollment activation, capacity, attendance and staff administration. Resource,
scope, independent-review and workflow checks still apply; missing readiness
evidence must be completed rather than waived. Guardian signatures and offer
acceptance still require an authorized guardian context, not registrar authority.

### Demo Admin user switching

Sign in as `admin.demo@can-os.invalid` with the same local demo code. Demo Admin
starts in a site-scoped registrar workspace. The top-bar **Demo user** selector
can switch to Jordan, Riley, Casey, Morgan or Alex and back to Demo Admin without
signing out. A persistent banner identifies the effective person and role.
Each switch performs a document navigation to discard the previous user's
mounted state and caches.

This is explicit, development/test-only facilitator delegation, not arbitrary
production impersonation. The admin account owns a separate synthetic
`demo_facilitator` grant and selects the original allowlisted user grants without
duplicating staff memberships. Each request
and selection rechecks that facilitator grant, the source user's active
synthetic grant, active person, enabled source account and exact school scope.
Revoking the source or facilitator grant removes access; provisioning never
reactivates it. Production or disabling either local demo flag denies existing
admin sessions as well as new logins.

The authenticated account remains Demo Admin while capabilities and relationships
come from the selected person/role. Student mode does not retain registrar
permissions. Guardian decisions can be demonstrated in Morgan's delegated
context, not while acting as registrar. Login and switch audit records identify
the facilitator; context-based domain audit helpers preserve both facilitator
and acting identity. This does not claim to complete the broader legacy audit
attribution migration documented below.

After changing local environment flags, restart the development server.
To validate provisioning, login, scope denials and transactional rollback on the
guarded disposable database, run
`node scripts/run-integration-tests.mjs demo-registrar`.

## Original implementation sequence (historical, not a live task list)

1. Add auth/session/one-time-challenge schema, scoped grants and idempotent synthetic fixtures.
2. Implement identity adapter + Resend magic code workflow with rate limits, challenge expiry, single use and cookie sessions.
3. Establish server-side context from authenticated session and choose authorized active membership.
4. Migrate every UI-facing server function from hard-coded fixture person IDs and `assertSyntheticMutation("role")` to scoped resource checks, including GET endpoints.
5. Backfill mutation auditing and DB immutability safeguards on audit/domain event history.
6. Implement clearly labeled facilitator-controlled demo impersonation and deterministic synthetic reset.
7. Cover unauthorized reads/writes, role switches, multiple actors, guardian relationships, session replay, cross-user leakage and audit attribution with unit/integration/e2e tests.

## Current implementation boundary

The application now derives workspace selection from server-issued session grants rather than trusting a browser-selected persona. See `src/modules/identity/command-context.server.ts` and `src/components/shell/WorkspaceNavigation.tsx`. Resource-level authorization, retention, safety, and deployment readiness still require explicit review and tests. Some legacy workflows still contain synthetic-write gates; do not generalize these into product architecture. Nothing in this document certifies the application for real student, medical, or legal data.
