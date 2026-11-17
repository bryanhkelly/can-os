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
