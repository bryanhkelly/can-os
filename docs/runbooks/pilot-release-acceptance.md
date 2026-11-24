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
