# CAN OS synthetic pilot — release gate

This gate applies only to the shared **synthetic-data** pilot. It is not approval to store real student records.

## Current decision: HOLD

A pushed commit is not equivalent to a verified release. Record actual execution evidence before changing this decision.

### P0 evidence checklist

- [ ] GitHub Actions **CI** is green on the release candidate commit (route coverage, targeted authorization tests, TypeScript/build, migration check, full unit suite).
- [ ] **Admissions Neon Acceptance** completes successfully on a disposable branch at the exact release candidate commit.
- [ ] Browser acceptance on the deployed candidate with separate server-issued registrar and guardian sessions; verify student notifications, navigation, page reload, and denied cross-persona actions.
- [ ] Synthetic fixtures cover both children in the same household and an unrelated user; validate concurrent final-seat allocation, declined-seat release, accepted-seat retention, idempotency and audit records.
- [ ] Migration parity and deployment SHA match the intended release candidate; production DB is not used for integration fixture writes.
- [ ] Release and rollback smoke checks have recorded outcomes.

### Verified read-only database evidence (2026-10-16)

The existing disposable Neon branch `br-aged-cherry-arl5c0lf` in project `sweet-hall-62441909` was inspected without fixture writes:

- Seven rows in `drizzle.__drizzle_migrations` match the seven journal timestamps in `drizzle/meta/_journal.json`, from migration `0000` through `0006`.
- Required admissions, journey, notification and session tables exist.
- Unique indexes are present on application and offer idempotency keys, program/year seat pools, and active offers per application/year.
- There are no existing fixture applications, seat pools or offers on the inspected branch.
- This is **structural evidence only**. No passing integration execution, full SQL hash parity or production deployment parity has been verified.

### Run CI

CI runs on pushes to `main` and pull requests. Inspect the **Actions** tab and link the exact successful run here. The GitHub commit status endpoint is not sufficient proof if no checks are returned.

### Run admissions acceptance safely

1. Prepare a **disposable Neon branch** with current schema; do not use the production branch.
2. In GitHub repository **Settings → Environments**, configure the `integration-test` environment. Use any approval rules appropriate to the deployment team.
3. Create the secret `CAN_ADMISSIONS_TEST_DATABASE_URL` holding the isolated branch connection string.
4. Create the **nonsecret** environment variable `CAN_APPLICATION_DB_HOST` holding the application database hostname (not a connection string; no password).
5. Open **Actions → Admissions Neon Acceptance → Run workflow**, selecting the release candidate ref. The job first validates the test target without writing, then applies committed Drizzle migrations **to the disposable branch only**, then runs the admissions suite.
6. Capture the job URL, commit SHA, test results and any failing assertions. Fix failures and rerun. Do not mark the checklist complete on a skipped run.
7. The runner requires `APP_ENV=test`, `CAN_TEST_DB_WRITES_ENABLED=true`, `TEST_DATABASE_URL` and a nonproduction `NODE_ENV`. It rejects a matching application database hostname. These guards complement, not replace, using a disposable branch.

Alternatively, on a trusted isolated runner, set `TEST_DATABASE_URL` and `CAN_APPLICATION_DB_HOST`, then run `npm ci`, `npm run test:integration:admissions -- --preflight`, `DATABASE_URL="$TEST_DATABASE_URL" npm run db:migrate`, and `npm run test:integration:admissions`, in that order. Never upload credentials or include them in test logs.

### Browser acceptance

Log in with separate real server-issued demo sessions. Verify registrar offer issuance; guardian receipt and acceptance; registrar activation; student/guardian confirmation; refresh and repeat; and negative tests for revoked sessions, wrong program/site and unrelated households.

### Release evidence record

| Evidence | Link / SHA | Result |
| --- | --- | --- |
| CI run | Pending | Unverified |
| Disposable Neon acceptance | Pending | Unverified |
| Browser golden flows | Pending | Unverified |
| Database migration parity | Pending | Unverified |
| Netlify deployed commit | Pending | Unverified |
| Production smoke / rollback | Pending | Unverified |

**Release decision remains HOLD until all P0 requirements pass.** P1/P2 work may be explicitly deferred only with a documented owner, severity and impact.
