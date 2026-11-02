# CAN OS demonstration curriculum factory

Generates **120 original synthetic course entries**, including **15 deeper product walkthroughs** (20 illustrative lessons each) and **105 preview courses** (one lesson each). The content is a demonstration artifact, not a credited or academically reviewed curriculum. Demo academic approval status is intentionally `approved` for every supported jurisdiction in the demo environment; this is simulated internal approval, never a claim of external government approval or accreditation. No external third-party texts are embedded, so importing it does not assert rights over OER.

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

This is a dry run. To load drafts, set `DEMO_CURRICULUM_ALLOW_WRITE=1` and add `--apply`. Never point the command at a live production database without deliberately reviewing the target and publisher. The importer verifies course content with the existing Zod schema and wraps all records in one transaction. Re-runs with identical input are idempotent by SHA-256 digest and course code. Different input creates new draft versions rather than rewriting published versions.

**No implicit publication or school adoption.** The importer does not create student records, entitlements, enrollments, teacher answer guides, or assignment submissions.

## Identified integration gaps

1. **Marketplace visibility:** the pack is deliberately private/draft. The existing store needs a publisher-authorized demo-preview path before ordinary visitors can browse it.
2. **Jurisdiction approval:** all 120 demo course versions must receive `approved` internal academic status for every jurisdiction supported by CAN OS, using the standard version-and-jurisdiction approval mechanism. On a new jurisdiction being added, demo approval coverage must be reconciled. This approval must not imply external authorization or credit recognition. The current importer does not yet create these approval records.
3. **Assignments:** generated student activities are not section-specific gradebook assessments. A separate, idempotent publisher-assessment-template-to-section materialization flow remains necessary.
4. **Teacher guides:** demos currently do not include answer keys; add teacher-only guides via the restricted existing `teacherGuides` field before claiming a complete classroom workflow.
5. **Source ingestion:** this generator authors new, synthetic demos. Importing third-party OER requires item-level rights, attributions, editions and compatibility review.
6. **Deep-course quality:** the 15 deeper demos are 20-day scripted product examples, not academically reviewed instructional sequences.
7. **Target protection:** dry-run and explicit write opt-in are provided, but a further production-target allowlist would be needed for unattended automation.

The current scope intentionally favors safe, deterministic marketplace data over synthetic grades or live-school contamination.

## CAN-managed demo teacher marketplace (PR #240 extension)

The CAN Academy model is **centrally procured instructors**: CAN recruits,
screens, onboards and governs teachers before churches can select them. Churches
select curriculum while setting up a school, then choose from CAN-managed
teacher candidates afterward. Teachers may serve multiple church schools
through existing cross-school instructional capacity. Course-level selection
should propagate to compatible sections, with an explicit section-level
override. Real staffing supports both directly confirmed assignments and
request/acceptance when needed; qualification, capacity, agreements and
institutional authority remain mandatory.

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

### Discovery screen

The isolated demonstration screen is
`/operations/teacher-marketplace?programId=<school-program-uuid>`.
It requires a signed-in school registrar authorized to view the selected
program's curriculum and explicitly enabled isolated-demo environment flags:

```
CAN_DEMO_TEACHER_PREVIEW_ENABLED=true
CAN_DEMO_ISOLATED_ENV=true
```

Only adopted, entitled, published course versions are considered. Matching
synthetic teachers are discovered through the actual course-capability and
provider-membership links, rather than unrelated fixture JSON. Teachers are
labeled Demo and not credential verified; the screen is read-only and links to
the existing school/class staffing workflow. Ordinary production deployments
must not enable these flags. The original 120-course draft/private pack cannot
be adopted until the separate authorized demo-publication path is provided.

### Remaining product work (not claimed by this PR)

- Implement CAN's real teacher onboarding, verified credential/contract status
  and CAN-only marketplace publishing.
- Complete one-course-to-many-section selection, matching and confirmation
  with real teacher request/acceptance, cross-school scheduling conflict checks,
  compliance eligibility, and auditable capacity reservations.
- Provision 15 *actual* sample sections using existing school years, terms,
  program authorizations and curriculum entitlements after the guarded demo
  publication path exists; do not insert unattached `section_teachers` rows.
- Run the teacher import on isolated Neon and exercise the authenticated
  marketplace and school staffing journeys. Until then code is not database-
  or browser-accepted.

## November 2 — Post-setup CAN teacher selection

School administrators complete school configuration and curriculum adoption
before making staffing choices. A dedicated post-setup action in the academic
launch workspace opens `/operations/teacher-marketplace?programId=<uuid>`.
The market shows CAN-managed teachers mapped by course, with per-Section
targeting when a class already exists. Teachers can serve multiple church
schools only through independently verified scheduling, authorizations and
shared-capacity reservations.

In isolated demos, the screen also displays the dedicated publisher's latest
synthetic course drafts as **preview-only**. Draft courses and associated
teacher matches are not adopted curricula and cannot be requested or assigned.
Requests are enabled only for versions with active entitlement/adoption.
The client validates and submits the chosen teacher and optional class to
`requestDemoTeacherStaffing`. The server verifies the institutional program
scope, exact adopted course release, current demo-provider membership,
matching instructor capability, active preview offering, and class ownership
before creating an idempotent program-scoped `teacher_staffing_request`
Action with audit and domain-event evidence.

An open request appears on the school screen, but **does not** issue a
teacher credential, staffing role, delivery arrangement or `section_teachers`
assignment. Existing CAN-authorized launch staffing is still the direct
assignment/confirmation path. The CAN provider-facing review queue, real
two-sided consent and capacity booking are separately outstanding.

### One-command seed entry point

```bash
npm run demo:academic-marketplace
# Local deterministic manifests only, no connection or database write

DEMO_CURRICULUM_PUBLISHER_ID="<verified-demo-publisher-uuid>" \
DATABASE_URL="<isolated-neon-branch-url>" \
npm run demo:academic-marketplace -- --inspect
# Read-only curriculum import plan on the explicitly chosen branch
```

To apply, provide the already documented database/host confirmations and
both importer opt-ins, then use:

```bash
npm run demo:academic-marketplace -- --apply
```

The script reuses the existing guarded import commands in order: first 120
curriculum draft records, then 30 demo teacher profiles and their
course-specific capabilities/preview offerings. Idempotent retries do not
produce duplicate versions or teacher records. Because each stage commits
separately, a failed second stage may leave the imported course drafts
available for a safe retry. No publication, internal academic approvals or
classroom staffing occurs in this command.

**Observed isolated-Neon state (read-only verification, 2026-11-02):**
`demo-curriculum-validation-20261102` contains the CAN Demo Publisher,
but no demo course templates, teacher provider, demo teachers or teacher
staffing Actions yet. Generating manifests or merging this PR does not load
the database.
