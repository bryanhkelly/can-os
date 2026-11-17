# CAN OS App Admin and Valor School Blueprint readiness

Status: implementation partially committed to main; **not released or accepted**.
Last inspected: 2026-11-17. Production database: Neon can-os / main.
Run with current database evidence; do not assume these observations remain true.

## What is now in source

- `app_admin` is an independently scoped public-schema CAN access role.
  It conveys `platform.admin` only, never any school, learner, Site, Blueprint,
  credential-issuer, or reviewer access.
- `/platform` is the protected, read-only platform-admin landing page.
  Its server endpoint rechecks a current verified non-demo CAN account,
  exact app_admin grant, and null organization/Site scope.
- `npm run admin:provision` is a read-only preflight unless an operator
  explicitly includes `--execute`. It requires existing distinct verified
  target and independent approver accounts and an external approval ticket.
  It does not mint credentials or infer identity from an email match.
- Site Admin/Registrar Blueprint Studio is exposed in school navigation,
  but actual canonical operations continue to enforce their independent
  organization, Site, Person, grant, SQL purpose and Blueprint permissions.
- `npm run db:canonical:staff-readiness` checks canonical infrastructure and
  aggregate active relationship counts, not private identities.

## Production findings (2026-11-17)

- `education_v30` is installed, but there are zero native canonical
  organizations' school Sites, zero Persons, zero canonical accounts, zero
  active canonical Site administrators and zero active operator relationships.
- Public CAN has eight school Sites; Valor's public Demo Admin has an active
  `site_admin` grant, but it is a shared synthetic `.demo` identity.
- There are zero approved public-to-canonical Site identity links and zero
  verified CAN-to-canonical Person links.
- The additive `patch-can-staff-single-login.sql` and
  `patch-can-staff-restricted-auth-reader.sql` were applied on 2026-11-17:
  both the restricted staff projection function and Person crosswalk table
  now exist on production. No Person, Site or staff links were created.
- There are currently zero `app_admin` grants. Do not claim an App Admin
  login or password exists.

## Separate trusted App Admin bootstrap

1. Independently choose the actual operator-owned, existing verified CAN account
   and distinct approver. Obtain an auditable operator approval ticket. Do not use
   the Valor demo identity, the published six-digit test code or an unverified
   email account.
2. Confirm the distinct approver currently holds an authorized, active
   organization-scoped `can_network_steward` grant or an existing account-wide
   `app_admin` grant. A verified email without one of these grants is **not**
   sufficient. The initial institutional reviewer must be appointed through a
   separately governed organizational process before this script can be used.
3. On an authorized operator machine, target the desired database using a
   controlled connection. Set `PLATFORM_ADMIN_EMAIL`,
   `PLATFORM_ADMIN_APPROVER_EMAIL`, `PLATFORM_ADMIN_TICKET`, and `DATABASE_URL`.
4. Run `npm run admin:provision` first (rollback-only preflight). On
   independently approved evidence, run
   `npm run admin:provision -- --execute`.
5. Have the new App Admin sign in through the normal verified email flow and
   visit `/platform`. Confirm an active grant is visible and Site/learner
   destinations remain forbidden. Test deactivation/revocation independently.

The bootstrap is **not** a public UI privilege-assignment endpoint. Further
platform-wide mutations are not implemented by the read-only landing page;
each requires its own audit, policy, and separate route-level permission.

## Canonical onboarding before Valor Blueprint Studio

1. Use the canonical **net-new** education model. Do not bulk copy legacy
   school identifiers or treat matching names/emails as identity verification.
2. Under an authorized setup procedure, create/verify actual canonical
   Organization, Site, and distinct native staff Person/account/grant.
   Establish the current canonical Site operator relationship and provision
   restricted per-Organization Blueprint SQL author/reviewer purpose roles.
3. Request Site correspondence at `/site-identity?mode=request`.
   Have an authorized native operator confirm and a **different**
   institutional reviewer approve the exact Site relationship.
4. An independent institutional reviewer verifies the real non-demo CAN
   staff Person crosswalk at `/site-identity?mode=staff`, after checking the
   canonical grant's Person, Site and role. Shared synthetic demo accounts
   cannot satisfy this requirement.
5. Confirm the restricted deployed `CAN_CANONICAL_AUTH_DATABASE_URL`
   identity and its ability to `SET LOCAL ROLE can_v30_canonical_auth_reader`.
   The general database owner URL is not an acceptable substitute.
6. Exercise Blueprint Studio with the same verified CAN login:
   read exact Site, create draft, save revision, submit, distinct reviewer
   approval, and approved execution (planning Deployment only).
   Verify other-Site denial, self-review denial, revoked mapping denial,
   expired session denial and underlying SQL RLS/purpose boundaries.
7. Record exact deployed SHA, required secret availability, typecheck,
   relevant unit/integration tests, production build and authenticated
   Playwright before promoting the work.

## test01 restricted-role checks (2026-11-17)

Read-only direct Neon checks using the isolated
`can_v301_blueprint_acceptance_app` login and purpose-specific `SET LOCAL ROLE`
confirmed:

- 46 Blueprint-named RLS policies are installed; sampled planning tables
  have FORCE ROW LEVEL SECURITY enabled.
- Valor author role can see its exact native Site, cannot see the Barton Site,
  may INSERT draft Blueprint configurations, and cannot INSERT reviews.
- Independent Valor reviewer sees its own evidence, cannot see the sibling
  evidence or INSERT drafts, and may INSERT reviews.
- Neither purpose role may SELECT canonical sessions or UPDATE deployments.
- Dedicated CAN authentication login can enter the restricted auth reader
  role and rejects a nonmatching synthetic session digest.

This confirms restricted SQL boundaries, **not** the full browser or
transactional Blueprint draft -> save -> submit -> independent review -> execute
journey. The additional read-only regression command is:

```sh
APP_ENV=test CAN_TEST_DB_WRITES_ENABLED=true \
TEST_DATABASE_URL="<isolated-owner-connection>" \
DATABASE_URL="<distinct-production-connection>" \
CAN_CANONICAL_TEST_APP_DATABASE_URL="<isolated-restricted-connection>" \
npm run db:test:canonical:v301:blueprint-roles
```

The shared isolated-target guard requires the explicit test-write flag even
though this command only uses `BEGIN READ ONLY` and `ROLLBACK`. Never point
either isolated connection to production. After a fully reviewed isolated test
environment has been prepared, use the existing rollback-only
`db:test:canonical:v301:blueprint-flow` acceptance command. Do not claim
that command was executed by these read-only checks.

## Demo test strategy

The `admin.demo@valorschool.demo` account and published shared code are
**not** a production-grade identity source. Keep synthetic canonical
Blueprint fixture testing on isolated `test01`, with rollback, restricted
roles, and independent tester identities. Do not add a demo-only bypass to
the production session projection or mark an unreviewed Site link approved.

## Current release gate

Until the native canonical entities and verified links are established and
the application passes an exact-SHA build and browser test, **Valor School
Site Admin Blueprint creation is not production-accepted**. Site navigation
visibility does not constitute authorization.
