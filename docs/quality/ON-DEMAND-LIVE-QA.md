# On-demand live-site QA

**Workflow:** [CAN OS live QA - On-demand test and repair](../../.github/workflows/on-demand-live-qa.yml)

## How to run

1. Open **GitHub > Actions > CAN OS live QA - On-demand test and repair**.
2. Click **Run workflow** on `main`.
3. Select the deployed Netlify target and scope (all, public, or signed-out).
4. Leave **propose_fix** enabled if automatic *proposal* of a repair is wanted.
5. Read the run summary; download `live-qa-evidence-<run-id>` for screenshots, videos, traces, and HTML output.

This workflow executes Playwright against a **deployed site** on demand. It does not start a local application server and does not use a database connection.

## What runs

The dedicated `playwright.live.config.ts` suite uses desktop and mobile Chromium to check the root entry point, sign-in form, school creation entry point, and signed-out access protection for guardian, student, and calendar routes. It only navigates with GET requests. The spec must never submit forms, log into accounts, send messages, or modify production data.

Authenticated workflows and state-changing scenarios belong to the existing disposable-Neon E2E suites. They require explicitly guarded test fixtures and separate nonproduction application/database environments.

## Optional automatic fix proposal

If Playwright fails and `propose_fix` is enabled, the workflow attempts to invoke `openai/codex-action@v1` **only if the repository secret `OPENAI_API_KEY` is configured**.

Codex investigates browser evidence against the repository code. It must decline to patch when evidence is inconclusive or the deployed version differs materially from the checkout. If it generates a patch, a separate read-only job checks file scope, build, typecheck, and unit tests. Only then does another job, using a write-scoped GitHub token, open a pull request to `main`.

Prerequisites for PR creation:

- Set `OPENAI_API_KEY` under repository **Settings > Secrets and variables > Actions**. This is a separate API credential and billing arrangement, not a ChatGPT subscription entitlement.
- Allow GitHub Actions to create pull requests, and grant workflow permissions permitting `contents: write` and `pull-requests: write`. If the repository blocks this, the browser evidence and proposed patch are still the primary debugging artifacts.

**No automated merge or deployment occurs.** Changes tested in a GitHub runner are not evidence that the deployed site is fixed. After a reviewed PR is deployed to a preview or the target environment, rerun the live-site Playwright suite against that deployment.

## Current limitations

- The initial live suite is signed-out only. It does not claim to cover Blueprint approval, Launch Studio operations, real sessions, course delivery, admissions, or role-sensitive data.
- Browser testing does not currently run autonomously on ChatGPT message receipt; the supported trigger is GitHub Actions **Run workflow**.
- Codex proposes fixes only when its API secret is configured, failure evidence supports a code defect, and the resulting patch passes validation.
- A Playwright failure may come from an outdated deployment, an unavailable backend, or the test itself. Report uncertainty instead of manufacturing a passing result or bypassing security guards.
