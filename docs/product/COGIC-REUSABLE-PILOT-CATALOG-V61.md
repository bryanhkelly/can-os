# Reusable training pilots: Program → Solution Blueprint → Offering (V6.1)

**Branch:** `feature/launch-studio-v61-clean-cutover-20261118`  
**Database:** Neon `can-os`, canonical `public.*` (not `education_v30.*` writes).  
**Source state:** configured, draft learning products; not partner-authorized, not enrollable, not live-accepted.

## Canonical hierarchy

| Intent in Establish | Blueprint/Solution in Prepare | Offering in Prepare and Open | Course |
| --- | --- | --- | --- |
| `can.program.custom_training`: **Custom Training Pilot** | `can.pilot.custom-training.one-hour` (published planning model) | `CLC-CUSTOM-TRAINING-01` (draft) | `CLC-CUSTOM-TRAINING-01` (draft; 7 ordered segments) |
| `can.program.ai_digital_skills`: **AI & Digital Skills Pilot** | `can.pilot.ai-digital-skills.four-session` (published planning model) | `CLC-DIGITAL-01` (draft) | `CLC-AI-DIGITAL-01` (draft; 4 sessions) |

These reusable generic names intentionally do not hardcode COGIC or a denomination. The pilot can be deployed to an authorized COGIC Organization/Site only after independent governing approvals.

**Program / intent** uses the existing versioned, published `public.blueprint_reference_items` and `public.blueprint_reference_item_versions` (kind `program_model`). This is an instructional *intent model*, not an instantiated `public.programs` row. An instantiated school Program requires institutional jurisdiction and actual Site authorization. Do not make one simply to display a Site's intentions.

**Site preference** is `public.sites.metadata.launchPreferences.programCodes` with optional `startingProgramCode`, part of the same revision-checked Site preferences already used in Establish. It neither duplicates the catalog nor creates an approved Offering, Course, Class or enrollment. The server checks active/published catalog codes under the existing program-catalog authority.

**Solution** uses canonical `public.blueprints`, `blueprint_versions`, `blueprint_components`. Only published recipe versions are shown in Prepare. Published recipe `spec.programCode` and `spec.offeringCode` link to the reusable reference and Offering catalog. The Site-facing service returns just these two safe associations, never the entire internal Blueprint spec. An exact Program code match ranks above lexical interest matches.

**Offering** uses canonical `public.offerings`, `offering_versions`, `offering_courses` and `course_versions`. These are intentionally **draft**. Actual publication requires independent academic/content review, approved media/assessment rights, applicable Site/Operation grants, controlled adoption, and a separate enrollment release. The draft Offering must never show as open or enrollable.

## Content and operating model

### Custom Training (adult, private, recorded)

- Seven segments: 5-minute organization-leader introduction; five independently created 10-minute instructional modules; 5-minute leader closing.
- Course is a reusable template with placeholder media. Real partner intro/outro and instructional media require rights and review.
- Independent five-question published knowledge check, five-question feedback survey, Course-bound grant, completion policy and Site-specific consent-enabled noncredit registration are required before opening.
- Phase 1 should not depend on Classroom Connect.

### AI & Digital Skills (facilitated, four sessions)

- Existing four-session draft Course preserved: ask better questions; verify before you trust; protect digital identity; responsible AI project.
- Published Solution recipe requires local facilitator, four dated meetings, Site equipment/bandwidth and safety evidence, knowledge check and feedback.
- Session date cadence is flexible: Monday–Thursday, twice weekly, weekly, or holiday-interrupted over five+ weeks. No fixed schedule is stored in the Program intent.
- Where minors participate, verified guardian permission, qualified supervision and the church-hosted safeguarding gates are required. Do not infer eligibility from a Site audience preference.
- No national operating grant or cross-organization reporting is synthesized from a COGIC affiliation.

## Application behavior

1. **Establish → Programs & Audiences:** read published `program_model` references via `exploreBlueprintReferenceCatalog`; save codes and starting Program under Site revision/authority checks. Legacy learning-interest codes stay readable.
2. **Prepare → Program Catalog:** read current published Blueprint recipes and their exact `programCode`. Suggested recipes matching saved Program codes appear first. Show a linked Offering code as an association, not product availability or authorization.
3. **Prepare → Configure:** use existing versioned Blueprint configuration/review, canonical Course/Offering product and Site qualification workflows. Do not create a second authoring pipeline.
4. **Open → Enable Enrollment:** continue to the existing authorized noncredit release and native Class operator journeys, preserving exact Site, adoption, capacity and consent gates. Current draft products will not appear in published-only enrollment catalogs.

## Verified persisted baseline

At inspection after additive SQL insertion in Neon main:
- two Program reference entries, each with immutable published v1 and a published v2 using the requested *Pilot* display name;
- two published Solution/Blueprint recipe versions;
- two **draft** Offering versions;
- Custom Training Course draft with seven lesson rows;
- AI & Digital Skills Course draft with four distinct lessons; previous content was not replaced;
- no new Site approval, publisher review, enrollment release or class schedule created.

The additive, re-runnable source is `database/seeds/2026-11-cogic-reusable-pilot-catalog.sql`. It references the existing **CAN Community Learning Center (Demo)** publisher. Do not confuse this with partner authorization or use synthetic records as authentic learners.

## Still required for pilot acceptance

- Replace placeholders with reviewed, licensed teaching content; publish and scope real knowledge checks, surveys, Course and Offering versions through authorized services.
- Confirm publisher identity and organizational rights instead of automatically approving draft rows.
- Resolve the canonical `public` schema cutover and restricted app-role grants; a migrated TypeScript mapping does not establish deployment parity.
- Authenticate and test one adult Phase 1 journey (same account, resume, assessment, feedback, independent completion, private reporting).
- Test two independently authorized Site/Organization Phase 2 journeys (four dated sessions each, pairing, no-device facilitator attestation, corrections, completion, operator reporting).
- Obtain separate national/portfolio delegation and disclosure review before publishing a COGIC-wide report.
- Verify a clean candidate branch build, typecheck, unit tests, role-denial tests and authenticated browser acceptance on the exact SHA.

## Current database authorization blocker

**Verified on Neon `main` during this review:** `pg_roles` contains **zero** `can_v30_program_catalog_%` and `can_v30_blueprint_%` roles; `public.database_role_organization_bindings` has **zero** active, approved bindings for program-catalog and Blueprint author/reviewer purposes. `public.sites` enforces RLS and currently exposes only the restrictive `sites_no_direct_client_access` policy, not the required scoped catalog-operator read policy. The published records exist, but the authenticated Establish catalog and Prepare Solution screens **will fail closed** until Site RLS and purpose-bound roles are independently reviewed and provisioned.

Do **not** bypass Site RLS, grant access to anonymous clients, log in as database owner, or grant an unscoped application role. Follow reviewed `database/canonical/v3.0.1/provision-program-catalog-role.sql` and `provision-blueprint-roles.sql` only **after** their RLS policy preconditions, restricted principals, and privilege reviews pass on a disposable test branch. Do not treat role provisioning or migration as part of the reusable content seed.

**No build, UI session, or real partner-delivery acceptance is claimed by this record.**


## 2026-11-20 delivery preparation update

Implementation now uses **one canonical Program → Solution → Offering → Course delivery chain**, not a parallel pilot-specific enrollment system.

- The published Site Blueprint recipe continues to link the exact reusable Program and Offering codes. The established Program codes live in Site metadata only. Selecting a Program, opening a Solution, or even saving a Blueprint plan does **not** publish or register any learner.
- `src/domain/program-offering-journey-v61.ts` projects authorized results into existing Prepare/Open readiness panels without writing another record. The provider publisher now includes the actual Offering code, so the launch handoff filters to the exact authorized product and Site instead of title matching. A scoped URL is a hint, never approval.
- The facilitator workspace accepts a Site-scoped URL and filters Course choices, rehearsal previews, meeting scheduler and visible rooms to that Site. Server-side facilitator and enrollment authorization still owns all commands.
- Existing four-Class scheduling, learner-facing dated Class linking, facilitator attendance, provider reports, lesson completion and Class delivery mechanisms are reused. UI copy now uses **Course registration** and **Classes** rather than introducing new cohort/section workflows.

The additive guarded seed `database/seeds/2026-11-cogic-pilot-draft-delivery.sql` was run against the disposable Neon validation branch and then Neon `main`. The same script was re-run on validation and produced no duplicates. Its canonical records:

| Record | Custom Training | AI & Digital Skills |
| --- | --- | --- |
| Offering | Draft `CLC-CUSTOM-TRAINING-01` | Draft `CLC-DIGITAL-01` |
| Course | Draft, 7 lesson segments | Draft, 4 lessons |
| Noncredit training version | Draft, 60 planned minutes | Draft, 0 approved minutes pending real dates/content |
| Knowledge-check form | Five draft, unreviewed short-answer questions | Five draft, unreviewed short-answer questions |
| Feedback instrument | Five draft questions | Five draft questions |
| Training assessment linkage | Draft assessment version | Draft assessment version |
| Registered learners, attendance and completion | None created | None created |

All check prompts and survey instruments are labeled draft and require actual instructor and privacy review. The seed author is the **existing synthetic CAN Demo Administrator** strictly for test provenance, not a COGIC content author or reviewer. No published survey campaigns, real COGIC participation, approved media, consent, signed provider decisions, Site grants, scheduled pilot meetings or enrollment releases have been fabricated.

**Database acceptance:** `scripts/sql/canonical-v301/cogic-reusable-pilot-draft-acceptance.sql` passed against both Neon `main` and the disposable V6.1 validation branch. The checked outcome was two draft training versions, exactly five draft knowledge-check questions and five draft feedback questions for each, and the previously expected seven/four Course lesson counts. There are **zero** published enrollment releases. This does not constitute a browser/player/assessment/completion acceptance test. Unit coverage is added in `tests/unit/program-offering-journey-v61.test.ts`, but a successful TypeScript/build/CI run is **not** verified.

### Remaining gates before the requested two end-to-end pilot acceptances

1. **Phase 1:** Obtain approved leader intro/outro and training module media; independently review/publish the Course, Offering, knowledge-check form, consent, survey instrument/campaign, completion policy, and actual provider Site/Deployment authority. Then run one adult self-registration, lesson progress, five-question check, feedback invitation and independently governed completion/reporting journey.
2. **Phase 2:** Obtain approved AI/Digital Skills teaching media and qualified facilitator(s), approved participant safeguards (particularly if minors), actual operator Site/Deployment rights and a published Course/Offering. Then schedule and attach four dated Classes at **each of two real authorized Sites**, and verify registered learner attendance, homework/activity records, assessments, feedback, corrections and Site/provider reporting. The four dates may be nonconsecutive; never infer presence from QR pairing.
3. **Network:** Independently operated COGIC churches require explicit cross-Organization delegation and publication-safe disclosure decisions before national network rollup.
4. **Release:** Finish production database migrations, scoped DB roles, exact-SHA build/TypeScript/role-denial tests and authenticated browser acceptance. Do not equate Neon draft setup with operational enrollment activation.
