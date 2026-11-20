# Valor School V6.1 synthetic rehydration

**Date:** November 20, 2026. **Target:** Neon project `sweet-hall-62441909`, default branch `main`. **Site:** Valor School `f1000000-0000-4000-8000-000000000003`.

## Recovery completed and verified

The former academic fixture survived in legacy source tables but was not present in the canonical application model. A tenant-scoped, atomic rehydration populated only the current `public` Course, Offering, Deployment, Class and participation tables. No Section or Cohort rows were created.

| Canonical object | Verified count |
| --- | ---: |
| Courses and draft Course versions | 12 each |
| Course units | 48 |
| Lessons | 746 |
| Draft Classes (hybrid) | 12 |
| Class Enrollments | 131 (130 pending, one withdrawn) |
| Required participation attributions | 131 |
| First-lesson supplemental video candidate links | 12 |
| Planning education operation / Deployment / Offering / proposed adoption | One each |

The four CAN Standard courses (Algebra I, Biology, English 9, U.S. History) each contain 184 previously authored lessons. The separate close-reading Course contains three. Seven courses received clearly labeled introductory placeholders because the previous source had no structured lesson units. The existing Site identity, immutable Brand, other Site content, synthetic People, and older historical learning data were not replaced.

IDs are stable using the `md5('valor-v61:…')::uuid` namespace. The legacy fixture was read as a **one-time source**, not resurrected as a live product model or added as a new foreign-key dependency.

## Important boundaries

- All restored canonical Course versions, Offering version and Classes remain `draft`. The new operation/Deployment remain `planning` and the adoption is `proposed`. No institution, publisher, Site operator, school accreditation, credit, enrollment release or staff appointment is approved by this recovery.
- The 130 pending Class Enrollments preserve student-to-Class association while withholding active learning permission. They have no Course Attempt yet; the one previously withdrawn enrollment remains withdrawn.
- The 12 reusable YouTube entries are supplemental media candidates copied from existing CAN demo fixtures, still requiring teacher review, rights, suitability, accessibility and availability checks. Existing original lesson `resources` were retained.
- No native dated Class Sessions, independent teaching assignments, Course Attempts, assignment/submission/grade migration, official grades or learning progress were manufactured. Before marking Classes active, reconcile provenance, staffing, reviewed curriculum, authorization, learner consents and actual delivery.
- The canonical Class workspace validates live operation, published Offering/Course versions, approved adoption, operator authority and Site placement. Restored **draft** Classes are not proof of a functional active Class UI or a signed-in Jordan test.
- The pre-cutover Neon backup `main-pre-v61-cutover-backup-20261120` was read for comparison and **not altered**.

## Repeatable acceptance

Run the read-only check from a connection explicitly verified to be the intended Neon branch:

```sh
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/acceptance/verify-valor-v61-rehydration.sql
```

This tests the canonical data without referencing any retired Section or Cohort source. It reports missing Courses, lessons, Classes, enrollments, attributions or video candidates. It does not verify authentication, interactive playback, student consent, course publication or external media links.

## Subsequent canonical recovery

1. Reconcile synthetic teaching assignments, the 22 distinct synthetic learners, and the previously recorded student/guardian associations under current identity and safeguarding rules.
2. Review/publish canonical Course versions and the Offering, provision independently approved operator/Site/adoption authorities, then activate appropriate Classes through the same application approval workflows.
3. Create actual dated Class Sessions and instructor coverage. Preserve Course Attempt, submission, score, attendance and progress provenance rather than inventing or replaying official records.
4. Run Jordan learner and Riley teacher tests with direct playback, assignment/submission, roster access and multi-Site isolation; record execution and build evidence.
5. Once these references have been accepted, archive/retire the historic academic fixture and remove remaining transitional route dependencies. Do not drop historic tables solely because an initial import count matches.


## November 20 follow-up: synthetic student activation for Jordan

**Status:** Neon `main` read-back verified; source changes committed to GitHub `main`. **Browser acceptance and deployment are not verified.**

The user requested that Valor's restored academic material be usable as interactive classes rather than remaining drafts. The following exact synthetic tenant test state was created without bringing back Sections or Cohorts:

| Target | Verified live database count |
| --- | ---: |
| Active canonical Classes | 12 |
| Published canonical Courses | 12 |
| Unlisted published Class Offerings | 12 |
| Restored Course lessons | 746 |
| Canonical written homework assignments | 24 (two per Class) |
| Jordan active Class Enrollments | 9 |
| Jordan valid active Course Attempts | 9 |
| Jordan unsubmitted assigned homework entries | 18 |
| Jordan preserved historic withdrawn Class | 1 |
| Dated canonical Class Sessions | 0 |
| Current demo delivery format | Self-paced (12 Classes) |

The new publication and Organization/Site operator role records are **synthetic test authorizations only**. They are not a real accreditation, school-of-record approval, credit award, actual minor consent or independent provider rights clearance. The Offering version's test-only release requirements have zero minimum approved primary recording tracks; external candidate videos remain subject to review. The Site metadata remains `synthetic:true` and enrollment remains noncredit only.

**New application ownership:** `src/modules/classes/native-valor-demo-student.functions.ts` and `ValorStudentClassHome.tsx` provide an exact synthetic Valor student mode on the existing `/class` route. Direct CAN student authentication is reused, with no new native learner token. The existing `/class/$classId` page reuses the existing `ClassVideoPlayer` for review-pending videos and native canonical Course Attempt progress. `NativeClassHomeworkPanel` reads and submits through canonical `graded_assignments`, `official_course_assignment_versions`, and `graded_submissions`. These are new code paths and have **not** been runtime/browser accepted.

**Recovery and preflight scripts:**

- `scripts/recovery/valor-v61-synthetic-learning-activation-20261120.sql`
- `scripts/recovery/valor-v61-jordan-synthetic-class-attempts-20261120.sql`
- `scripts/recovery/valor-v61-jordan-homework-20261120.sql`
- `scripts/acceptance/verify-valor-v61-jordan-learning-20261120.sql`
- `tests/unit/valor-v61-native-journey.contract.test.ts`

**Manual authenticated regression after a successful build/deploy:**

1. Sign in directly as the synthetic `jordan.student@valorschool.demo` Person, not the shared demo administrator.
2. Open `/class`. Nine enrolled Classes should show an **Open Class** action. Three other offerings (including the previously withdrawn English Literature) may show available enrollment.
3. Open **Algebra I**. Check 184 native lessons, the first optional supplemental video in the shared `ClassVideoPlayer`, and that marking a lesson complete persists across refresh.
4. Switch to **Assignments** and verify two unsubmitted assignments. Submit a five-character-or-longer written response. Reload and confirm it remains submitted, cannot be silently replaced, and does not issue a grade or official credit.
5. Verify Riley/other teacher access remains restricted until verified staff appointment is completed. Confirm another Person/Site cannot access Jordan's Course Attempt or submissions.
6. Recheck any activated deployment's build results, `npm run typecheck`, `npm run check:class-architecture`, focused unit/integration tests, and actual login/browser acceptance. The Netlify `can-os-demo-new` deployment checks for the latest source commits were **skipped due to exceeded build usage**. No successful deployment of this source has been established, and Cloudflare Worker deployment has not been independently inspected.

**Caveat:** Current text-homework submission is not a complete file attachment, teacher gradebook or feedback workflow. It uses the existing immutable Course Attempt evidence and does not create parallel academic records.

**Delivery format correction:** After the database read-back, all 12 synthetic Classes were switched from planned `hybrid` to `self_paced` because zero dated native Class Sessions exist. This enables independent lessons/homework without implying an available supervised session. The checked-in activation SQL includes that same transition for replay. Hybrid/Scheduled delivery must be reauthorized with real Class Sessions.
