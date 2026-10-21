# Algebra I Week 2: publisher-owned instructional foundation

**Status:** Planning only. Week 2 lessons, assessments, teacher keys, and rubrics have not been authored or released to students by this plan. This material does not establish academic credit or accreditation readiness.

## Ownership and delivery

- **Publisher** owns the course sequence, including units, weeks, lessons, and teacher guidance; drafts and publishes controlled whole-course versions.
- **Organization** licenses, accepts, and selects an eligible publisher course release. It can add organization/site-scoped supplements without editing the publisher's content.
- **Assigned teacher** determines class pacing and adds section/lesson-scoped supplemental resources, homework, classwork, quizzes, tests, projects, and graded discussion assignments.
- **Student** sees published lessons from their section's pinned course version. Student submissions, progress, and grades belong to their actual class.

A week is a curricular grouping, **not** a separately adopted or published release. No per-week school or teacher approval workflow is necessary. Midyear publisher-version switches are exceptional and explicitly outside this bite's scope.

## Week 2 lesson plan

The planning artifact is [week02-development-plan.json](../../curriculum/can-high-school-core/algebra1/week02-development-plan.json), which outlines five intended 55-minute sessions:

1. Multi-step equations with fractional coefficients.
2. Rearranging literal formulas and checking units.
3. Variables on both sides and clearing denominators.
4. Applied multi-step equations with contextual constraints.
5. Formative checkpoint, feedback, and targeted reteaching.

Two assessments are proposed: 20-point practice and a 30-point teacher-scored checkpoint. These are proposed tasks, not published or assigned assessments. Instructional hours must be verified in actual delivery; five planned periods are not attendance evidence.

## Required before publishing

1. Author student-facing worked explanations, guided and independent practice, self-checks, and accessible exit tickets for all five days.
2. Provide separate teacher-facing answers, misconception notes, support/reteaching guidance, and rubrics.
3. Have a qualified math educator review mathematics, standards mapping, accessibility, and scoring.
4. Release under the publisher's normal **course version** mechanism; schools adopt that course release through existing entitlements/adoptions.
5. Teachers assign work through the actual class/gradebook, optionally referencing published lessons.

## Database / compatibility

PR #140's `curriculum_unit_versions` and `section_unit_adoptions` tables remain in migration history for backward compatibility, but are **not used** in live classroom delivery or exposed through the old mutable APIs (PR #141). Do not run migrations or seed student/class records to publish this planning file. Do not change existing class pointers or Week 1 progress.

The earlier per-week Unit Studio, teacher review gate, and section-unit adoption design was superseded by [the publisher/organization/teacher architecture](publisher-organization-classroom-architecture.md). Browser acceptance remains deferred at the user's direction.
