# WS12 — API-first quality and release engineering

Integration target: `architecture/api-first-nestjs`. This workstream owns acceptance and evidence, not alternate implementations of business rules.

## Run independently (no CI dependency)

Use Node 24, a clean checkout at the candidate SHA, and no application dotenv files. From repository root:

```sh
node scripts/acceptance/run-api-first-release-gate.mjs --source
node scripts/acceptance/run-api-first-release-gate.mjs --release
```

The source gate uses committed locks, root architecture/V6.1/migration-safety checks, typechecking, unit tests, production build, route wiring, canonical bridge build, Nest HTTP tests, the exhaustive documented-operation security sweep, generated SDK checks and dependency audits. A successful source profile is **not** release approval. The release profile also invokes the existing branch-attested QA runner. Both produce an exact-SHA JSON report in a private temporary directory and exit nonzero on failure or missing evidence. There is no floating-lock fallback.

Run acceptance slices separately after locked installation and `npm --prefix apps/api run build:canonical` plus `npm --prefix apps/api run build`:

```sh
npm run qa:pilot -- schema
npm run qa:pilot -- nest-http
npm run qa:pilot -- nest-reporting
npm run qa:pilot -- nest-pilot1
npm run qa:pilot -- nest-pilot2
```

The existing ignored `.env.pilot-qa` is the only credential input. Never add production dotenv files, seed or reset a real database, share credentials or use demo fixed codes. The runner independently verifies the primary and restricted secondary Neon connections before starting Nest. The same isolated mail outbox transports ordinary single-use access credentials; no testing login endpoints or direct business writes are introduced. Use fresh synthetic fixtures for each mutating run. No retries, screenshots, traces or videos for these API-only tests.

## Reviewed fixture inputs

- `CAN_STUDENT_QA_JSON`: the existing two-student fixture in `nest-student-http.spec.ts`; distinct Persons, grants, Sites and active enrollments. For the guarded release slice its fresh write target is mandatory.
- `CAN_NEST_SIGNUP_QA_JSON`: existing fresh signup fixture in `nest-access-provisioning-http.spec.ts`, attestation `fresh-synthetic-signups`, two distinct lower-case .test email domains, organization and Site names. Both accounts must be new.
- `CAN_NEST_REPORT_QA_JSON`: readback fixture in `nest-pilot-report-readback.spec.ts`, attestation `reviewed-synthetic-pilot-report-readback`, inclusive/exclusive UTC report dates, two distinct Site/organization provider actors (ordinary .test mail, grant, Person, organization and Site IDs), two distinct Class cohorts per Site (independent/facilitated), expected registrations, uniquePeople, sessionsScheduled, sessionsDelivered, verifiedAttendance, verifiedAttendees, assessmentsSubmitted, assessmentsFinalized and formalCompletions. Facilitated cohorts require four scheduled and four delivered sessions each. Independent cohorts must have no facilitated sessions. Expected counts must come from reviewed journey receipts, not from the report under test. This is readback of prepared cohorts, not execution of the two pilots.

## Evidence matrix

| Gate | Implementation | Required further evidence |
| --- | --- | --- |
| Contracts and anonymous denial | Dynamic OpenAPI operation sweep, forged actor headers, problem details/correlation, disabled writes | Execute against locked executable build |
| Identity and participation | Standard access, signup, replay denial, foreign membership, two students, logout | Execute on attested QA; additional guardian and staff roles |
| Concurrency | Simultaneous identical completion/submission, single authoritative receipt and count increment | Execute and verify persisted records |
| Database | Reuse independently attested migration-parity runner | App-role RLS isolation, transaction and reconciliation evidence |
| Pilot reporting | Four cohort provider report readbacks with expected counts and foreign-tenant denial | Execute using actual pilot receipts, add consent/accept/revoke disclosure journey |
| Pilot 1 | Prepared release registration through recorded instruction, baseline/final, survey, completion, reports and read-only receipt reconciliation on two Sites | Merge WS07 recorded instruction, execute on fresh fixtures, add provisioning/publication/discovery and full cohorts |
| Pilot 2 | Two-Site schedule of eight sessions, plus separately executable due-session delivery with pairing, presence, projector, formative responses, attendance corrections and persisted evidence | Eight distinct executed sessions, baseline/final, staged feedback, completion, actual media and reconciled outcomes |
| Release | Exact SHA, no skipped gate counted as pass | Exact deployment, secure ingress, readiness, rollback and post-release checks |

No release sign-off if either pilot, runtime security, data isolation, national reporting, or deployment acceptance is missing. A 503 in disabled runtime only proves disabled writes, not authenticated authorization or RLS. The legacy TanStack pilot tests are useful regressions but are not evidence of a Nest-only journey. No special API, direct fixture business manipulation or production mutation may be used to make a pilot green.

## Prepared-cohort pilot suites

`nest-pilot1` requires `CAN_NEST_PILOT1_QA_JSON` with attestation `fresh-synthetic-independent-cohorts`, ISO from/to covering the run, and two sites. Each site has a fresh published releaseId, trainingVersionId, siteId, consentVersion, consentSha256, instructorTitle, lessonTitles, baselineAnswers (five reviewed labels), finalAnswers (five reviewed labels), surveyTitle, and provider/learner actors. Actor fields are email (.test), grantId, personId, organizationId and siteId (scope IDs nullable where legitimate). Distinct learners have fresh independently approved native learner onboarding and no prior registration; each provider has exact reporting authority. The two training versions are distinct so readback can reconcile one participant in each independently. This initial learner journey is not the full multi-participant cohort gate. The recorded instruction paths come from WS07; merge that workstream before running. The absence of a contract must fail the suite, not trigger a legacy RPC fallback.

`nest-pilot2` requires `CAN_NEST_PILOT2_QA_JSON`. Select stage schedule or deliver. Schedule requires two independently operated active Class/Site targets, each with a current host and four nonoverlapping future meeting windows (15 minutes–8 hours). Each meeting has requestId, agendaRequestId, startsAt, endsAt, lessonId, assetVersionId, prompt and choices. The test schedules via the ordinary API, verifies idempotency, publishes agenda revisions and checks persisted counts. The attached schedule receipts identify the eight session IDs; they contain no pairing codes.

For stage deliver, supply the reviewed receipt's classId, siteId, classSessionId, meeting, host, participants and a foreign participant. Every participant has an actor, courseAttemptId, paired and present flags. Include paired and no-device participants, present and corrected-absent observations. Existing reviewed learner bindings and authorized host assignments must be in place. Run each of the eight sessions when its actual scheduled window is due; no clock override, no fabricated playback event. The suite checks the exact persisted schedule receipt, ordinary room opening, code renewal, cross-tenant denial, concurrent presence, projector commands, responses, attendance corrections, room closure and read-only persisted counts. It emits a session receipt with playbackVerified:false. The existing release gate intentionally does not count a single stage invocation as completion of both pilot journeys.

The partial independent suite is invoked by the release profile. The facilitated stages are explicitly invoked with their reviewed manifests; independent aggregation of eight receipts and full outcomes remains a mandatory release blocker.
