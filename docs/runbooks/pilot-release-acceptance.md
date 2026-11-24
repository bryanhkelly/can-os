# Pilot release acceptance

This runbook covers any authorized noncredit offering, not a denomination-specific application. Universal Work and Approval Management is excluded.

## Source changes

- Publication: exact authorized site/offering selection, session-scoped readiness, registration-window and capacity validation.
- Participant: shared course activities, progress and separate baseline/final knowledge checks.
- Distribution: governed Go link and existing engagement invitation service; scoped draft, validation, retry and in-flight fencing. Native pilot-scale campaign sending is implemented; provider, consent, suppression, and receipt acceptance are outstanding. Do not reuse transactional delivery as an unconsented bulk sender.
- Evidence: canonical current verified participation minutes, distinct delivery sites, distinct-person disclosure thresholds, complementary-cell suppression, and shared metric components. A delivery site is not necessarily a congregation; participant hours are not unique clock hours. Private evidence must not be represented as publishable national impact.
- Site Intelligence: shared stored content package, selection-scoped UI, canonical 6.1 controls and explicit processing/failure state.
- Use existing design system 6.1 components and domain services. No pilot-specific parallel platform.

## Exact revision validation

On an approved runner with a clean checkout:

```sh
npm run verify:release -- --profile=pilot --install --database --browser --live
```

Supply only approved test and deployment configuration. Never expose secrets in evidence. The release command records its Git SHA and each pass, failure or blocked check. It does not deploy, approve partner content, or certify the complete pilot journey. Manual acceptance remains explicitly blocked in the automated report. Do not interpret a successful unit test as a successful pilot.

## Required independent launch evidence

1. Verify real publisher authority, offering version, delivery site, content rights and actual approved recordings and assessment/feedback instruments.
2. Apply required migrations via the reviewed database release path. Verify production parity; create a disposable Neon environment for writes. Verify the deployed preview fingerprint matches the tested revision and that its runtime uses that disposable database before any mutating browser test.
3. Establish two distinct verified QA identities. Exercise real Go invitation, registration, instruction, baseline and final assessment, feedback, completion and withdrawal. Verify retry/idempotency and cross-tenant denial.
4. Reconcile attendance corrections, superseded evidence, verified minutes, unique people, site reach, completion and disclosure suppression against canonical records. Do not extrapolate national reach.
5. Verify Gloo provider configuration, permissions, data minimization, actual generation and persistence.
6. For native bulk distribution, verify durable consent and suppression/unsubscribe records, idempotent delivery, retry and signed receipt ingestion before sending any campaign. Existing authorized external distribution is a separate pathway.
7. Record independent partner authorization and rights-withdrawal handling before any live rollout. Never fabricate a partner approval, participant or verified outcome.

A source commit alone satisfies none of the runtime or partner gates.

## Independent training rehearsal

Use a new dedicated Neon QA branch, never production or retired test01. Mark the independently authorized synthetic publisher and operator organizations with metadata qa_only=true and intended_branch=<exact branch ID>. Author and review a fresh training through existing publisher workflows; use short native MP4 recordings matching the fixture (seven for the first rehearsal and four for the second), separate five-question baseline and final forms, a matching identified five-question feedback campaign, an independently approved automatic completion policy (all lessons, final threshold 0.8, no verified minutes required for short QA), a single authorized Site, and a Go invitation. Do not reuse real partner approvals or publish a synthetic pilot in production.

Set APP_ENV=test, NODE_ENV=test, CAN_TEST_DB_WRITES_ENABLED=true, TEST_DATABASE_URL, CAN_APPLICATION_DB_HOST, CAN_PILOT_QA_BRANCH_ID, CAN_RELEASE_SOURCE_SHA (clean checked-out SHA) and CAN_PILOT_QA_LEARNER_SESSION, CAN_PILOT_QA_OTHER_SESSION, CAN_PILOT_QA_PROVIDER_SESSION (three distinct verified isolated accounts; never log session values). Set CAN_PILOT_QA_FIXTURE_JSON with releaseId, goCode, optional goActionLabel, trainingTitle, instructorTitle, lessons (1–40 distinct exact titles; seven and four for the two rehearsals), baselineAnswers and finalAnswers (five exact option labels each), surveyTitle. The baseline answer set should deliberately score below the final set in this synthetic exercise. Choose an actual approved automatic-finalization assessment policy. The local browser test uses a newly started application and refuses an unverified database, a used fixture or a production URL.

```sh
npm run test:e2e:noncredit:journey
```

The same test is run separately against each fresh fixture; use a separate approved synthetic publisher per fixture so the provider report remains unambiguous. The release runner invokes it when explicitly supplied the browser flag and isolated fixture configuration. Real email and Gloo credentials are disabled in automated browser rehearsals; independent provider acceptance is separate.

The test covers Go referral, consent, enrollment, cross-Person denial, real short-video playback, persistent lesson progress, two objective assessments, feedback, governed completion and the exact provider report row. It does not replace publisher review or prove actual COGIC training hours. Fixture preflight is read-only. An unavailable environment or missing approved fixture is a blocker, never a pass.

### 2026-11-24 discovery

Neon main returned SQLSTATE 42883 for min(uuid) on assessment_administrations.id. Migration 0117 replaces the unsupported aggregate while preserving the exact-one-administration gate. A read-only zero/one/multiple-candidate query confirmed the corrected expression; the migration and full browser scenario require isolated acceptance. Neon rejected creation of pilot1-acceptance-20261124 with branches limit exceeded. No real pilot records were changed.

### P0 follow-up, November 24

- Migration 0117 was exercised using the exact committed SQL in a rollback-protected PL/pgSQL subtransaction on existing isolated validation branch `v61-launch-brand-migration-validation-20261119`. The corrected definition exactly matched the intended replacement; function OID, owner, ACL, SECURITY DEFINER and configuration were preserved. A second execution was idempotent; intentional rollback restored the original function. No production mutation or migration journal change was made. This older branch does not establish full release schema parity or learner acceptance.
- The shared full learner journey accepts variable lesson counts, verifies progress against the fixture, and is connected to the release runner. The fixture preflight continues to require independent approvals and branch-bound synthetic organizations.
- The runner includes campaign settlement, webhook, owner delegation, pilot role and full Gloo package regression tests. Campaign worker totals now require a successful fenced settlement; provider redirects are rejected. The full Gloo package adapter uses a shared synthetic contract fixture for both domain and transport validation.
- No provider sends, external Gloo calls, live partner publication or owner grants were created in this work. Exact-SHA compilation and browser tests remain required. An operator must record independent provider and owner acceptance; a passing synthetic browser run alone is not launch authorization.

### Isolated database verification (2026-11-24)

Dedicated Neon branch `pilot1-acceptance-20261124` (`br-spring-frog-arnmih9w`) created from main. Migration 0117 was applied twice; exact replacement, unchanged function authority and idempotency verified. The real Course Attempt insert then exposed SQLSTATE 42702, an ambiguous administration_id variable in ON CONFLICT. Migration 0118 renames only the local variable and preserves conflict semantics; applied twice with unchanged authority. Neither fix has been applied to main by this QA run.

The rollback-only regression `database/canonical/v3.0.1/accept-noncredit-assessment-provisioning-qa.sql` executed successfully on the new branch: two assessment grants, idempotent provisioning, identity/policy linkage, premature completion denial, ambiguous final administration denial, distinct learner grants, assessment-alone denial, all seven lessons required, single automatic completion, and its audit/domain event. It exercises actual database triggers and state transitions using synthetic reviews, an item response and a supplied synthetic item-level score. It is NOT evidence of browser authentication, actual media playback, server scoring, public Go links, feedback, or reporting UI. It uses the connected database owner, not restricted application-role/RLS acceptance. No synthetic fixture data was retained.

With the same isolated branch guard variables as above (including APP_ENV=test and CAN_TEST_DB_WRITES_ENABLED=true), run `npm run verify:pilot:noncredit-regression` to repeat this database regression. The full approved browser fixture and runtime remain separate gates.

### Feedback regression (November 24)

The dedicated QA branch lacked the opt-in knowledge-check feedback trigger and vocabulary. The canonical survey campaign scope CHECK also prohibited the exact deployment/Offering pair required by the existing learner service. Migrations 0119 and 0120 install the scoped in-app trigger and allow only a matching identified deployment/Offering pair in addition to existing single-scope campaigns. No actual invitations are backfilled. Both were applied to the dedicated QA branch only.

The rollback regression now passes 15 checks, including a real baseline/final assessment state transition, no baseline invitation, exact operator/Offering invitation with disabled and different-operator campaigns excluded, idempotent invitation, five saved feedback answers and duplicate-response denial. It executes SQL as the database owner; restricted app-principal acceptance, actual server scoring, browser, media, Go and report reconciliation are not established. Synthetic review and response rows are rolled back.

### Go, identity and evidence reconciliation (November 24)

The isolated regression now passes 22 assertions. It exercises actual SET LOCAL ROLE can_go_gateway with exact-code visibility, paused link denial and two atomic daily counter upserts. It creates a synthetic verified account correspondence using the existing public Person, verifies a wrong-Site claim fails, inserts a valid consent claim with immutable attribution and independently reconciles one registration, one distinct Person, one delivery Site, seven lessons, one baseline result, one final result, one feedback response and one completion. The full transaction rolls back. Only the gateway segment runs under the restricted gateway role; other SQL uses the connected owner. No HTTP route, server-side assessment scoring, reporting service/UI or browser was exercised.

Ordinary noncredit self-enrollment no longer creates a second legacy Person; it requires the active public Person, same-Person bridge and verified native account. Reviewed adult/Class flows retain their separate existing evidence gates and need their own cutover verification. Source changes require compilation and authenticated browser acceptance.

### Application HTTP RPC acceptance (November 24)

Run `npm run test:e2e:noncredit:api` against a fresh, independently approved, branch-tagged fixture. This test is designed to call the existing Vite-transformed production server-function clients from an inert local browser document over the application's HTTP transport. It exercises direct adult-training Go resolution, authenticated registration and consent, idempotent retry, cross-Person denial, session recovery, server assessment draft/submission/scoring, recorded instructor selection and lesson completion, automatic completion, identified feedback idempotency, provider reporting, and independent read-only database reconciliation. No test-only production endpoint or mocked API/DB handler is introduced. Playback/layout acceptance is separate and requires another fresh fixture.

The shared fixture preflight independently attests the restricted authentication connection to the exact QA branch, session/assessment configuration, three distinct current branch-tagged QA accounts and an active matching self-paced Class. Supply CAN_CANONICAL_AUTH_DATABASE_URL for the isolated restricted login, CAN_ACCESS_TOKEN_PEPPER, CAN_CANONICAL_ACCESS_TOKEN_PEPPER, CAN_NONCREDIT_ASSESSMENT_KEY_HEX, and CAN_NONCREDIT_AUTO_FINALIZATION_ENABLED=true. Do not use production secrets/sessions or bypass independently reviewed adult identity. The API scenario requires a direct adult-training Go link and an unambiguous eligible Class. Course-to-Class placement now leaves the release FK null for Class-only attribution, preserving release provenance in the relationship snapshot, as required by the installed source CHECK. Cross-operator attribution and reviewed Person cutover still require acceptance.

These sources are committed but uncompiled and unexecuted. The isolated branch currently has zero published branch-tagged QA releases and zero matching QA Classes, and the execution environment cannot resolve GitHub for checkout. Do not interpret the earlier database-only regression or authentication-reader tests as actual API acceptance. A successful exact-SHA run with real API results and database reconciliation is required.
