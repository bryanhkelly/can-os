# CAN OS Cloudflare production build: route generation repair

**Incident evidence:** user-supplied Cloudflare build log
`can-os.production.766be408-59da-4ecc-b492-37ecda03d982.build.log`
(UTC 2026-11-17 04:26-04:30). The log does not explicitly establish
the source checkout SHA. It does establish the blocking syntax location.

## Original failure chain

1. `npm clean-install` completed, installing 961 packages.
2. `prebuild:cloudflare` completed Site planning schema import validation.
3. Image preparation validated 10 originals and generated 20 variants.
4. TanStack Router stopped while transforming
   `src/routes/learn.my-activity.tsx`, reporting
   `SyntaxError: Unexpected token, expected ":" (213:14)`.
5. The route's nested empty-state JSX expression lacked its final
   `: null` branch. The plugin therefore did not generate
   `src/routeTree.gen.ts`.
6. Vite's subsequent `[UNRESOLVED_IMPORT]` for
   `./routeTree.gen` in `src/router.tsx` was a **secondary symptom**.
   Never check in or hand-author a generated route tree to hide the syntax error.

## Fixes committed directly to main

- Closed the malformed nested JSX ternary in the My Activity route.
- Added `scripts/acceptance/check-build-source-syntax.mjs` to parse
  runtime/build source before generating route types or images. Its
  diagnostics report original file, line and TypeScript parse error.
  Test-only fixtures are excluded from production prebuild scanning.
- Wired `check:build-source-syntax` into both `prebuild` and
  `prebuild:cloudflare`.
- Both Vite configs now import `./build-source-revision.ts` with an
  explicit extension, resolving the exact native config-loader
  compatibility warning in the supplied log.
- Added `postbuild` and `postbuild:cloudflare` to run
  `npm run typecheck` **after** TanStack generates its route tree.
  This prevents a bundler-only success from being mistaken for a
  TypeScript-verified production build.
- Added `tests/unit/build-source-syntax-regression.test.ts` to
  detect the original malformed-ternary form and enforce pre/post build
  hooks, and wired it into WS00's focused/local regression runners.

## Grounded verification scope

A scratch copy of the TypeScript parser check executed locally with
TypeScript and Node against two synthetic TSX fixtures: it rejected the
original missing-`:` pattern with `TS1005` and accepted the repaired
form. An isolated `npm run build:cloudflare` lifecycle fixture
verified that npm runs `prebuild:cloudflare`, the build command,
then `postbuild:cloudflare` in that order.

Repo-wide static import inspection checked all **82 changed app source
files** from the six-workstream integration: their local referenced
source paths exist except for the **expected build-generated**
`src/routeTree.gen.ts` import. This is a path-existence check, **not**
an import graph/TypeScript link or Vite production bundle pass.

**No completed post-fix Cloudflare production build has been observed.**
The GitHub Actions run family remains `startup_failure` before jobs
start (issue #317), and the Netlify preview was skipped due to
`account builds usage exceeded`; neither can certify Cloudflare build
correctness. A successful **exact-main-SHA** Cloudflare client/server
bundle followed by postbuild `tsc --noEmit` is still required.

Non-blocking warnings in the uploaded log: deprecated packages and
`npm audit` reporting 34 vulnerabilities (26 moderate, eight high),
and the optional `vite-tsconfig-paths` native-resolution warning.
Address dependency security and plugin modernization separately,
without force-upgrading unrelated packages to mask this parser bug.

**Keep production release on hold:** the main `netlify.toml`
`[context.production] ignore = "exit 0"` safeguard remains.
Do not run WS3/WS4/WS5 migrations or enable their feature flags to
resolve a build-time syntax problem.

## Exact-sha acceptance command

On a clean checked-out `main` with dependencies available:

```bash
npm run build:cloudflare
```

Its lifecycle now runs source parse, Site preflight, asset preparation,
Vite Cloudflare bundle (client and server) and then TypeScript. For
additional full-unit and cross-stream checks run
`npm run verify:ws00`. Do not assert success until commands are
actually executed and their logs identify the checkout SHA.
