# Bite 5 — isolated authenticated Algebra I browser acceptance

**This is a real browser acceptance harness, not a synthetic SQL-only grade simulation.** It invokes the normal application routes and student/teacher server functions against a disposable database, with genuine database-backed session cookies. It does not permit a production sign-in bypass or touch the shared ValorSchool demonstration records.

## Covered

The suite `tests/e2e/algebra1-classroom.spec.ts` creates a temporary, separate synthetic school using the existing GF1 fixture helper. It installs the *same* Week 1 Algebra I student lessons, 36-week blueprint and teacher guide from `curriculum/can-high-school-core/algebra1` in its temporary course release. Two real `assessments` are configured from the published 20- and 30-point unit tasks and their criteria.

In Chromium, the actual enrolled synthetic student opens the existing `/classes` lesson pages and Week 1 planning roadmap, marks Day 1 complete, submits **both assignments** through `/student/assignments`, and cannot see the teacher-only guide. The **separately authenticated** assigned teacher opens the existing `/classes` teacher guide and uses `/teacher/gradebook` to score both submissions with the real rubric controls and written feedback. The student returns to the application to see the released grades and comments. The suite checks persisted progress, submissions, scores, and audit evidence.

The fixture generates unique identities and opaque sessions hashed in database `access_sessions`. Tests never set an actor/person in an HTTP request, use a fixed demo access code, or spoof a role; ordinary access grants and section relationships control access.

## Safety and execution

The runner is deliberately **manual and fail-closed**. No Playwright workflow executes on ordinary pushes or PR events. Use a disposable Neon branch distinct from production and configure the **integration-test** GitHub Actions environment with:

- `CAN_CURRICULUM_TEST_DATABASE_URL` (secret): isolated disposable Neon connection string
- `CAN_CURRICULUM_TEST_TOKEN_PEPPER` (secret): distinct random value, at least 32 characters
- `CAN_APPLICATION_DB_HOST` (variable): production application DB hostname for mismatch detection (not credentials)

Then run **Actions → Curriculum Browser Acceptance → Run workflow**, selecting the desired commit or `main`. The workflow checks database isolation **before** schema migrations, installs Chromium, migrates only the test branch, then runs `npm run test:e2e:curriculum`. It records a run summary; browser failure traces are available as a short-retention artifact. A missing secret or matching host fails rather than being skipped or rerouted.

For an authorized local runner, supply `APP_ENV=test`, `NODE_ENV=test`, `CAN_TEST_DB_WRITES_ENABLED=true`, `DATABASE_URL=TEST_DATABASE_URL`, `CAN_APPLICATION_DB_HOST`, and `CAN_ACCESS_TOKEN_PEPPER`, then run `node scripts/preflight-curriculum-e2e.mjs`, `npm run db:migrate`, and `npm run test:e2e:curriculum`.

On normal completion the suite removes test-generated submissions, lesson-progress rows, derived audit/event evidence and all temporary school/identity records. If it crashes before cleanup, the isolated branch should be treated as contaminated and replaced or manually inspected, never repurposed for real school data.

## Acceptance gate (not automatic)

- [x] Guarded Playwright config, genuine session fixture integration and app UI scenario authored
- [x] Manual workflow authored with database host mismatch protection
- [ ] Workflow actually executed on a disposable branch
- [ ] Both student submissions graded through the *HTTP/browser* path, confirmed by passing run
- [ ] Student/guardian/teacher authorization and feedback verified through that run
- [ ] Shared deployed ValorSchool login and production route smoke acceptance (separate release gate)

**Important:** Compiling and merging this test harness does not establish a passing end-to-end browser result. Until the manual job actually passes, report Bite 5 as implemented, awaiting acceptance execution. The yearlong Algebra I plan remains a development blueprint, not credit-ready.
