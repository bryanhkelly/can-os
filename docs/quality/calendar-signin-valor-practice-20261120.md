# Calendar access, build provenance, and Valor Class practice (2026-11-20)

**Branch:** `feature/platform-admin-catalog-blueprints-20261120` (PR #355). **Production changes:** none. **Validation:** source changes committed; TypeScript, build, authenticated browser, and Cloudflare deployment have **not** been verified.

## Calendar
- `/calendar` now checks the current server-authorized workspace session at route load and redirects a missing/expired login to `/access` with a validated same-origin `returnTo` that retains the date/event query.
- Expiry while an already-open calendar fetches data also redirects on an explicit authentication failure. A role denial, unavailable database, or truly missing event is **not** treated as missing authentication.
- Acceptance: signed out and expired signed-in users opening `/calendar?date=2026-11-20&event=b6744a3c-b9cc-4e2d-ad1d-30644f7fe5c3` are routed to sign-in; valid members reach original event or legitimate unavailable/permission state.

## Login
- `/access` footer renders `embeddedSourceRevision()` short SHA from Vite's actual checked-out source commit. If unavailable the UI explicitly says `Build: unavailable`, never a fabricated deploy ID.

## Synthetic Valor Class practice
- Existing Valor draft assessment administrations stay **draft**. The present `native-valor-practice-check.functions.ts` service projects only synthetic draft short-text prompts for the **exact** active Valor student Class and keeps answers in the already existing `public.formative_practice_attempts` / `education_v30_secure.formative_practice_responses`. No duplicate quiz/grade tables or Section dependencies. The proposed duplicate service was deleted.
- The student assessments tab now shows a clearly marked synthetic, unscored draft-practice exercise beneath the separately authorized official assessment player.
- The assigned teacher's assessments tab can inspect saved practice answers through the existing exact-Class teacher appointment reader. Private practice is not an issued test, official score or credit.
- The teacher's Class homework review now allows returning free-text feedback and an optional 0–10 **practice score** on synthetic Valor submissions. The existing `graded_submissions` row and the shared public audit journal persist the practice response; Jordan sees the returned feedback and label `not an official grade`.
- No `grading_decisions`, approved professional grader appointment, academic release, consent, credit, qualification, or institutional authority is fabricated or activated.
- Jordan's nine current active native Classes can display available synthetic prompts from their associated course drafts. The twelve draft administrations are not equivalent to twelve current Jordan enrollments.

## Remaining acceptance gates
- Run TypeScript, focused tests including `calendar-access-valor-draft-practice.test.ts`, Cloudflare build and authenticated role-positive/role-negative browser QA on the exact PR SHA.
- Validate a real test login/logout followed by the provided deep-link redirect and a saved draft-practice response for Jordan. Verify Riley can read that record and return practice feedback on a submitted homework row, and that unrelated Sites cannot.
- Verify no official `grading_decisions` or published assessment lifecycle rows were inserted. Approval and publication remain subject to the separate verified credential/reviewer workflows.
- CI is reporting failures without usable compiler/test logs. Netlify deploy preview also failed. Do not label this release verified or deployed.
