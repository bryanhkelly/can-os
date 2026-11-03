# CAN OS demonstration curriculum factory

Generates **120 original synthetic course entries**, including **15 deeper product walkthroughs** (20 illustrative lessons each) and **105 preview courses** (one lesson each). The content is a demonstration artifact, not a credited or academically reviewed curriculum. Demo jurisdiction review records use `under_review` for the eight explicitly configured demo states. They are synthetic workflow fixtures, not academic approvals, external government authorization, or accreditation. No external third-party texts are embedded, so importing it does not assert rights over OER.

## Generate

```bash
node scripts/demo-curriculum-factory.mjs --output /tmp/can-demo-catalog.json --deep 15
```

Output is deterministic and carries an explicit provenance record. The deeper examples show modules, activities, practice and formative evidence, but do not represent a reviewed four-week scope and sequence.

## Import

Use an **isolated Neon database branch** and a dedicated organization named **CAN Demo Publisher** (slug `can-demo-publisher`, type `other_partner`, metadata `demoPublisher: true`, `isSynthetic: true`). The importer rejects any other publisher. Create this organization in the target database before importing. The validation Neon branch already contains it, with UUID `3340246a-4e2d-46cf-aa79-0adaa9feb2c8`.

```bash
DATABASE_URL="<branch-specific connection string>" \
  node --import tsx scripts/import-demo-curriculum.mjs \
  --file /tmp/can-demo-catalog.json \
  --publisher "<can-demo-publisher-uuid>"
```

This is a dry run. To load drafts, set `DEMO_CURRICULUM_ALLOW_WRITE=1`, `DEMO_CURRICULUM_DATABASE_CONFIRMED=neondb`, `DEMO_CURRICULUM_EXPECTED_HOST=<isolated-branch-hostname>`, and `DEMO_CURRICULUM_EXPECTED_BRANCH_ID=<isolated-Neon-branch-ID>`, then add `--apply`. Never point the command at a live production database without deliberately reviewing the target and publisher. The importer verifies course content with the existing Zod schema and wraps all records in one transaction. Re-runs with identical input are idempotent by SHA-256 digest and course code. Different input refreshes importer-owned draft versions while leaving published versions immutable.

**No implicit publication or school adoption.** The importer does not create student records, entitlements, enrollments, teacher answer guides, or assignment submissions.

## Identified integration gaps

1. **Marketplace visibility:** the pack is deliberately private/draft. The existing store needs a publisher-authorized demo-preview path before ordinary visitors can browse it.
2. **Jurisdiction approval:** all 120 demo course versions must receive `under_review` synthetic records for the eight configured demonstration states, using the standard version-and-jurisdiction approval mechanism. On a new jurisdiction being added, demo approval coverage must be reconciled. This approval must not imply external authorization or credit recognition. The current importer does not yet create these approval records.
3. **Assignments:** generated student activities are not section-specific gradebook assessments. A separate, idempotent publisher-assessment-template-to-section materialization flow remains necessary.
4. **Teacher guides:** demos currently do not include answer keys; add teacher-only guides via the restricted existing `teacherGuides` field before claiming a complete classroom workflow.
5. **Source ingestion:** this generator authors new, synthetic demos. Importing third-party OER requires item-level rights, attributions, editions and compatibility review.
6. **Deep-course quality:** the 15 deeper demos are 20-day scripted product examples, not academically reviewed instructional sequences.
7. **Target protection:** dry-run and explicit write opt-in are provided, but a further production-target allowlist would be needed for unattended automation.

The current scope intentionally favors safe, deterministic marketplace data over synthetic grades or live-school contamination.

## CAN-managed demo teacher marketplace (PR #240 extension)

The CAN Academy model is **centrally onboarded instructors**: CAN recruits,
screens and onboards teachers before schools can select them. Schools select
curriculum while setting up, then directly decide which onboarded teachers to
engage. A course-level choice applies to its active Sections, with an explicit
section-level override. The school remains the staffing decision-maker;
qualification policy and institutional authority are enforced by the existing
launch assignment command.

### Generate 30 teacher profiles connected to all 120 demo courses

```bash
node scripts/demo-curriculum-factory.mjs --output /tmp/can-demo-catalog.json --deep 15
node scripts/demo-teacher-marketplace-factory.mjs \
  --catalog /tmp/can-demo-catalog.json --output /tmp/can-demo-teachers.json
```

The teacher fixture is deterministic, with **30 invented identities, 240
course-to-instructor capabilities (two per course), and 15 proposed class
staffing examples** for featured courses. Subject matches are synthetic
demonstration recommendations, **not** validated qualifications. Teacher
contact addresses use the reserved `example.invalid` domain. Illustrative
weekly schedules include weekend/Sunday options where applicable.

### Inspect and optionally load on an isolated Neon branch

Import the curriculum pack first, then generate the teacher fixture. The
`scripts/import-demo-teachers.mjs` loader requires that the existing canonical
CAN Demo Publisher own all 120 matching course templates. It creates the
dedicated `CAN Demo Teaching Provider` organization as a synthetic
`other_partner` only on an explicitly guarded write. This is the **single
canonical marker** used to identify demo teachers: membership in the provider
organization with metadata `demoProvider:true, isSynthetic:true`.
The synthetic person fixture key is only for repeatable imports, not a
separate teacher marketplace demo flag.

```bash
DATABASE_URL="<isolated-branch-url>" node scripts/import-demo-teachers.mjs \
  --catalog /tmp/can-demo-catalog.json --teachers /tmp/can-demo-teachers.json
```

The default run is read-only. For an intentionally isolated Neon validation
branch only, set each of these to *actual verified values* and append `--apply`:

```bash
DEMO_TEACHERS_ALLOW_WRITE=1
DEMO_TEACHERS_DATABASE_CONFIRMED="<value returned by SELECT current_database()>"
DEMO_TEACHERS_HOST_CONFIRMED="<isolated branch database hostname>"
CAN_APPLICATION_DB_HOST="<production database hostname, different from branch>"
```

The loader checks the actual database name and connection hostname,
and refuses writes to the declared production database host. Never deploy
those write opt-ins to the application. Its transaction creates person
records, provider memberships, course-specific `instructor_capabilities`,
`instructor_availability_windows` and illustrative
`instructional_capacity_offerings` using existing schema. Re-running an
identical manifest reuses fixture records rather than creating duplicates.
No access accounts, teacher role assignments, approved credential claims,
reservations, delivery arrangements, canonical Sections or `section_teachers`
are created. The 15 class matches remain planning examples until a separate
authorized school staffing flow explicitly provisions and assigns them.

### Teacher discovery in the standard marketplace

There is no demo application mode or separate demo-only teacher route.
The regular school staffing entry point is
`/operations/teacher-marketplace?programId=<school-program-uuid>`.
The same authenticated registrar and curricular adoption authorization
applies to real and sample records. There are no runtime
`CAN_DEMO_TEACHER_PREVIEW_ENABLED` or `CAN_DEMO_ISOLATED_ENV` switches.

For adopted, entitled published courses, the service looks up actual teacher
capabilities, current offerings, availability and provider memberships.
Normal instructors belong to the school's academic provider organization.
Synthetic instructors are discovered from the sample teaching-provider
membership (`isSynthetic:true, demoProvider:true`), only for sample
course templates. Each sample is visibly labeled, not treated as verified.
A curriculum draft is not available for school teacher selection until
its normal publication and adoption workflow is completed.

The school administrator directly engages an onboarded provider teacher
across all active Sections for a course or for one selected Section. The
engagement uses the existing launch assignment command, which rechecks the
school's published qualification policy, program scope and operating-service
authority in the same transaction. Sample profiles and preview-only offerings
are not assignable.

### Remaining product work (not claimed by this PR)

- Implement CAN's real teacher onboarding, verified credential/contract status
  and CAN-only marketplace publishing.
- Provision 15 *actual* sample sections using existing school years, terms,
  program authorizations and curriculum entitlements after the guarded demo
  publication path exists; do not insert unattached `section_teachers` rows.
- Run the teacher import on isolated Neon and exercise the authenticated
  marketplace and school staffing journeys. Until then code is not database-
  or browser-accepted.

## November 2 — Post-setup school teacher selection

Administrators configure schools and adopt curriculum first, then use
the same CAN teacher marketplace to choose instructors. No special demo
launch flag, UI pathway or alternative application tables are required.

`getTeacherMarketplace` lists onboarded provider teachers and explicitly
labeled synthetic preview profiles matched to the selected authorized school,
adopted curriculum and provider affiliation. A school registrar may engage a
real candidate across compatible active Sections or narrow the choice to one
Section. Each Section needs an open instructional-capacity demand. Discovery
shows real candidates only where published teaching eligibility, offering
scope, availability, full enrollment capacity and recurring schedule
compatibility pass. Schedule conflicts are compared across schools using each
school year's timezone. Engagement rechecks those conditions in one
transaction, commits the capacity reservation, links it to the active delivery
arrangement, and records capacity and assignment audit/event evidence.
Course-wide engagement applies only to compatible Sections; a selected-class
engagement fails explicitly if that class is no longer compatible. CAN does
not review or approve the school's selection. Synthetic preview profiles
remain visible but cannot be engaged.

The dedicated synthetic generator, optional seeding command and guarded
Neon loader are developer/data-operations utilities only. They are not
required by application startup, school launch or instructor selection.

### Data generation and import (optional development operations)

No `run demo` command is needed by the application. The factory and importer
scripts are optional maintenance tools for building, validating and loading
synthetic data into an isolated Neon development branch. The application
uses its normal database tables and marketplace workflows after loading.

Generate curriculum and matching teacher records with
`scripts/demo-curriculum-factory.mjs` and
`scripts/demo-teacher-marketplace-factory.mjs`. Import drafts with
`scripts/import-demo-curriculum.mjs` and then
`scripts/import-demo-teachers.mjs`; both require their documented write
confirmations. Draft content must pass normal publication and school
adoption to become selectable. Importing does not create instructor
permissions, class assignments or real qualifications.
The curriculum loader reuses only private packs explicitly marked as
importer-owned and updates one importer-owned draft in place. It refuses
unmarked packs, published packs, and ambiguous or user-owned drafts instead
of modifying released content or adding another draft.

**Observed data state, November 2, 2026:** The isolated Neon validation
branch contains 120 draft courses (15 with 20 lessons and 105 with one),
30 sample teachers, 240 course capabilities, 30 availability windows,
and 240 preview-only capacity offerings. No operational assignments or
published demo curriculum were created. The records were loaded using
branch-checked SQL, with seed-specific hashes; a subsequent importer
run should reconcile those hashes before applying another draft.
