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
| Pilot 1 | Existing Nest routes for registration, learning, knowledge checks, completion, survey and reporting | Full provisioning-to-report standard API journey |
| Pilot 2 | Existing Nest routes for scheduled sessions, room controls, attendance, activity and reporting | Full four-session per Site standard API journey including corrections and no-device participants |
| Release | Exact SHA, no skipped gate counted as pass | Exact deployment, secure ingress, readiness, rollback and post-release checks |

No release sign-off if either pilot, runtime security, data isolation, national reporting, or deployment acceptance is missing. A 503 in disabled runtime only proves disabled writes, not authenticated authorization or RLS. The legacy TanStack pilot tests are useful regressions but are not evidence of a Nest-only journey. No special API, direct fixture business manipulation or production mutation may be used to make a pilot green.
