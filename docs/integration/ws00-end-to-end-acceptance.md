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
