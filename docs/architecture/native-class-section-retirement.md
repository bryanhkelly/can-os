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

## Verified test01 inventory, November 17, 2026 (read-only)

A direct Neon SQL inspection of `br-bitter-feather-ar0u63x7` found:
- 11 public school Sections, 13 teacher rows, 129 Section enrollments,
  60 assessments, and 506 submissions
- 11 distinct legacy Course template versions used by those Sections;
  only 2 native Course versions and 0 native Classes/Class Enrollments
- 21 distinct enrolled school student profiles
- 68 public CAN People and 6 native canonical Persons, with 0 equal
  Person IDs across the two stores
- 10 public CAN Accounts and 4 native canonical Accounts, with 0 equal
  Account IDs across those two stores
- 4 native account grants, 0 native sessions
- 0 reviewed noncredit or staff identity-link rows

Schema introspection returned **23 foreign-key relationships** to
`public.sections`, including attendance, actions, grading, lesson progress,
messages/support, calendar/scheduling, and staffing relationships. A
Course-version join, Person-ID equality or email-based merge is therefore
**not a verified migration**.

**Decision:** no automatic legacy table drop, UUID coercion, shadow
enrollment, synthetic native Person linkage or second-login workaround.
A reviewed academic/identity reconciliation must establish the proper
Course publisher, Class Deployment, published version, learner/guardian
authority and evidence lineage before any production cutover. The script
`db:test01:retirement-readiness` now discovers dependent FK tables
automatically. Counts are a snapshot, not proof that current production
has the same records.

## Cutover candidate reporting (additional test01 verification)

The source-to-native Course selection must be evidence based rather than a
new permanent translation service. The read-only, test01-pinned candidate
inventory is `npm run db:test01:class-cutover-candidates` with
`CAN_CLASS_CUTOVER_CANDIDATES=1` and
`CAN_CLASS_CUTOVER_QA_DATABASE_URL` set to the isolated test01 connection.

It reports one entry per legacy class without learner names or email addresses,
including source Course version, Site, Program and **aggregate** enrollment,
assessment, submission, scheduling, grade and lesson-progress counts.
It looks for published native Course versions with the same publisher, Course
code and version number. Such a match is only a **candidate**: an independent
curriculum/content, rights, assessment and grading equivalence review is still
required before mapping anything. Zero or multiple candidates block migration;
the script never writes to a database and cannot authorize a cutover.

A subsequent direct read-only check on test01 established:
- All 11 old classes are active, belong to one Site and one Program; all 129
  legacy Section enrollments are active
- All 11 source Course versions are published
- **Zero** exact publisher+Course-code candidates among the native Courses
  (and thus zero exact published version candidates)
- Additional retained academic evidence includes 996 scheduled occurrences,
  4 Section grade records and 4 lesson-progress records, beyond the 506
  submissions and 60 assessments previously counted

**Required next source data:** approved native Course publications for the
actual eleven source Course versions, independently reconciled learner
Person identities, explicit Deployments/adoptions, accurate dated Class
Sessions, grade/assessment conversion rules, and record-level audit
reconciliation. No one-to-one conversion is inferred from a matching title,
email address, Site membership or numerical version alone.

The read-only retirement preflight now fails on missing/ambiguous native Course
version candidates and on divergent native Person/account IDs, even if the
legacy identity-link tables happen to be empty. This closes the misleading
"no links means one identity" loophole.
