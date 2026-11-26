# Storybook Worker build root

This directory isolates Cloudflare's Worker discovery from the application's root Wrangler configuration. The actual deployment uses the exact-commit validated generated Wrangler configuration, not this discovery file.

In the Cloudflare dashboard set root directory to `deploy/storybook`, build command to `npm --prefix ../.. ci --include=dev && npm --prefix ../.. run build:storybook:cloudflare`, deploy command to `npm --prefix ../.. run deploy:storybook:cloudflare`, branch to `6.1-storybook-configuration`, build variable `SKIP_DEPENDENCY_INSTALL=1` and `NODE_VERSION=22`. Disable preview builds and require Cloudflare Access. See `docs/design-coverage/cloudflare-storybook.md`.
