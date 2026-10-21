# Algebra I Week 2: Independent unit foundation

**Status:** Architecture and five-day planning foundation. Week 2 instruction is NOT published to students and does not confer academic credit.

## What changed
- `curriculum_unit_versions`: one organization-owned draft/reviewed/published unit version per base course version and unit key. A published release retains its lesson/module content and teacher guide unchanged.
- `section_unit_adoptions`: explicitly pins a published, school-approved unit to one existing section, optionally with a future `available_at`. It does **not** change `sections.course_template_version_id`, the marketplace pack or existing grades.
- Server commands: institutional registrar creates/saves drafts and publishes after review; an *assigned class teacher* independently reviews instructional content and a complete teacher guide; registrar then explicitly pins the release to a same-program/site class.
- Existing `/classes` renders only available, pinned unit lessons and only returns adopted-unit guide answers for an assigned teacher. Student lesson progress remains under the original pinned course-version identity; Week 1 records do not need copying.
- Version collisions (lesson, module, activity IDs, duplicated teacher units), mismatched course ownership, wrong review status, stale revisions and attempts to silently repoint existing adopted units are rejected.

## Week 2 learning sequence
`curriculum/can-high-school-core/algebra1/week02-development-plan.json` plans:
1. Multi-step equations with fractional coefficients
2. Rearranging literal formulas and quantity units
3. Variables on both sides and denominator clearing
4. Applied multi-step equations with contextual constraints
5. Transfer assessment, targeted feedback and reteaching

Five 55-minute teaching days are *planned*, not evidence of actual instructional hours. Formative problem set: planned 20 points. Checkpoint: planned 30 points. Answers, accessible student activities, teacher key and rubrics still require full authoring and qualified educator review. The yearlong roadmap remains **not credit-ready**.

## Release controls and verification
- Canonical generated Drizzle migration: `drizzle/0027_big_lady_deathstrike.sql`; migration journal and snapshot committed. New tables were applied and tracked on **Neon test01**, not on production. Existing production data is unchanged by this PR.
- Automated CI exercises build, TypeScript, Vitest and migration-drift parity; `tests/unit/class-unit-releases.test.ts` covers progress retention, unit review gate, schedule hiding, collisions and teacher-guide separation.
- **Deployment requirement:** apply committed database migrations in the target environment *before* deploying code that queries `section_unit_adoptions`. The new class loader requires the table even when no units have been adopted. Deploying code first will break class loading.
- Do not publish Week 2 merely from this planning file. Author it as a draft release through the existing authenticated unit commands, obtain assigned teacher review and explicit school approval, then adopt it to the class.
- A complete browser and actor-session acceptance is not claimed; per user direction, browser acceptance is skipped.

## Explicit boundaries
- No changes to production section/course/pack pointers.
- No synthetic student records or scores inserted here.
- Review states reflect workflow controls, not accreditation, course credit, legal qualification or UC A-G approval.
- Future bite: teacher-friendly Unit Studio form and publishing UI, rather than treating developer JSON or API commands as the primary authoring surface.
