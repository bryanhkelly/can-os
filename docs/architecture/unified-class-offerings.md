# CAN OS unified Class and Class Offering architecture

Status: **native replacement model on a feature branch; not applied to a live database**.
Canonical v3.0.1 remains the governing source of publisher rights, site/operation authority,
learning identity, progress, school records, registration and completion evidence.

## One consistent educational model

- **Course**: reusable instructional content, versioned at publication.
- **Course Offering**: one publisher-owned, explicitly classified single-Course product made available for approved organizational adoption.
- **Program Offering**: a publisher-owned, versioned bundle of learning experiences (one or many Courses, possibly other components).
- **Class**: a governed instantiation of *exactly one Course version* within one current Deployment/adoption and operating organization, optionally at a Site. No schedule is required for self-paced learning.
- **Class Offering**: the required enrollment contract of that Class, even when entirely private or assigned. One identity, versioned terms. Visibility is separate from one or more permitted enrollment methods.
- **Class Enrollment**: one person's enrollment regardless of how participation began. Learners may participate for credit, audit or without academic-credit applicability. Certificates and other awards are independent outcomes, not separate enrollment types.
- **Individual Course Attempt**: authoritative individual Course activity/progress, not duplicated for classrooms or recorded teacher selection.
- **Class Outcome**: independently supported evidence of achievement or assessment. A result may exist without an award.
- **Class Award**: credit/certificate/credential issued by an independently authorized authority under a valid policy to an eligible participant. Not automatically derived from enrollment, completion or the Course's content.
- **Session**: optional dated delivery event attached to the Class; the existing canonical delivery_sessions timetable remains the time/place source of truth.

### Cardinalities

1. Course 1 → many Classes. Each Class references exactly one immutable published Course version.
2. Publisher Offering 1 → one/many Course versions. Only an explicitly classified single-Course publisher Offering is a Course Offering.
3. Class 1 → one Class Offering identity; Class Offering 1 → many immutable publication versions over time.
4. Class 1 → zero/many Sessions; Class 1 → zero/many learner Enrollments.
5. Enrollment 1 → one person and one Class; Enrollment → individual outcomes, possible separate awards.
6. Program registration may coordinate enrollment in several Courses/Classes, but must not pretend a Program is a single Course attempt.

## Marketing and enrollment are independent

Class Offering visibility: public, unlisted, private.
Class Offering enrollment methods: any explicitly permitted combination of self, invitation, assignment and approval.
These are orthogonal. A private Class can assign learners; a public Class can still require approval.
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

**No backward compatibility is required.** The target is one native Class, Class Offering,
Class Enrollment, Course Attempt, Outcome and Award model. New commands will not call
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
- Native operator creation/publishing/closing/revision commands:
  src/modules/classes/unified-class.functions.ts.
- Native **adult self-enrollment** with current adult DOB verification, consent
  hashing, class-level capacity lock, idempotent duplicate handling and atomic
  Class Enrollment/Course Attempt: src/modules/classes/native-class-enrollment.functions.ts.
- Native Course Attempt authorization, Course lesson/progress and outcomes/awards
  **read model**: src/modules/classes/native-class-learning.functions.ts.
  Recorded media, assessments and independent instructor delivery are NOT yet
  wired into the new native learner context.
- Operator 6.1 workspace: /canonical/classes.
- Learner listing/enrollment: /learn/classes.
- Learner Course progress: /learn/class/$classEnrollmentId.
- Unit contracts: tests/unit/unified-class.test.ts and
  tests/unit/native-class-enrollment.test.ts.
- Read-only isolated schema verification:
  scripts/acceptance/check-native-class-schema.mjs.

**Not activated:** no database migration was applied and no app role was granted
access to the new tables. All six new tables have forced RLS, initially owner-only
policies, and are not safely available to application roles until reviewed scoped
authorization. Native server functions require CAN_UNIFIED_CLASS_COMMANDS_ENABLED=true,
but setting this alone is NOT a release approval.

The publisher Course/Program Offering kind currently has a domain contract;
it is NOT yet a persisted, governed publisher publication classifier.

`learner_course_attempts` still physically retains old source columns because
the canonical v3.0.1 database has dependent constraints/triggers. The new code
does not use those source paths, adapt them, import their rows or dual-write.
Replacing the underlying fresh-install schema will be an explicit cutover task.

**Verification:** no successful branch typecheck, unit run, database acceptance
or browser E2E has been observed. GitHub Actions push runs are reporting
`startup_failure` rather than executing tests. The original test01 database
credentials were unavailable during the earlier integration work; this migration
has not been executed or tested there.

## Next phases to graduate the model

### P0: Authorized Class and publication lifecycle
- On an isolated canonical QA database, validate and apply both SQL patches; provision purpose-specific RLS,
  never an unrestricted network role or broad public SELECT.
- Exercise the newly implemented atomic Class/Offering draft command using approved
  Course, Deployment, Site and operator authority on an isolated QA database.
- Exercise publication, close and revision with database integrity and RLS checks.
- Complete verified private assignment, invitations and approval workflows.
- Exercise the native Class-level seat lock across concurrent requests and
  multiple offering versions; no silent oversubscription.
- Versioned policies must record eligibility, consent, any guardian approval and any credit/audit selection. Certificates and credentials remain independently governed awards.

### P0: Native enrollment commands
- One Class Enrollment identity with verified Person, Class Offering version and
  authorized enrollment mechanism, regardless of credit or certification intent.
- Verify the implemented native Course Attempt source constraint, trigger and atomic
  enrollment command. It must work without creating a school/noncredit source row.
- Add purpose-specific learner RLS and restricted media rights binding for native
  Class Course Attempts, without exposing raw lesson media to unenrolled people.
- Complete native Class guardian/child enrollment, assignment, invitation, approval,
  withdrawals, repeats and seat release with verified policy and consent.
- Integrate independent instructor choice, practice progress and official
  assessments without resetting learners or duplicating Course attempts.

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
- Learner: native Class catalog and lesson/progress read view are committed;
  add authorized playback, practice, assessment, schedule and awarded outcomes.
- Replace prior pages and services at cutover rather than maintaining dual routes.
  Old screens continue unchanged on main until the native workflows are proven.

## Acceptance gates before activation

- One Course instantiated by 25 independent authorized Sites, with no network privacy leak.
- Class with a private assigned Offering succeeds without public catalog visibility.
- Class with public Offering rejects unauthorized, ineligible and unconsented enrollment.
- One Class supports credit and auditing learners; certificates may be separately awarded when authorized and earned.
- A Program with three Courses records three Course-level attempts and appropriate Classes.
- Same Class, different recorded instructors; grades and progress remain stable.
- One Class, multiple publication versions; no duplicate active enrollment, no oversold seats.
- Revoked Site/adoption blocks new acts without rewriting historic completion and credit.
- New canonical grading, attendance, consent and guardian policy enforcement verified.
- Pass typecheck, lint, unit/integration, browser E2E and restricted RLS before release.

**Do not run this migration on production or switch live routes to the new tables without
a separately approved release and empirical test01 verification.**
