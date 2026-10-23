# Hybrid Site Operations — CI recovery and acceptance gate

**Branch:** `FullFlow` / draft PR #172. **No production deployment or merge is authorized.**

## Current blocker (2026-10-23)

GitHub Actions [run 39901715568](https://github.com/bryanhkelly/can-os/actions/runs/39901715568) failed as `CI / verify` **before the runner was assigned**: one failed job, zero steps, empty runner name, no job logs. A requested rerun (attempt 2) also failed with zero steps. By comparison, [run 39872057949](https://github.com/bryanhkelly/can-os/actions/runs/39872057949) completed successfully earlier with 16 steps on an older commit.

This is **not evidence of a passing or failing application test**. The exact GitHub-side root cause cannot be determined from the API metadata. GitHub's job-summary banner/account diagnostics are required. Do not change the GitHub Actions workflow merely to hide this failure or turn off any verification.

### Owner-side recovery

1. Open the failed run above in **Actions**, then select `verify` / the run summary. Read any banner or account limitation message at the top and in the annotations.
2. Check the repository owner's **Settings → Billing and licensing** for any GitHub Actions budget, usage, payment, storage or billing restrictions. GitHub lists billing and storage limits as possible causes of Actions execution failure; this is a **hypothesis, not a diagnosed cause**.
3. Check **Repository Settings → Actions → General** and any relevant runner policies for whether GitHub-hosted runners are allowed. The workflow correctly specifies `runs-on: ubuntu-latest`.
4. If those settings look normal and the runner still cannot start, send the failed run ID, exact banner text, and zero-step result to GitHub Support. A new workflow or a code-only commit will not unblock a platform/account-level denial.
5. When the owner-side block is cleared, rerun the latest `FullFlow` **CI**, not only an old successful commit. Record its commit SHA and the results of checkout, build, TypeScript, unit tests, and migration parity.

## Safe local / isolated acceptance commands

From a clean checkout of **the latest** `FullFlow`:

```bash
npm ci
npm run typecheck
npm run build
npx vitest run \
  tests/unit/onsite-attendance-access.test.ts \
  tests/unit/onsite-duty-policy.test.ts \
  tests/unit/onsite-supervision-coverage.test.ts \
  tests/unit/onsite-day-reconciliation.test.ts \
  tests/unit/onsite-day-reconciliation-panel.test.tsx \
  tests/unit/hybrid-site-day.test.tsx \
  tests/unit/site-safeguarding-access.test.ts
npm test
```

Only with a **disposable, isolated database** that has the committed migrations applied:

```bash
# Configure a disposable TEST_DATABASE_URL, distinct from CAN_APPLICATION_DB_HOST
# or DATABASE_URL; never paste credentials into this document or GitHub comments.
CAN_TEST_DB_WRITES_ENABLED=true npm run test:integration -- attendance-handoff --preflight
CAN_TEST_DB_WRITES_ENABLED=true npm run test:integration -- attendance-handoff
```

The integration runner intentionally refuses execution against production, requires `TEST_DATABASE_URL` and `CAN_TEST_DB_WRITES_ENABLED=true`, and verifies the application database host is different. Do not disable these guards or point either command at production Neon.

## Connected acceptance checks (not yet passed)

1. A room facilitator sees **only the assigned site's** roster and planned onsite sections. Sibling-site access is denied. A paraeducator cannot mark attendance by default.
2. Staff attendance marks append to the canonical attendance ledger. Unmarked students remain **unrecorded**, not absent; corrected entries retain prior-event reconciliation and audit history.
3. Section instructional coverage appears only for a verified staff assignment **and actual instructional calendar day**. Closed/holiday/zero-instruction dates cannot generate an acknowledged duty or false missed-duty counts.
4. Only the personally assigned, currently authenticated adult can accept or decline a scheduled block. Exact retries are idempotent; inconsistent retries, wrong-site, wrong-person and past-date requests fail closed. Declined coverage still requires direct human site-leader coordination.
5. A site leader can attest a complete attendance **snapshot** only when their grant includes every active onsite program. Corrections or calendar changes invalidate the prior snapshot; a snapshot is neither school closure nor a student-release decision.
6. No academic grades, counselor/safeguarding records, guardian excuse adjudication, physical-presence certification, custody/release or checkout powers leak into these staff routes.
7. Browser test with real role switching, session reload, failed request/retry, site-local timezone changes, and attendance/staffing mutations; inspect audit and event records.

**Exit condition:** the latest `FullFlow` commit passes CI; the disposable-database `attendance-handoff` integration suite passes; authenticated cross-role browser acceptance passes. Until all three, mark Hybrid Site Operations as **implemented, unverified — do not merge or launch**.
