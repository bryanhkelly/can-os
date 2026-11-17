# WS00 main consolidation release hold

**Purpose:** merge six implemented Programs/Courses/Classes/My Activity workstreams
to `main` as a shared development and bug-fix baseline. This is **not**
approval for production deployment or for database schema migration.

## Baseline and recovery

- Pre-integration `main`: `5f0f09a59d0d14eb0d1cc8a16f2b09d32dd160aa`.
- Recovery branch: `backup/main-pre-programs-courses-classes-20261116`
  pointing exactly to that commit. Do not delete it during stabilization.
- Integration PR: https://github.com/bryanhkelly/can-os/pull/307
- Original workstream branches retained for provenance.

## Automatic deployment hold

- `netlify.toml` declares `[context.production] ignore = "exit 0"`.
  For Netlify Git-triggered production-context builds, exit 0 means skip.
- The hold is **deliberately temporary** and must be removed only as part of
  an approved production release. It may also skip automatic builds of future
  `main` changes, including unrelated fixes. Keep the release hold visible.
- This is **not a global deployment lock**. Netlify manual deploys and build
  hooks can bypass its ignore command. Git-connected external platforms such
  as Cloudflare may deploy independently and require their own controls.
- The main Cloudflare GitHub Actions workflow is a **build/test gate**, not a
  verified Cloudflare deployment blocker.
- Newly introduced WS3 and WS4 capability flags remain disabled; this does
  not imply all existing product features or deployments are disabled.

## Stabilization entry criteria

Development commits may continue on main with isolated feature flags disabled.
The following are **not yet certified passing** on the exact integrated SHA:

1. `npm ci && npm run verify:ws00` or equivalent clean-checkout,
   non-production build/typecheck/lint/Vitest acceptance.
2. GitHub Actions jobs actually start and pass. Current `startup_failure`
   creates zero jobs; https://github.com/bryanhkelly/can-os/issues/317.
3. Correct ordered WS3/WS4/WS5 migrations and grants in disposable isolated QA,
   with restricted user RLS denial and Class/Enrollment lock concurrency checks.
4. Authenticated one-hour class, four-session/two-Site, local operators,
   participants, students and guardians E2E and evidence/reporting outcomes.
5. Explicit review of Netlify/Cloudflare production promotion paths,
   rollback testing and approval to remove the production-context skip.

**Release decision: HOLD / NO-GO**, even if the source is present on `main`.


## Main merge and first stabilization (2026-11-16 Pacific)

- GitHub merged PR #307 at **`63c60ee0a951d047696b0150db2c53c6931ebc4c`** with `[skip netlify]` in the merge title. The original main SHA was preserved as a real backup branch and independently rechecked.
- The GitHub cloud build gate triggered on the new main commit, but the run again reported `startup_failure` with zero jobs. This is not a passing application build.
- Netlify `can-os-demo-new` and `can-os-demo` continued reporting their previously published, ready deployment IDs when checked after the merge. This is not evidence of any new deployment or validation.
- The `npm run verify:ws00` fallback previously required the **integration** branch, which would make it unusable after the merge. On `main` it now accepts a clean main checkout only while `[context.production] ignore = "exit 0"` remains in `netlify.toml`, still accepts the integration branch, and rejects other branches.
- The exact committed verifier was evaluated read-only with mocked git/npm invocations for four cases: main with hold, main without hold, integration, and unrelated feature branch. **All four routing/fail-closed checks passed**. The simulation deliberately aborts at `npm ci`; it is not an actual npm installation or test pass.
- Netlify's `[context.production]` skip must be removed only after a separately authorized production release. This cannot prevent independent Cloudflare pipelines or manually triggered Netlify deploys.

**Release remains HOLD / NO-GO, while development may proceed on main.**


## Native Class schedule and CAN learner recovery hardening (2026-11-17)

The following source fixes are committed directly on main:

- Native Class Session plans cannot be rescheduled or cancelled through the
  generic facilitated-room calendar. Native Sessions must use their specific
  `changeNativeClassSessionSchedule` command so Class Session replacement,
  cancellation history, staff authority and audits stay coherent. The generic
  calendar now labels and links native Sessions to their Class workspace,
  without rendering its generic mutation controls.
- A retry of an existing Class Enrollment revalidates the active canonical
  learner session inside the transaction. Independently approved admission
  now passes the explicit `approval` method to the shared seat guard rather
  than treating it as `self`.
- `resumeLinkedNativeClassLearner` allows an adult CAN-only session to recover
  a short-lived native learner cookie without a second interactive sign-in
  **only when** the original CAN Person, existing independently linked native
  Person, birth-date adult check, verified native account, and one current
  learner home-Organization grant all agree. No identity is created and no
  Class Enrollment or seat is altered. A restricted reader is mandatory.
  The `/class` workspace offers this recovery for existing linked accounts.

Focused Vitest regression contracts were added to `test:classes:unit`.
Source-level assertions were checked against GitHub main; **TypeScript, Vitest,
Cloudflare bundling and authenticated browser execution remain unverified**.

**Remaining P0:** a truly new verified CAN account with no existing native
Person/learner grant still cannot create the first native Class enrollment from
one login. A separately reviewed native adult Person/age/learner grant
onboarding decision is required; do not make an email match, shared demo
identity or arbitrary self-reported adult birth date sufficient. The native
Class approval and Site/Organization production schema still requires
authorized migration and positive acceptance fixtures.

**Release hold remains in force.**


## November 17 schema reconciliation (database migrations applied; release hold retained)

At the user's explicit direction to put all pending tables on Neon
`main`, the additive sensitive-issuer and staged WS3, WS4, WS5
migrations were applied to `test01` and then `main` in validated
dependency order. The main branch now contains all 11 newly added
relations with forced RLS and their available guard functions/triggers,
including governed Class Outcome columns. All existing native Class and
credential approval record counts remain zero. **This does not change
the WS00 application release HOLD/NO-GO**, and it does not prove any
authenticated Class journey or Cloudflare deployment.

These DB migrations supersede the earlier text in this runbook stating
that WS3/4/5 tables are absent, but they do not supersede the
requirements for real-role authorization tests, published completion
policies before enrolling a Class learner, current-SHA build acceptance,
independent reviewer decisions, and production promotion approval.

See [2026-11-17 main schema reconciliation](../releases/2026-11-17-main-schema-reconciliation.md)
and the repeatable read-only `db:canonical:main-schema` check.
