# Two reusable pilot journeys: targeted code verification

**Date:** November 20, 2026  
**Repository:** `bryanhkelly/can-os`  
**Branch:** `feature/launch-studio-v61-clean-cutover-20261118`

## Verified by executing actual source logic

- **9/9 pass:** Extracted and executed the unmodified function body from `src/domain/program-offering-journey-v61.ts` in a JavaScript test harness. Cases: exact two-Program mapping, draft publication fail-closed, pinned Blueprint version, other-Site data exclusion, open-window counting, unknown publisher authority, window boundaries, unmatched Program and saved-version precedence.
- **11/11 pass:** Extracted and executed the unmodified function bodies from `src/domain/classroom-scheduling.ts`. Cases: weekly, twice-weekly, Monday–Thursday, holiday breaks, overlap, duplicate times, short duration, more than four dates, invalid/reversed times, adjacent meetings and 180-day limit.
- **14/14 pass:** Source-level integration contract checks, including exact Site handoff, provider Offering code filter, approved deployment authorization, independent Class attachment scope and four-Class batch scheduling. **These are source assertions, not runtime service tests.**

## Verified against Neon

The repository's read-only `scripts/sql/canonical-v301/cogic-reusable-pilot-draft-acceptance.sql` passed on **Neon main** and on `v61-launch-brand-migration-validation-20261119`.

Both databases show the same canonical draft state:

| | Custom Training | AI & Digital Skills |
| --- | --- | --- |
| Course lessons | 7 | 4 |
| Noncredit training | draft | draft |
| Knowledge check | 5 draft questions | 5 draft questions |
| Feedback instrument | 5 draft questions | 5 draft questions |
| Approved training | no | no |

No live registration release has been created.

## Defect found and corrected

**Problem:** `src/routes/canonical.lab.facilitated.tsx` supplied `getFacilitatedHostWorkspace().choices` to the four-Class scheduler. That list is derived from **active learner Course attempts**, so an authorized facilitator could not schedule a pilot Course before the first registration.

**Fix:** The four-Class planner now reuses the existing `getClassroomRehearsalChoices()` authorized published-Course reader. It does not require an enrolled learner and filters to the selected Site. The live-room start UI continues to use the old learner-dependent choices, and scheduling commands still recheck exact Site, published Course and approved adoption. An unavailable pre-enrollment reader fails closed.

Updated `tests/unit/noncredit-cohort-four-week.test.ts` to assert this separation and corrected the now-stale calendar source assertion.

## Important unverified work

The repository was not cloned into a runnable local dependency environment, and the connected GitHub integration does not expose a new-workflow dispatch for this run. Thus **Vitest, TypeScript typecheck, Vite build and authenticated Playwright acceptance were not executed**. Tests described above were directly executed in a lightweight JavaScript harness, against the real fetched pure-function bodies, or as SQL against Neon.

The inspected Netlify deploy preview for PR #348 was skipped with the explicit provider error **“Skipped due to account builds usage exceeded.”** That is not evidence of a source compilation error. Previous GitHub Actions workflow results show failures but did not supply usable step logs; they do not verify the current feature-branch SHA.

Both Courses and Offerings remain drafts. Real instructional media, review signatures, publication authorizations, enrollment consent, scheduled Site Classes and attendance/assessment/completion browser journeys remain outstanding. **Do not claim either COGIC pilot is live or end-to-end accepted.**
