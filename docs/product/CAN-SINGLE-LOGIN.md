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

Additive migration:
`database/canonical/v3.0.1/patch-can-staff-single-login.sql`.

- **test01**: migration applied and RLS/index existence verified.
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
