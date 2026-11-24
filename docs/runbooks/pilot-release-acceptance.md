# Pilot release acceptance

This runbook covers any authorized noncredit offering, not a denomination-specific application. Universal Work and Approval Management is excluded.

## Source changes

- Publication: exact authorized site/offering selection, session-scoped readiness, registration-window and capacity validation.
- Participant: shared course activities, progress and separate baseline/final knowledge checks.
- Distribution: governed Go link and existing engagement invitation service; scoped draft, validation, retry and in-flight fencing. Native bulk campaign sending remains outstanding; do not reuse transactional delivery as an unconsented bulk sender.
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
6. For native bulk distribution, implement durable consent and suppression/unsubscribe records, idempotent delivery, retry and receipt ingestion with signature verification before sending any campaign. Existing authorized external distribution is a separate pathway.
7. Record independent partner authorization and rights-withdrawal handling before any live rollout. Never fabricate a partner approval, participant or verified outcome.

A source commit alone satisfies none of the runtime or partner gates.

## Independent training rehearsal

Use a new dedicated Neon QA branch, never production or retired test01. Mark the independently authorized synthetic publisher and operator organizations with metadata qa_only=true and intended_branch=<exact branch ID>. Author and review a fresh training through existing publisher workflows; use seven short native MP4 recordings, separate five-question baseline and final forms, a matching identified five-question feedback campaign, an independently approved automatic completion policy (all lessons, final threshold 0.8, no verified minutes required for short QA), a single authorized Site, and a Go invitation. Do not reuse real partner approvals or publish a synthetic pilot in production.

Set APP_ENV=test, NODE_ENV=test, CAN_TEST_DB_WRITES_ENABLED=true, TEST_DATABASE_URL, CAN_APPLICATION_DB_HOST, CAN_PILOT_QA_BRANCH_ID, CAN_RELEASE_SOURCE_SHA (clean checked-out SHA) and CAN_PILOT_QA_LEARNER_SESSION, CAN_PILOT_QA_OTHER_SESSION, CAN_PILOT_QA_PROVIDER_SESSION (three distinct verified isolated accounts; never log session values). Set CAN_PILOT_QA_FIXTURE_JSON with releaseId, goCode, optional goActionLabel, trainingTitle, instructorTitle, lessons (seven distinct exact titles), baselineAnswers and finalAnswers (five exact option labels each), surveyTitle. The baseline answer set should deliberately score below the final set in this synthetic exercise. Choose an actual approved automatic-finalization assessment policy. The local browser test uses a newly started application and refuses an unverified database, a used fixture or a production URL.

```sh
npm run test:e2e:noncredit:journey
```

The test covers Go referral, consent, enrollment, cross-Person denial, real short-video playback, persistent lesson progress, two objective assessments, feedback, governed completion and the exact provider report row. It does not replace publisher review or prove actual COGIC training hours. Fixture preflight is read-only. An unavailable environment or missing approved fixture is a blocker, never a pass.

### 2026-11-24 discovery

Neon main returned SQLSTATE 42883 for min(uuid) on assessment_administrations.id. Migration 0117 replaces the unsupported aggregate while preserving the exact-one-administration gate. A read-only zero/one/multiple-candidate query confirmed the corrected expression; the migration and full browser scenario require isolated acceptance. Neon rejected creation of pilot1-acceptance-20261124 with branches limit exceeded. No real pilot records were changed.
