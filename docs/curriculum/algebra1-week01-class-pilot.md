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

**Deployment artifact:** `scripts/seeds/valor-algebra1-week01-upgrade.sql` uses guarded, atomic transactions and targets only the existing synthetic ValorSchool Algebra I class. It must not be run on any live/student school organization.
