# FullFlow — one integrated school-network-to-classroom progression

## 2026-11-01 — follow-up: family invitation and custody disclosure

New commits on **FullFlow**:

- Family invitation school/purpose selection now fails closed when a selected Program becomes ineligible, clears pasted contacts on a school change, and discards previously confirmed previews when pre-opening interest becomes authorized application outreach.
- Staff and guardian pickup commands preserve their original client mutation IDs after an uncertain server response, preventing UI retries from inventing a second unrelated event. The server continues to re-check current relationships/authority even on idempotent replay.
- The guardian-facing read model exposes only a generic active custody hold to someone other than its reporting guardian; restricted allegations, resolution notes and inactive hold history remain private. Denied adults' identities and raw witness notes are not returned to family-facing pickup history.
- Creating or resolving a custody hold, and denying a pickup, no longer broadcasts safety-sensitive details to every pickup guardian. Site-leader Action/escalation remains. A child uncollected under an active hold is routed for restricted staff contact instead of a broad family notice. Ordinary verified release and non-held uncollected alerts retain their existing guardian notification path.

**Important unmet operational requirement:** the school must implement verified, case-specific family contact routing and local jurisdiction/custody policy review before treating custody notifications as pilot-ready. Broad automated notices are not an acceptable shortcut; the release remains **HOLD**. These are code and unit/CI improvements, not authenticated child-safety acceptance.

---

## 2026-11-01 — current FullFlow school-day and launch source fixes

**Only FullFlow has been modified. Production, default main, protected Neon E2E, and feature-flag rollout are unchanged.** Drizzle 0057–0059 SQL and snapshots are committed; clean 0000–0059 SQL replay passes on disposable PostgreSQL. Standard CI has passed earlier integrated exact-head candidates. Final-day CI and authenticated acceptance need separate exact-head evidence; passing static tests is not proof of physical supervision, lawful campus opening or a one-hour timed launch.

Source work committed:

1. Guard three new pickup observations by server-derived school-local day while retaining historical reading and idempotent replay. Do not silently backdate physical release, denial or dismissal.
2. Keep canonical Program/Site recovery links after server-side launch creation or activation if navigation fails; freeze ambiguous invitation delivery retries until persisted batch records are verified.
3. Refresh the site-leader attendance reconciliation when duty, human witness or room coverage changes; canonical server fingerprint remains the source of truth.

**Outstanding P0:** a real uninterrupted two-adult supervised day with current local delegation, child safeguarding, program authorization, attendance, physical presence, denied/approved custody, separate site-leader witness, and distinct-person browser sessions; a timed real school launch with persisted site publication, invited families and same-student admissions handoff. Both require approved connected acceptance, legal/safeguarding authority, and realistic operational integrations. Historical 0053–0055 migration provenance and GitHub protected test credentials remain BLOCKED.

---

## Status reconciliation (28 October 2026)

At FullFlow HEAD `94a194c`: `npm test -- --reporter=dot` passed **219 files / 1284 tests**, `npm run typecheck` reports **0 diagnostics** (the 47 baseline diagnostics referenced in earlier entries are closed), production build, mutation hygiene, 86/86 route contracts and 75/75 static fixture declarations pass. The FullFlow A continuous six-stage Neon + issued-session browser journey remains **unexecuted** in this environment, so the current result remains **HOLD**. See `docs/CURRENT-STATE.md` (2026-10-28 addendum) for the full evidence list and remaining acceptance gaps. No live integration, production migration or authenticated browser run is claimed.

---

## P0 shared instructional coverage and restored acceptance contract (27 October 2026)

**Source implemented; focused checks executed, connected database acceptance
pending.** Restored the canonical six-stage acceptance contract and reconciled
its current evidence with the prior connected run. Launch and placement now
share one instructional-coverage decision: the same assigned instructor must
have an active full-term delivery arrangement and current teaching eligibility.
Placement can no longer treat a qualified but uncovered teacher as staffed, or
combine one teacher's coverage with another teacher's qualifications.

Focused validation: 38 unit tests passed; production build, 86 route contracts
and mutation hygiene passed. Typecheck retains 47 existing diagnostics and the
full unit suite retains 43 existing failures. The new connected placement
regression is authored but not executed against Neon. Current result remains
**HOLD**. Next P0: rerun the migrated FullFlow service suite, then prove the
same six stages with persistent registrar/publisher/teacher/guardian/student
browser sessions and reloads. No new UI component, schema, production mutation
or deployment was introduced.

---

## P0 supervised-day roster and canonical Section attendance (24 October 2026)

**Committed code and test cases; runtime verification pending. GitHub
Actions intentionally excluded.** Closed a church-hosted school privacy and
physical attendance entitlement gap: a generic `site_staff` account with
a Site grant was able to enumerate a CAN-operated church roster and
submit/replay attendance without a named local role. The shared roster
provider now excludes independent church-hosted Programs for generic
staff; the canonical append-only attendance write transaction independently
denies that role **before** idempotent replay. Ordinary schools retain their
legacy site-staff attendance workflow.

A student who merely has a Program enrollment at a church-hosted CAN
school is no longer projected as **expected onsite** until actively placed
in an instructional Section. The server's locked canonical attendance guard
also requires a Section for that school type, including registrar and
site-leader attendance entries, before an observation can be recorded.
When a Section ID is supplied, the student's active Section seat must
match the **actual Section's Program and Term school year**, not just its
UUID. This prohibits false physical presence claims via stale or
mis-keyed memberships, while preserving ordinary Program-level attendance
behavior at non-church-hosted schools.

Rollback-only integration acceptance now checks a church-owned Program's
generic staff direct write denial and an ordinary school's wrong-year
Section attendance denial. The existing historical attendance/absence,
correction, guardians and supervised-day workflows remain in place.
These new tests were authored but **not executed**. No production writes,
deployment, additional migration, or GitHub Actions repair.

**Remaining P0:** execute the complete same-child supervised day with
original identities and witnesses on isolated storage/DB, including staff
qualifications, full session coverage, arrival/pickup custody, and
reconciliation. Historical school-day observations must never be treated as
verified physical presence, custody release, or legal campus opening.

---


## P0 guardian academic membership and returned-feedback parity (24 October 2026)

**Source committed; execution not verified. No GitHub Actions work.**

A guardian with a verified academic relationship could previously see a
child's assessments and released grades based on an active Section enrollment
alone even after institutional Program withdrawal. The guardian assignment
query now requires **active Program + active Section** enrollment for the same
StudentProfile, canonical Program and Term school year, plus an active
Section and exact original guardian relationship/Site/Program scope.
The guardian student picker requires an active Program enrollment (so
children still appear before first Section placement, but not based on
orphaned Section records). Both guardian academic endpoints now return
private/no-store responses.

The independent guardian grade-review action read/write path now enforces
the same year-matched Program/Section condition before accepting a request
or showing an existing response. An authorized guardian does not retain a
school grade-dispute capability after the student's Program is withdrawn.

For the student revision journey, the guardian sees **already released**
teacher comments and annotations from a previously returned attempt
while the student saves or submits a new ungraded attempt, but does not
receive the child's new draft text, future score, or unreleased grading.
After the second attempt is graded, the guardian sees the newly released
grade and feedback; prior guidance is no longer presented as current.

Regression coverage was added to the existing same-student
parent → admission → student account → class → first assignment → revision
scenario: guardian reads the same released grade as student, sees prior
returned guidance without the student's draft, then loses grade and
grade-review access after Program withdrawal. Pure unit coverage checks
strictly previous released attempts only.

**Remaining P0:** runtime execution and correction of any real errors in
this same-ID acceptance scenario, followed by the last school-day
supervision acceptance blockers. No data migration or production change
from this patch.

---


## P0 learner's revision → feedback → second grading (23 October 2026)

**Source committed, not executed.** Implemented the next small slice
of the same-child classroom lifecycle. The student now retains the
previous **returned attempt's teacher comments and annotated response**
while saving or submitting attempt N+1; the new attempt keeps its
independent score and status rather than inheriting the earlier grade.
After the new attempt is graded, the current teacher feedback replaces
revision instructions. The student's Feedback filter includes work
that is being revised.

The real `returnSubmissionForRevision` transaction now blocks
unresolvable returns: a closed assessment, inactive Section or withdrawn
student's Program/Section membership is not a valid invitation to
resubmit. The same registrar-admitted learner's rollback-only acceptance
now exercises first grade → close/reopen hold → teacher return →
learner's saved draft (with visible feedback) → second submission →
grade 2 → feedback → historical attempt preservation. The test also
denies returning the old attempt twice and returning after withdrawal.

Assignment file safety shares the identical current
Program/Section/year membership check: no new private-file upload,
attachment association, listing or short-lived download URL can
be issued from a stale Section-only enrollment. Authorized students
can still read their own verified attachments after an assessment
is closed; only modifications require publication. Draft autosave
and final response updates preserve verified **current-attempt**
attachment IDs rather than overwriting the response JSON, while
a new revision does not silently inherit the prior attempt's files.
Small pure regression cases cover retention, canonical IDs and
deduplication.

**Remaining acceptance:** these changes were not compiled or
executed in GitHub Actions, which is intentionally excluded.
Actual isolated-DB and browser verification is still required before
calling the full end-to-end learning lifecycle complete. No additional
migration, deployment or live child record was created by this work.

---


## P0 first assignment → student submission → teacher feedback (23 October 2026)

**Source committed, execution unverified; GitHub Actions deliberately skipped.**
The canonical student's authenticated assignment read, response-draft,
final submission and feedback-history paths now use the existing
`authorizeClass`/student directory rule: a current active **Program plus
Section** enrollment for the same student, Program and school year.
The read path omits withdrawn students' assignments and feedback, and
write paths recheck inside the same transaction before creating any
SubmissionReceived or draft/audit record.

The connected rollback-only admissions fixture now drives a real teacher
`createAssessment` publication, reads it from the same independently
provisioned and passwordless-redeemed student's assignment view,
submits the learner's written answer, grades it using the actual teacher
service, and reads the **grade plus teacher feedback** from the exact
same student. On Program withdrawal, assignment reads disappear and
subsequent drafts are denied.

New assignments published through the gradebook's immediate-publish and
draft-to-publish routes, and through the older shared publication service,
now target **only** students with same-year active Program and Section
membership. Regression coverage asserts that an orphan Section enrollment
does not generate fresh assigned work after withdrawal. Direct legacy
student submission is also checked against active Program+Section membership.

The shared grade-posting service now uses the same live teacher-of-Section
authorization for host teachers and separately delegated CAN institution
teachers rather than wrongly requiring all teachers to have a global
`sectionIds` grant; nonteacher/service contexts retain their existing
explicit Section capability boundary.

No database migration, live email, merge or production deployment.
All integration cases have been authored but **not run**. Next P0 bite:
exercise actual first-lesson assessment resources and the end-to-end
returned-for-revision lifecycle, then targeted non-Actions runtime
acceptance when an appropriate test environment is available.

---


## P0 canonical workflow wiring — assigned CAN teacher, admitted child, local day (23 October 2026)

**Small patches committed to `FullFlow`; actual Neon/browser tests are NOT passed or executed.**

- The independent CAN teacher's named Section authorization is now used by
  missing-work lists/follow-up writes, evidence-backed academic intervention
  creation, the teacher's intervention queue and the shared academic Action
  resolver. Mutation paths recheck the Section/contract authority *inside*
  their transaction; CAN receives no host-wide church Organization/Site grant.
- Teacher Today class headcounts, missing-work queues, learning evidence,
  intervention listing/writes and onsite room rosters now require current
  active **Program + Section enrollment for the same student, Program and
  academic year**, so a withdrawn Program cannot leave phantom in-class
  students or intervention authority.
- Student login handoff requires an accepted Application plus exact active
  Program/Site/year placement. Its **first** independent registrar approval
  now requires explicit in-person or institutional-record identity attestation
  and records the review method. Subsequent passwordless-link requests
  audit a resend separately and do not duplicate institution approval events.
- The registrar's admitted-student screen links directly to the authorized
  onsite attendance register, and the related guardian view links to the
  child's attendance/excuse screen. Enrollment does not claim a physical
  check-in or discharge; staff must observe and record attendance.
- Absence notices and legacy excuse submissions require independently
  verified guardian attendance permissions, not bare relationship flags.
  All guardian notification deep links to child attendance, enrollment
  offers, submissions and grade responses use live verified relationships;
  stale sensitive attendance/application/offer/submission notifications are
  suppressed rather than merely stripped of hyperlinks. Missing-assignment
  email recipients now also require verified academic guardianship.
- Source regression in the same academic-family-to-class rollback test now
  asserts that a separately attested student can be provisioned and that
  passwordless resend does not duplicate approval events. It additionally
  tests the **same student's** attendance via an effective onsite calendar
  date and actual authorized staff attendance recording. The legacy academic
  intervention fixture explicitly creates a verified guardian and a
  matching active Program enrollment.

**Outstanding release blockers:** run `full-flow`, cross-persona
admissions/onsite tests, typecheck and browser reload acceptance against
the isolated disposable database. Existing GitHub workflows fail before
runner allocation, so these source commits are not proof of execution.
Keep merge/deployment and production migrations on HOLD.

---


## P0 same-student passwordless redemption and teacher roster integrity (23 October 2026)

**Source committed to `FullFlow`; no CI or independent runtime
verification claimed.** The user-requested focus remains the public
parent → accepted Application → staffed Section → distinct student login →
real first lesson, not administrative features or GitHub Actions repair.

- Expanded the **rollback-only admissions acceptance** so the registrar's
  approved student invitation uses the REAL passwordless challenge service
  with the outgoing email captured (not sent externally). The student's
  single-use link is actually redeemed, replay is denied, the DB-backed
  session cookie resolves to the original **student** Person, role,
  account, grant and host Site, and that same signed-in student opens the
  assigned published first lesson. An immediate registrar resend does not
  mint a second challenge inside the passwordless cooldown.
- On the student's **Today** page, the primary action now opens the first
  *substantive* published lesson of the first assigned class. A route-only
  marker is resolved against current classroom content **after normal
  authorized class access**; empty lesson shells are skipped. It is never
  a lesson ID supplied to a domain mutation or an access credential.
- The current teacher class roster **and** gradebook now require a child's
  active Section enrollment to be backed by their matching, independently
  active **same-year Program enrollment**. A Program withdrawal removes
  the child from today's teacher roster and gradebook without erasing
  historical assessment records. Regression acceptance extends the
  same-child withdrawal scenario through both teacher read boundaries.

This increment required no new schema or production migration. The
existing verified-guardian approval and separate student account
provisioning remain explicit safeguards. Acceptance has been authored,
but **not executed**; hosted Actions remain deliberately out of scope.

**Next P0 item:** run the same-ID acceptance in an available
non-GitHub test environment when one is available, and finish any actual
blocking portal transitions discovered; avoid additional features until
the student can use their learning session end-to-end.

---

## P0 enrollment-to-student-login and return-family usability (23 October 2026)

**Code committed; runtime acceptance not yet executed. GitHub Actions is known
unavailable and is not the next work target.**

- Student-learning-account eligibility now insists that the active Section
  row's **actual Program and Site** match the admitted Application and the
  student's active Program membership, and that the Section enrollment
  itself belongs to that same canonical school year. A mis-keyed/stale
  Section row cannot authorize a child's separate email login.
- The existing rollback-only same-child admissions fixture now extends
  beyond the teacher's first lesson: a real verified adult account
  consents to a separate student email, a registrar independently approves,
  the existing student Person gains the exact Site-bound student grant,
  and one sign-in email request is made (delivery mocked to prevent
  external email). The fixture rejects a mismatched-year Section before
  consent and restores the actual Section before approved provisioning.
- Admissions Section selection and the atomic Section placement command
  now use **one school-local date and seat-window predicate** rather
  than UTC midnight. Site timezone takes precedence; site-less online
  classes use the SchoolYear timezone. Impossible dates and full classes
  fail closed; rollover and capacity regression cases were added.
- The signed-in family application workspace now offers a direct
  **Resume this student's enrollment checklist** link for independently
  verified guardians, scoped to the exact saved Application ID. Pending
  unverified relationships still cannot access the child's records.

**Next product gaps on this path:** preserve a visible next step if the
family is pending guardian verification; verify the student can actually
redeem a real passwordless link (not only receive the invitation request);
match placement preview to schedule/prerequisite failures; execute the
connected multi-persona acceptance in an available environment when
practical. No deployment, merge, live student creation, email or production
migration was performed.

---

## P0 registrar seat and add/drop preview (23 October 2026)

**Source committed, test execution pending.** Extended the same real
admissions registrar selector beyond verified teaching identity, first lesson,
and signed institutional services to avoid promoting a **full class** or a
Section whose **add/drop window has ended** as placeable. The preview reads
canonical `getSectionRegistrationPolicy` capacity/deadline rules and counts
only active Section enrollments, while the transactional placement command
continues to lock and independently recheck roster capacity, deadline,
student credit limits, schedule conflicts and prerequisites.

On a one-seat class the rollback-only family-to-class test now asserts that
placing the first learner makes `readyForPlacement=false` for any additional
registration, without hiding the learner's already assigned class. The
registrar UI explains teacher, curriculum, agreement, seat and deadline
readiness separately from completed student placements. No new tables,
migration or production writes. CI acceptance remains blocked before
allocation of GitHub-hosted runners.

---

## P0 registrar class-choice consistency — no false-ready Sections (23 October 2026)

**Source committed, runtime acceptance pending.** Corrected another
family-to-class blocker in the actual `/admissions` registrar journey:
`listEnrollmentPlacements` was still running a *separate, weaker*
`section_teachers` + site-grant SQL query. It could call a class staffed
while the atomic placement command would reject a disabled or unverified
teacher or a host-only teacher at a CAN-operated church school.

That preview now calls the **same** `verifiedTeacherSectionIds` verifier
as `activateSectionEnrollment`, plus
`staffedPublishedSectionIds` to identify a truly placeable class.
The additional `readyForPlacement` result requires an authorized
academic instructor, the published first lesson and the currently verified
church/CAN school-of-record, curriculum and instructional agreement.
The actual registrar selector now offers only these ready Sections.
Missing/expired agreement and inadequate teaching identity are shown
as actionable readiness holds rather than another empty, failed enrollment
attempt. The enrollment command still rechecks all conditions under its
canonical transaction and maintains independent capacity, add/drop,
schedule and prerequisite checks.

The existing rollback-only family acceptance adds assertions verifying
that disabling the teacher flips `readyForPlacement` false, and restoring
verified teacher access flips it true. The separate church/CAN
authorization acceptance proves host staff never count as CAN teaching
coverage and signed-agreement revocation denies access.

**Database:** required existing tables and account grant columns were
confirmed on the isolated `fullflow-e2e-20261022` Neon branch; the latest
read-only check showed **43 migration journal entries**. No migration
or production write was performed by this increment. Tests have
**not** executed: GitHub Actions still fail before allocating runners.
Next task is running cross-persona acceptance with a trusted test runner,
fixing actual errors, and verifying preview plus atomic placement on
the same canonical student and Section.

---

## P0 CAN-operated church classroom staffing and revocation (23 October 2026)

**Source committed on `FullFlow`; tests remain unexecuted.** A church-owned
Site may use CAN as a **different institutional academic provider**. A
teacher grant belonging solely to the host church must **not** make the
admissions placement screen call that classroom academically staffed, even
if somebody inserted a `section_teachers` assignment.

The shared Section staffing check now accepts the original provider-wide
verified teacher membership where the provider differs from the Program
owner; only when a school owns **its own** academics can a Site-bound
teacher grant satisfy placement. Canonical class workspace and gradebook
authorization additionally reject host-only teacher access to independently
CAN-operated church academic Sections, require a named CAN-delegated Section
and original institution-wide grant, and independently check the current
academic-instruction + curriculum authorization. A previously signed-in
CAN teacher's **class directory** now rechecks the live operating agreement
rather than showing a stale delegated class after cancellation.

The rollback-only `program-site-authorization.integration.test.ts` now
creates a real church Program + CAN publisher course + Section + two
independently email-verified teacher accounts. It verifies that host-only
teaching membership does **not** count as staffed, CAN teacher membership
does, church staff cannot open the CAN-owned class, the CAN teacher can
open only their assigned Section, and contract revocation removes the
teacher's Section from the directory and denies class entry.

**No new schema, Site ownership transfer, production writes, or new general
partner roles.** The dedicated Neon + browser first-family-to-class
acceptance remains the only release-critical blocker. GitHub-hosted CI
and Neon test workflows still failed before any job runner or step was
allocated; source tests are not passing evidence.

---

## P0 learner membership integrity — prevent orphan Section access (23 October 2026)

**Source committed; execution not yet verified.** An active Section
enrollment can survive after its matching Program enrollment is withdrawn,
transferred or cancelled. Previously a learner could still open that
Section's lesson and see it in Student Today because class access
checked only the Section row.

The canonical `authorizeClass` student/guardian read now requires **both**
an active Section membership and an independently active Program membership
for the **same Person/StudentProfile, Program and school year**. The
`accessibleClasses` student/guardian directory applies the same
Program/Section/year join. Teacher Section discovery remains independent of
enrollment and is not broadened to Site or Organization access. Student Today
reads only Section records with a matching active same-year Program, and its
entrypoint requires active Program membership rather than any active row.

The existing rollback-only admissions journey now deliberately withdraws
the just-placed student's Program membership while leaving Section active;
checks first-lesson denial, class-directory disappearance and Student Today
denial; restores fixture state and confirms the student returns. This closes
a high-impact same-ID family-to-class revocation gap and does not require
new schema or unrelated Site CMS work.

**Remaining release blocker:** Actual database and authenticated browser
execution for first family → offer → Section → student lesson → teacher
class/gradebook, with CAN/church cross-organization persona test evidence.
Recent GitHub Actions failures have **zero runner/steps** and no retrievable
job logs; they cannot be treated as failing tests or successful tests.
No production environment was changed.

---

## Current P0 lesson + teacher gradebook handoff (23 October 2026)

**Source committed, actual execution not yet verified.** Closed a material
school-of-record operational gap: an explicitly Section-assigned CAN teacher
at an independently owned church Site could reach the class workspace but
`gradebook.functions.ts` still required the **church's Site/Program grant**
for its Section list, class roster, gradebook, assessment creation,
assessment publication and graded-work return. An institution teacher
must never receive such a host-wide permission.

Gradebook and assessment endpoints now share the existing
`authorizeClass` contract: (a) real teacher identity and canonical
`section_teachers` relationship, (b) original Site/Program scope **or**
one explicitly institution-delegated Section, and (c) current independently
verified institution academic authority for cross-organization CAN teaching.
Teacher Section discovery reuses the same `accessibleClasses` directory.
Assessment creation, state transitions and return-for-revision recheck
authorization **inside their write transaction**. The shared canonical
`gradeSubmission` service now rechecks Section/contract access in its own
write transaction for verified teacher callers, before GradePosted/audit.

The existing rollback-only admissions integration fixture now explicitly
reads the *same placed student's* first published lesson through student and
teacher workspaces, and checks the teacher's gradebook Section, roster and
student ID. This increases test coverage, but does **not** establish a passing
browser or database acceptance run. No production rollout/migration.

**Next release-critical gate:** Run actual isolated-Neon and authenticated
browser acceptance of the full family-to-class flow across CAN institution,
church host, registrar, parent, student and teacher personas; fix runtime
failures before building ancillary content, website or staffing features.

---

## Current P0 focus — put an admitted student in a usable class (23 October 2026)

**Critical path:** first public parent → email-verified canonical Application →
CAN admissions decision and accepted offer → active Program enrollment plus
real Section placement → student can open a first lesson and the assigned
teacher can teach. Church/Site ownership and CAN academic authority remain
separately verified.

**This bite (source committed; execution unverified):** A shared
`verifiedTeacherSectionIds` query now drives **both** the registrar's
placement candidate/readiness projection and the atomic Section enrollment
command. An assigned `section_teachers` row is not enough: the adult must
have an active Person, active nonsynthetic teacher account-person grant,
non-disabled **email-verified account**, and appropriate original Site
membership or an **organization-wide CAN academic-provider** membership.
The Section must belong to its canonical Program Site. The original
course-publication, first-lesson, agreement, enrollment, capacity, schedule,
prerequisite, audit and outbox checks remain independently enforced.
Regression fixtures now exercise disabled/unverified/synthetic denial and
candidate/transaction agreement on disabled staff.

**Do not divert P0** into more partner site styling, lead CRM,
network expansion, or additional local staffing framework until the
same-ID multi-role acceptance is executed. Next priority is running the
isolated database plus browser family → Section → first-lesson journey
and fixing any failed assertions. GitHub Actions runner allocation still
requires investigation; a committed test is not a passing test.

---

## Incremental application, classroom and student-access corrections (23 October 2026)

- Serialize a first-time parent+Program application before Household creation,
  and reject duplicate open Applications by that adult across Households.
  No name-only Person merging is permitted.
- Let authenticated adults resume registrar-created applications only when
  the exact guardian–student relationship is independently verified.
  Display pending/verified guardian review status on the family page.
- Reuse the original Person for single-identity multi-role access accounts,
  and reject ambiguous People, inactive People and revoked matching family
  memberships. An email link cannot silently reactivate a suspended grant.
- School placement now requires an independently authorized active Teacher,
  a published instructional course and live curriculum agreement. CAN teacher
  delegation requires an original organization-wide CAN grant, a named
  Section assignment and current independently verified school agreement.
- The legacy enrollment-only command is closed for church-hosted CAN
  programs: activation requires an accepted-offer+staffed-Section
  transaction. The Operations first-class metric additionally requires the
  same school year on active Program and Section enrollments.
- A **rollback-only Neon acceptance test** now exercises published Site,
  email proof, one-use link, guardian account grant, canonical application,
  replay/idempotency and pending child access. The existing enrollment
  test requires staffing before placement, then checks student and assigned
  teacher class access. These are source tests, not evidence of passing CI.

## P0 implementation slices — first public family and staffed class (23 October 2026)

**Source committed on FullFlow, not released or browser accepted.**

- **Published Site → email proof → canonical Application:** active academic
  program cards offer "Verify email to apply" through the dedicated tenant
  `POST /apply`. The Netlify edge host gate rewrites ONLY that exact action;
  tenant origins continue to deny account, session, private and RPC routes.
  The action accepts a bounded adult-only form with honeypot, same-origin and
  database-backed global/cooldown limits, checks Site and Program publication
  and current CAN/church service authority, and emails a short-lived hashed
  token to the CAN OS platform origin.
- **New parent account and resume:** `/family/join` atomically consumes that
  one-use token and establishes a real email-verified, Site-scoped **guardian**
  account/session. Existing accounts and verified family Person identities
  are reused only where the account-to-guardian relationship is unambiguous;
  ambiguous multiple guardian Person identities are denied, not silently
  merged. The parent lands at `/guardian/apply?programId=...`, submits a
  canonical Application and Journey through the existing authorized
  `startFamilyApplication` transaction, and later sees their own previously
  submitted application by authenticating again. Child relationships remain
  unverified and all three permissions false until explicit registrar review.
  Public email ownership **does not** prove legal guardianship.
- **Accepted enrollment → actual staffed class:** the registrar can preview
  Sections belonging to an accepted offer's school year **before** activation.
  The page offers one "Activate enrollment and assign class" command, which
  uses the existing Section allocation service **within the Program activation
  transaction**. Staff identity/grant, active Section, matching program/year,
  live church/CAN academic agreement, **published instructional course**
  version, class capacity, policy, prerequisites, schedule and audit/outbox
  all fail closed; any rejection rolls back enrollment and Section placement
  together. For a church-hosted CAN program
  the direct activation path refuses a missing Section ID entirely.
- **CAN teaching team:** a CAN account assigned as the Section teacher
  receives only independently approved **Section-level** academic visibility
  for a church-hosted class. Institutional organization membership is checked
  against current signed operating evidence on session use and per-class
  access, including within mutation transactions. The church Site,
  organization and other programs are **not** added to the CAN account's grant.
- **Database:** `0042_public_family_start_requests.sql` is in Drizzle's
  journal and **applied to isolated Neon `fullflow-e2e-20261022`**.
  The ten-column pending verification record has a unique token hash and
  expiration/status and school indexes; no change to production data.
  New regressions cover tenant host isolation, first-family CTA, constrained
  adult request, and the church-offer Section requirement.
- **Not yet accepted:** branch CI and Admissions Neon acceptance failures
  remain unresolved/uninspected as passing evidence; no multi-role
  browser run, DNS/TLS/feature flag rollout, public deliverability check or
  real teacher lesson/grade/guardian acceptance is claimed. Existing family
  records created through an independent registrar inquiry still require
  explicit institution identity reconciliation; an email match is not
  permission to adopt a prior student or Household.

## GF-B schedule-to-delegation coverage gate (23 October 2026)

**Source committed, runtime acceptance pending.** The Site supervision
projection no longer treats an active delivery arrangement plus a generic
local staff account grant as enough for an independently church-hosted CAN
Section's planned staffing. On the exact scheduled block it now requires
the same adult's verified, latest-configuration **Section-specific
responsibility**, the active local Site account role, and the institution's
current evidence-backed `onsite_supervision` agreement.

Missing responsibilities or agreements surface independent, actionable
`section_delegation_missing` and `operating_agreement_missing` gaps,
remove the block from planned coverage, and do not activate affirmative
duty acceptance. Replacing an appointment or operating authorization
changes the schedule's acknowledgment fingerprint, so a prior accepted
response does not transfer into a new authorization. Classroom staff
retain the ability to report inability to cover an assigned block.

The coverage projection continues to flag conflicts, absent calendars,
missing rooms and unscheduled Sections, and **never** claims physical
coverage. No schema change or production DB action was made.

**Next blocker:** verified staff training/screening per assigned
scheduled adult, real Section room occupancy and backup arrangements,
then separately authenticated end-to-end guardian → enrollment → Section
→ check-in/attendance → supervised day acceptance.

---

## GF-B local Site continuation — staffed Sections (23 October 2026)

**Source committed, not runtime accepted.** An independent church/CAN Program
now supports several separately appointed, expiring **Section-specific**
facilitators. The registrar launches this from **Staff each onsite class**,
using current SchoolConfigurationVersion, ProgramResponsibilityAssignment,
RoleAssignment and existing Site-specific staff grants (no new migration).
For this church/CAN model, the server rejects new Program-wide facilitator
appointments while retaining revocation of existing ones.

Onsite pupil roster queries for facilitators now draw ONLY from their
current, explicitly delegated Section enrollments, not the full Program
enrollment. Revocation of the independent CAN/church operating agreement
also denies these read queries. New attendance writes and idempotent
replays, plus affirmative scheduled duty acceptance, recheck the specific
Section appointment; negative inability-to-cover reporting remains
separate. Site leaders retain their distinct director-level permission.

**Not achieved:** named staff assignment does not yet prove a current
teacher/facilitator delivery arrangement, whole-block qualified adult
coverage, screening/training, physical supervision, room capacity or
safe school opening. Next P0 is the active per-Section schedule +
qualified local coverage/readiness gate, then the same enrolled child's
actual Section placement and attendance acceptance on isolated Neon.

---

## Current GF-B priority-two handoff — local Site authority (23 October 2026)

**Source committed, unverified.** The requested next implementation was
**priority 2** (church local director/facilitator delegation), while standalone
CAN academic staff access work was intentionally skipped for this bite.

- A host registrar can explicitly appoint/revoke **one Program-specific local
  director and one initial room facilitator** from already active, email-verified,
  Site-bound staff accounts. Uses canonical SchoolConfigurationVersion (a draft
  is provisioned at first appointment), ProgramResponsibilityAssignment,
  RoleAssignment, and current CAN/church onsite-supervision agreement.
- Appointments have a 90-day maximum term, optimistic conflict checks,
  exact Organization/Site/Program scopes, original active account-grant
  verification, transactional audit and domain events. Revocation remains
  available after agreement loss and serializes with actual onsite affirmative
  duty/attendance mutations.
- Independent church/CAN Programs now re-check named delegation at actual
  pupil-roster read and attendance-write boundaries, whole-site director
  attendance attestation, and facilitator/leader **affirmative** scheduled
  duty acceptance. Legacy same-Organization/nonchurch programs retain their
  previous role-and-duty behavior. Staff can still report inability to cover
  a duty after expiry/revocation.
- Registrar launch now exposes the local staff handoff. **No new database
  migration** was necessary; the existing canonical tables are reused.

**HOLD:** Actual execution of unit/database/browser tests, safe multi-facilitator
and deputy scheduling (the first assignment model has only one per role per
Program), independently verified staff screening/training, room-limited student
rosters, safeguarding and school opening approvals, and real cross-Organization
CAN academic staff access remain separate blockers. Draft school configuration
does not constitute a completed campus readiness review.

---

## Product override — first enrolled student into a real class (23 October 2026)

**Priority P0: churches and families, not additional website features.** The shortest
accepted operating journey is: independently owned church/Site → verified CAN
institutional relationship and delegated local authority → academic Program,
school year, published instructional Section and qualified teacher → real family
intake and verified guardian invitation → reviewed application, offer, consent,
active Program enrollment and **actual Section placement** → signed-in student
lesson and submission → teacher grade and guardian view → onsite-day reconciliation.

**Source-committed UX/integrity improvements (not browser accepted):**

- Operations now includes church-hosted academies in its academic-school guided
  journey; first-family navigation uses the real registrar intake instead of
  detouring through website publishing.
- Program launch prioritizes class setup and registrar-assisted family intake;
  private website editing is deliberately optional and secondary.
- Active guardian accounts without enrolled children point to admission offers
  and enrollment requirements rather than a dead-end family summary.
- Registrar admissions loads eligible Sections for an enrolled child on entry,
  while retaining the existing explicit, authorized placement command.
- The operational projection counts a placed student only if the **same**
  StudentProfile has an active Program enrollment and eligible active Section;
  Operations shows enrolled students awaiting placement and never labels the
  enrollment-to-class step complete while any active student remains unplaced.
- Unit regressions for school-type guidance, first-family routing, unplaced
  students and orphan Section placement were added; **no test run is claimed**.

**Additional 23 October source patches (unverified):**
- Registrar-created inquiries, including converted public interests, now
  navigate directly to their exact Application so staff can immediately
  verify guardianship, provision sign-in, invite the parent, and continue
  eligibility/offer review instead of hunting through the inbox.
- Guardian offer reads exclude pending/unverified or revoked enrollment
  relationships despite legacy boolean defaults; class counts require the
  Section to belong to the same Program. Enrolled families with assigned
  classes now have an explicit contextual `/classes` link. This is not
  anonymous online application signup.
- Guardian verification and invitation recheck registrar Program, owner
  Organization and Site scope. The shared enrollment application authorizer
  now requires independent guardian verification for checklists, forms and
  document workflows—not only the offer-list projection. Unit policy tests
  cover unverified, pending, duplicate and revoked relationships.
  The guardian offers workspace also gives pending applicants an explicit
  application status and checklist next action instead of "No offers yet."
- The church operating-authorization proposal previously defaulted to
  only four services and omitted **admissions** and **academic_records**,
  both required downstream. It now recommends the complete class/admissions/
  records entitlement set and removes `credit_issuance` for Programs without
  a credit issuer. CAN independent review, verified evidence, effective
  periods, individual staff grants and opening/safeguarding checks are
  unchanged requirements; no agreement is automatically approved.
- These are source changes with tests added, **not** recorded passing runs.

**Additional academic parent application and schema fixes (23 October 2026; source unverified):**
- New `/guardian/apply` permits an **existing, real, email-verified guardian
  account** with a verified school membership to start a canonical
  `Application` and enrollment `Journey`. The school must be active and
  within the original Organization/Program/Site grant, and the current
  CAN/church service authorization is checked **in the same creation transaction**.
  A repeated request ID is idempotent. Parents can revisit their own
  submitted applications and reuse a household they actually belong to.
  New child relationships have pending verification and no permission bits.
- Admissions intake resolves the submitting parent only for explicitly
  marked self-submitted Applications, while staff-entered inquiries continue
  to require a separately recorded contact. Registrar verification then
  enables the standard guardian account, forms and offer path.
- `0041_pending_guardian_access_defaults.sql` changes three default values
  for new guardian relationships (academic, enrollment and attendance to
  false), without rewriting existing rows. Registered in Drizzle journal.
  **Applied and inspected on isolated Neon `fullflow-e2e-20261022` only**;
  production unchanged. Ledger timestamp `1792738800000`.
- Offer acceptance/activation and admission-offer notification recipients
  use the same independently verified guardian policy. The shared SQL
  relationship predicate now additionally denies unverified academic,
  enrollment and attendance-excuse reads/writes across dependent modules;
  existing unverified records were not mutated to appear verified. Unit
  regressions cover family scope, parent/staff identity separation,
  pending relationships, and the SQL verification predicate.
- The authenticated parent path now serializes submissions for an existing
  Household and rejects duplicate open applications for the same full name
  and Program. It never merges child identities on a name match; admissions
  must resolve any genuine identity conflict. New-household collisions and
  cross-school deduplication still need dedicated policy and acceptance.
- **Still absent:** uninvited public parent signup, editable application
  drafts, full identity deduplication and general school account
  self-provisioning, and connected browser/multi-role acceptance. Source
  committed is not release readiness.

**Still P0 / not implemented or accepted:** uninvited parent account startup
and a public first-contact-to-application journey; CAN staff's effective
cross-organization academic permissions and local delegated responsibility;
legal/evidence-backed school-of-record agreement, opening/safeguarding and
day-supervision approval; executed disposable-Neon test and separate-session
church, CAN, guardian, teacher and student browser acceptance. The existing
staff-created inquiry is **not** a public self-service application. Do not
represent a school as ready because a private website draft or published
marketing page exists.

**Next implementation order:** (1) verified CAN/church authority and church
operator access; (2) parent start/resume of one canonical application with
email ownership and guardian relationship checks; (3) enrollment/Section
placement handoff and classroom activation; (4) onsite school day; (5) execute
single-program multi-role acceptance. Website customization, SEO and campaign
optimizations remain secondary until this path is green.


## Product priorities — cumulative implementation, 22 October 2026

The agreed order is **guided launch → action ownership/deadlines → Student 360 →
comprehensive learning-activity tracking → academics/credits → finance →
deeper hybrid scheduling → optional denomination features**. These are
improvements to existing canonical commands/read models, not a second school
platform. **The connected six-stage FullFlow journey remains the P0 acceptance
gate; comprehensive tracking is a required P1 feature, not a reason to defer
or claim that unexecuted journey passed.** Changes remain on `FullFlow` /
draft PR #172.

| Priority | Committed implementation | Remaining acceptance |
| --- | --- | --- |
| Guided launch | `guided-school-journey.ts` and `GuidedSchoolJourney.tsx` turn the scoped live Program record into six navigable steps. A step is recorded only from canonical DB evidence; school-wide operations is always marked Review, never an automatic acceptance pass. | Real staff navigation and reload with one linked Program |
| Operational action engine | `operations-action-triage.ts`, staff work queue, and `setOperationsActionDeadline`: urgent/due/unassigned ordering, due-date counts, verified site/program guard, auditable due-date change, existing owner's in-app alert. | Disposable DB tests for owner changes and deadline state, multi-role browser |
| Student 360 | Existing `/staff/students/$personId` gains an academic-activity timeline. Searches, active-section counts, missing-work counts, attendance, actions, insights, and referrals are constrained to permitted programs/sections/sites. A teacher cannot view the student's other, untaught classes or private referral history through this read model. | Different-program and shared-student teacher isolation tests on real DB |
| **Comprehensive learning-activity tracking (required P1)** | **Session/event persistence and student/teacher evidence surfaces committed; connected browser test pending.** Existing `access_sessions`, `lesson_progress`, `submissions`, audit/events, and attendance represent distinct facts; none alone records comprehensive learning engagement. [Tracking contract](./comprehensive-learning-activity-tracking.md) specifies learner sessions, lesson/resource engagement, bounded estimated active time, retries/feedback, hybrid/offline attestation, scoped Student 360/teacher views, and privacy/abuse protections. | Verify committed session/event ingestion with real authenticated student/guardian/teacher roles on isolated Neon; then add resource/media/submission event coverage, privacy/retention policy, deduplication stress tests, Student 360 timeline, and browser reload acceptance |
| **Site safeguarding and student welfare (pre-onsite P0)** | Restricted `incidents`/reviews/audit model already exists but cannot yet safely serve staff reporting. [Safeguarding contract](./site-student-safeguarding-and-welfare.md) requires onsite reporters, independent legally required outside reporting, urgent response, CAN/site duty rosters, case confidentiality and guarded family disclosure. **Not implemented; not safe to treat as an incident submission solution today.** | Jurisdictional school counsel approval, staff role/report-only permissions, case-level restricted access, direct agency-report evidence, emergency fallback, incident notification controls and offline/multirole acceptance |
| **Multidisciplinary student support cases (required P1)** | Existing support referral stages, support plans, services, Action/audit links and teacher follow-up exist. **Case-level counselor/paraeducator integration is NOT complete.** [Product/access contract](./multidisciplinary-student-support-cases.md) requires named coordinators, authorized specialists, tutors, coaches and paraeducator services with distinct privacy levels and service handoffs. | Explicit staff/case/service assignments, case-level scoped reads/writes, controlled role onboarding, service delivery/review outcomes and multi-role connected acceptance. Do not expose restricted counseling notes through teacher/site-wide views. |
| Academic credit and transcripts | `section-credit-policy.ts` removes the silent 1-credit fallback but **does not block official transcript issuance** when credits have not been recorded. Unknown credits remain null and display **Not recorded**. Official transcript snapshots preserve the missing-credit disclosure, courses, grades and institution of record. Registrar may configure Section credits in `/operations/launch/$programId` with an audit/event and a lock after finalized grades; section provisioning can also supply units initially. **Graduation eligibility and diploma issuance are different workflows**, not implied by a transcript. | DB integration and authorized registrar UI; issuance snapshot test |
| Hybrid starter | A deliberate Grade 9 extension preset pre-fills onsite two days plus asynchronous delivery in the existing launch form. It never creates regulatory compliance, signed curriculum, schedules, attendance expectations or staff grants. | Actual calendar and hybrid attendance acceptance, after core journey |
| Finance | **Not implemented.** No canonical tuition/billing/payments ledger was found. Do not generate money movements, financial aid or host-share percentages without an approved commercial/finance domain model. | Separate finance design and real ledger/payment integration; only after core-school acceptance |
| Network/denomination | Existing partner contract and affiliation code retained but **deferred**. | No expansion until continuous school acceptance |

**Transcript ≠ Diploma (canonical product rule):** A transcript reports the
academic record as it exists, including courses and finalized grades even if
credit information is incomplete. Missing credits must be displayed as
`Not recorded`, **not** silently set to zero or one and **not** treated as
an issuance blocker. Diploma issuance is reserved for a future separate
graduation-review workflow that checks the complete requirements for the
applicable institution/cohort (required course categories, minimum credits,
completion evidence, approved transfers, exceptions and authorized final
approval). Issuing a transcript does not assert eligibility, award credits or
issue a diploma. The transcript snapshot must remain unchanged when data is
later corrected; a new issuance captures the corrected record.

**Additional academic-authority gate:** the credit issuer is currently selected
when launching a Program, but independent legal authority for an external
academic provider/credit issuer is **not proven by a verified academic
partnership agreement**. Program metadata and school-staff choices are
insufficient evidence. Do not treat a configured credit unit or selected issuer
as legal accreditation/credit authorization. Separate verified contracting
and graduation/issuance authorization are still needed before using this
with real external credit issuers.

**Outbox:** `SectionCreditConfigured` and `ActionDeadlineChanged` are
registered as transactional fact/pass-through types with the existing worker,
preventing them from sitting forever as unhandled events. No external
email, payment movement or student credit award is made by these events.

**Gating facts:** the six-stage `tests/integration/full-flow.integration.test.ts`
continues to be **written but not executed** against the disposable Neon branch.
The new functional unit/CI checks cannot substitute for a linked database and
authenticated-browser run. Do not claim an overall FullFlow pass, even when
static CI is green.



## Church-Hosted School: distinct CAN institution / independent church site

See [Church-Hosted School acceptance](./church-hosted-school-acceptance.md). An initial `FullFlow` increment separates host Organization options from CAN academic provider and credit issuer options in the live launch form, validates CAN/issuer intent server-side for church-hosted cross-organization arrangements, and adds pure/GF3 tests. **This does not establish verified academic service agreements, a school-of-record grant, site authorization, site-day readiness or full-flow acceptance.** The existing host-owned `programs.organization_id` remains unchanged. Next bite: independent, revocable academic-services Site authorization with verified agreement evidence; only then enforce institutional operating scope. Current result: HOLD.

## Connected learning and school-operations workstream

User-approved order: **comprehensive learning activity → teacher intervention →
student success → academic progression → hybrid-site operations**.
See [Connected Learning / School Operations](./connected-learning-success-progression-hybrid.md)
for canonical owners, committed source, deferred work and acceptance gates.
Current source includes learner session/event tables and scoped ingestion, a
student lesson tracker, assigned-teacher learning evidence, student course
next steps, a **non-authoritative** credit-gap calculator, and a hybrid
attendance/online-evidence separator. The last two are **pure domain
foundations, not working registrar/site-leader workflows**. All feature
acceptance remains separate from static CI and from P0 FullFlow proof.

## P0: canonical continuous six-stage journey

**[The single FullFlow acceptance contract](./full-flow-acceptance-contract.md)
is the primary priority and release gate.** One independently operated K–8
school must create a high-school extension, adopt course content, provision an
actual teacher/section, admit and activate a family/student, submit and grade
real work, notify/serve the guardian, and see the same persistent operational
record. The same tenant/program/section/student IDs must survive all stages.

**Current result: HOLD / NOT YET PROVEN.** A connected service-level
acceptance test now exists at `tests/integration/full-flow.integration.test.ts`
but has **not been executed** against the migrated isolated Neon branch. Browser
acceptance with separate actual user sessions and notification/reload evidence
remains missing. The canonical acceptance contract lists exact environment and
execution details.

**Isolated Neon branch:** `fullflow-e2e-20261022`
(`br-proud-pine-arfju8h2`), **32 migrations confirmed as of 22 October 2026**.
Migrations `0030_anonymous_auth_request_budget.sql` and `0031_learning_activity_tracking.sql` were applied transactionally to this isolated branch, including matching Drizzle migration ledger entries. Read-only verification confirmed `auth_request_rate_limits` and its three columns. The existing `access_sessions`, `lesson_progress`, and `submissions` tables, required columns and unique indexes were also confirmed; no additional session or lesson-completion table is required for the current first bite. A dedicated *authentication* last-interaction column is optional, but the separately specified comprehensive learning-activity event history is required P1 work, not a P0 FullFlow fixture prerequisite.

**Connected schema guard:** `scripts/verify-fullflow-schema.mjs` now fails the connected `full-flow` integration runner before fixtures when the isolated database's migration count/latest checksum or required auth/session/learning columns/indexes differ from the FullFlow source. It uses `TEST_DATABASE_URL` exclusively, after the existing test-database isolation checks; `--preflight` intentionally remains an offline URL-isolation check. **The Node schema guard has been committed but has not passed on a trusted connected runner**; live multi-persona tests and the full six-stage fixture remain unverified.
**Latest full-flow code static CI:** [39740004930](https://github.com/bryanhkelly/can-os/actions/runs/39740004930)
passed build/typecheck/unit and migration checks. This is not an integration
or browser pass.

Disconnected GF1/GF2/GF3 or network tests do not satisfy this
requirement. The immediate blocker is **executing the connected fixture**
against the prepared isolated Neon branch using a trusted Node runner.
The next gate is real multi-persona browser acceptance, including persisted
notification, intervention, school dashboard and reload. Existing denomination
HQ/site affiliation work below is retained but **P2 optional entry-path work**,
not part of the core school end-to-end gate.

---

**Working branch:** `FullFlow`. No changes to `main` without explicit approval.
This checklist records evidence and blockers, not automatic production acceptance.

## Product boundary: agreements, affiliation, school operations

1. **CAN** contracts with an independent denomination/network organization. An executed commercial agreement is **not** the same as a verified user grant.
2. **Denomination HQ administrator** holds an explicit `network_admin` membership under their denomination organization. HQ may create **directly operated** Site records for that organization. This membership does **not** grant academic, guardian, medical, admissions, curriculum-publishing or student-operation authority.
3. **Independently governed church/school** remains the owner of its own Organization and Sites. A site can request denomination affiliation without changing `sites.organization_id`.
4. **Affiliation link** is a reviewed relationship between a denomination Organization and a pre-existing Site (with its owner Organization). It must have its own pending/approved/rejected/revoked state, evidence and independent permission checks. A pending request is **not** an approved network membership and approval is **not** a student-data grant.
5. **Local school operator/registrar** still performs the separate school/program launch, academic setup, admissions, enrollment and classroom activities under its own grants.

### Two intentional HQ entry paths

- **HQ-created location:** authorized denomination HQ administrator creates a `Site` with `organization_id` belonging to that denomination. No school program, admissions or student record is automatically created. Implemented in this bite.
- **Site-requested affiliation:** an authorized local school/site administrator identifies the denomination, submits an affiliation request, HQ reviews and accepts/denies. Keep the original site owner and school grants intact. **Implemented in code in bite 1C; isolated database and browser acceptance remain pending.** Do **not** use `organizations.parent_organization_id` to impersonate a reviewed multi-network affiliation or silently grant HQ academic access.

## Integration repairs — 23 October 2026

The six-stage journey remains unaccepted. Two launch-to-staffing integration
defects were patched on `FullFlow`:

- **Initial teacher qualification policies** now require the same explicit,
  program-scoped institutional publisher role grant as revisions. The launch
  UI hides publication from unauthorized registrars; integration fixtures
  check denial with no persisted policy and authorized publication.
- **CAN academic-provider teacher discovery** now uses the exact same scope
  predicate as assignment eligibility. Selecting CAN as an external provider
  does not expose its organization-wide teacher directory or grant those
  teachers instructional authority. External staff must have an explicitly
  Program-scoped role assignment; GF3 fixtures assert both sides.

**Acceptance evidence:** Changes are committed; the new tests are **not
executed**. Dedicated FullFlow Neon is at **39/39 migrations**, verified by
read-only SQL. GitHub Actions continues to report pre-step failures without
an assigned runner, so these are not application test assertions. The next
priority is executing the guarded FullFlow database suite and fixing its
first actual runtime failure.

## Bite register

| Bite | Goal | Implementation | Acceptance |
| --- | --- | --- | --- |
| 1A | Correct organization-wide vs site-limited school launch grant handling | In `FullFlow`, inherited from prior school-launch patch | Primary CI passed on prior isolated patch; signed-in acceptance pending |
| 1B | HQ creates its own location with distinct non-academic `network_admin` grant | Server commands, domain policy, HQ workspace and unit tests added on `FullFlow` | Primary CI passed; isolated database/browser acceptance pending; HQ grant must be deliberately provisioned |
| 1C | Independent site requests link to denomination; HQ reviews it | New `site_affiliations` table, local request/withdraw, HQ approve/reject/revoke, UI and guarded integration fixture added on `FullFlow` | Primary CI passed (run `39732006470`); database/browser acceptance pending |
| 1D | Verify network contract and provision HQ officer | Agreement evidence + effective-term table, CAN steward authorization, officer authority checks, server-side contract gates and steward desk on `FullFlow` | Primary CI passed (run `39735575551`); isolated database/browser acceptance pending |
| 2 | Independently governed school configures high-school extension | Existing GF3 flows, then closed-loop acceptance | Not accepted |
| 3 | Curriculum adoption, teacher and class provisioning | Existing canonical publisher/school/classroom tools | Not accepted |
| 4 | Family application, offer, activation and class assignment | Existing GF22/GF2 | Not accepted |
| 5 | Lessons, assignments, submissions and grades | Existing classroom/learning | Not accepted |
| 6 | Parent, teacher and operational follow-through | Existing GF1/GF4/actions/notification flows | Not accepted |

## Acceptance for bite 1B

- HQ grant belongs to a verified denomination Organization and has no Site restriction.
- HQ can create and read only Sites **owned by that denomination**, never Site/Student records belonging to independent affiliated entities.
- Repeating an identical create for the same slug is idempotent; conflicting slug details reject.
- Every successful write creates canonical transactional `SiteCreated` and `network.site.create` audit evidence.
- A local registrar or site-restricted HQ membership cannot create an HQ location.
- School creation, enrollment, staff grants and program launch are **not** side effects.
- Typecheck, build and unit tests are required; isolated Neon service test and real signed-in browser test remain separate acceptance gates.

## Open issues

- A legitimate HQ `network_admin` grant needs a separate authorized CAN onboarding/provisioning path; the existing school registrar staff invitation is not allowed to mint one.
- The existing `sites.organization_id` is an ownership edge, not a network-membership edge. A new association model with clear permissions and independent approvals is necessary for site-requested links.
- Do not assert a denomination-wide right to student data or treat a signed contract as automatic access.

## Bite 1C implementation — affiliation request and HQ decisions

- Independent local registrar can request one denomination affiliation for each owned/authorized Site; the request is scoped to the actual owner Organization and Site and includes a message.
- Only denominations with a currently active, organization-wide `network_admin` grant appear as request targets. This is an operational routing condition, **not** proof of a commercial contract.
- HQ can approve/reject a pending request and revoke an approved link; site owner can withdraw pending/approved links.
- Conflicting duplicate requests are refused; identical pending retries are no-ops; rejected/revoked links can be requested again and emit new event/audit evidence.
- Never edit `sites.organization_id`, user grants, enrollment, program, student or family records as a side effect.
- The new schema migration is `drizzle/0028_site_affiliation_link.sql`. Generated schema parity must be independently checked by CI. Do not deploy migration without review.
- `tests/integration/network-affiliations.integration.test.ts` uses a rollback-isolated synthetic site/denomination and the actual request/review commands, including cross-denomination denial and owner continuity; it is not counted as passed until a disposable-database run completes.

### Remaining blockers

1. Dedicated, authorized CAN-issued HQ membership provisioner tied to verified executed contract; current `network_admin` grants must be assigned out-of-band by an authorized steward.
2. Explicit, versioned partnership agreement/entitlement evidence must gate production affiliation approval. A verified HQ grant is not sufficient contract proof.
3. Browser acceptance with real authenticated sessions and an isolated database, including negative access to student/family endpoints, remains unverified.

## Bite 1D — verified partner agreement and HQ officer provisioning

A verified HQ login is **not** sufficient to operate a network. A verified **current agreement** is now required by the HQ site workspace, site creation, affiliation request target discovery, and HQ affiliation review. Once the agreement expires, HQ management operations fail closed; local school ownership and affiliation history remain unchanged.

A separate `can_network_steward` role, granted only under a verified CAN-network Organization with no Site restriction, can:
1. Record the existence of an externally signed agreement. It must reference an existing `documents` row with `subject_type='organization'`, denomination subject ID, `category='network_agreement'`, valid independent `verified_at` and `verified_by_person_id`, and no expired evidence. The steward recording the contract cannot be the same Person who verified that document.
2. Create an organization-wide `network_admin` grant only while a contract is current, with a second independently verified `network_hq_authority` Document whose `metadata.authorizedEmailNormalized` **exactly matches** the invited officer's normalized email. A locally existing account/person is reused; otherwise an account/person is created. This records a real membership but does **not** bypass email verification or send a mail message.
3. Review contract terms and the recorded agreement reference in `/network-steward`. This interface is a post-verification record, **not** an upload, e-signature, independent verification or contract-negotiation system.

Authority and evidence are **distinct**:
- CAN steward may not enroll students, open programs, modify schools' registrar grants or review student records.
- Denomination HQ grant may not manage student data or grant itself stronger roles.
- School registrar may not mint `network_admin` or `can_network_steward`, including by toggling existing grants' active status.
- All agreement and HQ-provisioning mutations write transactional audit and domain events. Identical contract reference retries reuse existing details; changed reference details reject; active officer membership retries reuse existing grant.
- New schema is `drizzle/0029_network_agreements.sql`, reviewed in GitHub CI only; **not migrated to production**.

### Remaining acceptance blockers

- The very first CAN-steward membership must be bootstrapped by a separately authorized operator; no browser self-registration or school registrar escalation exists.
- Independent signed-contract and HQ officer-authority verification/upload pathways are not yet implemented in CAN OS. The steward desk accepts IDs of **already independently verified** Documents, not legal attestation by checkbox.
- Contract term revocation and renewal workflows, explicit entitlements, independent verifier administration, account invitation delivery and dual-control review need subsequent focused bites before commercial production acceptance.
- Isolated Neon integration and authenticated-browser validation must run before treating this as fully accepted. Missing isolated Neon CI configuration remains a blocker.

**Last verified CI:** [run 39735575551](https://github.com/bryanhkelly/can-os/actions/runs/39735575551) passed on commit `194ef48758c36a41702934635c67ec4f810b9eec`. The separate Admissions Neon Acceptance job failed at **Require isolated test database secret** before running database-backed tests; it does not establish a failed product assertion. The focused mode `npm run test:integration:network-onboarding` is implemented but unexecuted.
