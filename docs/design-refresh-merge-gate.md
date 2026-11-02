# Design refresh merge gate

Target: `FullFlow`. Source: `design/full-site-refresh`.

**Do not merge until all required checks are evidenced.** The branches had diverged (10 ahead / 9 behind) at the 2026-10-28 review; refresh these counts before integration.

## Required before merge

- [ ] Reconcile latest `FullFlow` changes into the design branch; inspect conflicts in `guardian.apply`, shared workspace components, CSS and package lock.
- [ ] Run `npm ci`, `npm run typecheck`, `npm run build`, `npm run lint`, `npm test`, `npm run build-storybook`, `npm run test:storybook`. Record command, environment, exit code and commit SHA. Never mark a skipped check as passed.
- [ ] Verify shadcn CLI configuration without overwriting customized components; retain existing `src/styles.css`, `src/lib/utils.ts`, and UI primitives.
- [ ] Manually exercise guardian application: eligible program deep link, changing the `programId` search parameter while mounted, validation, submit success/failure, router refresh, household ownership, retry/idempotency, and verified/unverified guardian boundaries.
- [ ] Check visual states at 390/768/1024/1440 px, keyboard navigation, focus and accessible contrast; publish/approve Chromatic baseline when credentials are available.
- [ ] Revalidate Golden Flows affected by the diff, including application vs verification vs enrollment activation and site/institution authorization boundaries.
- [ ] Verify there are no migrations, production-data writes, new authorization bypasses, or new parallel workflow state.
- [ ] Review changed files and obtain explicit merge approval; merge to `FullFlow` only after checks. Do not merge to `main` without separate authorization.

## Current evidence

The branch includes Storybook stories, Chromatic configuration, reusable workflow shells, a real guardian application integration, branding tokens, and lint rules. This establishes implementation, **not** successful execution of build, browser, or end-to-end tests.

On 2026-10-28, the guardian form was patched to track a changed eligible `programId` route parameter. Regression execution remains unverified.

GitHub Actions repair is out of scope; use local or dedicated runner commands and capture results.
