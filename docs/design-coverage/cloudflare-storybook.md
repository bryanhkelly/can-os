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

On Linux, install Playwright OS dependencies if needed (`npx playwright install --with-deps chromium`). The acceptance receipt must be for the exact checkout and the static output must match its fingerprint. The packager writes a separate Wrangler JSON configuration alongside a commit-specific assets directory under `acceptance-artifacts/storybook-release/`. It excludes source maps and carries static security headers.

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

## Future automation

Cloudflare Workers Builds can connect to the repository and select a production branch other than main. Configure this only on the dedicated Worker, after the first protected deployment and after the acceptance suite can execute reliably in the chosen build environment. Do not run the default production Wrangler deploy command against this repository. Do not copy production environment variables. The local acceptance route is supported first; remote build and private access have not been verified.

References:
- https://developers.cloudflare.com/workers/static-assets/
- https://developers.cloudflare.com/workers/configuration/cloudflare-access/
- https://developers.cloudflare.com/workers/ci-cd/builds/build-branches/
