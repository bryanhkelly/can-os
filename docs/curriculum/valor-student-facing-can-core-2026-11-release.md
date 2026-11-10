# Valor School student-facing CAN Standard curriculum release

**Date:** 2026-11-10
**Environment:** Connected Neon project `sweet-hall-62441909`, existing **synthetic** Valor School program `synthetic-hybrid`.
**Operator action:** Explicit user instruction to release new versions to students.
**Scope:** Four existing enrolled CAN Standard demo classes only. No real student or external school release.

## Completed and database-verified

| Course | Previously pinned | Newly published and student-pinned | Section ID |
| --- | --- | --- | --- |
| CAN-ALG1 | v2 | v3 | `7b6eb18e-8191-fbd5-bc2d-cd860e6b26a0` |
| CAN-ENG9 | v1 | v2 | `19e9b731-a501-4dda-a063-e5600dd53475` |
| CAN-BIO | v1 | v2 | `839c3a75-664c-2b1e-814f-5ff06c4d459d` |
| CAN-USHIST | v1 | v2 | `8218ad09-97fb-87df-1e2c-beb7e8fb8752` |

- Published four versioned course snapshots (rather than overwriting previously published lessons).
- Retained original four published `foundations` lessons per course in a new prior-learning unit. Algebra I's five other pilot lessons retain their original lesson IDs without duplication.
- Four student-facing sections now point to the newly published versions; each contains 184 lessons in 10 modules (180 new plus four legacy foundations), with eight detailed weeks and 28 additional draft instructional frameworks.
- The existing private DEMO-INTERNAL `can-high-school-core` pack got **published v3**, retaining **32 unique published course offerings**, replacing only the four preview courses with these new versions. New pack version id: `5fc7f45d-0c04-da95-dd41-f98ffc383305`.
- Existing Valor synthetic program adoption now explicitly pins pack v3, using the prior accepted entitlement, and has an audit record documenting the revision. Old pack v1/v2 remain immutable and available for history. The other 28 unreviewed new draft course versions have **not** been published; pack v3 continues to use their previously published versions.
- Verified one current-version progress row in each target section. Historical progress versions remain intact; the Algebra I and English 9 prior completion timestamps were carried forward, and zero-completion Biology and U.S. History prior rows retained their incomplete status.
- Existing student/class data preserved: **27 assessments**, **216 submissions**, active section enrollments of 12 Algebra I and 11 each in Biology, English 9 and U.S. History. No student scores, statuses, deadlines, or assignment ownership changed.
- Published and section-pinned versions verified via SQL; no direct signed-in classroom-browser acceptance was performed.

## Important limitations

All four courses remain `creditStatus=not_credit_ready` with an academic planning/review status. This is a **synthetic demonstration release**, not educator signoff, state approval, accreditation or real credit authorization. Although 184 lesson records are visible, most of Weeks 9–36 are still provisional learning frameworks, not vetted teaching scripts. The 36 per-course weekly assignment templates remain curriculum metadata; they were not inserted as graded teacher-owned assignments or discussion threads.

This release is not an application code deployment: student views should read the pinned published release from the database using existing delivery code and the active same-organization synthetic pack. App/browser playback, teacher-only answer confidentiality and links/captions still need a separately signed-in acceptance run.

## Audit and reproducibility

Applied guarded, atomic, idempotency-protected SQL:

`scripts/releases/valor-can-core-2026-11-student-preview.sql`

It rejects non-synthetic organizations, wrong site/program IDs, missing accepted pack/entitlement, unexpected class or version counts, incomplete 36-week draft blueprints, unexpected duplicate prior lesson identities, existing partial v3 releases and post-update reference mismatches. Four course-publication audit entries, one pack-publication entry, one adoption-revision entry and four class-version-revision entries were created.

Expected student route format:

`https://can-os.bryanhkelly.workers.dev/classes?section=<SECTION_UUID>&tab=lessons`

Validate from the **Valor student demo account**. If a deployed app relies on caching, server cache invalidation or a fresh session may be required; none was manually invoked.
