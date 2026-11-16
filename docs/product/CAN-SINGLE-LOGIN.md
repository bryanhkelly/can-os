# CAN OS single sign-in for canonical Site staff

**Source status:** Implemented in GitHub `main` for verified CAN Site Admin and
Registrar accounts with explicitly reviewed canonical Person and Site links.
**Deployment status:** Not yet accepted in a deployed browser session.

## One login, two independent scopes

A staff member signs in **once** at CAN's existing `/access` flow. Canonical
staff server functions use that same trusted CAN cookie and the active school
membership. They never ask a user to enter a second password, invent a native
canonical account, or issue a second administrator cookie.

Canonical authorization still requires all of the following on *every request*:

1. An active, verified, non-demo CAN login for exactly one Person (no shared
   demo-switcher or cross-person family identity).
2. A current CAN `site_admin` or `registrar` grant at the exact original
   school Site, without broadening to sibling Sites.
3. The independently confirmed and independently reviewed
   `public.site_canonical_identity_links` mapping from that Site to the
   corresponding canonical Site.
4. An independently reviewed, nonrevoked one-to-one CAN Account to canonical
   **Person** link, `public.access_account_canonical_principals`.
5. Exactly one current canonical native account grant for that canonical Person,
   same Site and role, whose Organization has a current operator/host
   relationship at that Site. Canonical native account, grant, Site and
   Organization must all remain active.

No role is elevated merely by entering a UUID, matching an email, selecting a
network, favoriting a Site, or approving a Site identity link.

## Operator setup sequence

1. Provision actual canonical Organization, Site and approved staff grants
   through the existing independently authorized administrative process.
2. Use `/site-identity?mode=request` for the school's existing Site.
3. A native canonical operator independently confirms the proposed Site in
   `/site-identity?mode=confirm`. This is a **bootstrap-only authorization
   checkpoint** before the CAN-to-canonical Site correspondence exists, not a
   second staff login for regular operations.
4. An independent CAN institutional reviewer approves the Site relationship
   in `/site-identity?mode=review`.
5. The same independent reviewer links the *verified* public staff account to
   the correct existing canonical Person at `/site-identity?mode=staff`,
   providing the actual identity evidence. The reviewer cannot approve their
   own account or duplicate an active Person/account mapping.
6. The staff member visits `/programs/noncredit/enrollment` or other
   authorized canonical workspaces using **only their existing CAN login**.
   No native administrator session is minted for this path.

Revoke the staff identity correspondence from the same Staff page, revoke
either grant, or revoke the Site link to deny access on the next request.
Historical audit events are retained.

## Synthetic demo accounts

The shared `@*.demo` identities, including the public Valor Demo Admin,
can use the safe read-only Enrollment Lab experience preview. A public
six-digit shared demo code is **not sufficient proof of a real staff identity**,
so these personas cannot use the real canonical provider commands via the
single-sign-in principal bridge. Testing real administrative commands requires
a verified non-demo staff identity with independent review and synthetic
data in an isolated test environment.

## Native learner and reviewer compatibility

Existing adult self-enrollment retains its separately consented one-to-one
CAN Account to canonical learner mapping, and its automatically issued
canonical learning session. A CAN cookie plus native learner cookie is accepted
by the canonical command-context adapter only if the current verified CAN
Person, account and native learning session match that existing bridge.
Mismatched native staff or learner sessions fail closed.

Native independent Blueprint/survey reviewers and native bootstrap operators
remain subject to their original independently scoped authentication until
an explicitly reviewed CAN account/Person crosswalk for those roles is
delivered. Do not silently infer reviewer power from a CAN Site Admin grant.

## Database and release order

Additive migrations, in order:

1. `database/canonical/v3.0.1/patch-can-staff-single-login.sql`
2. `database/canonical/v3.0.1/patch-can-staff-restricted-auth-reader.sql`

The second creates `education_v30.v301_can_staff_session_context(text)`.
The interactive CAN session supplies the only bearer secret. The server hashes
it and calls the new SQL projection using the existing restricted canonical
authentication login with `SET LOCAL ROLE can_v30_canonical_auth_reader`.
The returned context contains only the uniquely authorized native account,
session, grant, Person, role, Organization and Site. No general application
connection reads raw canonical identities for staff authentication.

A user with a valid CAN session may have **no** canonical staff access: the
function denies unmapped Sites, absent/ambiguous independently reviewed Person
links, stale grants, revoked sessions, conflicting Persons and mismatched roles.
A shared demo login never acquires production-grade canonical staff privileges.

Staff mutation endpoints also use
`assertCurrentCanonicalStaffForMutation` in the same database transaction as
publishing, cohort changes, completion decisions, completion policies and
credential writes. This rechecks the current scope before mutation. It reduces
stale preflight authority, but without row-locking every identity record it is
**not** a guarantee against all concurrent revocation/commit races. Existing
operation-specific database policies and resource gates remain mandatory.

The canonical role matrix now distinguishes `noncredit.enrollment.read`,
`noncredit.enrollment.manage`, `credential.preview`, and
`credential.issue`. Neither `site_admin` nor `registrar` inherits
`credential.issue` automatically. Credential issuance is intentionally
inaccessible until independently approved issuer authority exists; merely
enabling `CAN_CREDENTIAL_ISSUANCE_ENABLED` is insufficient.

- **test01**: principal-link migration and restricted staff reader applied.
  The test branch was missing `access_sessions.last_activity_at` and
  `shared_device` despite those columns being present in production and
  declared in `drizzle/0079_session_device_evidence.sql`. Both were added
  *only on test01* before installing the reader; existing session activity was
  bounded by `updated_at`.
- **test01 authorization acceptance passed**: the SQL function returned one
  synthetic authorized Site Admin, then denied revoked sessions, inactive
  staff membership, revoked Person links, revoked Site links and an ambiguous
  second Person. Acceptance used a savepoint and rollback; no synthetic
  source accounts, grants or links persisted.
- **Restricted-role evidence on test01**: `can_os_canonical_auth_app`
  successfully entered the dedicated `can_v30_canonical_auth_reader` role
  and executed the new function with a nonmatching test digest (zero rows).
  The reader can execute the function but cannot directly SELECT raw
  public CAN sessions, CAN/native principal mappings or native grants.
  Public EXECUTE on the function is revoked.
- **TypeScript tests, build and signed-in Playwright**: source tests were
  committed, but no successful CI or browser execution is evidenced yet.
  Do not treat a GitHub commit as a production release.
- **production main Neon**: when inspected November 15, 2026, the staff
  principal-link table was absent, there were **zero** approved Site identity
  links, and **zero** active native `site_admin`/`registrar` grants.
  No production migration or records were silently provisioned by this work.
- Apply the reviewed migration under the approved production change process
  *before* deploying source that reads this table; separately provision valid
  Site links, native staff accounts/grants and verified Person mappings.
- Run `npm run typecheck`, unit tests, an exact-SHA build and signed-in
  browser regression against disposable test data before claiming release
  acceptance. Previously recorded GitHub Actions startup failures are not
  evidence of passing verification.

A single login does not mean every staff member automatically has every
canonical role. Authorization remains an exact resource/role relationship.

## Independently approved sensitive capabilities (P0 slice)

**Source is committed on `main`, not activated in production.**
`database/canonical/v3.0.1/patch-sensitive-credential-issuer-approvals.sql`
has been installed on `test01`. The migration adds an expiring,
independently reviewed `credential.issue` approval for one native staff grant,
plus a restricted `v301_can_sensitive_capability(text,text)` projection.
There are no real approved issuer grants.

The governed workflow is at `/canonical/issuer-access`, using the existing
CAN login. Verified Site Admins or Registrars can submit their own issuer
request with evidence. A separately authenticated CAN institutional reviewer
must approve it with a defined expiry; the requester cannot self-approve.
Reviewers can reject or revoke requests and all decisions are audited.

The issuance command now uses `assertCurrentCredentialIssuer` inside its
write transaction and locks the approved grant row before creating an award.
A Site Admin/Registrar role by itself is never `credential.issue` authority,
and a native-only second-login cookie cannot satisfy the new issuer guard.

**Activation blockers:** `CAN_CREDENTIAL_ISSUANCE_ENABLED` must remain
disabled until a reviewed runtime DB permission plan, DB-backed issuer
lifecycle acceptance, executable TypeScript/build/Playwright checks, credential
artifact issuance, revocation and cross-organization negative acceptance pass.
The rollback-only issuer acceptance SQL is committed as
`database/canonical/v3.0.1/accept-sensitive-credential-issuer-test01.sql`,
but its execution was blocked and no positive issuer-grant test is claimed.
A read-only negative test using a nonmatching session digest was verified on
`test01` and returned false for both issuance and unrelated capabilities.
The restricted reader can EXECUTE the capability projection but cannot directly
SELECT the approval table; public EXECUTE is revoked.

**Important:** Existing credential-award domain RLS and runtime application
role grants are separate prerequisites. The issuer workflow may not have
runtime DB write privileges under a non-owner deployment login until the
credential-specific, audited role is provisioned. Do not widen general
application database privileges to make it work.

## Issuer governance hardening, follow-up (pending database rollout)

The sensitive issuance authorization is now bound to **both** the requested
canonical staff grant and the original verified CAN account. If a canonical
Person is subsequently linked to another CAN account, that account does not
inherit an earlier account's credential-issuer approval.

The original `patch-sensitive-credential-issuer-approvals.sql` has the
account-binding check for fresh installations. Databases with the earlier
version must apply the additive
`patch-sensitive-credential-issuer-account-binding.sql` patch.

The approval request/review/revoke handlers also switch temporarily to
`can_v30_sensitive_approval_writer` within their authorized transaction,
instead of executing the actual INSERT/UPDATE as the broad application role.
The role has no login, no BYPASSRLS, no DELETE, and separate RLS policies
covering pending requests, independent review and revocation. This requires
`provision-sensitive-issuer-approval-writer.sql` and a separately reviewed
runtime DB role membership grant, if the runtime app is not the table owner.
Missing membership **denies approval writes**; there is no owner fallback.

Credential issuer reviews now require a *dedicated*
`can_credential_reviewer` CAN membership, authorized at the CAN institutional
network scope. The usual `can_network_steward` Site identity reviewer cannot
approve or revoke issuer access merely by holding that broader network role.
This new role is a separate grant, not a new login. The institution must
explicitly provision it to a verified Person before issuer requests can be
approved; no reviewer is automatically seeded.

**Rollout / verification order (test01 first, no production changes):**

1. Apply `patch-sensitive-credential-issuer-account-binding.sql` to a
   reviewed nonproduction environment with the base approval schema.
2. Apply `provision-sensitive-issuer-approval-writer.sql`; verify the actual
   writer RLS policies, absence of DELETE and who may SET the role.
3. Configure the separate restricted auth login, then run
   `npm run db:canonical:issuer-reader`. This is read-only and fails if the
   installed SQL function lacks the CAN-account binding.
4. With an approved test01-only owner connection and explicit test opt-in,
   run `npm run db:canonical:issuer-acceptance`. The SQL asserts positive
   approval, pending/expired/revoked denial, source CAN-account transfer denial,
   and synthetic data rollback. This test was **not run in this follow-up**.
5. Run `npm run typecheck`, `npm test`, `npm run build` and authenticated
   browser tests for staff, dedicated reviewer, wrong organization, Site
   switching and revocation. No successful workflow run is yet recorded.
6. Do not enable `CAN_CREDENTIAL_ISSUANCE_ENABLED` until restricted runtime
   credential-award writers, trusted artifact issuance, and cross-organization
   and credential revocation acceptance have also passed.

The application security check independently compares the issuer request's
CAN account to the CAN session even before the SQL hotfix is deployed, but
both code and the stored SQL function are mandatory for release. The test01
database currently retains the earlier projection until migration approval.
