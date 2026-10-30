# Curriculum ownership and classroom delivery (CAN-OS)

**Locked model**: A publisher creates and versions the curriculum. A school/organization accepts a licensed curriculum pack and chooses an approved course release. The *assigned class teacher* implements the course, adds classroom resources, and creates assignments (homework, classwork, quizzes, tests, projects or graded discussion tasks). Publisher, organization, and teacher may all supply supplemental materials, each with ownership, scope, attribution, and permissions.

## Corrected interaction

1. **Publisher curriculum** — `course_templates`, `course_template_versions.curriculum.learning.modules`, publisher `curriculum_resources` and `curriculum_resource_bindings`. Units and weeks are just nested parts of the curriculum. Publisher edits take place in draft and produce controlled **course releases**, not per-class weekly adoptions.
2. **Organization selection** — `curriculum_entitlements` and `curriculum_adoptions` confirm the license and the chosen pack release. Organization/site additions use `curriculum_overlays` and never edit the publisher-owned course. Legacy institutional self-authoring is permitted only where the organization is actually the curriculum owner.
   - The **publisher** must hold an explicit institutional `curriculum.publish` grant to author, publish or stage imported materials.
   - The **school registrar** may use a distinct explicit institutional `curriculum.adopt` grant to discover, install, adopt, and supplement another publisher's curriculum. School adoption does not grant the publisher's editing rights. Existing scoped publisher memberships retain the marketplace capability for backward compatibility.
   - The Marketplace program picker uses scoped adopter authority, not publisher-only program discovery. Import panels and publisher authoring remain hidden or inaccessible to adopter-only users.
3. **Class delivery** — The current section pins its accepted `course_template_version_id`. `getClassWorkspace` and lesson-completion validation read published lessons directly from this release. **No class-unit-adoption lookup** or teacher approval of each publisher week is required.
4. **Teacher resources** — An assigned teacher can attach an external HTTPS resource to their actual section, optionally to a publisher lesson. A new `curriculum_resource` and section-scoped `curriculum_overlay` reference it with the teacher's person ID and source. This does not modify a publisher release or extend other classes.
5. **Teacher assignments** — Existing gradebook `assessments` can be typed as homework, classwork, quiz, test, project, or graded discussion task and optionally reference a lesson in that pinned publisher course. This link is stored in `assessments.metadata` (with publisher course version ID); it does not modify lesson content. An actual discussion forum continues through the existing discussions module; `discussion` here identifies the assessed work type, not a forum thread.

## Week 2

When a publisher includes Week 2 in the adopted release, it is part of the course sequence already. When building a future release, the publisher adds Week 2 to that draft and publishes a **controlled course version**; the organization selects the course release when appropriate, typically before a new academic term. Week-by-week adoption, teacher-reviewed unit publication, and automatic mid-semester switches are not normal classroom operations. Midyear upgrades and version-based progress migration are deferred edge cases. Teacher pacing, assignments, and supplements remain independent.

The `curriculum_unit_versions` and `section_unit_adoptions` tables introduced in PR #140 are **retained in the migration history for backward compatibility but are not used by live class delivery or exposed through mutable APIs**. Their data is not deleted; any later publisher-internal incremental editing feature should be designed separately and must never change classroom adoption semantics.

## Verification and remaining product work

- Verify existing Week 1 Algebra I section and lesson IDs, published course version, progress and teacher guides remain unchanged.
- Test that students/guardians cannot add classroom supplements, unrelated teachers cannot add them to a class, invalid lesson references are rejected, and the overlay remains scoped to the correct section.
- Test that a teacher can link work only to a lesson from the *same current published course version*, and the assessment remains teacher-owned classroom work.
- Existing organization marketplace supplements and publisher resource bindings remain untouched. Teacher external-link resources are a first step; classroom PDF upload via private storage requires a separate authorization expansion, not an unsafe file-upload bypass.
- Structured curriculum metadata (unit/week IDs and learning targets) and assignment-to-standard links can be added within the same three-layer model without expanding adoption gates.
- **Credit readiness is not inferred** from authored weeks, assignments, lesson completion, or a publisher label. CAN retains separate school approval and transcript/graduation governance.

Browser acceptance remains skipped at the user's direction. CI is not a substitute for signed-in browser acceptance.
