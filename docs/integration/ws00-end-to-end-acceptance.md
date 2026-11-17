# CAN OS WS00: End-to-end learning release acceptance

**Status: NOT VERIFIED, DO NOT ENABLE OR RELEASE.** Integration merged into `main` does not
prove that the application builds or that real people can complete every journey.
This document defines the required, observable release evidence for WS1–WS6.
Tests must run against one exact built commit, with real signed-in browser
sessions and a disposable isolated QA database. A skipped test is **not a pass**.

## Required system journey

| Stage | Source of truth | Acceptance evidence |
|---|---|---|
| Identity (WS1 + existing auth) | Personal CAN account and independently authorized grants | The same verified account sees only its school, personal and guardian activity, and changing Site/favorite does not elevate privileges |
| Publication (WS5) | Published Program/Course versions, approved local Site and Class Offering | One Course can be independent of a Program; a native Class pins exactly one published Course version, local hosts cannot mutate publisher-owned work |
| Registration (WS2) | Exact Class Enrollment + Course Attempt; distinct noncredit registrations | Verified adult can join self-enrollment Class after consent; private assignment does not require a Class Offering; repeated joining is idempotent; last seat, withdrawal, waitlist and transfer cannot create duplicate authority |
| One-hour training pilot (WS1/2/3/5) | One centrally published training with authorized delivery | Discover or invite, sign in, enroll, open assigned content, submit canonical assessments, independently review evidence, record final outcome, see personal history and source-backed reports |
| Four-Session / two-Site pilot (WS4/5) | Four canonical Sessions, separate approved delivery Sites, facilitators and attendance evidence | Session times/zones and agendas survive change history; host A cannot read or mutate host B; actual room state and facilitator attestations determine Sessions delivered and presence |
| Original completion (WS3) | Pinned completion policy, existing canonical assessment results and independent review | Self-approval and stale/voided grades denied; an authorized reviewer records immutable governed Class outcome; correction retains original evidence and verified result is revoked when provenance changes |
| My Activity (WS1) | Existing Section/Class/noncredit/family readers, not a new participation ledger | Original source IDs and life-cycle statuses reconcile; older Class pages remain reachable; waitlist invitations never inflate registrations/completions; learner/guardian views remain independently scoped |
| Reporting (WS6) | Source-bounded readonly operational facts | Correct individual Class and network authorized Site scope, no cross-provider leakage, retakes not counted as new people, no fabricated completions, private CSV excludes learner details |
| Safety and recovery | RLS, transactions, feature gates, reversible operations | Negative role tests, last-seat concurrency, Class→Enrollment lock ordering, rollback, and production flags OFF until signed release |

## Fixtures required, in disposable isolated QA ONLY

- Two approved canonical delivery Sites under an explicitly authorized operating
  Organization, plus an unrelated Site with a foreign principal.
- One one-hour centrally published training release and one four-Session Course
  deployed to two independent local Classes, with Site-specific agendas and
  unambiguous time zones.
- Two real test-only adult accounts, a student, guardian, a host operator for each
  Site, an independent evidence reviewer, and a foreign-Site operator.
- Published Course version and Class Offering terms, positive/negative consent,
  test-only self-enrollment places, and an isolated near-capacity scenario.
- Canonical Course Attempts, current and superseded assessment revisions,
  authoritative learner progress, facilitator-room attestations, and independently
  reviewed source document versions.
- Distinct Organization/Site grants, Class membership and explicit reporting
  authorization. Real production identities, sessions and data must never be
  used as test fixtures.

## Execution / sign-off criteria

1. Obtain an actual fresh Cloudflare build on **the exact current `main` SHA**,
   with source syntax preflight, route-tree generation, `npm run typecheck`,
   design-system lint, focused suites, and application build passing. Historical
   CI `startup_failure` and Netlify quota failures are not source test passes.
2. Isolate the QA database. Review and apply the WS3, WS4 and WS5 SQL migration
   sequence **there only**, then verify forced RLS and restricted-role grants,
   before enabling guarded WS3/WS4/native Class flags **only in QA**.
3. Run signed-in Playwright tests, not only source-string contracts, across the
   one-hour and four-Session/two-Site flows above. Assert changes from the
   authoritative server/SQL sources, not merely that a button exists.
4. Run concurrent final-seat and duplicate-request tests, negative cross-Site
   authorization, stale policy and assessment correction tests, and ensure
   failed transactions neither overwrite prior evidence nor leave partial rows.
5. Produce exact SHA, build/deployment ID, database branch ID, fixture IDs
   (nonsecret only), test counts, test failures, screenshots/trace references and
   per-stage verification results. **Zero skipped required tests.**
6. Independently authorize production migration, release flags and re-enabling
   Netlify production Git builds. Until then `main` is a development baseline,
   not a production acceptance certificate.

## Current observed blockers (2026-11-16 Pacific)

- GitHub Actions workflow jobs report `startup_failure` before runner startup:
  https://github.com/bryanhkelly/can-os/issues/317
- The uploaded Cloudflare build log stopped on malformed JSX in
  `src/routes/learn.my-activity.tsx`; source was fixed on `main`. A separate
  malformed URL regex in `tests/e2e/my-activity.spec.ts` was also fixed.
  **No post-fix end-to-end build success is yet evidenced.**
- Read-only Neon `test01` inspection: **0** `education_v30.classes`,
  **0** `class_enrollments`, **0** `class_sessions` and missing WS3 governed
  policy / WS4 agenda tables. This is not an E2E-ready fixture database.
- WS3 independent evidence and completion commands and WS4 agendas are
  feature gated; their full browser outcomes cannot be verified against the
  presently unmodified QA schema.
- Existing specs cover portions of My Activity, noncredit enrollment, WS4
  two-Site read-only, facilitated rooms and WS6 reporting, but **do not yet
  provide a single passing real-person Class creation→delivery→completion→
  reporting proof across all six workstreams**. Additional acceptance coverage
  and fixture provisioning remain release work.

**Owner: WS00 integration/release. Release status: NO-GO.**


## Added executable fail-closed QA gates

- `npm run verify:ws00:qa-readiness`: read-only, checks exact Neon project/branch
  identity through the restricted test-branch attestation, test-only capability
  flags, 3 approved active canonical Classes (one one-hour and two four-Session
  Classes), two distinct Sites, four canonical Sessions per local pilot Class,
  WS3/WS4 governance relations and 5 forced-RLS tables. The gate cannot
  currently pass against the unmodified empty `test01` branch and it is
  **not proof of browser acceptance**.
- `npm run test:e2e:ws00:single-login`: disposable localhost-only Playwright
  acceptance. An unused, verified CAN-only adult with no native-v3 cookie must
  enroll in the one-hour Class after consent, open the Class, see the original
  source in My Activity, withdraw, and retain exactly one historical source
  record. A skipped required test is not a pass. This test deliberately
  captures the unresolved **P0 one-login gap** described in
  https://github.com/bryanhkelly/can-os/issues/320.
- Current source `getCanonicalCommandContext` requires a native canonical
  learner session for CAN account roles other than Site Admin/Registrar.
  Noncredit enrollment can create one after identity binding, but fresh
  CAN-only native Class self-enrollment currently has no equivalent onboarding
  path. This must be fixed using reviewed CAN/Person/Organization mappings and
  an authorized native learning session, **not by weakening auth or inferring
  ownership from email**.

These added checks have been committed but **have not passed in a running QA
environment**. They do not replace one-hour/four-Session delivery, independently
reviewed governed outcomes, two-Site reporting, or concurrent seat acceptance.


## Reviewed-first-time CAN adult Class onboarding (Issue #320)

Source implementation: `src/modules/classes/native-class-reviewed-onboarding.functions.ts`.
QA-only schema candidate: `database/canonical/v3.0.1/patch-reviewed-adult-class-onboarding.sql`.

When `/class` receives an authenticated CAN-only adult with no native cookie,
Class self-enrollment/invitation/approval attempts the existing native learner
recovery. If no existing verified bound Person/grant is available, it may consume
**only** an independently approved, exact-account/exact-Person adult review.
Activation creates the canonical account, Person (with reviewed birth date),
CAN-to-canonical link, organization-scoped learner grant, audit event and native
session in one serializable-identity transaction, before retrying the original
Class enrollment command. No Class seat is reserved or Enrollment/Attempt written
by activation itself. No browser-provided DOB, Person or Organization is accepted.

**Review creation is not automatic and has no public learner UI.**
`approveAdultClassLearnerReview` is an internal App-Admin-only mutation requiring
a separately provisioned verified App Admin, a real active exact Person, distinct
reviewer/account, an independently checked birth date, an opaque reference to
evidence in controlled storage, and an active canonical learner home Organization.
It rechecks the current platform grant inside the transaction, never enrolls or
creates a learner, and writes a CAN audit row without the date of birth.
`revokeAdultClassLearnerReview` invalidates the decision and transactionally
revokes the resulting native learner grants and active sessions, preserving
Class history and evidence. The original reviewed evidence is immutable.

The review and revocation controls now appear in the existing `/platform`
App Admin workspace, and are hidden until the evidence ledger exists with FORCE
RLS. The independent evidence collection and verification policy, actual
controlled evidence storage integration, App Admin reviewer acceptance,
operator signoff, and tested DB permissions still require acceptance. A matching email, self-declared age,
learner click, Site favorite or synthetic QA fixture cannot substitute for
independent identity verification. Do not apply this migration to production
until reviewer governance, actual QA role/RLS tests, revocation, rollback and
reconciliation are approved.

**Required QA acceptance:** set `CAN_WS00_QA_FRESH_LEARNER_CAN_ACCOUNT_ID`
for the unused verified fixture. The read-only readiness script requires the
approved unconsumed independent review, the matching CAN Person, an active home
Organization, a verified separate reviewer and the new table's FORCE RLS.
Start with a truly new verified CAN account and no
native cookie or existing canonical account; arrange an independently approved
review under disposable QA controls using the App Admin review command; then enroll in the published one-hour
Class, open its content, see the original Class Enrollment in My Activity,
withdraw and retain one original historical enrollment. Repeat the same request
concurrently; ensure exactly one Person, one link, one learner grant, one consumed
review and no duplicate Class seat. Negative fixtures: unreviewed; revoked;
self-reviewed; underage; stale review; mismatched CAN Person; disabled reviewer;
existing same-email canonical account; existing operator link; disabled CAN
account; other Site staff/reviewer cookie; revoked learner grant; missing
restricted reader. All must fail closed. Existing previously bound learners
must continue to work without provisioning again.

**Status:** review/activation/revocation code committed to `main`; migration, independent evidence integration, and signed-in QA tests not run.
Issue #320 remains P0 / NO-GO until the independent review path and the above
QA assertions are completed with exact SHA and database branch evidence.


## 2026-11-17 adult review ledger migration verification

The additive `patch-reviewed-adult-class-onboarding.sql` migration was applied as
one transaction to Neon CAN OS project `sweet-hall-62441909`:

| Environment | Neon branch ID | Rows | Columns | RLS / FORCE RLS | Policies | Custom triggers | Constraints |
|---|---|---:|---:|---|---:|---:|---:|
| QA `test01` | `br-bitter-feather-ar0u63x7` | 0 | 11 | on / on | 1 | 1 | 21 |
| Default `main` | `br-restless-sea-ar9ooo55` | 0 | 11 | on / on | 1 | 1 | 21 |

Both policies are scoped to `neondb_owner`; the restricted
`can_v30_canonical_auth_reader` role has no direct SELECT on the review table.
Neither migration seeded an adult identity, review approval, canonical Person,
learner grant, Class, Enrollment or Course Attempt. Production evidence remains
empty, and the reviewer form is gated by schema readiness rather than proof of
reviewer/evidence operational signoff.

**Migration applied does not mean release accepted.** The `test01` branch
still has zero canonical Classes, so the required real signed-in WS00
one-hour-Class acceptance cannot run without independently approved, published
QA fixtures. Required execution evidence remains: independent DOB review,
reviewer non-self authority, positive and negative review/activation/revocation,
source-backed Class enrollment, access and historical activity, transactional
retries/concurrency, restricted role RLS, typecheck/build, and a passing
Playwright trace against the exact deployed SHA. Issue #320 remains P0 open.


### Isolated P0 single-login test scope

`npm run test:e2e:ws00:single-login` sets
`CAN_WS00_QA_SCOPE=single_login_class` for its read-only preflight. It requires
one real, active, Site-bound one-hour canonical Class and a fresh, exact CAN
adult account with an independently approved, unconsumed review. It **does not**
require the two unrelated four-session pilot Classes to exist before Issue #320
can be validated. The full WS00 readiness command retains all three real Class
and two-Site/four-session requirements when the scope is not set.

The two-site/four-session fixture contract is unchanged; this is a test scope
separation, not a bypass of published authority, CAN/native authorization,
restricted reader, reviewed adulthood, row-level security, participation
history or withdrawal. With zero Classes on test01, the isolated P0 test still
cannot pass until one authorized, published QA one-hour Class is provisioned.


### Additional one-account integration gap identified

A CAN adult may have completed noncredit self-enrollment before requesting a native
Class. That enrollment creates a genuine CAN-to-canonical Person link but
intentionally leaves the native Person's birth date null. The existing
`resumeLinkedNativeClassLearner` correctly rejects the unverified date.
However, `approveAdultClassLearnerReview` and
`activateReviewedNativeClassLearner` currently reject any preexisting
CAN-to-canonical link, even when it is the exact previously authenticated,
consented one. Such learners are stuck despite having one real account.

Do not solve this by creating a second Person, copying a self-attested date,
trusting an email match, or reactivating a revoked grant. An authorized,
independently reviewed upgrade must reuse the exact linked canonical Person,
confirm its unchanged account association, verify new age evidence, preserve
prior Course Attempts and Class history, and issue only the minimum current
learner session. Existing documented staff/operator identities remain
ineligible for automatic conversion. Cover both fresh and previously
noncredit-linked adults in the QA acceptance, including repeat requests,
revocation, simultaneous Class/noncredit requests, and prior grants.

**The preexisting-link upgrade is now implemented in source, not runtime-accepted.**
Independent App Admin review permits only exact existing CAN-to-canonical
noncredit links; activation locks and reuses the native Person, sets only a
previously null verified birth date, and reuses or provisions the one authorized
home-Organization learner grant. Conflicting identity or date evidence fails
closed. Signed-in QA acceptance for both cohorts remains outstanding.


### Identity consolidation implementation update

Main now uses the shared raw account-Person invariant in Class review, activation
and session recovery, and the same native learner authorization capability for
Class enrollment and Class learning. The Class page delegates all three
admission modes to `native-class-entry.client.ts`. This is deliberately a
reusable *client application flow*, not a nested server RPC: TanStack Start
does not make a newly set response cookie visible to subsequent handlers in
the same HTTP request. Recovery/activation is one request; enrollment retry
is a separate request after the browser receives the HttpOnly cookie. The
original `native-class-entry.functions.ts` was retired.

The review command now requires an existing private R2 document for the
exact CAN Person with restricted sensitivity, an independently verified date
matching the approval, a current authorized App Admin document verifier,
verified object metadata and no evidence revocation. It does not accept an
arbitrary URL/opaque reference as evidence. The QA readiness script rechecks
the same evidence provenance and validates review immutability and denial of
raw review-table SELECT to the canonical auth-reader role.

The existing `/platform` workspace now exposes redacted review lifecycle
states (approved pending activation, active, revoked), with no DOB or private
document contents. A repeated revocation rechecks and revokes dependent
native grants/sessions and leaves historical participation records untouched.

**Remaining explicit release gates:** A securely controlled upload and
independent evidence-verification producer for the documented R2 identity
document category is not yet established; currently neither test01 nor main
has any adult identity documents or reviewed approvals. A separate browser
credential still exists for canonical sessions, despite a single interactive
CAN login. Removing it across classroom playback and session persistence
requires a deliberately staged cross-module migration, not a claim of
completion from the admission-only refactor. Actual signed-in Class publisher,
QA fixtures, E2E browser, build/typecheck, and restricted-role negative tests
remain unverified. Production roll-out of new review UX should not be
considered accepted from database migration alone.
