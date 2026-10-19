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

## Passwordless flow

- Enter email; endpoint always responds generically (avoid enumeration).
- Rate-limit per IP, normalized email, and attempted challenge; cap sends and verification attempts.
- Generate high-entropy single-use code or token with a short expiration; persist only a salted/peppered hash and consumption metadata in Neon; invalidate superseded challenges.
- Deliver using server-only Resend API key and verified sender domain. Never log token or embed it in analytics.
- On redemption atomically consume challenge, check account status/grants, create server session, set secure cookie, and record login audit.
- Authenticate each request from session, not from query string, localStorage, or client-submitted actorId.
- Where anonymous shared demo access is allowed, give it an explicit limited demo principal and never pretend that principal represents an authenticated student or staff member.

## Local synthetic demo sign-in

In the existing access form, the four seeded synthetic email addresses reveal a code field and use the fixed code `CANOS-LOCAL-TEST` without email delivery in local development or test runs. Other addresses keep the standard email-link flow. Enable demo-code redemption explicitly with `CAN_DEMO_FIXED_ACCESS_ENABLED=true`; the server also requires `NODE_ENV` to be `development` or `test`. Production environments reject this sign-in path even if the flag is accidentally set. It only accepts the four allowlisted `.invalid` demo emails with an active synthetic grant, creates a regular audited server session, and does not mark the email as verified. Never use this code for real accounts or shared production access.

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
