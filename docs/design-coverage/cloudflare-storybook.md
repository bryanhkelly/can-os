# Dedicated Cloudflare Storybook Worker

Target Worker: `becomuna-storybook`. Do not reuse the `can-os` Worker, its configuration, runtime secrets or bindings.

## Local deployment

From a clean checkout of the reviewed Storybook branch, using an authenticated Cloudflare account:

```sh
npm ci
npm run storybook:check-playwright
node node_modules/playwright/cli.js install chromium
npm run storybook:check-browser
npm run storybook:acceptance
npm run storybook:prepare-cloudflare
```

On Linux, install Playwright OS dependencies if needed (`npx playwright install --with-deps chromium`). The acceptance receipt must be for the exact checkout and the static output must match its fingerprint. The packager writes a separate Wrangler JSON configuration alongside a commit-specific assets directory under `acceptance-artifacts/storybook-release/`. It excludes source maps and carries static security headers. A single root rewrite serves the Storybook manager at `/`; the iframe retains its exact `/iframe.html` URL and unknown paths do not fall back to the manager.

Run `npm run deploy:storybook:cloudflare` to revalidate the receipt, configuration and assets before deployment. Authenticate Wrangler locally with `npx wrangler login` if necessary. Never use the production application's deploy script or root Wrangler configuration.

## Enable private review access

The generated configuration disables both workers.dev and preview URLs. It has no routes, server entry point, production bindings or secrets. The initial deployment is intentionally not a public website.

1. In Cloudflare Workers & Pages, select **becomuna-storybook**.
2. In **Access**, protect the entire Worker, not only previews. Configure an allow policy for approved reviewers.
3. In Domains, enable the workers.dev hostname only after confirming protection. Keep preview URLs disabled.
4. In a signed-out browser, verify that the manager, iframe and static assets require authentication. Sign in as an approved reviewer and confirm they load.
5. For future deployments, keep public URL enablement an explicit protected-host decision. The generated bootstrap configuration defaults to disabled; verify Access remains enabled before restoring the hostname after each deployment.

Do not treat noindex or robots.txt as authentication. Do not publish an unverified build.

Expected hostname pattern: `becomuna-storybook.<account-subdomain>.workers.dev`. Confirm the actual hostname and protection in Cloudflare.

## Cloudflare Workers Builds

Use the following settings on the dedicated Worker:

| Field | Value |
| --- | --- |
| Repository | bryanhkelly/can-os |
| Worker | becomuna-storybook |
| Production branch | 6.1-storybook-configuration |
| Root directory | deploy/storybook |
| Build command | npm --prefix ../.. ci --include=dev && npm --prefix ../.. run build:storybook:cloudflare |
| Deploy command | npm --prefix ../.. run deploy:storybook:cloudflare |
| Preview builds | Disabled |
| Access | Protect all traffic |
| Build variables | NODE_VERSION=22; SKIP_DEPENDENCY_INSTALL=1 |

The dedicated `deploy/storybook/wrangler.jsonc` is a discovery configuration for Workers Builds so Cloudflare identifies the correct Worker, not the application's root Worker. The actual deploy command uses the validated generated package and configuration. Do not deploy the discovery configuration directly. The explicit npm prefix installs the locked dependencies at the repository root; disable Cloudflare automatic dependency installation with the build variable above. Cloudflare defaults to the repository's default branch. If the creation screen does not expose branch selection, create a standalone Hello World Worker with Access enabled first, then connect the repository through Settings > Build and select the Storybook branch before running a build. The Storybook-specific commands exist only on the dedicated branch until explicitly merged. Never substitute the production build or default Wrangler deploy command.

The managed build script installs Chromium without requesting elevated operating-system privileges, checks that it can launch and render, runs the portable acceptance gate and prepares the static package. It prints the last 80 lines of any failed acceptance stage into the Cloudflare build log. The deploy script rechecks the receipt, package and dedicated Wrangler configuration, and invokes the repository's installed Wrangler without using the application config. If Chromium cannot launch because the managed builder lacks system libraries, or acceptance fails, deployment must stop. Do not use --with-deps on the managed builder: its non-root environment rejected privileged package installation. A local or other authorized acceptance runner with the necessary libraries remains an alternative. The hosted build is not yet verified. Use a dedicated or suitably scoped Workers build token; no application environment variables are required. The generated Worker configuration disables public hostnames on each deploy. Enable the hostname only with verified all-traffic Access protection.

References:
- https://developers.cloudflare.com/workers/static-assets/
- https://developers.cloudflare.com/workers/configuration/cloudflare-access/
- https://developers.cloudflare.com/workers/ci-cd/builds/build-branches/

## Browser version consistency

Playwright and @playwright/test are pinned to the same version and the lockfile has one playwright-core runtime. Managed builds check the actual resolution paths before downloading Chromium using the explicitly selected local CLI. Vitest and Playwright Test then use that same browser revision. A runtime mismatch is a build failure, not a reason to install multiple revisions.

## On-demand acceptance runner

The Storybook Cloudflare release workflow installs the locked Playwright runtime and its Linux dependencies, checks browser rendering, runs acceptance and packages the exact tested static assets. The workflow defaults to acceptance only. Enable the deploy input to deploy from the same job after successful acceptance. Set repository secrets STORYBOOK_CLOUDFLARE_API_TOKEN (dedicated scoped Worker deployment token) and STORYBOOK_CLOUDFLARE_ACCOUNT_ID for deployment. Secrets are passed only to the deployment step. No application secrets are needed.

GitHub requires a workflow_dispatch workflow to exist on the default branch before it can be manually dispatched. Until the reviewed branch is merged, use the documented local or managed Cloudflare build. Once the runner is available and validated, disconnect automatic Cloudflare Workers Builds for this dedicated Worker if using runner-based deployment, to prevent competing deployments. Do not disconnect the production application Worker. Verify all-traffic Cloudflare Access before enabling any hostname.
