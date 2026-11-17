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
