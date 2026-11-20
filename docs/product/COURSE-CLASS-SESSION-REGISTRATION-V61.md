# CAN OS v6.1: Course Registration to Class Placement

## Canonical language

- **Program:** educational intent.
- **Solution:** the approved operating configuration.
- **Course:** what a learner registers to take.
- **Class:** the delivery of that Course at a Site, including self-paced delivery.
- **Session:** a dated instructional meeting belonging to a Class.

Cohort and Section are retired product concepts. Historical column names are not
permission to create new cohort or section experiences.

## Source of truth

| Record | What it owns |
|---|---|
| Course registration (`noncredit_registrations`) | Consent, enrollment capacity, registered Course, reporting and official noncredit completion |
| Class placement (`class_enrollments`) | The exact Class, instructor and Session participation |
| Course Attempt (`learner_course_attempts`) | One set of progress, lesson activity, assessment evidence and learning results |

A new noncredit Course signup uses the existing `enrollMyselfInNoncredit`
server command. Within **one transaction**, it first applies the published
Course release and verified enrollment terms, inserts the single Course Attempt,
then verifies and places the learner into an eligible current Class. The
Attempt receives a Class Enrollment pointer without dropping its original
noncredit Registration pointer or making another Attempt. The Class Enrollment
points back at that Attempt.

The complementary database migration `0095_course_registration_class_placement`
updates the original three-source check for this specifically authorized dual
reference and enforces exact Person, Site, Course, release and participation
provenance in a database trigger. Other combinations remain disallowed.

The additional Class participation attribution is an explicit view of the
**same Course enrollment**, not a second student or another billable learner.
Aggregate reporting must deduplicate on the Course registration / Attempt
source when counting learners.

## Eligibility and learner experience

- The Course must have an approved, open registration release and its original
  consent terms must be acknowledged.
- The Class must be active, at the exact authorized Site, for the exact Course
  version, deployment, adoption and Offering; active operator and Site authority
  are checked by `currentClassAuthority`.
- Scheduled Classes require future dated linked native Sessions, and capacity
  is checked under the Class row lock. Self-paced Classes may have no Sessions.
- Native Class self-admission retains the independently verified adult requirement;
  an unverified date of birth or a student role alone is not sufficient. This
  requires completion of the existing adult review/activation process.
- With one available Class, CAN OS selects it. With multiple eligible Classes,
  the learner must explicitly choose. It never guesses a schedule or Site.
- Existing registration and waitlist state remains source-owned. Historical
  pre-cutover registrations are **not** automatically rewritten or assigned.
- Existing native Class event projection sends one Class welcome confirmation,
  and attaches ICS invitations for the Class's scheduled Sessions using its
  idempotent email queue. Source `ClassEnrollmentCreated` is emitted atomically
  with the new placement. Actual email dispatch requires the relevant migration,
  worker and provider configuration.
- My Learning shows the actual Class title and its authoritative upcoming Class
  Sessions, reuses the original Course Attempt and the existing Course player.
- Course withdrawal synchronizes its linked Class placement in one transaction,
  preserving original learning, identity and consent history. The native Class
  withdrawal command cannot independently sever a Course-owned placement.
- The **noncredit Course registration** retains official completion authority.
  Native Class formal completion does not issue another completion decision for
  the same original Course registration.

## Integration checklist

1. Apply all prerequisite DB migrations in the required order on a reviewed
   integration branch, verify public table cutover and `0095` guard. Do not
   apply the migration to Neon main until test and migration acceptance.
2. Verify a new single Class self-paced registration and a scheduled Course with
   four real Sessions, including verified-adult identity and canonical Person.
3. Check last-seat race between Course registration, Class registration and
   an operator closing the Course release.
4. Check a Course with two Classes requires an exact choice and never
   silently picks the first.
5. Check one Course Attempt and two linked participation sources, no duplicate
   score/lesson/progress records, exact Person/Site reporting.
6. Check existing legacy registrations, open Course, verified withdrawal, a
   closed/withdrawn Class, and deactivated adult account fail correctly.
7. Confirm the generated emails and ICS events against a provider test inbox
   and existing Class-delivery operator status page.
8. Exercise published Class Session rescheduling, reminders, missing birth date,
   no Session, and delivery provider failures.
9. Verify completion policy and Class attendance evidence remain complementary,
   without duplicate official noncredit completion/awards.

## Follow-up work before full launch

The application code and migration are staged in the feature branch, **not**
deployed or verified with an end-to-end database/browser run. Remaining work:

- Existing historic Course registrations require an explicit governed Class
  migration/placement review rather than an implicit enrollment.
- Implement transfer and calendar cancellation on withdrawal and reconcile
  any already-sent invitations.
- Establish a single consistent readiness signal across Course discovery,
  Open enablement, and Class publishing.
- Reconcile official Course completion with Class placement terminal status,
  safely preserving Course and Class history.
- Remove legacy schema terms only through the larger approved public-table
  migration; product copy uses Course, Class and Session.

Do not claim live email, passing build or production readiness without
executing the verification above.
