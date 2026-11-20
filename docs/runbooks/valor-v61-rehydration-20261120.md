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
