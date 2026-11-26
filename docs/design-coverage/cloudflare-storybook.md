# Dedicated Cloudflare Storybook Worker

Target Worker: `becomuna-storybook`. Do not reuse the `can-os` Worker, its configuration, runtime secrets or bindings.

## Local deployment

From a clean checkout of the reviewed Storybook branch, using an authenticated Cloudflare account:

```sh
npm ci
npx playwright install chromium
npm run storybook:acceptance
npm run storybook:prepare-cloudflare
```

On Linux, install Playwright OS dependencies if needed (`npx playwright install --with-deps chromium`). The acceptance receipt must be for the exact checkout and the static output must match its fingerprint. The packager writes a separate Wrangler JSON configuration alongside a commit-specific assets directory under `acceptance-artifacts/storybook-release/`. It excludes source maps and carries static security headers. A single root rewrite serves the Storybook manager at `/`; the iframe retains its exact `/iframe.html` URL and unknown paths do not fall back to the manager.

Run the exact `npx wrangler deploy --config ...` command printed by the packager. Authenticate Wrangler locally with `npx wrangler login` if necessary. Never use the production application's deploy script or root Wrangler configuration.

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
| Root directory | / |
| Build command | npm run build:storybook:cloudflare |
| Deploy command | npm run deploy:storybook:cloudflare |
| Preview builds | Disabled |
| Access | Protect all traffic |
| Build variable | NODE_VERSION=22 |

Cloudflare defaults to the repository's default branch. If the creation screen does not expose branch selection, create a standalone Hello World Worker with Access enabled first, then connect the repository through Settings > Build and select the Storybook branch before running a build. The Storybook-specific commands exist only on the dedicated branch until explicitly merged. Never substitute the production build or default Wrangler deploy command.

The build script installs Chromium and its system dependencies, runs the portable acceptance gate and prepares the static package. The deploy script rechecks the receipt, package and dedicated Wrangler configuration, and invokes the repository's installed Wrangler without using the application config. If a browser dependency cannot be installed on the managed builder or acceptance fails, deployment must stop. The hosted build is not yet verified. Use a dedicated or suitably scoped Workers build token; no application environment variables are required. The generated Worker configuration disables public hostnames on each deploy. Enable the hostname only with verified all-traffic Access protection.

References:
- https://developers.cloudflare.com/workers/static-assets/
- https://developers.cloudflare.com/workers/configuration/cloudflare-access/
- https://developers.cloudflare.com/workers/ci-cd/builds/build-branches/
