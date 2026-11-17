# Retire school Sections in favor of native Class

Status: **IN PROGRESS**. Native application routing cut over on November 17, 2026. Academic Section domain retirement is still outstanding.

## Non-negotiable target
- One native Class directory `/class` and one Class workspace `/class/:classId`. No redirects, aliases, legacy dual-writes or continuing school Section records after verified migration.
- Class references one published Course version, with optional published Class Offering and zero or more dated Sessions. Class Enrollment is the authoritative individual participation; Course Attempt preserves learner activity. Academic credit and official outcomes require independently authorized issuing policy.
- Adult learners with a verified Person may discover and self-enroll without school-staff or school-student roles. Class operators use scoped, current organization/Site grants. Dependents require independently verified guardian relationships.

## Mandatory academic data and service migrations
1. **Section placement/enrollment**: migrate current academic placements to verified Class Enrollment and the correct Course version and academic calendar/term. Reconcile each record per Person, Site and enrollment status.
2. **Gradebooks and assessment evidence**: replace sectionId in authoritative academic scoring, assignment submission, teacher review, released feedback and grading policies. Do not infer official grades from recorded teacher progress or Class attendance.
3. **Timetables, people and attendance**: use Class Sessions, instructional staff grants, lawful rosters and academic attendance authority, with effective dates and no cross-Site leakage.
4. **Guardians and student services**: preserve dependent access and safeguarding through independent guardian relationships; migrate section-scoped messages, study groups, support, progress and accommodations.
5. **Academic records and reports**: transcript, report card, promotion, graduation and course-credit issuance must reference immutable authorized Class evidence; account-wide My Activity must not retain a school_section adapter as its final source.
6. **Retire schema and route**: after counting and verifying historical attendance, grades, credit, enrollments, dependent access and academic reports, archive historic records under applicable policy, remove Section FKs and dependent tables/services, then delete `src/routes/classes.tsx`. The legacy application route is still accessible only while the native academic feature parity is unfinished, and is not part of the target contract.
7. **Acceptance**: verify a single signed-in Person with adult + academic roles, an independently authorized guardian, teacher/facilitator and manager, and two separate Sites. Run build/typecheck, focused unit tests, migration fixtures, restricted-principal SQL tests and authenticated browser journeys.

No Section DDL or existing academic records were deleted during the native route change. This is intentionally **not** a declaration of completed Section retirement.

## November 17 architecture isolation and retirement gates

**Governing decision:** Sections and CAN-to-canonical Person/account translations are
retiring implementation details, not the product's long-term model. No new
Section, identity crosswalk, or additional learner bearer credential should
be introduced as a feature implementation.

**Code changes on main:**
- `getIdentityContext(request)` establishes one CAN identity and verified
  organization/Site roles without looking up school Sections.
- Native Class authentication, guardian checks, credential-issuer approval,
  and the general workspace session now use that Section-free identity path.
- `getCommandContext(request)` continues to project Section authority ONLY for
  unmigrated legacy academic workflows. That compatibility entrypoint is
  explicitly quarantined in
  `src/modules/identity/retiring-school-section-scope.server.ts` and must
  be deleted after the migration. It is NOT a native Class service or new
  identity system.
- `npm run check:class-architecture` blocks legacy Section/identity
  dependencies in authoritative Class owners and prevents the canonical Class
  resolver from reverting to Section-projected identity. Both deployment
  builds run the check.

**Before deleting legacy schema or authorization code**, run:
`CAN_RETIREMENT_QA=1 CAN_RETIREMENT_QA_DATABASE_URL=<isolated test01 URL> npm run db:test01:retirement-readiness`

The read-only test01 preflight inventories legacy Sections, Section teachers,
Section enrollments, assessments, submissions, native Classes, native Class
Enrollments and outstanding account-identity crosswalks. A nonzero legacy
count or a remaining crosswalk blocks retirement. This is necessary, not
sufficient: a separate reversible, independently reviewed migration must
preserve every academic record's exact Person, Course version, Class,
Enrollment, teaching authority, attendance, guardian visibility, grades,
reports, audit trail and retention obligations. No legacy `section_id` should
be replaced with a guessed Class ID and no Person identity should be joined
on email or name.

**Identity cutover sequence:** select one authoritative Account and Person
identity, reconcile every existing canonical learner and staff identity under
verified evidence, rekey authoritative Class-related foreign keys, replace
native-only session validation with an independently scoped CAN session
projection, prove transactional revocation and access isolation, then
retire crosswalks and the second bearer cookie. Do not delete canonical
records or bypass native SQL policy guards until the replacement is proven
on test01. Crosswalk tables are historical cutover inputs, never the
new primary authorization scheme.

**Status:** build gates and read-only preflight are source commits. No
record-level migration, production deletion, full test pass or browser
acceptance has been established by these commits.
