# Adult and community self-enrollment, canonical v3.0.1

**Implementation:** GitHub `main`  
**Database migration:** `database/canonical/v3.0.1/patch-noncredit-self-enrollment.sql`  
**Test database:** `sweet-hall-62441909`, test01 `br-bitter-feather-ar0u63x7` (migration applied; two synthetic QA-only open releases and separate stage authorization evidence)  
**Production database:** `br-restless-sea-ar9ooo55` (migration **not yet applied**)  
**Release state:** Source committed. Test01 SQL registration/consent/capacity/Site/withdrawal integration **passed**, with all synthetic learner rows rolled back. TypeScript/build, live session-based provider/learner E2E, restricted-principal login tests and deployed browser tests **not yet executed**. Do not call this production released merely because the code is in main.

## Reproducible test01 fixtures and verified integration

The `test01` branch contains a strictly synthetic provider, operation, two QA Sites,
two short metadata-only published training versions, associated published Course
versions, active deployments, approved offering adoptions, effective completion
policies and **separate evidence-backed noncredit registration authorization**.
This is not real instruction, accreditation, a credential or an approved COGIC course.

- `database/canonical/v3.0.1/seed-noncredit-self-enrollment-test01.sql` (applied only to test01)
- `database/canonical/v3.0.1/accept-noncredit-self-enrollment-test01.sql` (transaction rollback suite)
- `scripts/acceptance/test-noncredit-self-enrollment-test01.mjs` (guarded runnable suite)

Test01 releases are `aa230000-0000-4000-8000-000000000001` (independent,
capacity 2) and `aa230000-0000-4000-8000-000000000002` (Site A facilitated,
capacity 1; Site B has no deployment permission). They have a limited open
window and must never be advertised as real instruction.

The 46-statement rollback test ran successfully via Neon on test01: three
synthetic verified account/Person/native learner linkages created three
registrations and claims; wrong Site, wrong consent, mismatched native Account,
and over-capacity were rejected; one registration and its attempt were
withdrawn without releasing its seat or deleting its claim. The savepoint then
rolled back all learner identities, registrations, attempts and claims.
A subsequent read confirmed **zero residual synthetic learner data**.
The exact published-release eligibility predicates (active operation/deployment,
approved adoption, evidence-backed noncredit stage authorization, Site
placement, provider role, published completion policy and Course) returned
**both synthetic releases**. An actual connection using
`can_os_canonical_auth_app` succeeded, but raw SELECT against the claims,
releases and legacy-to-canonical identity bridge was denied by PostgreSQL
(`42501`). These are genuine test01 DB role checks, not simulated account
or HTTP authorization tests.

The test initially failed on the existing database's independent
`register_noncredit` authorization gate. Both public discovery and the
provider release publisher now check current, approved, effective,
non-superseded **operational authorization decisions** for the registering
organization and operation/deployment. The synthetic fixture supplies distinct
TEST ONLY evidence and approval rows. The database remains the final
authorization authority.

To repeat the database suite with a restricted disposable test target:

```sh
APP_ENV=test CAN_TEST_DB_WRITES_ENABLED=true \
  TEST_DATABASE_URL="$TEST_DATABASE_URL" \
  npm run db:canonical:noncredit:integration
```

For on-demand browser acceptance against an **exact-commit deployed test preview**:

```sh
CAN_RELEASE_E2E_URL="https://<your-test-preview>" \
  CAN_RELEASE_SOURCE_SHA="<main-sha>" \
  CAN_RELEASE_DEPLOYED_SHA="<matching-deployed-sha>" \
  CAN_NONCREDIT_QA_RELEASE_ID="aa230000-0000-4000-8000-000000000001" \
  npm run test:e2e:noncredit
```

Only set `CAN_NONCREDIT_E2E_WRITES=1` with `APP_ENV=test`,
`CAN_TEST_DB_WRITES_ENABLED=true`, and two separately verified,
already-provisioned nonproduction CAN session secrets in
`CAN_NONCREDIT_QA_CAN_SESSION_1` and `CAN_NONCREDIT_QA_CAN_SESSION_2`.
Browser mutations consume real capacity in the designated isolated
test database; use fresh disposable releases for repeated runs.
The Playwright suite has been committed but **not executed** because the
Netlify deploy does not include this branch's source commits.

## Product model

A CAN account is the single person-owned identity, independent of school admissions. A provider creates an explicit, versioned, public **enrollment release** from an independently approved **active** canonical deployment, adopted Offering version, published training/Course version and effective provider-approved completion policy.

For the proposed partner pilots, the one-hour leadership session and four-week digital-skills course are **two trainings and two enrollment releases**, not two registration applications. The same registration workflow works for any future adult, workforce, veterans or community noncredit program. Do not create fixture pilots in production.

A release is either `independent` (no Site bound) or `facilitated` (an exact active deployment Site and current operation Site relationship). The participant's Site is never inferred from a saved favorite, membership, referrer or a client-supplied Person ID. The optional `ref` link parameter is a bounded source/campaign tag, **not** a network grant, geographic assertion or affiliation authorization.

## Pages

- `/learn/enroll`: public search among **open** published releases. Show provider, training, delivery context, available places and full immutable terms. Adult confirms 18+, reads/accepts release version, signs in or creates an account, and clicks Confirm my registration.
- `/learn/my-courses`: learner's registrations and status via an explicit CAN-to-canonical Person link, with native session restoration for active courses. Learners may self-withdraw from unfinished active registrations using explicit confirmation.
- `/learn/course/:courseAttemptId`: own canonical Course-attempt learning workspace. Reuses recorded lessons, knowledge checks, surveys, completion readiness and Classroom Connect with existing authorization.
- `/programs/noncredit/enrollment`: native Site-admin/registrar release publisher. Lists only current provider/operator-scoped approved training candidates, allows an exact participating Site for facilitated, sets window/capacity and versioned terms, records publisher audit and supports closure.
- `/canonical/lab/enrollment`: **remains read-only design preview**; links to actual new routes without writing records.

## Verified account vs canonical learner

Canonical v3.0.1 has its **own** `canonical_accounts`, `persons`, `canonical_account_grants`, `canonical_sessions`; legacy `public.access_accounts` and `public.people` are **not equivalent IDs**.

The registrant must be an active, verified, non-demo CAN account with exactly one Person identity and no school `student` role. Signing into CAN alone gives **no** native learner privileges.

On the first explicitly consented self-registration, the server checks for an existing `access_account_noncredit_principals` link. If none, it **refuses** to link by matching email to an existing canonical identity, including an already operator-verified legacy/native principal crosswalk. Such accounts need manual identity reconciliation. Otherwise it creates a **new** canonical account and Person and a one-to-one linkage in the same transaction. The new native Person has a self-declared preferred name only, not an asserted legal name or DOB.

One canonical learner grant is added **only** for the releasing registering/operator Organization, with `site_id=NULL`, not as an institutional Site admin or school student. A current learner session is issued using `CAN_CANONICAL_ACCESS_TOKEN_PEPPER`, with its validity checked independently through the restricted `CAN_CANONICAL_AUTH_DATABASE_URL` projection. No env feature flag. Missing reader connectivity denies new enrollment.

## Registration authority and writes

The self-registration server obtains actor and Person from the trusted server session, never the request body. It serializes each release's capacity and each CAN account's native mapping, then locks the release and rechecks:

1. Current published release, inside its registration window, under the same exact **active** deployment/adoption/offering/training/Course.
2. Active operation, provider and registering Organization, authorized deployment, current approved adoption, published Offering/Course and independently approved published training.
3. Active approved registering-Organization operator relationship, and, for facilitated releases, active Site with a valid deployment + operation Site relationship.
4. Published effective immutable completion policy; a release-specific capacity slot; consent version/text SHA matches the server projection.
5. Active verified, unambiguous adult session. Existing noncredit registrations/claims are idempotently returned only if **this** Person/account/release owns them; revoked, moved or mismatched registrations need review.

A new registration atomically creates: `noncredit_registrations` (with enrollment-time completion policy), `learner_profiles`, `learner_course_attempts`, one consent/registration claim, audit event and canonical domain event, plus scoped learner grant and native session. A submission **never** creates school enrollment, family guardianship, class attendance, grade, certificate or grant funding entitlement.

Release fields and consent become immutable on publication; closure only. Claims are append-only. A verified adult can withdraw their own **unfinished** noncredit registration; the transaction marks active Course attempts withdrawn, closes their facilitated room pairings, and appends a canonical audit/domain event. It cannot withdraw a completed or credentialed training, touch school enrollment, erase collected evidence or silently reopen a seat. Capacity counts all prior self-enrollment claims for that release, including those later cancelled, until a separately governed seat-release/refund policy is implemented. This is conservative rather than assuming cancellation opens a seat.

For facilitated claims, **room pairing and room-status reads** check the exact registered Site. Independent online learners may pair at an otherwise authorized room without duplicate registration. Room pairing is not evidence of verified attendance. Course activity remains evidence only under its original independent policy.

## Security and validation

- Both new canonical release and claim tables, and the legacy/canonical bridge, have **forced RLS** with a restricted trusted-owner policy. The restricted native auth reader has no raw SELECT to any of them.
- Consent is a signed-in, timestamped **record of user acceptance** that is also database-verified against the immutable text/version SHA of the immutable displayed terms, not a cryptographic user signature. Email verification proves mailbox access, not legal age or identity.
- Native session default expiry is 12 h with a 30-minute idle check; only actual trusted pointer/keyboard interaction can extend idle life. Page rendering, timers and video position alone cannot extend it.
- GETs are no-store for private data; published course catalog is public cached briefly. A valid logged-in Person sees only their own linked registration. Reopening a course requires current source registration/adoption/deployment authority.
- Operator-published release, capacity and consent evidence is separate from network affiliation, Site favorites and sponsored referral attribution.

## Acceptance / release blockers

1. Run `npm run typecheck`, `npm run test -- tests/unit/noncredit-self-enrollment.test.ts`, `npm run build`; regenerate TanStack file routes during normal build.
2. With isolated TEST_DATABASE_URL and APP_ENV=test, run `npm run db:canonical:noncredit-self-enrollment` for migrations, RLS, least privilege, required FKs and immutability.
3. Test01 has the strictly synthetic two-release fixture and the rollback-only database integration suite has passed. Repeat using the guarded npm command; do not mistake a metadata-only QA course for a ready real pilot.
4. Test concurrent last-seat registrations, duplicate click/retry, consent revision mismatch, closed/expired/premature release, withdrawn learner, restricted canonical reader outage, preexisting native email collision, revoked source membership and cross-account/course isolation. Exercise owner-only confirmed withdrawal, idempotent retries, completed-outcome denial and immediate room-access removal.
5. Test independent, facilitated Site A vs Site B, revocation during pairing, expired room behavior, guardian/student denial, native session expiration and verified interactive renewal. Test at least two real distinct CAN accounts.
6. Verify production environment secret/reader permissions and deploy a successful current GitHub `main` build; Netlify's previously inspected production deploy was stale, so build/real-site acceptance must precede production schema migration.
7. After release approval, apply the additive SQL patch to production, verify restricted readers/trigger/policies, deploy and run controlled live test. Do not publish fake pilot offerings to simulate completion.

## Future, intentionally not falsely implemented

Native canonical users whose separately created Person/account collides with a CAN account need operator-reviewed identity linking, not a silent email merge. Youth/guardian managed registration, payment/fee waivers, waitlists, release/cohort transfer, formal Site seat allocation and authorized portfolio/network reporting are separate features. A provider should not assume its registration attribution provides rights to see unrelated school records.

## Update: community class operations source expansion (November 14, 2026)

The subsequent implementation in `main` adds course release-to-Classroom
Connect meeting links, provider-scoped roster and reporting, audited seat
reconciliation, a first-class waiting queue and bounded invitations, multi-Site
batch publication for currently authorized Sites, and a unified My Learning
page. These commits do **not** supersede the release blockers above. The new
SQL migrations are committed but not applied or validated here; production
deployment, current browser acceptance, settlement processing, cross-provider
network delegation and transfer workflows remain unverified or incomplete.
See [Community Program Participation](COMMUNITY-PROGRAM-PARTICIPATION.md).


## Optional Site attribution for independent online courses (2026-11-15)

**Current source and test01 change:** `education_v30.noncredit_self_enrollment_releases.site_id` may now reference an authorized `physical`, `virtual`, or `mobile` Site even when `delivery_mode='independent'`. `site_id=NULL` remains valid for provider-wide online training. Facilitated delivery still requires a non-null Site and the separately authorized classroom relationship. The constraint change is `database/canonical/v3.0.1/patch-noncredit-site-associated-online.sql`, applied and verified on `test01` only.

The publisher offers an optional currently authorized Site for independent online release, checks the operation-to-Site and operator/host relationships before publishing, and stores the Site on the release. The public enrollment catalog rechecks those relationships and the current Site status; it does not require a physical classroom for independent online delivery. Self-enrollment claims preserve the exact Site from the verified release. **Learner account grants remain organization-scoped (`site_id=NULL`), which is correct and separate from Site association of an offering.**

Where a public Website Site maps by an independently reviewed Site identity correspondence to the canonical Site, the existing public Site renderer may show a current approved noncredit release and link to the existing `/learn/enroll?release=...` route. A mapping never creates publication, registration, content license or attendance authorization.

As of this documentation update, no canonical/native Site identity has been approved on `test01`. The schema changes have not been applied to production. The source changes require a successful build/typecheck, isolated real-session integration/browser regression, exact deployed commit verification, and public hostname/TLS/restricted-reader acceptance before release-ready status.
