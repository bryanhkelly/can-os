# Test discovery and Playwright profiles

## Unit tests

`npm test` is the full non-E2E Vitest gate. Its npm `pretest` hook checks
the unit-suite discovery contract before running Vitest.

Seven focused npm test commands now invoke `scripts/run-unit-suite.mjs`
rather than listing specific files:

| Command | Naming family |
| --- | --- |
| `test:safety` | church, opening, onsite supervision, pickup safety, safeguarding |
| `test:family:p0:unit` | guardian, conference, pickup, field trip, family workspace |
| `test:classroom:unit` | classroom, facilitated learning, canonical learning release, waitlist delivery |
| `test:enrollment:unit` | noncredit self-enrollment, personal CAN account |
| `test:site:channels` | site content, preview, setup, planning, enrollment, website studio |
| `test:classes:unit` | classes, native classes, unified classes, canonical objectives, class announcements/downloads |
| `test:network:unit` | network attribution, noncredit enrollment |

Add a test with a matching `*.test.ts` or `*.test.tsx` filename under
`tests/unit/` or `src/` to have it discovered by the appropriate focused
command. A nonmatching test still runs in the comprehensive `npm test` gate;
add a logical prefix to an existing suite for focused coverage.

Examples:

```bash
npm run test:classes:unit -- --list
npm run test:classes:unit
npm run check:unit-suite-discovery
npm test
```

The focused runner fails if a configured suite discovers no files. The
discovery contract tests live at `scripts/lib/unit-suites.test.mjs` and
exercise new filename matching and exclusion of integration/E2E files.

## Playwright profile isolation

`playwright.my-activity.config.ts` was identical to the authenticated-route
configuration except for file selection. It has been retired; both tests now
share `playwright.authenticated-routes.config.ts`. To run only My Activity:

```bash
npm run test:e2e:my-activity
```

The remaining 11 root configs have materially different runtimes or security
boundaries. Retain their fail-closed guards rather than combining them into
one globally evaluated project graph:

| Configuration | Runtime / security intent |
| --- | --- |
| `playwright.config.ts` | Isolated database-backed golden-flow server |
| `playwright.admissions.config.ts` | Isolated admissions fixture and mail outbox |
| `playwright.authenticated-routes.config.ts` | Disposable Neon + localhost authenticated smoke, including My Activity |
| `playwright.curriculum.config.ts` | Disposable Neon + local curriculum grading fixtures |
| `playwright.fullflow.config.ts` | Retained legacy pinned FullFlow fixture path |
| `playwright.ws00-single-login.config.ts` | Explicit WS00 QA opt-in and synthetic learner |
| `playwright.ws4-two-site.config.ts` | Opt-in two-Site read-only synthetic personas |
| `playwright.routes.config.ts` | Read-only local route checks |
| `playwright.live.config.ts` | Approved live hosts, no local server |
| `playwright.canonical-learning-release.config.ts` | Exact-SHA deployed learning release |
| `playwright.noncredit-self-enrollment.config.ts` | Exact-SHA deployed noncredit acceptance, separate mutation permission |

Shared checks for loopback-only and deployed exact-SHA URL validation are in
`tests/e2e/config/guards.ts`, with regression tests in
`tests/unit/playwright-configuration-guards.test.ts`. Retain each profile's
additional database, credential, fixture, and mutation guards.

Do not move mutating tests into a read-only or live profile to reduce file
count. Prefer adding files to an existing safety-equivalent test profile.
