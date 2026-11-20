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
