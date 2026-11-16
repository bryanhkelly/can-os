# CAN OS unified Class and Class Offering architecture

Status: **native replacement model on a feature branch; not applied to a live database**.
Canonical v3.0.1 remains the governing source of publisher rights, site/operation authority,
learning identity, progress, school records, registration and completion evidence.

## One consistent educational model

- **Course**: reusable instructional content, versioned at publication.
- **Course Offering**: one publisher-owned, explicitly classified single-Course product made available for approved organizational adoption.
- **Program Offering**: a publisher-owned, versioned bundle of learning experiences (one or many Courses, possibly other components).
- **Class**: a governed instantiation of *exactly one Course version* within one current Deployment/adoption and operating organization, optionally at a Site. No schedule is required for self-paced learning.
- **Class Offering**: the required enrollment contract of that Class, even when entirely private or assigned. One identity, versioned terms. Visibility is separate from enrollment method.
- **Class Enrollment**: one person's enrollment regardless of how participation began. Credit, audit, certificate and participation are choices/intents, not different types of student.
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
Class Offering enrollment method: self, invitation, assignment, approval.
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

## Branch implementation

- Shared domain contracts, product-kind/visibility semantics and award prerequisites:
  src/domain/unified-class.ts
- Additive canonical schema mapping: src/db/canonical-v301/classes.ts
- Proposed migration script (not executed):
  database/canonical/v3.0.1/patch-unified-class-offerings.sql
- Unit tests: tests/unit/unified-class.test.ts

The SQL defines six new tables: classes, class_offerings, class_offering_versions,
class_enrollments, class_outcomes and class_awards. All have FORCE RLS and no application
access until a separate scoped authorization and release decision. This is deliberate:
it is safer to build the model first than to mint unverified grades or awards.

## Next phases to graduate the model

### P0: Authorized Class and publication lifecycle
- On test01, validate and apply the additive migration; provision purpose-specific RLS,
  never an unrestricted network role or broad public SELECT.
- Create Class and its Class Offering atomically from a published Course version and
  current approved Deployment/adoption. Require verified operator and Site authority.
- Publish/close/supersede Offering terms with audit events. Support all visibility and
  enrollment methods, including private assignment.
- Enforce one active Class Offering version at a time and aggregate seats across versions,
  releases and enrollment methods with transactional capacity locks.
- Versioned policies must record eligibility, consent, any guardian approval and award intent.

### P0: Native enrollment commands
- One Class Enrollment identity with verified Person, Class Offering version and
  authorized enrollment mechanism, regardless of credit or certification intent.
- Class Enrollment becomes the source for canonical Course Attempts; remove existing
  school/noncredit source assumptions in the new authorization and learning paths.
- No source adapters or legacy Section/noncredit linkage. New learning activity and
  grading must be driven by Class Enrollment, published Course versions and policy.
- Enforce capacity, duplicate-active-enrollment and idempotency under transaction locks.

### P0: Outcomes and credit/credentials
- Read existing gradebook/assessment/completion evidence as source of results.
- Evaluate learner-specific eligibility independently from what the Class could award.
- Require issuer authorization, award policy version and verified evidence before
  any credit or certificate issuance; retain revocation and corrections as events.
- A learner may take a credit-eligible Class for audit and receive no academic credit.

### P1: Native screens and reporting
- Publisher: Course/Program Offerings, approved adoptions.
- Operator: Classes → Class Offering → Enrollment → Sessions → Outcomes.
- Learner: Explore Classes; My Classes; Course player; Progress and earned awards.
- Replace prior pages and services at cutover rather than maintaining dual routes.
  Old screens continue unchanged on main until the native workflows are proven.

## Acceptance gates before activation

- One Course instantiated by 25 independent authorized Sites, with no network privacy leak.
- Class with a private assigned Offering succeeds without public catalog visibility.
- Class with public Offering rejects unauthorized, ineligible and unconsented enrollment.
- One Class supports credit, audit and certificate seekers; only legally authorized awards issue.
- A Program with three Courses records three Course-level attempts and appropriate Classes.
- Same Class, different recorded instructors; grades and progress remain stable.
- One Class, multiple publication versions; no duplicate active enrollment, no oversold seats.
- Revoked Site/adoption blocks new acts without rewriting historic completion and credit.
- New canonical grading, attendance, consent and guardian policy enforcement verified.
- Pass typecheck, lint, unit/integration, browser E2E and restricted RLS before release.

**Do not run this migration on production or switch live routes to the new tables without
a separately approved release and empirical test01 verification.**
