# CAN OS unified Class and Class Offering architecture

Status: **native replacement model on a feature branch; not applied to a live database**.
Canonical v3.0.1 remains the governing source of publisher rights, site/operation authority,
learning identity, progress, school records, registration and completion evidence.

## November 16 workstream boundary

The feature branch includes scheduling, scalable discovery, a portable
network launch recipe, facilitator reliability improvements and a reusable
Course learning-activity source. This work deliberately excludes single-login
multi-role completion, pilot impact reports and Class enrollment invitation /
approval flows. Those remain post-merge product work and are not release claims.

## November 15 integration checkpoint

The feature branch has incorporated the latest `main` authorization and
single-login changes with a genuine two-parent merge commit. The canonical
Site Admin/Registrar role matrix retains purpose-specific `class.manage`
only for Class operations; neither role receives `credential.issue` by
default. Protected Class creation, activation, Offering terms, direct adult
assignment and teaching-team mutations revalidate the current CAN/native
staff grant inside their database transaction. Scheduling and opening native
Class Sessions separately revalidate the active facilitator session in that
same transaction.

Native direct adult assignment requires an organization-scoped, verified
canonical learner account with `site_id IS NULL`, matching the actual
canonical learner-login contract. The hosting Class's specific Site,
Deployment and operating rights remain independently checked. No Class
Offering is required for assignment.

Release limitations: source-level checks are not successful typecheck,
test or signed-in browser evidence. GitHub Actions has produced a
repository-wide synthetic `BuildFailed` `startup_failure` with zero jobs
on both `main` and the feature branch. CI must start real jobs before a
passing result can be claimed. The native tables are absent on `test01`;
no migrations have been executed there or on production. One-account
switching between a person's student and staff experiences still requires
verified multiple-role integration across all instructional service calls;
the current Class learner-player APIs require an active learner context.

## One consistent educational model

- **Course**: reusable instructional content, versioned at publication.
- **Course Offering**: one publisher-owned, explicitly classified single-Course product made available for approved organizational adoption.
- **Program Offering**: a publisher-owned, versioned bundle of learning experiences (one or many Courses, possibly other components).
- **Class**: a governed instantiation of *exactly one Course version* within one current Deployment/adoption and operating organization, optionally at a Site. No schedule is required for self-paced learning.
- **Class Offering**: an optional, versioned registration/publication contract. A Class can exist, operate and receive authorized assigned students without any Class Offering. Visibility and enrollment methods do not change the Class identity.
- **Class Enrollment**: one person's enrollment regardless of how participation began. Learners may participate for credit, audit or without academic-credit applicability. Certificates and other awards are independent outcomes, not separate enrollment types.
- **Individual Course Attempt**: authoritative individual Course activity/progress, not duplicated for classrooms or recorded teacher selection.
- **Class Outcome**: independently supported evidence of achievement or assessment. A result may exist without an award.
- **Class Award**: credit/certificate/credential issued by an independently authorized authority under a valid policy to an eligible participant. Not automatically derived from enrollment, completion or the Course's content.
- **Session**: optional dated delivery event attached to the Class; the existing canonical delivery_sessions timetable remains the time/place source of truth.

### Cardinalities

1. Course 1 → many Classes. Each Class references exactly one immutable published Course version.
2. Publisher Offering 1 → one/many Course versions. Only an explicitly classified single-Course publisher Offering is a Course Offering.
3. Class 1 → zero/one Class Offering identity; when present, an Offering has many immutable publication versions over time.
4. Class 1 → zero/many Sessions; Class 1 → zero/many learner Enrollments.
5. Enrollment 1 → one person and one Class; Enrollment → individual outcomes, possible separate awards.
6. Program registration may coordinate enrollment in several Courses/Classes, but must not pretend a Program is a single Course attempt.

## Marketing and enrollment are independent

Class Offering visibility: public, unlisted, private.
Class Offering enrollment methods: any explicitly permitted combination of self, invitation, assignment and approval.
These are orthogonal. A private Class can assign learners directly, without any Class Offering. A public Class Offering can still require approval.
Publication does not imply public advertising or open self-service.

An evergreen self-paced Class can have no Site or meeting date.
An academic credit-eligible Class can have a learner pursuing credit and another enrolled for audit.
A learner can demonstrate mastery and receive no academic credit if auditing, ineligible or lacking
a qualified issuing institution.

## What remains governed independently

Course publication and instructional tracks belong to the publisher. A Class cannot copy or
silently amend the published Course. Deployment/adoption, Site readiness, professional roles,
content rights, safeguarding and any required local approval remain enforceable at each action.
Student Person/guardian identity and privacy are not derived from network membership.

**No backward compatibility is required.** The target is one native Class,
optional Class Offering, Class Enrollment, Course Attempt, Outcome and Award model. New commands will not call
legacy Section or noncredit-registration services, and there are no importers, backfills,
dual writes, source adapters or fallback endpoints. Existing live data and workflows remain
unmodified on main until a separately approved replacement deployment.

## Branch implementation (source committed, runtime inactive)

- Contracts: src/domain/unified-class.ts and src/domain/native-class-enrollment.ts.
- Tables/Drizzle mapping: src/db/canonical-v301/classes.ts; direct Course Attempt
  mapping in src/db/canonical-v301/learning.ts.
- SQL, in order, on an isolated reviewed database only:
  1. database/canonical/v3.0.1/patch-unified-class-offerings.sql
  2. database/canonical/v3.0.1/patch-unified-class-course-attempts.sql
  3. database/canonical/v3.0.1/patch-unified-class-activities.sql
- Native operator creation/publishing/closing/revision commands:
  src/modules/classes/unified-class.functions.ts.
- Native **adult self-enrollment** with current adult DOB verification, consent
  hashing, class-level capacity lock, idempotent duplicate handling and atomic
  Class Enrollment/Course Attempt: src/modules/classes/native-class-enrollment.functions.ts.
- Native **direct adult assignment** for verified existing Organization/Site learners,
  with no Class Offering, independent Class-wide capacity, one Course Attempt,
  audit trail and no implicit academic-credit award:
  src/modules/classes/native-class-assignment.functions.ts.
- Class creation and activation are independent of publication. An optional
  Class Offering can be created at Class creation or added later.
- Native Course Attempt authorization, Course lesson/progress and outcomes/awards
  **read model**: src/modules/classes/native-class-learning.functions.ts.
  The same recorded-instructor lesson, selection, practice and signed-media
  services now authorize the native Class Enrollment / Course Attempt source.
  Native credit/assessment issuance remains disabled. Class-specific scheduled
  room pairing and projector services have branch implementations but are unverified.
- Global Class creation and Class Offering publishing: /canonical/classes.
- Native catalog/self-enrollment entry: /learn/classes (directory cutover pending).
- Shared Class workspace for learner, teacher/facilitator, and manager:
  /classes/:classId (role-gated view and tab query modifiers).
- Unit contracts: tests/unit/unified-class.test.ts,
  tests/unit/native-class-enrollment.test.ts,
  tests/unit/unified-classroom-player.test.tsx and
  tests/unit/class-views.test.ts.
- Read-only isolated schema verification:
  scripts/acceptance/check-native-class-schema.mjs.

**Not activated:** no database migration was applied and no app role was granted
access to the new tables. All new native and private activity tables have forced RLS, initially owner-only
policies, and are not safely available to application roles until reviewed scoped
authorization. Native server functions require CAN_UNIFIED_CLASS_COMMANDS_ENABLED=true,
but setting this alone is NOT a release approval.

## One classroom player across delivery modes

The **canonical native Class workspace is now one address: `/classes/:classId`**,
implemented at `src/routes/classes_.$classId.tsx` (TanStack non-nested route).
It supports server-verified views with query modifiers:

- `/classes/:classId?view=learn&tab=lessons&lesson=:lessonId`
- `/classes/:classId?view=teach&tab=classroom`
- `/classes/:classId?view=manage&tab=offering`

The `view`, `tab`, `lesson` and `session` parameters select navigation state,
**never Person identity, rights, course progress or teaching authorization**.
Requests for disallowed views or tabs fail closed. The default perspective is
derived from the current verified Class relationship. A person can switch
perspectives only when the verified current session/grants and Class
relationships support more than one.

`UnifiedCoursePlayer` is the shared focus-mode classroom shell, used by this
native Class route and the previously implemented legacy academic and training
surfaces. Only one native Class detail route remains: the redundant
`/learn/class/:classEnrollmentId` route was deleted. Native learner and
operator entry-point links now address `/classes/:classId`.

**Not a backwards-compatibility plan:** The original `/classes?section=...`
school route and `/learn/course/:courseAttemptId` training route still exist
for old live workflows and numerous other callers/tests. Their removal is a
coordinated cutover gate, not an adapter between old and new enrollments.
Replacing the old `/classes` directory without updating those dependencies
would break school users and regression tests.

### Student, teacher, and administrator authority

- **Learner:** a current Person-specific Class Enrollment and the matching
  Course Attempt must pass publisher, Deployment, Site and adoption checks.
  Selected recorded teacher, lesson progress and practice remain individual.
- **Teacher/facilitator:** requires a current verified Site/organization
  facilitator role **and** a separate approved Person-to-Class
  `class_staff_assignments` row. A published recording or a generic Site role
  never authorizes teaching this Class.
- **Manager:** requires current `class.manage` scope, relevant operation
  authority and exact Site/organization ownership (or creator scope for
  provider-wide self-paced Classes).
- **Roster confidentiality:** even an assigned teacher receives only
  aggregate counts until independently approved `class.roster.view`
  permission is implemented. Student names are restricted to verified
  operating managers in this branch. The teacher's role does not authorize
  official grading or credit issuance.
- **Multiple roles:** current session grant governs the perspectives exposed
  in the switcher; changing `?view=` never activates a different grant.

An operator can assign or end Class-specific teaching roles in the new
workspace only for people with a verified, active room-facilitator grant
at that same Site. Assignment is audited and has an immutable history.
For youth/school delivery, safeguarding clearance and professional
eligibility must be enforced before granting expanded learner-record access.

`UnifiedLessonOutline` renders the same lesson navigation pattern in the
academic classroom, recorded-instructor player, and native Class overview.
`ClassroomMediaSurface` is the single validated native MP4/WebM or
YouTube/Vimeo media renderer used by `ClassVideoPlayer` and
`ClassroomProjectorPlayer`. The facilitator projector still owns
its separate room command loop, synchronization and optional QR experience:
projector commands never count as individual attendance or completion.

Native Class learners may switch approved recorded presenters while retaining
one canonical Course Attempt, lesson progress and practice history. Their
recorded-instructor and media requests now pass the native Enrollment →
Class → Course/Offering adoption → operator/Site authorization checks.
Academic assignments, grades and transcript credit are never inferred from
a chosen presenter or video play event.

The native learner's **Assignments** tab now has reusable publisher-owned
Course-version knowledge checks, consented identified feedback and a noncredit
completion-evidence confirmation. Correct quiz choices and submitted feedback
bodies are kept in `education_v30_secure`, never projected to the learner or
classroom host. This low-stakes check does **not** reuse noncredit registration,
issue academic grades or certificates, or attribute classroom screen playback
as individual completion. The first submission pins the learner to the
published Course activity version; later publisher revisions cannot rewrite
their historical responses or requirements. The publisher's authoring surface
is `/canonical/course-activities` and is restricted by current organization
ownership and verified staff authority. The Courses themselves are still
centrally governed and are not copied to each Site.

The Class Session planner now accepts a one-off Session, four weekly Sessions
or up to twelve custom dated Sessions. Wall-clock input is interpreted in
the canonical hosting Site's `time_zone`; invalid or ambiguous daylight-saving
times are rejected. The facilitator sees preparation checks, live controls
and session closure in one flow. Existing presenter-screen authentication
remains mandatory; an untrusted-display handoff is NOT enabled.

The learner directory has server-side search, stable keyset pagination and
a Course title index. The manager roster has separately authorized paging.
A portable network Class launch recipe carries only Course identity and
proposed setup defaults, never enrollment, Site grants or publisher rights.
Each receiving Site must validate its own current adoption and create its
own Class using the existing governed creation command.

All of these changes are **source-level implementation only**, pending
an isolated database migration with actual restricted app-role tests,
working CI and authenticated cross-Site acceptance. The native
Class-to-Session and Course Attempt authorization checks remain mandatory.

### Class-specific Sessions and facilitated classroom delivery

The shared Class workspace now has a live **Sessions** tab in learner,
teacher/facilitator and manager perspectives. School, independent, adult and
church-hosted Classes use the same Class ID and canonical \`delivery_sessions\`
dates instead of inventing an academic-only Cohort/Section timetable.

Native implementation:
- \`education_v30.class_sessions\` maps one immutable Class ID to one
  \`facilitated_classroom_plans\` ID and one dated \`delivery_sessions\` ID.
  The SQL trigger requires exact Deployment, Course version, Site,
  host organization and facilitator identity; a plan linked to a Class
  cannot later be repurposed as a noncredit enrollment release.
- \`scheduleNativeClassSessions\` requires a currently active Class and
  explicit Person-to-Class teaching assignment at an authorized Site.
  It reuses the existing canonical booking transaction. The four-week
  preset validates four weekly meetings with consistent duration and a
  one-hour DST allowance. Other school or summer schedules may use custom
  cadence.
- \`openNativeClassSession\` verifies the exact Class/plan/delivery relationship,
  current facilitator assignment and at least one **active enrollment from
  this Class** before issuing a one-time room code near the scheduled start.
- \`nativeClassRoomParticipant\` verifies the room's exact Class,
  Person's Class Enrollment, and linked Course Attempt, including current
  approved adoption, deployment, Course and Site authority. Course/Site
  coincidence alone never permits pairing.
- Projector control, playback and private media rights reuse the existing
  shared screen/player, while revalidating native Class staff and each paired
  learner's Class Enrollment on reads and commands. Native Class attempts
  cannot pair into older unbound rooms, and older course attempts cannot pair
  into a native Class room.
- Native attendance rostering filters by exact Class **before pagination**.
  Administrative roster access is restricted to authorized Class managers.
  Facilitator roll call requires an explicit, immutable and audited
  class_staff_assignments.attendance_authorized delegation for that Class.
  Generic teaching rights do not grant roster identities. Device pairing,
  attendance and official completion remain distinct evidence levels.
- If native Class staff authorization expires, room playback and
  management metadata fail closed; ending a Class Session does not erase
  previously recorded learning evidence.

These changes are **source-level implementation only**: the new SQL and
purpose-specific RLS grants have not been applied, no successful tests
or E2E classroom acceptance have been observed. Particularly, a live room
must be exercised with two independent Classes using the same Course and Site,
including revoked staff/learner/adoption, before release.

## P0 native facilitated classroom update

The unified Class view now connects native Course Attempts to the existing
facilitated companion, question release, private facilitator console,
projector and attendance evidence components. For Class sessions, the
presenter can select rights-approved recorded content before phones pair,
using only active Course Attempts in that exact Class as the rights basis.
Pairing and response submissions still independently verify the Person's
Class Enrollment, Course Attempt and exact linked Session.

Classroom device layouts: layout=single exposes only public-safe playback
and question-release controls on the presentation page; dual-screen keeps
private controls on the facilitator laptop; distributed screens require a
separately authenticated presenter session, never shared public credentials.

Physical attendance is independent of device pairing and formative answers.
An authorized Site manager must explicitly set the immutable
class_staff_assignments.attendance_authorized flag on the exact Class staff
assignment before that facilitator can view or correct attendance. A teaching
assignment alone does not grant personal roster access. Historical response
evidence remains individual to the Course Attempt.

See docs/acceptance/native-facilitated-classroom-p0.md for the 25-person,
two-Site, shared-Course negative acceptance matrix and release blockers.
These are committed source paths, not validated release evidence. Native
tables and restricted RLS remain uninstalled on test01.

### Verified environment baseline

On 2026-11-15, READ-ONLY Neon queries against `test01` confirmed
that the original canonical Course Attempt, Offerings, Deployments, authority
and Course tables exist, as do the expected two-source legacy Attempt check and
publisher-adoption keys. `education_v30.classes` does NOT exist
there yet. No migration or other database mutation was executed in this pass.
The native schema and application role grants remain unproven.

The publisher Course/Program Offering kind currently has a domain contract;
it is NOT yet a persisted, governed publisher publication classifier.

`learner_course_attempts` still physically retains old source columns because
the canonical v3.0.1 database has dependent constraints/triggers. The new code
does not use those source paths, adapt them, import their rows or dual-write.
Replacing the underlying fresh-install schema will be an explicit cutover task.

**Verification:** no successful branch typecheck, unit run, database acceptance
or browser E2E has been observed. GitHub Actions push runs are reporting
`startup_failure` rather than executing tests. Read-only `test01` inspection is available through the connected Neon
project, but the native schema has not been installed or tested there.

## Next phases to graduate the model

### P0: Authorized Class and publication lifecycle
- On an isolated canonical QA database, validate and apply both SQL patches
  (including `class_staff_assignments` and `class_sessions`); provision
  purpose-specific RLS,
  never an unrestricted network role or broad public SELECT.
- Exercise the newly implemented atomic Class/Offering draft command using approved
  Course, Deployment, Site and operator authority on an isolated QA database.
- Exercise publication, close and revision with database integrity and RLS checks.
- Complete verified private assignment, invitations and approval workflows.
- Exercise the native Class-level seat lock across concurrent requests and
  multiple offering versions; no silent oversubscription.
- Versioned policies must record eligibility, consent, any guardian approval and any credit/audit selection. Certificates and credentials remain independently governed awards.

### P0: Native enrollment commands
- One Class Enrollment identity with verified Person and an authorized enrollment
  mechanism. The Class Offering version is optional for assignment, invitation
  and approval; published terms are required only for self-registration.
  Private invitation and approval still need dedicated consent and eligibility
  controls before those commands can be enabled. Credit intent does not select
  a different enrollment system.
- Verify the implemented native Course Attempt source constraint, trigger and atomic
  enrollment command. It must work without creating a school/noncredit source row.
- Add purpose-specific learner RLS and restricted media rights binding for native
  Class Course Attempts, without exposing raw lesson media to unenrolled people.
- Complete native Class guardian/child enrollment, assignment, invitation, approval,
  withdrawals, repeats and seat release with verified policy and consent.
- Add explicit, evidence-backed teacher safeguarding/roster-read and academic
  grading permissions. Site facilitator assignment alone grants neither.
- Execute the newly wired independent instructor choice, recorded playback
  and practice against native Class Attempt RLS on isolated QA. Integrate
  official assessments without resetting learners or duplicating Attempts.

### P0: Outcomes and credit/credentials
- Produce native outcomes from canonical assessment, grading and completion evidence,
  without a legacy gradebook source adapter.
- Evaluate learner-specific eligibility independently from what the Class could award.
- Require issuer authorization, award policy version and verified evidence before
  any credit or certificate issuance; retain revocation and corrections as events.
- A learner may take a credit-eligible Class for audit and receive no academic credit, while still qualifying for a separately authorized certificate.

### P1: Native screens and reporting
- Publisher: Course/Program Offerings, approved adoptions.
- Operator: Classes → Class Offering → Enrollment → Sessions → Outcomes.
- Learner: native Class catalog, shared recorded-teacher player, progress,
  dates, Course and results views are committed. Validate secure playback,
  pairing, teacher projector access and attendance with the exact native
  Class Enrollment; add governed assessment and authorized outcome issuance.
- Replace prior pages and services at cutover, including old `/classes?section=`
  callers, noncredit catalog entry routes and route tests. Do not introduce
  old-to-new enrollment adapters or dual-write services; leave main untouched
  until the native workflows are proven.

## Acceptance gates before activation

- One Course instantiated by 25 independent authorized Sites, with no network privacy leak.
- Class with a private assigned Offering succeeds without public catalog visibility.
- Class with public Offering rejects unauthorized, ineligible and unconsented enrollment.
- One Class supports credit and auditing learners; certificates may be separately awarded when authorized and earned.
- A Program with three Courses records three Course-level attempts and appropriate Classes.
- Same Class, different recorded instructors; grades and progress remain stable.
- One Class without publication can still accept authorized assignment; optional
  publication versions do not change Class identity or Class-wide capacity.
- No duplicate active enrollment, no oversold seats across assignment and registration.
- Revoked Site/adoption blocks new acts without rewriting historic completion and credit.
- New canonical grading, attendance, consent and guardian policy enforcement verified.
- Pass typecheck, lint, unit/integration, browser E2E and restricted RLS before release.

**Do not run this migration on production or switch live routes to the new tables without
a separately approved release and empirical test01 verification.**
