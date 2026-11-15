# Adult and community self-enrollment, canonical v3.0.1

**Implementation:** GitHub `main`  
**Database migration:** `database/canonical/v3.0.1/patch-noncredit-self-enrollment.sql`  
**Test database:** `sweet-hall-62441909`, test01 `br-bitter-feather-ar0u63x7` (migration installed, zero published courses)  
**Production database:** `br-restless-sea-ar9ooo55` (migration **not yet applied**)  
**Release state:** Source committed; build, route generation, real learner journey, provider E2E and restricted-principal tests **not yet executed**. Do not call this production released merely because the code is in main.

## Product model

A CAN account is the single person-owned identity, independent of school admissions. A provider creates an explicit, versioned, public **enrollment release** from an independently approved canonical deployment, adopted Offering version, published training/Course version and effective provider-approved completion policy.

For the proposed partner pilots, the one-hour leadership session and four-week digital-skills course are **two trainings and two enrollment releases**, not two registration applications. The same registration workflow works for any future adult, workforce, veterans or community noncredit program. Do not create fixture pilots in production.

A release is either `independent` (no Site bound) or `facilitated` (an exact active deployment Site and current operation Site relationship). The participant's Site is never inferred from a saved favorite, membership, referrer or a client-supplied Person ID. The optional `ref` link parameter is a bounded source/campaign tag, **not** a network grant, geographic assertion or affiliation authorization.

## Pages

- `/learn/enroll`: public search among **open** published releases. Show provider, training, delivery context, available places and full immutable terms. Adult confirms 18+, reads/accepts release version, signs in or creates an account, and clicks Confirm my registration.
- `/learn/my-courses`: learner's registrations and status via an explicit CAN-to-canonical Person link, with native session restoration for active courses.
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

1. Current published release, inside its registration window, under the same exact deployment/adoption/offering/training/Course.
2. Active operation, provider and registering Organization, authorized deployment, current approved adoption, published Offering/Course and independently approved published training.
3. Active approved registering-Organization operator relationship, and, for facilitated releases, active Site with a valid deployment + operation Site relationship.
4. Published effective immutable completion policy; a release-specific capacity slot; consent version/text SHA matches the server projection.
5. Active verified, unambiguous adult session. Existing noncredit registrations/claims are idempotently returned only if **this** Person/account/release owns them; revoked, moved or mismatched registrations need review.

A new registration atomically creates: `noncredit_registrations` (with enrollment-time completion policy), `learner_profiles`, `learner_course_attempts`, one consent/registration claim, audit event and canonical domain event, plus scoped learner grant and native session. A submission **never** creates school enrollment, family guardianship, class attendance, grade, certificate or grant funding entitlement.

Release fields and consent become immutable on publication; closure only. Claims are append-only. Capacity counts all prior self-enrollment claims for that release, including those later cancelled, until a separately governed seat-release/refund policy is implemented. This is conservative rather than assuming cancellation opens a seat.

For facilitated claims, **room pairing and room-status reads** check the exact registered Site. Independent online learners may pair at an otherwise authorized room without duplicate registration. Room pairing is not evidence of verified attendance. Course activity remains evidence only under its original independent policy.

## Security and validation

- Both new canonical release and claim tables, and the legacy/canonical bridge, have RLS enabled. The restricted native auth reader has no raw SELECT to any of them.
- Consent is a signed-in, timestamped **record of user acceptance** of the immutable displayed terms, not a cryptographic user signature. Email verification proves mailbox access, not legal age or identity.
- Native session default expiry is 12 h with a 30-minute idle check; only actual trusted pointer/keyboard interaction can extend idle life. Page rendering, timers and video position alone cannot extend it.
- GETs are no-store for private data; published course catalog is public cached briefly. A valid logged-in Person sees only their own linked registration. Reopening a course requires current source registration/adoption/deployment authority.
- Operator-published release, capacity and consent evidence is separate from network affiliation, Site favorites and sponsored referral attribution.

## Acceptance / release blockers

1. Run `npm run typecheck`, `npm run test -- tests/unit/noncredit-self-enrollment.test.ts`, `npm run build`; regenerate TanStack file routes during normal build.
2. With isolated TEST_DATABASE_URL and APP_ENV=test, run `npm run db:canonical:noncredit-self-enrollment` for migrations, RLS, least privilege, required FKs and immutability.
3. Seed **synthetic test01 only** via actual governed provider authoring: two published trainings, current effective completion policies, Courses, Offering versions, authorized deployments and active operator relationships. **No such ready rows existed** on either branch as inspected.
4. Test concurrent last-seat registrations, duplicate click/retry, consent revision mismatch, closed/expired/premature release, withdrawn learner, restricted canonical reader outage, preexisting native email collision, revoked source membership and cross-account/course isolation.
5. Test independent, facilitated Site A vs Site B, revocation during pairing, expired room behavior, guardian/student denial, native session expiration and verified interactive renewal. Test at least two real distinct CAN accounts.
6. Verify production environment secret/reader permissions and deploy a successful current GitHub `main` build; Netlify's previously inspected production deploy was stale, so build/real-site acceptance must precede production schema migration.
7. After release approval, apply the additive SQL patch to production, verify restricted readers/trigger/policies, deploy and run controlled live test. Do not publish fake pilot offerings to simulate completion.

## Future, intentionally not falsely implemented

Native canonical users whose separately created Person/account collides with a CAN account need operator-reviewed identity linking, not a silent email merge. Youth/guardian managed registration, payment/fee waivers, waitlists, release/cohort transfer, formal Site seat allocation and authorized portfolio/network reporting are separate features. A provider should not assume its registration attribution provides rights to see unrelated school records.
