# CAN Algebra I: Week 1 of a full-year course (synthetic pilot)

**Status:** Complete five-day instructional unit, two existing-gradebook assessments, not yet a complete, reviewed, credit-bearing Algebra I course. Learning time: five 55-minute blocks plus differentiated practice and revisions. School review required before awarding credit.

## Learning arc

| Lesson | Key idea | Main evidence | CCSS |
|---|---|---|---|
| 1. Expressions and Equivalent Forms | Substitute, distribute and collect like terms | Exit-ticket justification of two equivalent expressions | HSA-SSE.A.1 |
| 2. Equality and Inverses | Preserve solutions with legal operations | Solve, label inverse steps and check in original equation | HSA-REI.A.1, B.3 |
| 3. Multi-Step Equations | Handle variables on both sides and no/all solutions | Classify identity and contradiction; solve multi-step examples | HSA-REI.A.1, B.3 |
| 4. Inequalities | Order reversal after multiplying/dividing by negative | Solve, check boundary, describe number-line solution set | HSA-REI.B.3, HSA-CED.A.1 |
| 5. Modeling | Translate cost constraints and integer-domain restrictions | Model school fundraiser, interpret feasible solutions | HSA-CED.A.1 |

Sources: [Common Core Algebra Reasoning with Equations and Inequalities](https://www.thecorestandards.org/Math/Content/HSA/REI/), [Creating Equations](https://www.thecorestandards.org/Math/Content/HSA/CED/), [Seeing Structure in Expressions](https://www.thecorestandards.org/Math/Content/HSA/SSE/). The listed codes are alignment targets for this unit, not an assertion that the entire high-school course is standards-complete.

## Delivery through actual CAN OS workflows

- **Student:** Open existing ValorSchool synthetic Algebra I class `/classes?section=7b6eb18e-8191-fbd5-bc2d-cd860e6b26a0&tab=lessons`. Open each Unit 1 lesson. Use the existing “Mark lesson complete” to track participation, not mastery or credit. Practice answers are self-checks; teacher scores the separately published assignments.
- **Student assignments:** Go to `/student/assignments` for `Algebra I · Unit 1 Guided Problem Set` (20 points) and `Algebra I · Unit 1 Mastery Checkpoint` (30 points). Each permits the existing text response, submission, feedback and revision flow. No new route is introduced.
- **Teacher:** Use `/teacher/gradebook?section=7b6eb18e-8191-fbd5-bc2d-cd860e6b26a0` with the existing synthetic Riley teacher account. The two assignments have standard `rubricCriteria` metadata and are scored with the existing gradebook rubric service. For formative evidence, review daily exit tickets outside the scored checkpoint and arrange reteaching where needed.
- **Registrar:** Existing course template `CAN-ALG1` retains immutable published v1; the guarded upgrade publishes course v2 containing the original four preview lessons and five new full-length instructional lessons. Marketplace pack v2 retains all 32 course items, with Algebra I pointing to v2. Explicitly repoint only the existing synthetic class to v2; copy v1 `lesson_progress` rows so previous completions remain visible. Other sections remain on prior versions.

## Teacher facilitation and quality gates

Prior to lesson one, administer a short arithmetic/pre-algebra diagnostic: evaluate -4 + 9; expand 3(x + 2); evaluate 2x + 1 at x = -3. Reteach sign rules and multiplication when responses reveal gaps.

Each day has approximately 5–6 minutes launch, 12–15 minutes teacher modeling, 10–12 guided collaboration, 15 independent practice, and a 10-minute exit/check. Provide a nonvisual number-line description and speech-friendly mathematical explanations; permit accommodations consistent with learners' support plans. Confirm worked examples and exit-ticket answer checks before use.

**Assessment and evidence:** The 20-point guided set assesses model setup, solution reasoning, checking and interpretation. The 30-point checkpoint assesses expression manipulation (5), equation reasoning (10), inequalities (10), and application/communication (5). The teacher may require revisions and reassessment; completion flags never substitute for a submitted and graded assessment.

**Content rights:** Text is original for this CAN synthetic pilot and does not copy a publisher's protected pages. External standards documents are cited, not reproduced. A teacher guide may contain answer keys, but those must remain teacher-restricted, not included in student-visible course JSON.

## Explicit release gate

This week does **not** satisfy a full-year mathematics requirement. California specifies a full course of Algebra I or equivalent rigor aligned to adopted standards for the Algebra I graduation requirement; simply completing one week or a partial semester cannot be counted as the full Algebra I course. See [California Department of Education mathematics graduation requirements](https://www.cde.ca.gov/ci/gs/hs/hsgrmath.asp) and [Algebra I FAQs](https://www.cde.ca.gov/ci/gs/hs/algebrafaq.asp). CAN must also approve scope/sequence, learning support, school grading and transcript policy, a full calendar, accommodations, and instructor qualifications before designating a course as credit-ready.

## Next small bites

Continue Week 2 on equations, formulas, quantitative relationships and review in another immutable course and pack release. Follow with 36-week scope/sequence, summative tests, review of alignment coverage and credit governance. Do not silently repoint live sections without a progress migration and a school authorization step.

**Deployment artifact:** The orphaned `scripts/seeds/valor-algebra1-week01-upgrade.sql` fixture (stale identities, not in the fixture manifest, referenced by no script or test) has been removed. The activation path is documented in `valor-algebra1-week01-activation-acceptance.md`; nothing here may be run on any live/student school organization.

## Bite 2: Structured lesson delivery and a 36-week blueprint

- `curriculum/can-high-school-core/algebra1/yearlong-blueprint.json` describes a **provisional** 36-week, nine-unit teaching sequence, 5 planned 55-minute instructional periods per week (9,900 planned minutes, not logged attendance). It records planned assessments, standard identifiers and per-week review state. Week 1 is `authored`; Weeks 2–36 are `planned`. None is school-approved or credit-ready.
- `curriculum/can-high-school-core/algebra1/unit01-week01.json` now retains the prior plain-text lessons for compatibility and adds individually structured launch, instruction, guided practice, independent practice, exit/reflect and self-check steps. Each day has a 55-minute suggested sequence. Targets and standards are separate typed fields.
- `src/domain/class-content.ts` accepts the new typed fields alongside old courses; `/classes` renders structured step cards for updated published lessons, otherwise existing text. The class overview renders the 36-week plan only when the course release includes it; planned weeks do **not** become available classes or claim instructional completion.
- The guarded v2 SQL deployment asset includes the roadmap and structured activities. This does not change the source v1 published course. The current synthetic ValorSchool classroom remains on v1 until the verified upgrade is activated; merging this code alone is not equivalent to live student/teacher acceptance.
- **Review gates:** curriculum-authoring schema validates nonempty activities and ID uniqueness; `yearlongCourseBlueprintSchema` rejects holes, duplicate weeks and premature credit-ready status. Tests check 36-week totals, every lesson's structured steps and correct rubric point totals.

**Design decision for future bites:** Do not create an immutable course-and-marketplace release for every new week. Introduce separately versioned, teacher-reviewed instructional units with explicit section adoption, maintaining stable section course IDs, then verify grade/progress continuity in an integration test before enabling that workflow for a live school.

## Bite 3: Teacher-restricted classroom guides

- `curriculum/can-high-school-core/algebra1/unit01-teacher-guide.json` contains lesson-by-lesson worked solutions, anticipated misconceptions, interventions, extensions and scoring evidence for the Week 1 guided problem set and mastery checkpoint.
- `curriculum.teacherGuides` is a separate **teacher-only** property attached to a published course version, never a field under `curriculum.learning`. The class server returns it only for a currently assigned teacher. The `/classes` **Teacher guide** tab is absent from student and guardian navigation and cannot render answers for those roles.
- The server cross-checks the guide's course code, unit IDs and lesson IDs against the currently pinned published class release before returning the guide. Integration tests use real class, enrollment, guardian and teacher assignment tables inside a rollback transaction.
- The guide is **draft**, not educator- or school-approved. It does not confer credit, a mastery determination or standardized assessment certification.
- The teacher guide is added to the **guarded synthetic Algebra I v2 upgrade SQL**. Because that database update has not yet been accepted, Week 1 content and private teacher keys will not appear in the live ValorSchool demonstration class merely by merging this PR.
- Future full-year unit releases should hold teacher guides independently of student-facing units and require authorized review. The current v2 fixture is a compatibility bridge, not the final unit-versioning design.

**Confidentiality limitation:** The Week 1 demonstration answer guide and guarded fixture SQL are checked into the repository. Role-based restrictions protect the *application response*, but cannot keep those demonstration answers secret from anyone with repository access. **Do not use the public/demo checkpoint as a secure live exam.** Before issuing credit-bearing assessments, store protected answer keys in access-controlled content storage (or a permissioned publisher database) and release them only to authorized graders. The existing demo is for verifying teaching workflows, not assessment secrecy.
