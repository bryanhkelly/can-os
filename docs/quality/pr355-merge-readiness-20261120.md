# PR #355 merge readiness, 2026-11-20

Branch: `feature/platform-admin-catalog-blueprints-20261120`
PR: https://github.com/bryanhkelly/can-os/pull/355
Target: `main`

## Status: SOURCE REVIEWED, NOT BUILD VERIFIED

- On November 20, branch merge commit `98aa76ad5aa47f38215a9aaf45fa323432dffa7d` reconciled `main` with the feature branch. GitHub reported `behind=0` and `mergeable=true`; recheck at final merge because agents remain active.
- Netlify Preview explicitly reported `Skipped due to account builds usage exceeded` for PR #355. That failure does **not** establish a TypeScript or Vite defect.
- Nine GitHub Actions workflows reported failure for the inspected integration SHA; their job data exposed **no steps** and GitHub's job log download returned **BlobNotFound**. Do **not** count any workflow as passing or assert a source failure from this evidence.
- The latest known Cloudflare preview comment reported a failed build for an *earlier* PR commit. A successful exact-SHA Cloudflare build is still required.
- The repo has not been checked out with node_modules in an accessible execution environment in this review. No actual TypeScript, Vitest, Vite/Cloudflare, Playwright, or RLS regression suite was executed by this review.

## Fixes completed on this branch

- Global session guard redirects missing, expired and revoked session users to login, with a local-path `returnTo` for reauthentication. Public signup, site preview, interest/event and discovery paths retain explicit exceptions. Exact browser behavior is still untested.
- Account menu and server-revoking Sign Out are reused in both Launch Studio shells.
- `Save & Sign Out` saves the Site or website draft before logout and surfaces a failed logout.
- Site Profile draft edits no longer require explanation text or a separate Program grant for every draft Program. The current verified Site-registrar grant, revision/organization scope and independent operating/publishing authorization guards still apply.
- Saved Site Profile shows green completion even for older persisted Sites without new `siteIdentityRevision` metadata.
- Website previews preserve the **exact** saved Site/Brand name, including `Barton Demo School`, and omit private Site setup/network status cards. No canonical name or immutable snapshot is rewritten.
- Seven website templates now have page/section/element provenance and source/editing-location documentation in Website & Brand without website debug labels.
- Valor learning uses the same student Class home, canonical Class Enrollment, Course Attempt, lesson renderer and ordinary noncredit formative feedback services as any school. Valor-only student enrollment and unpublished draft assessment endpoints were retired; grades and academic credit remain independently governed.

## Latest executed readiness evidence

- Verified source diff: **155 newly added/changed relative imports** have valid tracked targets. This is a scoped source-level import check, not `tsc` or a Vite build.
- Changed `src/modules/classes/class-staff.functions.ts` to require a **teacher** CAN grant for a teacher Class assignment and **room_facilitator** for a facilitator Class assignment. Teaching alone cannot grant physical attendance approval. Contract tests were committed, not executed.
- Fixed fixed-code demo login to support additional verified, active Valor Site accounts through ordinary CAN grants, retaining the Demo Admin as the only privileged cross-identity switcher. The exact Site remains required, and Sally's unverified account remains blocked.
- Student Class pages now give actionable guardian/registrar enrollment instructions and a link to the student's school; youth registration and consent stay in the governed `/guardian/native-classes` process. No independent synthetic self-enrollment was reinstated.
- **Neon main read-only verification**: Jordan 9 active Classes; Biology 11 active enrollments; Riley 1 active facilitator grant; 0 facilitator Class assignments; 0 Biology Sessions; 0 authorized Biology video presentations; Sally remains unverified; all 4 checked identity/Class tables enforce RLS. Installed staff SQL has **no Riley email exception** and rejects an unknown session digest.
- **Neon main was modified in earlier implementation turns**, not in this readiness verification: the guarded Biology hybrid delivery, Riley dual-role provisioning, Valor synthetic Organization lifecycle reconciliation, restricted CAN staff projection, and Sally's legacy institutional capability reconciliation were applied with script/audit evidence. This supersedes earlier statements that the PR caused no database changes.
- **Static/CI remains blocked**: the current exact-SHA GitHub Action jobs fail before steps begin and logs return `BlobNotFound`; Netlify reports build usage exceeded. Neither failure is a passing build or proof of a code defect.
- **Do not merge solely because GitHub reports mergeable.** The final code still needs executed TypeScript, unit, architecture, Cloudflare build and targeted authenticated browser evidence.

## Active deployment dependencies

1. A legitimate, verified App Admin grant must be provisioned via the existing access process. A **read-only** Neon main inspection found **0 active `app_admin` person grants**. Do not mint or assign a synthetic account.
2. `CAN_PLATFORM_CATALOG_PUBLISHER_ORGANIZATION_ID` must point to a legitimate, active CAN-owned `can_network` Organization before global Blueprint drafts can be written. A **read-only** Neon main inspection found **0 active CAN network publisher organizations**. Do not substitute unrelated `GF25 Credit Issuer` fixtures. App Admin remains the human authority, the publisher is only the immutable ownership identity.
3. Real academic, safeguarding, Program, enrollment and grading authority is separate. The merge must not imply release of the 12 draft Valor knowledge-check administrations or the two draft COGIC Pilot Offerings.

## Merge gate

- [x] Verify PR is cleanly mergeable with GitHub compare.
- [x] Inspect changed files, in particular auth, Launch, Site Profile, template provenance, Blueprint catalog and synthetic learner/teacher boundaries.
- [x] Remove synthetic-only Valor practice service and use canonical formative practice storage and ordinary teacher feedback.
- [x] Verify Neon column names for the existing Blueprint facility/dependency and formative-practice tables, read only.
- [x] Fix the draft Program-scope editing deadlock and old-Site completion regression.
- [x] Update existing UI assertion for `Save & Sign Out`.
- [ ] Exact-SHA `npm ci` and `npm run check:build-source-syntax`.
- [ ] Exact-SHA `npm run check:local-import-exports`, `npm run check:class-architecture`, `npm run check:component-boundaries`, `npm run check:route-identifiers`.
- [ ] Exact-SHA `npm run typecheck` and `npm run build:cloudflare` (the production-target build includes source and TypeScript gates).
- [ ] Unit tests: `npx vitest run tests/unit/global-auth-redirect.test.ts tests/unit/launch-module-completion-v61.test.ts tests/unit/barton-preoperation-site-profile.test.ts tests/unit/website-template-provenance-v61.test.ts tests/unit/site-preview-presentation.test.ts tests/unit/site-programs-audiences-v61-ui.test.tsx tests/unit/platform-catalog-admin.test.ts tests/unit/calendar-login-valor-practice-v61.test.ts tests/unit/launch-studio-account-controls.test.tsx`.
- [ ] Run `npm run lint`, `npm test`, and the Cloudflare regression/build workflow.
- [ ] Authenticated browser smoke for Barton Admin Site Profile save+logout+return URL, account menu on every Launch screen, Session expiry, public signup and preview access, green checks based on saved data, exact Barton Brand names, and all seven website template preview pages.
- [ ] Jordan/Riley practice isolation and cross-organization negative authorization browser/SQL tests; verify no official grade or approved assessment was written.
- [ ] Restore working CI evidence or independently attach a verifiable command transcript from the exact PR SHA before merging.
- [ ] Recheck `main` divergence and PR mergeable state just before merge.

## Change policy

No additional Neon writes were made during this **readiness review**. The preceding implementation did modify Neon main as described in Latest executed readiness evidence. No new App Admin grant, academic approvals, or deployment environment values have been fabricated. The PR remains **open and unmerged** until release verification is available. No additional branch was created.

## Commands to run on a trusted checkout

```bash
git fetch origin main feature/platform-admin-catalog-blueprints-20261120
git switch feature/platform-admin-catalog-blueprints-20261120
git status --porcelain
git rev-parse HEAD
npm ci
npm run typecheck
npm run build:cloudflare
npm run lint
npm test
```

The commands above describe verification needed. They were **not executed** by this review.
