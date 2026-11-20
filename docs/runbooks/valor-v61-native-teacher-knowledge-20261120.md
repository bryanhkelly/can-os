# Valor V6.1: Native Class teacher review and knowledge-check integration

## Scope and status

**Commit series:** GitHub `main`, November 20, 2026. No schema migration or new academic data store is introduced.

**Database acceptance:** Four independent read-only suites now pass **91/91** on Neon project `sweet-hall-62441909`, branch `main` (`br-restless-sea-ar9ooo55`).

**Build / deployed UI:** NOT VERIFIED. GitHub reports no status checks or PR-workflow runs for the latest checked commit. Netlify `can-os-demo-new` skips every new GitHub `main` deployment due to exceeded account build usage. This is an infrastructure refusal to build, not a successful TypeScript build or proof of a compilation error. A Cloudflare release of this source has not been verified here. Authenticated browser acceptance has not been performed.

## Code changes

1. `getCanonicalCommandContext` now recognizes a **direct CAN school teacher** using the active CAN account, verified Person, exact Site grant, single operating Organization, and `teacher:read` capability. A mixed native cookie and CAN teacher cookie is explicitly denied. A teacher's Class actions still require an approved, unexpired Person-to-Class appointment.
2. `getNativeClassWorkspace` recognizes a teacher only for their exact current approved Class relationship and revalidates live Class publication, Organization, Site, Course and deployment authority. It **does not** grant `class.manage`, room-facilitator authority, verified independent grader capability, or assessment publisher authority. Named learner records are limited to the exact approved teacher Class.
3. The new `getMyNativeTeachingClasses` index in `/class` lists only Classes currently assigned to the authenticated direct CAN teacher.
4. The existing Class detail route `/class/$classId` has teacher **Assignments** and **Knowledge checks** tabs. Assignments use `graded_submissions`, `graded_assignments`, `learner_course_attempts`, `class_enrollments` and `classes` with exact Class/Course/Person authorization. This is **read-only**; the former Section-based gradebook is not reused and no new `grading_decisions` are invented.
5. The student **Knowledge checks** tab reuses `CourseAssessmentPanel` and `noncredit-assessment.server.ts`, which already delegates real Class participation to `loadNativeClassAssessmentScope`. The previous adult-only `requireLearner` guard was refined: verified school `student:read` may enter the **Class** assessment branch, while noncredit-only branch explicitly still requires the canonical `learner` role. There is no adult-session impersonation.
6. Availability first validates Jordan's exact canonical Class Course Attempt. It returns an unavailable state when published/form/grant requirements are not met. It does not publish drafts, self-issue grants, fabricate item answer keys, or score unreviewed short-text assessments.
7. Room scheduling and classroom console controls now require the distinct existing **facilitator** grant. Direct academic teacher admission to the Class workspace does not unlock them.
8. A focused source-contract regression was added at `tests/unit/valor-v61-canonical-teacher-assessment.contract.test.ts`; it is committed, **not executed** due to lack of accessible checkout/build runtime in this session.

## Grounded synthetic classroom state

- Riley has an active approved `class_staff_assignments` row for each of Valor's 12 Classes, and a direct verified CAN Site teacher grant.
- The exact canonical teacher homework query returns 52 current submitted / returned / graded-simulation records across Valor, including 22 in Algebra I. Records keep their Course Attempt and Class links.
- The 12 formative assessments, forms and administrations remain `draft`. There are **zero** learner access grants for those drafts and **zero** live Class assessment administrations. This is the correct blocked state until the independent publisher/provider review pipeline is used.
- Riley's grading appointment is `proposed` without professional authorization; **zero** official grading decisions or official grades were issued.
- Jordan retains nine active Class Course Attempts. No Sections or Cohorts were created.

## Mandatory release acceptance

1. Run `npm run typecheck`, Class architecture checks, the focused Vitest source contract and the full build on an actual checkout. Fix every TypeScript/build error before deployment.
2. Sign in as Riley's direct CAN `teacher` account, open `/class`, and verify exactly 12 assigned Classes. Open Algebra I `?view=teach&tab=assignments` and inspect the 22 authorized review rows. Verify denial for a different Site, unassigned Class, expired assignment and a facilitator-only grant.
3. Verify Riley's `assessments` tab shows draft status rather than quiz-taking controls; no teacher grade action is offered.
4. Verify the `classroom` tab cannot start a facilitated room using the teacher grant alone. Separately verify a legitimate current facilitator remains able to use the room console.
5. Sign in as Jordan, open one of nine enrolled Classes and the `assessments` tab. Confirm the draft-only notice. Verify that `lessons`, `assignments` and student discussion tabs remain accessible.
6. On an isolated QA branch, publish a reviewed objective assessment and grant it through the governed provider mechanism, then test question navigation, draft answer persistence, submission, automatic scoring, and independent confirmation. **Do not shortcut the publisher item review, published form, or individual access grant.** Current Valor short-text draft questions are not supported by the objective-only player and should remain blocked until a separate appropriate reviewed short-response workflow is implemented or the publisher authors valid objective items.
7. Confirm external deployment is serving the newly committed source and rerun all role and privacy tests. Neither the existing Netlify build usage problem nor lack of authenticated QA can be declared resolved by the database acceptance result.

## Read-only checks

```sh
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/acceptance/check-valor-v61-full-demo-20261120.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/acceptance/check-valor-v61-student-life-20261120.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/acceptance/check-valor-v61-extended-scenarios-20261120.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/acceptance/check-valor-v61-native-teacher-knowledge-20261120.sql
```
