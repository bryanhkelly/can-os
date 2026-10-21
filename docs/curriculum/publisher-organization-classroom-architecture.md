# Curriculum ownership and classroom delivery (CAN-OS)

**Locked model**: A publisher creates and versions the curriculum. A school/organization accepts a licensed curriculum pack and chooses an approved course release. The *assigned class teacher* implements the course, adds classroom resources, and creates assignments (homework, classwork, quizzes, tests, projects or graded discussion tasks). Publisher, organization, and teacher may all supply supplemental materials, each with ownership, scope, attribution, and permissions.

## Corrected interaction

1. **Publisher curriculum** — `course_templates`, `course_template_versions.curriculum.learning.modules`, publisher `curriculum_resources` and `curriculum_resource_bindings`. Units and weeks are just nested parts of the curriculum. Publisher edits take place in draft and produce controlled **course releases**, not per-class weekly adoptions.
2. **Organization selection** — `curriculum_entitlements` and `curriculum_adoptions` confirm the license and the chosen pack release. Organization/site additions use `curriculum_overlays` and never edit the publisher-owned course. Legacy institutional self-authoring is permitted only where the organization is actually the curriculum owner.
3. **Class delivery** — The current section pins its accepted `course_template_version_id`. `getClassWorkspace` and lesson-completion validation read published lessons directly from this release. **No class-unit-adoption lookup** or teacher approval of each publisher week is required.
4. **Teacher resources** — An assigned teacher can attach an external HTTPS resource to their actual section, optionally to a publisher lesson. A new `curriculum_resource` and section-scoped `curriculum_overlay` reference it with the teacher's person ID and source. This does not modify a publisher release or extend other classes.
5. **Teacher assignments** — Existing gradebook `assessments` can be typed as homework, classwork, quiz, test, project, or graded discussion task and optionally reference a lesson in that pinned publisher course. This link is stored in `assessments.metadata` (with publisher course version ID); it does not modify lesson content. An actual discussion forum continues through the existing discussions module; `discussion` here identifies the assessed work type, not a forum thread.

## Week 2

When a publisher includes Week 2 in the original release, it is already available in the course sequence. When a publisher adds Week 2 while developing a new course, it is part of the publisher's **next controlled course version**. The school can choose when to adopt that new version through the normal program/course selection and rollout process. There is no special per-week approval, class adoption, or teacher-reviewed unit publication requirement. Teacher controls for classroom pacing and assignment scheduling are separate.

The `curriculum_unit_versions` and `section_unit_adoptions` tables introduced in PR #140 are **retained in the migration history for backward compatibility but are not used by live class delivery or exposed through mutable APIs**. Their data is not deleted; any later publisher-internal incremental editing feature should be designed separately and must never change classroom adoption semantics.

## Verification and remaining product work

- Verify existing Week 1 Algebra I section and lesson IDs, published course version, progress and teacher guides remain unchanged.
- Test that students/guardians cannot add classroom supplements, unrelated teachers cannot add them to a class, invalid lesson references are rejected, and the overlay remains scoped to the correct section.
- Test that a teacher can link work only to a lesson from the *same current published course version*, and the assessment remains teacher-owned classroom work.
- Existing organization marketplace supplements and publisher resource bindings remain untouched. Teacher external-link resources are a first step; classroom PDF upload via private storage requires a separate authorization expansion, not an unsafe file-upload bypass.
- Structured curriculum metadata (unit/week IDs and learning targets) and assignment-to-standard links can be added within the same three-layer model without expanding adoption gates.
- **Credit readiness is not inferred** from authored weeks, assignments, lesson completion, or a publisher label. CAN retains separate school approval and transcript/graduation governance.

Browser acceptance remains skipped at the user's direction. CI is not a substitute for signed-in browser acceptance.
