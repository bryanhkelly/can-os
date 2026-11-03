# CAN OS — current implementation snapshot

## Authorized main demo reconciliation (2026-11-02)

- At source commit `8d4494789241137c0b15ad1350d7b4d595d9b186`, applied only
  migration `0061_demo_school_tenants` to attested main with explicit operator
  authorization, branch/ledger guards, bounded locks and one atomic transaction.
  Exact ledger hash and registry schema postflight passed; see
  [identity and demo access](./identity-and-demo-access.md).
- Browser verification created a separate synthetic `.demo` tenant and signed
  its initial Site Admin into normal Launch Studio without email delivery.
- A separately authorized, exact-identity Valor fixture reconciliation restored
  the missing parent Program enrollment for eight historical active Section
  memberships, the existing guardian relationship's explicitly simulated
  verification, a shared synthetic Household, missing institution memberships
  and Riley's scoped teacher role. Fixed Valor account verification timestamps
  were reconciled with explicit audit evidence that no email was delivered and
  no actual email ownership was verified. No authentic identity was adopted.
  These are operator-reconciled fixture facts, not real admissions, consent or
  credential-review evidence. An identical retry added no duplicate audit facts.
- Playwright verified Jordan's Today page with eight classes and coursework,
  and Morgan's family home with Jordan rather than an empty enrollment list.
  At that checkpoint Riley still lacked qualification policy and evidence; the
  subsequent authorized repair and browser evidence below supersede that blocker.
- Broader school lifecycle, authentic-record use and release readiness remain
  unverified. These checks do not replace isolated integration acceptance.

### Teacher evidence and connected learning follow-up (2026-11-02)

With subsequent explicit authorization to configure and repair the demo:

- Reconciled only the legacy active Valor Hybrid Program's missing teacher
  policy, without changing its status or bypassing the pre-opening editor gate.
  Version `f7300000-0000-4000-8000-000000000002` requires shared catalog entries
  `teacher-resume`, `bachelors-degree` and `teaching-license`. This is a chosen
  demonstration school policy, not universal requirements or regulatory advice.
  Operator reconciliation source is
  `operator-authorized-valor-qualifications-20261102`; catalog/policy audit and
  domain events are retained. Identical reconciliation retries create no
  duplicate policy versions.
- The configured private R2 bucket accepted `Content-Type`-only preflight but
  rejected the immutable upload's `If-None-Match` header. After the operator
  added that header to bucket CORS, the exact local browser preflight returned
  204. Wildcard origins remain operator-configured; this does not meet the
  documented production exact-origin hardening recommendation.
- Enabled `CAN_R2_QUALIFICATION_UPLOADS_ENABLED=true` locally, not on Netlify.
  Playwright submitted explicitly simulated resume, degree and license PDFs
  from Riley's profile. Real private objects, signature/size verification,
  restricted document metadata and immutable submission decisions were
  independently verified. Alex's separate reviewer identity approved all
  three through the ordinary review UI with explicitly simulated reasons.
  These are not real qualifications or an assertion of human-independent review.
- Riley's class directory and gradebook now expose eight assigned classes.
  Playwright published `PW Connected Demo Learning 20261102` in Algebra I:
  assessment `c0668f18-eb50-4937-ad51-d971cae18f21`. Jordan saved and submitted
  a response with receipt `6839647b-ed18-4fe4-8059-21f8cd6e3272`. Riley saved
  an unreleased grading draft and then posted 9/10 with feedback. Both Jordan's
  assignment and Morgan's academics displayed the released feedback; Morgan
  also displayed the numeric grade. The database independently verified the
  published assessment, graded/on-time submission, audit and domain events.
- Jordan sent an assignment discussion message, Morgan replied, and Riley read
  both in shared thread `f1997d6a-266d-4e77-9c45-567042f8c6ac`. No email
  delivery was required or claimed.
- Processed only the exact scenario's 19 qualification/learning/message events through the ordinary worker
  using its bounded event-ID selection. Guardian notifications displayed the
  grade and student message; marking the grade notice read succeeded. No
  queue-wide drain, external delivery worker or unrelated tenant repair ran.
  An identical worker retry processed zero events and retained exactly six
  notification rows, including the guardian's persisted read status.
- Found a coverage-repair UI gap: already-assigned teachers were excluded from
  the selector even when their historical assignment lacked delivery coverage.
  Kept those teachers selectable and reused the existing qualification-checked,
  idempotent assignment command. Playwright reconfirmed all eight existing
  Riley assignments. Independent database and service evaluation found exactly
  one teacher relationship and one active full-window arrangement per class;
  all eight returned staffing `ready: true`.
  The eight resulting delivery-arrangement events were also processed with the
  same bounded worker, bringing this scenario to 27 processed events.
  Four current curriculum classes
  also showed first-week readiness. Four legacy classes still explicitly lack
  learner-facing lessons and instructed introductory assessments; their
  content-readiness blockers were not waived.
- Validation: TypeScript passed; 85 focused cases across eight files passed,
  focused worker/coverage lint passed, route inventory passed at 108/108, and
  whitespace checks passed. Worker-selection cases cover scoped claim/recovery,
  empty selection, malformed IDs and ordinary default. Isolated database
  integration and all other golden-flow acceptance remain unverified; staffing
  recovery is not full school lifecycle or release certification.

### Admissions, attendance and support continuation (2026-11-02)

On the same source commit with local, uncommitted UI fixes, continued Playwright
walkthroughs against the explicitly authorized synthetic Valor records on main:

- Reconciled only Morgan's missing canonical contact email after exact fixed
  account/person/grant checks, retaining an operator audit. The sibling-intake
  email/verified-household guard was not relaxed.
- Application `dfdf5713-0b51-41bb-a2c0-f145166dbee0`, for
  `PW Admissions Synthetic 20261102`, reused Morgan and the existing Household.
  Exercised inquiry, verified guardian relationship, eligibility, waitlist and
  restoration, registrar readiness, guardian form signature, returned correction,
  re-signature, approval, offer issue/acceptance and atomic Program/Algebra I
  activation. All evidence explicitly identifies a simulated walkthrough.
  Independent database checks retained both signatures and both reviews, one
  accepted offer and exactly two active enrollments (Program and Section).
- Fixed guardian verification's unsupported native prompts with an inline
  method/evidence form using the same server command. The new form completed
  the walkthrough. Fixed a contradictory selected-application empty state and
  added scoped capacity-setup guidance when no school-year seat pool exists.
- Configured a 30-seat school-year pool through the ordinary UI. Set only
  Algebra I's add/drop deadline to November 30, preserving its December 18
  withdrawal deadline, rather than bypassing registration checks.
- Morgan's academic view exposes the new child's four Algebra I assignments,
  with zero released grades. No new student login or shared-code persona was
  created. Fixed registrar handoff copy to identify missing guardian consent
  rather than incorrectly reporting missing classroom readiness.
- Configured one explicitly simulated November 3 instructional day and a
  Monday-Friday 08:30-15:00 timetable, attached only to Algebra I through the
  audited lifecycle editor. Direct Alex sign-in verified future first-day
  preparation, but supervision remains blocked by missing facilitator and room.
  No attendance, supervision or actual school opening was certified.
  The staff live attendance view showed no roster for that future day; its
  relationship to the preparation projection remains unverified.
- Approved Jordan's existing synthetic October 13 excuse through the staff UI.
  Independent database checks retain the original absent event and exactly one
  superseding excused event; original attendance history was not overwritten.
- Riley referred the new learner for academic coaching, and Casey accepted,
  saved a plan, scheduled and completed an explicitly simulated service, moved
  to review and closed the referral. Action
  `f1ce15a5-76a5-4fe4-baf9-e884cc2db693` resolves to typed referral
  `e5fea852-2950-47bc-a377-9923d5431581`. Database checks found one plan, one
  completed service and all six stages retained. Riley sees the closed status;
  Morgan's direct navigation to the staff support record is denied.
- Validation: TypeScript passed; 40 focused navigation/handoff cases passed;
  focused ESLint returned zero errors and five existing warnings; route inventory
  passed at 108/108 and whitespace checks passed. This continuation did not drain
  the outbox or verify new notification/email delivery, provision student access,
  run isolated database integration acceptance or verify Netlify production.
  Remaining journeys and exceptions are not certified by these bounded checks.

### Physical classroom setup follow-up (2026-11-02)

- Added reusable Site-owned physical classrooms to normal school setup, separate
  from teaching Sections. The launch portfolio links to the academic setup's
  `Physical classrooms` panel. Scoped Site Admin/registrar commands create rooms
  and assign default Section locations, with transactional audit and domain
  events, stable-ID replay checks and case-insensitive Site/name uniqueness.
  Rooms are shared across Programs at the same Site. At this walkthrough the
  catalog was create-only; the later lifecycle follow-up below supersedes that
  limitation, but is not a complete facilities workflow.
- New daily onsite coverage plans must select a saved same-Site room. The server
  rejects another Site's room or client-supplied capacity/name changes, and
  rechecks canonical room identity at independent approval. The default class
  location preselects the room when no current plan exists. Existing reviewed
  legacy documents retain their evidence and expiry; defaults never replace
  approved daily plans or certify safety, inspection, attendance or opening.
- Under the operator's standing authorization for necessary demo configuration,
  applied only additive migration `0062_site_rooms` to exact-attested main in one
  transaction, after previous migration hash/ledger and table-absence checks.
  Postflight verified the five columns, primary/foreign/check constraints and
  indexes; identical retry performed no DDL. No existing business rows were
  rewritten by the migration.
- Playwright created `SIMULATED Valor Classroom A`, occupancy limit 30, through
  Alex's ordinary setup UI and assigned only Algebra I's default location.
  Reload preserved both. Independent main reads verified room
  `5089f3d9-60b4-49cb-a15f-958b77bd8477`, Section
  `7b6eb18e-8191-fbd5-bc2d-cd860e6b26a0`, one `SiteRoomCreated` and one
  `SectionRoomAssigned` event, and one corresponding audit for each command.
  No supervised day or new daily plan was approved.
- TypeScript, production build and 60 focused room/plan/setup cases passed.
  Route inventory passed at 108/108 and whitespace checks passed. Focused new-code ESLint
  passed without errors or warnings; the wider touched surfaces retained three
  existing warnings. Isolated room-plan database integration, the specialized
  daily plan selector in a browser and Netlify deployment remain unverified.

### Calendar and family conference continuation (2026-11-02)

Using the same authorized synthetic Valor records on main:

- Playwright exercised Alex's private personal calendar create, edit, reschedule
  and confirmed cancellation. Event `f31ee3bc-f96c-42ce-8284-d4147b2f6758`
  remains cancelled, with its revised occurrence at Nov 5, 14:00-14:30
  America/Los_Angeles. Independent reads verified matching scheduled-occurrence
  times and one audit/domain event per mutation. Morgan's private calendar did
  not expose Alex's event.
- Fixed month navigation that previously reset on reload because Next/Prev
  updated only component state. Month and selected day now derive from the
  validated search date; navigation retains view/source/Section filters and
  clears stale event selection. Superseded month loads cannot overwrite newer
  results. Playwright verified December survives reload with Personal/Agenda
  retained, Prev returns November, and selecting Nov 17 updates URL and form.
- Riley published `SIMULATED PW Family Conferences 20261102`, series
  `545c03b4-ca23-4531-aa89-88e17f98f33a`, with three Nov 5 slots, 16:00-17:00
  America/Los_Angeles. Morgan booked the new synthetic sibling, moved the
  appointment from 16:00 to 16:20 and cancelled it. Booking
  `05e30a97-5c75-433e-81bd-dff4ee63a467` retains its history.
  Morgan then booked Jordan at 16:40; Riley saw Jordan's appointment, queued
  one reminder and cancelled booking `e5437c14-9067-4d00-b43f-51d2457fefa2`.
  The ordinary teacher UI returned to three of three slots open.
- Fixed missing teacher/series/timezone labels on family availability, bookings
  and reschedule choices. Playwright verified Riley's name, series title and
  America/Los_Angeles labels after reload.
- Source inspection found that outcome recording could overwrite cancelled or
  completed bookings and record future attendance, while teacher reads dropped
  ended appointments before no-shows could be recorded. Added locked
  booked-only transitions, start/end-time guards and recent-booking retrieval
  independent of future series. Future outcome controls are disabled and
  reevaluate every 30 seconds; server time remains authoritative. Playwright
  confirmed future held/no-show controls disabled. No future conference was
  falsely recorded as held or missed.
- Independent exact-main verification found exactly two cancelled bookings,
  three available slots, matching cancelled calendar/occurrence projections,
  three canonical participants per booking, exactly one audit/event per
  exercised command and one persisted unread guardian reminder. No email or
  external delivery was claimed; the existing historical reminder is retained
  after cancellation. No outbox drain or schema migration ran in this segment.
- Enrichment's normal catalog showed no open programs. Registration,
  publication/safety gates, conference outcome/follow-up browser completion,
  isolated database integration and Netlify deployment remain unverified.
- Validation: TypeScript and production build passed; 74 focused calendar,
  authority, family-experience and conference cases across six files passed.
  Focused ESLint returned zero errors and 19 existing warnings on the calendar
  and teacher-panel surfaces. Route inventory passed at 108/108 and whitespace
  checks passed. These bounded results are not all-flow or release certification.

### Study groups, pickup authority and family health review (2026-11-02)

Continued ordinary Playwright commands against only the authorized synthetic
Valor records on main:

- Jordan created `SIMULATED PW Algebra Collaboration 20261102` from Algebra I
  and invited the newly enrolled synthetic sibling. Group
  `bb9ddaea-dc25-44e4-9c45-8affd169d7a8` uses Riley as the existing Section
  facilitator. Morgan granted permission, then Riley separately approved
  Jordan's membership. The invitation did not create an approved sibling
  membership or provision a student account.
- Riley scheduled session `d0bf2546-0fdf-4d9a-9491-e2c469f41caf` for Nov 6
  at 15:00 America/Los_Angeles. Jordan RSVP'd going and posted an explicitly
  simulated, harmless moderation exercise. Reporting the post reproduced
  `prompt() is not supported`; replaced the native prompt with the standard
  accessible ActionDialog, bounded reason input and shared mutation feedback.
  The new report reached Riley's ordinary moderation queue. Riley hid the post
  and resolved its moderation Action; Jordan's reloaded discussion omitted it.
- Riley moved the session to 15:30-16:00; Jordan's group view and canonical
  calendar both showed the new time. Riley cancelled it; Jordan saw an explicit
  Cancelled label and no RSVP controls. No future attendance was recorded.
- Jordan left and requested membership again. Fixed guardian permission cards
  to identify the canonical child by name rather than group title alone;
  Playwright verified `Student: Jordan Example`. Morgan declined this request.
  Changed misleading student pending guidance to name both current guardian
  permission and facilitator approval. Jordan withdrew the pending request.
  Discussion/session access and the calendar session were absent afterward.
- Independent exact-main reads verified one group, one final-left membership,
  both retained approve/decline consent records, one cancelled session with
  matching calendar/occurrence times, one RSVP with unrecorded attendance,
  one hidden post and one resolved report/Action. Audit counts matched the
  exercised create, request/re-request, guardian/facilitator decisions, two
  leave/withdraw commands, RSVP, post, report, moderation and session mutations.
- Morgan authorized the explicitly simulated pickup adult
  `Simulated Pickup Adult 20261102` for the sibling, Nov 2-6, with a government
  photo-ID requirement, then revoked the authorization through the ordinary
  family UI. Main retains revoked authorization
  `29d34504-79ab-4a21-898e-de90ee1165db`; no pickup release was fabricated.
  Staff-witnessed handoff, custody holds and supervised-day safety gates were
  not bypassed or accepted by this authorization/revocation check.
- Delegated Demo Admin health submission was correctly denied. Signed in
  directly as the approved Morgan fixed account, submitted a clearly simulated
  nonclinical request for school review, then signed in directly as Alex and
  declined it with an explicitly simulated explanation. Morgan's health page
  showed School needs clarification and allowed correction/resubmission.
  Main verified Action `d0cf1c26-fd50-47d1-a5a3-5265fd118c64` resolved/rejected,
  no pending proposal, unchanged empty school medical summaries, one request
  and one rejection audit, and one ActionCreated/ActionResolved event each.
  No actual clinical instruction, emergency contact, medication authorization
  or return-to-school clearance was approved.
- Remaining boundaries: invitation acceptance by the sibling, official
  attendance, actual pickup handoff, medical approval/clearance and all other
  unexercised journeys remain unverified. No schema migration, queue-wide
  worker drain, external delivery or Netlify deployment ran in this segment.
- Validation: TypeScript, production build and 57 focused navigation,
  membership and session-projection cases across three files passed. Focused
  ESLint returned zero errors and two existing student-route effect warnings.
  Route inventory passed at 108/108 and whitespace checks passed. The updated
  disposable-database consent-name assertion was not executed; isolated
  integration acceptance remains unverified.

### Course requests, academic records and trip permissions (2026-11-02)

Continued Playwright walkthroughs using the same authorized synthetic Valor
records on attested main:

- Jordan requested Algebra I withdrawal. Alex declined through the course
  approvals queue. Action `0a14a75b-e0bb-4467-9954-36ebfac6421d` remains
  cancelled; enrollment `e6588006-cabf-3984-b629-a61d56d27bd9` remains active.
- Through the ordinary course-policy editor, Alex set Digital Photography's
  add/drop deadline to Nov 30 and required verified guardian permission.
  Capacity 12, one credit and the seven-credit term limit were not relaxed.
  Jordan requested addition; Morgan declined, then changed the pending
  decision to approval. Both immutable consent records remain. Alex's approval
  correctly failed because the published legacy course lacks an accessible
  lesson. No enrollment was added and no published curriculum was edited.
  Alex subsequently declined Action `79492a08-2a7d-4f8d-afa9-4ab69386b053`;
  Jordan retains eight active classes and neither request remains open.
- Found that the registrar received only a generic failure instead of the
  placement blocker. Added explicit safe placement codes, then reproduced a
  deeper transport defect: Start's shallow Error serializer dropped the
  middleware's safe code/name/retryability properties. Sanitized failures now
  cross the wire as plain allowlisted DTOs. Playwright verified the actual
  response retains `COURSE_CONTENT_REQUIRED` and the page explains that a
  published student-accessible lesson is required. Private diagnostics remain
  excluded. Guardian access to the staff approvals route still returns the
  proper permission-denied presentation.
- Student registration and guardian course decisions now use shared mutation
  feedback rather than independent busy/error flags; successful writes and
  failed refreshes remain distinct and duplicate submissions are synchronously
  guarded. Removed stale catalog text claiming guardian approval was unfinished.
- Jordan and Morgan viewed the four pre-existing synthetic Quarter 1 finalized
  grades. Switching Morgan's report-card selection to the newly admitted
  sibling showed no finalized grades or transcript rows, not Jordan's records.
  Alex issued transcript `b612d0e8-00c2-41e1-94ab-434c6f2bb897` with an explicit
  SIMULATED purpose. Jordan's report card showed its issuance afterward.
  Independent main reads verified its four-row snapshot against canonical
  finalized grades, the correct issuer/Alex attribution and one audit/event.
  All four credit entries honestly remain Not recorded; no credits, grades,
  graduation status or diploma were fabricated. New grade finalization,
  corrections and external credential delivery remain unverified.
- Alex proposed and approved free trip `SIMULATED PW Museum Planning 20261102`,
  ID `9c901f83-f97d-4347-980e-8a41b93a60be`, for Nov 9, 09:00-14:00
  America/Los_Angeles, with Nov 6 17:00 permission deadline. Its versioned
  statement explicitly describes a synthetic walkthrough, not real travel,
  medical care or transport. Alex invited Jordan; Morgan signed and then
  withdrew permission through the confirmation UI.
- Reloaded staff roster shows Guardian declined / NOT authorized to board,
  with no departure or return recorded. Independent reads verified participant
  `9dcadda5-8f27-44d1-be32-ba4bd7e1d484` declined, retained original signature
  with revocation plus a new refusal record, one staff refusal notification,
  exactly one audit per exercised command, no fee obligation and zero trip
  attendance rows. Calendar event `ea9af305-1c31-41ee-b575-84ebdf414b1a`
  and its occurrence match the canonical trip times.
- No actual boarding, chaperone clearance, safety packet, offline medical
  access, payment, incident or return was simulated as a real fact. These
  limited planning/permission checks do not certify the full trip journey.
- Validation: 84 focused safe-error, first-lesson, navigation, mutation-feedback
  and loader cases across five files passed, including round trips with the
  router's actual Seroval plugins. Typecheck and production build passed.
  Focused ESLint returned zero errors and one existing catalog color warning.
  Route inventory passed at 108/108 and whitespace checks passed. Exact-main
  read-only assertions independently verified the course, transcript and trip
  records above. No schema migration, outbox drain or deployment ran;
  disposable-database integration and broader journeys remain unverified.

### Student preferences and schoolwork support follow-through (2026-11-02)

Continued local Playwright walkthroughs at source commit
`8d4494789241137c0b15ad1350d7b4d595d9b186` with uncommitted changes, using the
same explicitly authorized synthetic Valor records on attested main:

- Found that all four student display preferences persisted without affecting
  their intended surfaces. The authenticated student workspace now projects only
  the actor's parsed preference fields and applies density, reduced motion,
  default home section and completed-assignment visibility. Saving updates the
  shared session immediately, with duplicate-command prevention and separate
  saved-but-refresh-failed feedback. Staff and guardian authority is unchanged.
- Browser verification measured compact page padding at 16px and reduced
  transitions at `1e-05s`. CAN OS home honored Courses and then Support; a fresh
  Jordan sign-in also landed in Support. Explicit Today still opened `/student`.
  Switching to Alex did not retain student density attributes.
- Hiding completed work reduced the default assignment list from 13 to eight
  actionable items. Feedback still exposed four entries, and the exact graded
  assignment `c0668f18-eb50-4937-ad51-d971cae18f21` retained its released
  feedback. Restored Jordan's original comfortable/Today/no-reduced-motion/
  show-completed preferences through the ordinary settings UI; CAN OS home
  returned to Today and the All list again showed 13 assignments.
- Jordan created explicitly simulated schoolwork-only help Actions
  `73b2c21b-37d0-4974-9b19-b92e7bddbc9c` and
  `778a10ac-1d8e-4e96-baad-56f71f161bd5`. Two synchronous Send request
  clicks for the second produced exactly one Action. Alex followed the first
  through open, in progress and waiting. Resolve exposed an unsupported native
  prompt before any resolution write.
- Replaced the remaining Operations resolution, deadline and enrollment-exit
  prompts with standard accessible dialogs. Rationale remains required and
  bounded; institutional exits retain an explicit verified-review acknowledgment
  and their separate canonical command. Command errors retain the entered note;
  saved-but-refresh-failed closes the dialog and blocks further writes until
  reopening the workspace. Resolution now displays a success notice and the
  selected queue item links to its durable Action detail.
- Browser-resolved both help requests with clearly simulated completion notes.
  Jordan's Support list showed both resolved and the exact saved-action link
  showed Completed. Staff Action detail retained the second resolution note.
  A temporary deadline on the second request was saved and then removed through
  the new rationale dialog before resolution. Two synchronous resolution clicks
  produced one resolution audit and one event.
- Independent exact-main, read-only assertions verified one creation per unique
  request, the expected status transitions and actors, one ActionCreated and
  ActionResolved event per request, two deadline audits/events, restored null
  deadlines and original student ownership, zero assignment changes, and the
  restored Person preferences. No queue-wide outbox processing ran.
- Validation: 76 focused preference, session, navigation, support, Action-retry,
  mutation-feedback and safe-error cases across eight files passed. Typecheck,
  production build, route inventory (108/108) and whitespace checks passed.
  Focused ESLint returned zero errors and 21 warnings in existing hook/render
  code. No migration or deployment ran. Institutional exits, staff reassignment,
  real counseling/clinical care and broader golden-flow acceptance remain
  unverified; these schoolwork requests are not clinical service evidence.

### Learning revision, family follow-up and daily attendance (2026-11-02)

Continued local Playwright walkthroughs at source commit
`8d4494789241137c0b15ad1350d7b4d595d9b186` with uncommitted changes, using
the same explicitly authorized synthetic Valor records on attested main:

- Riley returned the existing connected-learning assignment
  `c0668f18-eb50-4937-ad51-d971cae18f21` for revision. Jordan retained the
  original feedback, saved a revised response with units, reloaded to verify
  the draft, inspected the first attempt and submitted attempt two.
- Found that already-loaded submission history kept showing attempt two as
  assigned after submission. The lazy history component now invalidates its
  local cache when canonical attempt summaries change, not only when the
  selected assessment changes. Browser history showed submitted and later
  graded status with the original returned attempt preserved.
- Riley saved a 10/10 grading draft, then signed out. Morgan could see the
  submission and previous released guidance but not the new draft comment.
  A fresh Riley session restored the grading draft; posting released the
  score and feedback to Jordan and Morgan and advanced the teacher review
  queue to the next submitted assignment without grading that next item.
- Morgan asked a contextual follow-up, Action
  `6764cf54-1f32-4ddc-b2a2-714f041c3ba1`. It appeared on Family Home and
  Teacher Today with the exact attempt-two evidence. Riley answered and
  resolved it; Morgan saw School responded on academics and Family Home,
  with the released 10/10 unchanged.
- Exact-main, read-only assertions verified exactly two attempts: original
  `6839647b-ed18-4fe4-8059-21f8cd6e3272` returned with its original
  response, 9/10 and feedback; revision
  `3210f207-b2ba-4aab-8e14-fbd07e0e4156` graded 10/10 by Riley with the
  revised response and released comment. Verified separate student/teacher
  audit actors, one revision submission and grade event, and one question
  creation/resolution with separate guardian requester and teacher responder.
- Daily attendance initially showed no expected roster and a truthful missing
  calendar-date warning. Alex used ordinary School-year studio to add only
  the November 2 instructional day, explicitly titled simulated walkthrough.
  No full-year population, opening waiver or direct database repair ran.
- The daily roster then showed Jordan and the synthetic sibling, both
  unmarked. Alex marked Jordan absent; Morgan submitted a clearly simulated
  explanation, which remained pending until Alex independently approved it.
  Staff showed one of two expected students marked, no pending excuses and
  the sibling still unmarked. Morgan's exact-child page showed November 2
  Excuse Approved and explicitly stated that the day now counts as excused.
- Read-only assertions verified original absent event
  `3017b886-0edb-40b5-81f4-361a030803db`, approved excuse
  `c06645e2-5329-45f0-923f-c1a115c2baf1` with distinct submitter/reviewer,
  and superseding excused event `5bcf55f2-981b-4384-89d6-1e8cc7588fbb`.
  The original absence remains immutable; the sibling has zero attendance
  facts for that day. Unmarked was not converted to absent.
- Validation: 34 focused assignment submission, attempt-policy, attachment,
  membership-scope and availability cases across five files passed.
  Typecheck, production build, route inventory (108/108) and whitespace
  checks passed. Assignment-page ESLint returned zero errors and three
  existing hook warnings. No migration, deployment or queue-wide outbox
  processing ran. External notification delivery, academic finalization,
  actual physical attendance and full golden-flow acceptance remain unverified.

### Cross-workspace reliability consolidation (2026-11-02)

Code-focused follow-up at source commit
`8d4494789241137c0b15ad1350d7b4d595d9b186`, with cumulative uncommitted changes:

- Every application-router invalidation now checks settled active route outcomes,
  rather than treating a fulfilled promise as proof of a successful read.
  Shared mutation coordination also detects resolved safe-loader/query errors,
  failed workspace sessions and explicitly disconnected read models, including
  their standard result envelopes. Legitimate successful empty lists are valid.
- Both shared mutation adapters retain a confirmed command receipt when refresh
  fails, synchronously block further submissions and provide read-only recovery.
  Retry refresh never reruns a command or a success callback. Error wording no
  longer claims an unconfirmed command definitely made no change.
- Consolidated direct-command feedback across admissions, operations, conferences,
  student/staff support, discussions, assignment submission, grading and
  finalization, enrollment forms, family attendance/health/enrichment/enrollment
  changes, watch settings, account sessions, network administration and site
  publishing. Critical post-save reads now propagate failures instead of silently
  marking the page current. Resumable private-upload tasks and existing durable
  request identities remain intact; a client duplicate guard is not a substitute
  for server idempotency.
- UI catches across the application consume the existing allowlisted safe-error
  normalization, including plain-object transport, rather than relying on
  `instanceof Error`. Room-name/identifier conflicts, conference timing/status
  failures and attendance conflicts have explicit domain error codes. Staff
  offline attendance recognizes the transported conflict code rather than
  parsing an Error message.
- A student's own canonical support-request subject remains readable in their
  authorized Site/Program after assignment to staff. The safe `canComplete`
  projection separates visibility from ownership; the completion command still
  enforces exact current ownership and eligible workflow/status. Private case
  metadata and unrelated requests are not exposed.
- Conference creation now carries a stable client UUID through the existing
  command. A transactional advisory lock and exact actor/scope/payload match
  reuse the original series on replay, without duplicate slots, audits or domain
  events. No schema migration was needed.
- Validation: 321 focused regression cases across 30 files passed, including
  actual installed-router safe-loader failure/recovery, synchronous duplicate
  blocking, saved finalization recovery, support visibility, conference replay,
  rooms and attendance. Typecheck and production build passed. ESLint across
  165 changed/new code files returned zero errors and 142 warnings; it was not
  warning-clean. Route inventory remained 108/108 with zero issues, and
  whitespace checks passed.
- No browser acceptance pass, live database mutation, queue-wide outbox
  processing, commit or deployment was performed in this consolidation.
  This is bounded code/regression evidence, not certification of every legacy
  command, notification delivery or complete golden-flow acceptance.

### Actionable readiness and ownership handoffs (2026-11-02)

Focused code follow-up to the walkthrough's empty attendance roster and
Photography placement blocker, still based on
`8d4494789241137c0b15ad1350d7b4d595d9b186` plus uncommitted changes:

- Daily attendance and Site Today now share specific explanations for a missing
  active school year, calendar dates, onsite schedule, delivery-pattern mismatch
  or active Program enrollment. The notice identifies the registrar as the next
  actor and offers scoped school-year, enrollment or Program setup links only
  when the server projects registrar/Site Admin academic-year authority.
  Configured/online-only Programs do not receive a false setup warning.
  Missing dates require explicit instructional/non-instructional classification;
  no calendar, enrollment or attendance record is generated by the notice.
- Student catalog, guardian permission and registrar approval reads project
  content readiness from the class's actual pinned curriculum version. A
  published shell is not instruction: the existing placement predicate must
  find a learner-facing lesson. Raw curriculum is not included in these DTOs.
  Families can still request classes and record permission before school setup
  is complete, with explicit no-seat/no-enrollment wording.
- Registrars see the content blocker before approval, with links to authorized
  curriculum releases and Program class setup. A newer published release does
  not repin the class automatically. Add approval is disabled for this known
  blocker; drops/withdrawals remain available under their existing rules.
  The transactional enrollment service remains authoritative for all placement
  gates, including staffing, capacity, prerequisites, credit and schedule.
- Course handoffs distinguish school setup, guardian permission and registrar
  decision. Qualification records identify pending independent review,
  unverified submissions and replacement evidence; verified evidence is not
  described as automatic Program teaching eligibility.
- This is a focused code change, not renewed all-app browser acceptance.
  No live database writes, provisioning, migrations or deployment were performed.
- Validation: 106 focused cases across ten files, typecheck, production build,
  route inventory (108/108, zero issues) and whitespace checks passed.
  Focused ESLint on 16 changed/new code files returned zero errors and nine
  warnings; the touched surfaces are not warning-clean.

### Cross-workflow next-actor handoffs (2026-11-02)

- Admissions intake now states the registrar's next application action for
  inquiry, application, eligibility, waitlist, offer-ready, accepted and closed
  states. Guardian verification and sign-in provisioning are shown as a
  separate family-access track; offer acceptance remains the guardian's
  authenticated action.
- Group permission requests identify when the guardian must decide, when the
  facilitator must still approve a guardian-approved membership, and when a
  declined or obsolete request has no remaining guardian action. Consent alone
  is not presented as active membership.
- Support referrals show the assigned owner's stage-specific next task. The UI
  now disables the review transition until at least one service exists and all
  scheduled services are complete, matching the server guard; it explains the
  blocker before the user submits.
- Validation: targeted support/admissions/permission and adjacent regression
  tests, plus TypeScript, passed. Playwright and live data acceptance were not
  run in this code-focused follow-up.

## Neon primary branch alignment and migration reconciliation (2026-11-02)

- With explicit operator authorization, renamed the Neon primary production
  branch from `production` to `main`. Its identity remains project
  `sweet-hall-62441909`, branch `br-restless-sea-ar9ooo55`; the database
  endpoint and connection remain unchanged. The configured `DATABASE_URL`
  resolves to this primary branch.
- Retained recovery branch `main-pre-migration-recovery-20261102`
  (`br-cold-wave-ar20md5i`) at parent LSN `0/3872B58`, with active read-only
  endpoint `ep-holy-dawn-arit5vw1`. Rehearsal branch
  `main-migration-rehearsal-20261102` (`br-wispy-haze-arrqlvpn`) was created
  from that recovery point. Both branches remain available.
- The production ledger already contained exact current entries for
  `0026_brief_ink` and `0027_big_lady_deathstrike`, plus one extra legacy
  `0026_charming_dark_beast` record. From main HEAD
  `20840bbd0aeac0bc6f45bf89dae3ec3006e1eed1`, applied migrations `0028`–`0059`
  in per-migration transactions with 10-second lock and 180-second statement
  timeouts. Recorded `0060_tenant_demo_access` only after confirming its sole
  `is_synthetic` column-drop effect was already present. Existing ledger rows
  were preserved; the final ledger has 62 rows, all 61 current journal
  timestamps represented, and one retained legacy row.
- A fresh post-commit connection verified exact hashes for `0028`–`0060` and
  catalog parity against the clean replay: 165 tables, 1,786 columns, 2,040
  constraints, 506 indexes, 224 enum labels and 6 triggers. Fifteen older
  journal entries retain pre-existing hash mismatches; these and the legacy
  row were not rewritten. The rehearsal data comparison preserved all common
  columns in existing tables; the only row-count difference was the two
  intended qualification definitions. The live admissions-interest table has
  zero records.
- With explicit operator authorization, deleted all seven Neon branches
  prefixed `delete-` and verified none remain. `main`, `FullFlow`, `test01`,
  the new recovery branch and the rehearsal branch remain. No application
  deployment or end-to-end release acceptance is implied by this schema
  reconciliation.

## FullFlow review fixes (November 1, 2026)

Local source fixes preserve the existing tenant redesign and migration history:

- Explicit bootstrap normalizes all four recognized legacy source-account
  addresses transactionally, checks canonical identity and active grants, and
  refuses collisions/revocations. Programs created through ordinary Valor
  workflows no longer block bootstrap merely for lacking fixture metadata.
- School-alert email requires verified account email; verified SMS consent
  remains independent of email ownership.
- Outbound workers claim only immediately processable work, renew owned leases
  before transport and fence all result/error updates by the lease timestamp.
  Email/SMS requests have a 20-second timeout. Provider acceptance followed by
  timeout remains ambiguous; this does not certify exactly-once delivery.
- Quiet-hour deferral uses actual timezone minute boundaries across DST and
  does not carry seconds past the configured end.
- Admissions uses scoped exact-ID detail/options, deterministic 40-row pages,
  server-side stage filtering and whole-scope application/requirement totals.
- Executed locally: **423 unit files / 2,504 tests passed**, typecheck and build
  passed, and route inventory **107/107, 0 issues**. Connected database
  concurrency/provisioning and authenticated browser
  acceptance remain **unverified**. These fixes did not mutate a database.

## FullFlow local tenant-identity redesign

**Evidence scope:** FullFlow HEAD `8f3aca2e` plus the current uncommitted local
changes. This addendum supersedes the synthetic-grant/write-gate architecture
descriptions in older pinned sections below, not their outstanding acceptance
requirements.

- Valor uses canonical Organization/Site identity and normal server-authorized
  product commands. The current grant schema has no `is_synthetic`; new
  migration `0060_tenant_demo_access.sql` drops only that column and retains
  historical SQL/snapshots.
- Restricted demo-admin switching uses canonical accounts/grants, preserving
  effective identity and session ownership. Delegated-session denials at
  independent-identity boundaries, existing inactivity limits and transactional
  audit/domain-event semantics remain in place.
- External notification email/SMS is suppressed by canonical source tenant.
  R2 demo/live upload deployment switches remain separate; legacy fixture
  storage evidence is accepted only in the canonical demo tenant.
- Executed locally: `npm test` **419 files / 2,460 tests passed**;
  `npm run typecheck` passed; `npm run build` passed; changed-file ESLint
  **0 errors / 38 warnings**; route contracts **107/107, 0 issues**;
  mutation hygiene passed; fixture declarations **90/90, STATIC_ONLY**.
- **Database follow-up (November 1, 2026, explicitly user-authorized):**
  renamed only Neon branch `br-proud-pine-arfju8h2` to `FullFlow`, matching Git,
  and applied migration 0060 through the guarded wrapper. Database identity,
  column absence and 61-row migration/hash ledger were verified; postflight is
  **UP_TO_DATE**, with no pending migrations. Production remains the unchanged
  default branch. Migration guard fixes account for PostgreSQL's truncated
  constraint names and Windows command launchers; **27 targeted tests passed**.
- **Unverified:** identity provisioning, connected workflow integration and
  authenticated browser acceptance. Historical DDL provenance remains unresolved.
  No production data mutation, commit, push or main merge was performed.

**Baseline reviewed:** `main` at `80f6c66` (2026-10-18), plus the academic Action and mutation-evidence follow-ups included with this snapshot. The prior academic/conference authorization follow-up was pushed in `75a83be`. Local automated results are recorded below; they are **not** a verified deployment, production acceptance, security audit, or assertion that remote CI has passed.

**Repository cleanup review:** based on `main` at `6be1a57` (2026-10-18), plus the cleanup changes on `chore/repository-stabilization-20261018`. This refresh covers unused-source tracing, the route inventory, local checks and a read-only audit of the locally configured Neon connection, not a full product acceptance review. Earlier integration results remain historical evidence.

**Latest database evidence:** production reconciliation completed at **2026-10-19 06:40:10 UTC**, against committed migration source at `f013878`. See the rollout section below; it supersedes the historical drift findings, not the outstanding product acceptance gates.

## FullFlow review addendum (2026-10-28)

**Baseline reviewed:** local FullFlow HEAD `94a194c`. The results below are local/static evidence recorded for the broad GoldenFlow review. **No live Neon integration, no production migration, and no real authenticated browser run were executed in this environment.** Earlier dated sections below remain historical evidence with their own counts.

Local validation at this snapshot:

- `npm test -- --reporter=dot`: **219 files / 1284 tests** passed.
- `npm run typecheck`: **0 diagnostics**.
- `npm run build`: passed, with one pre-existing ineffective-dynamic-import warning; the first run hit an environmental `ENOTEMPTY` cleanup error and a clean retry passed.
- `node scripts/check-route-fixture-coverage.mjs`: **75/75** fixture declarations, 0 unseeded; explicitly **STATIC_ONLY** (static manifest/file checks, not SQL execution or browser acceptance).
- `node scripts/check-mutation-hygiene.mjs`: passed.
- `node scripts/check-platform-route-contracts.mjs --check`: **86/86 routes, 0 issues**.
- `npm run db:generate`: no schema changes; clean tree after restoring `drizzle/meta/0045_snapshot.json` parity and adding a parity guard. The migration review gate is re-baselined through journal 0046, and Drizzle tip snapshot parity is guarded.

Patches included at this snapshot:

- The Admissions workflow now runs the authenticated browser journey after isolated integration, with Playwright install and failure artifacts. Admissions CI still needs its isolated database secrets/vars before live acceptance.
- The GF1 runbook continues to list fail-closed environment requirements; that text was not weakened.
- Stale unit tests and submission-review fixtures were aligned with canonical staffing eligibility.
- GF-B onsite/church-hosted typecheck diagnostics and the remaining nine non-GF-B diagnostics were closed without runtime authorization changes.
- The declared seed chain (`student-s1-s4`, `identity-demo-accounts`, `new-experiences-v1`, `valor-curriculum-marketplace`) was made executable against the current schema and validated locally in disposable PGlite by the coder; **no committed CI seed executor exists yet**.
- `section_teachers` assignment reads now filter `role='teacher'` in coverage, placement, and `requireAssignment` paths.
- GF1/GF2 browser specs and fixtures were aligned with the current UI and now include program+section enrollments, the teacher eligibility/delivery stack, the first lesson, and executable guardian permissions; unit import-time `DATABASE_URL` failures are mocked narrowly. The specs are repaired and wired but were **not live-run** here.

Remaining acceptance gaps (explicit; unchanged by this addendum):

- FullFlow A continuous six-stage Neon + issued-session browser journey remains unexecuted.
- Golden Flow B remains HOLD; safeguarding intake and custody/pickup workflows are missing product surface, not just tests.
- Launch Studio/site-director real-session browser proof remains missing.
- Most scenarios beyond GF1/GF2/curriculum slices lack dedicated workflows and browser/reload proof.
- GF-A3 human-approved action is unimplemented.
- `valor-algebra1-week01-upgrade.sql` (orphan/non-manifest fixture with stale identities) has been removed; it was never executable and is no longer in the tree.
- No CI seed executor currently applies the manifest seed chain.

## Integrated source baseline

- The main branch includes the development changes associated with Phases 1, 2 and 3. Phase 1 PR #120 is marked merged by GitHub. The Phase 2 and Phase 3 implementation work was integrated via commits on `main`; PRs #121 and #122 were closed without GitHub reporting them as merged. Do not use those original PR states as instructions for future branching.
- `src/routes/` currently passes **86/86** route contracts via `node scripts/check-platform-route-contracts.mjs --check`, with **75/75** static fixture declarations via `scripts/check-route-fixture-coverage.mjs` (see the 2026-10-28 FullFlow review addendum below; earlier dated entries record their own historical counts). The registrar transcript route is owned by Learning, which supplies its canonical read and issuance commands. **Every route's verification, role journey, read boundary and write boundary remains `pending`.** Recording ownership is not acceptance, and the fixture-coverage checker is static declaration, not browser acceptance.
- Workspace entry uses server session grants (`src/routes/index.tsx`, `src/components/shell/WorkspaceNavigation.tsx`). Module-level authorization still requires code and negative-access tests.
- Existing student/teacher group routes now call canonical creation, consent, posting, moderation, session, RSVP and attendance commands. The old combined `study-groups.functions.ts` mutation module was retired; retained read projections in `study-group-queries.functions.ts` preserve existing page shapes. Isolated integration tests cover interest groups, consent, duplicate reports, moderation, RSVP-independent attendance, and session reschedule/cancellation.
- Admissions offer commands are present under `src/modules/enrollment/admissions-offer-service.ts` and related server functions; some paths still use `assertRecordWriteAllowed` or synthetic-prefixed compatibility names. Do not misreport them as uniformly provenance-neutral or production accepted.
- Calendar, learning, attendance, family, support, launch and Ask CAN modules exist. Presence of source modules is not proof of cross-role end-to-end completeness.
- Domain modules use shared audit/event/inbox writers, guarded by `scripts/check-mutation-hygiene.mjs`. Enrollment and learning attachments share private R2 signing and bounded object verification. Conferences, field trips and activities share source-aware calendar projection infrastructure; activity seasons still support multiple occurrences.
- Grade finalization/correction and placement prerequisites use versioned grade-scale policy, including custom passing labels and bounded extra-credit handling. Staffing status enum migration `0021` is applied to the confirmed production branch as part of the reconciled rollout below.
- Approved agent writes use the approval transaction. The Academic Domain API now shares a program-and-relationship predicate across student discovery and summary sections: missing/empty program grants deny visibility, supplied site/section lists restrict it, and teachers only see their assigned sections. Tests cover revoked relationships/assignments and approval-time loss of access.
- Conference booking/rescheduling no longer accept an optional enrollment-check switch. Both commands require explicit site/program grants, current guardian relationship, school enrollment and active section enrollment where applicable; direct-service regression tests cover denials and transactional rescheduling.
- Student-section academic Action creation, operational acceptance/assignment/status changes and direct resolution now share resource/relationship policy. Ownership alone does not grant access. Resolution locks the Action, rechecks access on retries, requires a nonblank note and rejects cancelled work; concurrent completion writes one audit and one outbox event. Site-wide operational follow-ups retain their existing path, while the direct resolver rejects other domain types.
- School-Year Studio calendar-day create/update records before/after audit evidence and scoped calendar events. Program orientation, launch site creation and teacher assignment now have transactional audit/domain-event evidence; repeated active teacher assignment is a no-op.

## Retired repository leftovers

- Removed 25 unused source files after tracing route, test and script imports: the hard-coded student dataset and local-state experience lab; unused UI scaffolding, rubric editor and academic case view; superseded attendance, enrollment, program-launch and Student Today adapters; unused fixture-health and section-planning server functions; and their orphaned query/policy/validation helpers. The active routes keep their canonical implementations.
- Removed the obsolete lab's four fixture-only tests, not the live student workflow tests. Removed four unused direct Radix dependencies and 29 installed packages with the package manager; the lockfile is updated.
- Admissions routes now import `admissions-offer.functions.ts` using product-facing names. Existing service commands, synthetic write guards and persisted idempotency-key format are unchanged. Enrollment document functions now expose their canonical names directly rather than retaining unused synthetic-named exports.
- Historical archives, committed migrations/snapshots, SQL fixtures, compatibility redirects and offline attendance queue compatibility remain intact. Tested domain services are retained even when no current route calls them. The standalone qualification-review service is also retained as an intended domain capability, not represented as a wired or accepted product flow.

## Architecture versus known code gaps

**Target architecture:** synthetic fixtures behave like ordinary records through canonical product workflows, with an isolated environment and no test-specific UI or business engine.

**Observed remaining transition:** `src/modules/_demo/` guards and synthetic-prefixed admissions exports still exist. Multiple study-group page entry points remain as adapters to canonical commands, not separate mutation engines. Never remove protective guards without validating the authorization and data-isolation consequences. These are review targets, not a mandate to bypass safeguards.

`CAN_DEMO_WRITES_ENABLED` is fail-closed in `src/modules/_demo/demo-write-gate.ts` (`=== "true"`). The flag is not an authorization policy.

## Verification and release status

**Latest evidence:** the FullFlow review addendum (2026-10-28) above supersedes the counts and results in the dated entries below; those entries record their own historical snapshots.

- Local verification on 2026-10-18: `npm test` passed **71 files / 350 tests**; `npm run test:integration` passed **29 files / 43 tests** using the protected isolated Neon runner. These are working-tree results, including concurrent calendar/transcript work, not a claim that every change belongs to this follow-up. Coverage includes academic Action denial/concurrency, school-year calendar-day audit history, program orientation audit, launch site/teacher evidence and duplicate assignment idempotency.
- `npm run typecheck`, `npm run build`, mutation hygiene, route fixture coverage and `node scripts/check-platform-route-contracts.mjs --check` passed locally after the current evidence changes.
- Repository cleanup verification on 2026-10-18: the final full non-database unit run passed **71 files / 355 tests**, including nine new admissions server-function regressions covering registrar role/capability/program denial, synthetic write gating, guardian relationship checks, issuance idempotency and command delegation.
- Route ownership passed **66/66**, fixture coverage passed **59/59**, mutation hygiene passed, and typecheck and production build passed. `npm run db:generate` left committed migration files unchanged. These checks used the existing local Vite configuration change. Database integration and browser suites were not rerun during cleanup.
- Browser/Playwright cross-persona journeys, remote CI, live R2 configuration and application deployment remain **unverified** in this continuation. Production schema reconciliation is separately verified below; no integration fixtures were written to production.
- All 66 route acceptance entries remain **pending**. The basic source-drift checker is separate from the stricter `--acceptance` gate.
- Sensitive student, medical, safety, payment and legal data require independent privacy/security review and operational acceptance. Do not infer readiness from documentation or a passing compile.
- Refer to [release gate](./synthetic-pilot-release-gate.md) for recorded evidence and its dated limitations, [security gates](./school-operations-security-gates.md), and [Neon test isolation](./neon-development.md).

## Historical read-only Neon audit (2026-10-18; superseded by rollout below)

**Target:** the database selected by `DATABASE_URL` in local ignored configuration. Its deployment/branch classification was not independently established; these findings must not be generalized to every Neon branch. Queries ran in transactions with `transaction_read_only=on`; no migration, ledger update, fixture write or schema mutation was performed.

- The Drizzle ledger contains **9 rows, corresponding to `0000` through `0008`**. Eight hashes match the local files byte-for-byte; `0006` matches after LF normalization (the Windows checkout is CRLF), not evidence of edited migration history.
- There are no ledger entries for `0009` through `0021`. Nevertheless, later structures such as subscriptions and conversations already exist. This is **partial schema/ledger drift**, not proof that every unrecorded migration can safely be replayed. Reconcile deployed objects and migration history on an isolated copy before approving database changes.
- Canonical source defines **118 tables**; this database has **111 public tables**, including three unmodeled legacy tables. Ten canonical tables are missing:
  `delivery_arrangements`, `instructional_capacity_offerings`, `instructional_capacity_reservations`, `instructor_availability_windows`, `instructor_capabilities`, `notification_preferences`, `section_capacity_demands`, `section_prerequisites`, `section_registration_policies`, and `subscription_event_receipts`.
- Existing-table column-name checks found three missing columns: `section_teachers.assignment_source`, `subscription_deliveries.next_attempt_at`, and `subscription_deliveries.lease_until`. No extra columns were found on the modeled tables. This is a name-level comparison, not a full type/index/constraint equivalence certificate.
- The legacy tables `incident_actions`, `activity_calendar_events`, and `conference_actions` each contain **0 rows** and have no inbound foreign keys. Committed migration `0009_retire_dead_join_tables.sql` already targets their removal. They were not dropped; other dependencies and rollout safety still require review.
- The four staffing status enum types introduced by `0021` are absent. Its target capacity/delivery tables are also absent, so checking those tables' status values is not yet possible.
- Journal timestamps for `0019` and the comment-only `0020` are reversed. Migration files and journal were preserved unchanged.

## Production migration reconciliation (2026-10-19 UTC)

### Confirmed target and recovery

- Neon project `can-os` (`sweet-hall-62441909`), default branch **`production`** (`br-restless-sea-ar9ooo55`), endpoint `ep-autumn-glade-ar9r1t5q.c-4.us-west-2.aws.neon.tech`. This was confirmed with the operator after management metadata resolved an initial endpoint-role misunderstanding.
- `ep-noisy-bird-arruu0it` belongs to the separate **`test01`** branch, not production. It was not migrated or reset by this rollout. Never infer deployment identity merely from a locally assigned environment-variable name.
- The project reported a six-hour history-retention window. A separate pre-change recovery branch, **`production-pre-reconcile-20261019`** (`br-noisy-wind-ar1wkf98`), was created and verified ready at parent LSN `0/298D578`. It has no compute endpoint. Retain it until post-deployment acceptance and recovery retention are explicitly reviewed.
- With explicit operator approval, only the two obsolete branches `mcp-migration-2026-10-15T11-32-59` and `mcp-migration-2026-10-15T11-33-26` were deleted to free capacity.

### Rehearsal and execution

- Created a fresh isolated production copy, `migration-rehearsal-20261019`, and an empty `migration_reference` database on that isolated branch. All committed SQL migrations `0000` through `0021` replayed successfully into the empty reference, including PostgreSQL functions and triggers.
- Compared the production copy against that reference, including column types/defaults/nullability, constraints, indexes, enum labels, triggers and immutable-history function definitions. Function source line endings were normalized for comparison.
- Rehearsed reconciliation in one serializable transaction: required the original nine ledger entries to match committed SQL, validated the three legacy tables were empty, used restrictive drops rather than cascading dependency deletion, applied missing DDL and compared the final catalog to the reference.
- Existing objects from `0011` and `0012` were not blindly recreated. Their equivalence was checked as part of the full final catalog comparison. `0020` is comment-only. Only after schema equivalence and existing-record preservation checks passed were the 13 missing migration ledger entries appended. Existing ledger entries and committed SQL/journal files were not rewritten.
- The rehearsal preserved all **126 existing rows across 108 retained tables**, verified by per-table row counts and content fingerprints excluding newly added columns.
- Full isolated integration validation passed **29 files / 43 tests**. The initial empty-reference run passed 39 tests and failed four fixture-presence checks; after loading the required deterministic fixture dependencies into the isolated reference only, all 43 passed. No fixture or integration runner targeted production.
- Applied the same verified reconciliation plan to production in one transaction, using a five-second lock timeout, a 120-second per-statement timeout, an advisory lock, exclusive table locks and rollback-on-failure checks. The production transaction also preserved all **126 existing rows across 108 retained tables**.

### Post-commit verification

- Separate read-only checks confirmed **22 migration ledger entries**, matching the committed SQL hashes (allowing checkout line-ending variants), through **`0021_staffing_status_enums`**.
- Production has **118 public tables**, with no missing, changed or extra objects across the catalog categories checked against the clean reference.
- The three empty legacy join tables are removed: `incident_actions`, `activity_calendar_events`, `conference_actions`. The ten missing tables, three missing columns and status enum conversions are reconciled.
- The temporary rehearsal branch and its reference database were removed after verification. The independent pre-change recovery branch is retained.
- This establishes migration/schema equivalence and isolated integration evidence, not browser acceptance, remote CI status, application deployment health or a complete database security/permissions audit.

## Class participation build and approved schema rollout (2026-10-19)

- Added student/parent/teacher class participation: published lesson reading,
  syllabus/resources, durable student-reported progress, teacher roster,
  class announcements, production discussions, parent assignment detail,
  released response-text annotations and contextual family/teacher messages.
  The inventory and exclusions are in [prototype migration](./prototype-migration.md).
- Working-tree verification: **84 files / 469 tests**, TypeScript, production
  build, **67 source routes / 67 contracts / 0 issues**, fixture coverage and
  mutation hygiene passed. The isolated `class-participation` integration flow
  passed against real Neon transactions, including resource authorization,
  retries, cross-role progress/feedback and access revocation. Schema DDL and
  fixtures rolled back, with cleanup verified independently in the test.
- After explicit operator approval, management metadata reconfirmed project
  `sweet-hall-62441909`, branch `production` (`br-restless-sea-ar9ooo55`), endpoint
  `ep-autumn-glade-ar9r1t5q`. All 22 prior migrations matched local SQL hashes
  (normalizing Windows line endings where needed) and journal timestamps.
- The official Drizzle migrator applied only `0022_stale_sphinx`, with bounded
  lock/statement timeouts. Verified `lesson_progress`, `submission_annotations`,
  five foreign keys, the annotation offset check, five indexes and the exact
  new ledger hash/timestamp. A separate connection confirmed persistence.
  No migration history was rewritten and no production fixtures/content seeded.
- At 390px, the signed-out class route shows the authorized-account prompt,
  no private controls and no horizontal overflow. Genuine authenticated browser
  journeys and actual private R2 downloads remain unverified. No application
  deployment, commit or remote CI result is implied by this schema rollout.

## Expanded workspace follow-up

- Added the desktop sidebar/mobile modal navigation and retained authenticated
  top-bar utilities. Study-group discovery/detail now share enrollment policy.
- Added distinct counselor membership and caseload, shared specialist/counselor
  referral/plan/service workflows and canonical outreach. Clinical/private
  counseling notes are excluded pending policy.
- Replaced the synthetic profile explorer with real relationship-authorized
  profiles, private verified photo Documents and self-only JPEG/PNG upload.
  Student class pages now display the assigned teachers as profile links.
- Removed synthetic-only program and calendar-export reads without weakening
  authentication, scoped access, demo isolation or private-file verification.
- Verification: **84 nonintegration files / 470 tests** passed. TypeScript,
  production build, **69 route sources / 69 contracts / zero issues**, fixture
  coverage and mutation hygiene passed. The expanded isolated Neon rollback
  flow passed with group eligibility, counselor routing/lifecycle/outreach,
  profile relationships, failed-upload verification and photo idempotency.
  Storage calls are mocked; no live R2 delivery is certified.
- Genuine student-session browser checks confirmed sidebar navigation, a
  keyboard-dismissable mobile menu, no horizontal overflow at 390px, and the
  enrolled-class teacher link opening the correct authorized profile.
  Specialist-session checks opened the populated caseload and exact referral,
  retained `/support` as the return route, and confirmed blank plan fields with
  saving disabled until required inputs are supplied. Counselor browser
  acceptance remains blocked on an actual counselor grant.
- Application data remains a blocker for the sample study groups: four active
  section enrollments and two memberships exist, but no active program
  enrollment or accepted application. There is no counselor grant and there
  are no profile-photo Documents. The operator approved repairs only through
  supported audited operations; repairs stopped because enrollment activation
  has no accepted application and staff provisioning needs an authenticated
  registrar. No application content/grants/enrollments were changed. Updated
  disposable fixtures were not run against the application database.

## Remaining follow-up

- CI now runs for pull requests, pushes to `main`, and manual dispatch; obsolete phase/feature push triggers were removed. Start short-lived development branches from current `main` and submit focused pull requests. Branch protection and required-check enforcement are GitHub settings and remain unverified by this cleanup.
- Admissions CI requires the `integration-test` environment secret `CAN_ADMISSIONS_TEST_DATABASE_URL` and variable `CAN_APPLICATION_DB_HOST`; their remote configuration remains unverified. Keep the isolated-database preflight mandatory before migration or test writes.
- Production is current through `0022`; other Neon branches are not certified by these rollouts. The historical `0019`/`0020` timestamp inversion remains unchanged; `0020` is comment-only and all entries precede the verified `0021` high-water mark. Keep future journal timestamps increasing.
- Nonacademic and section-less operational Actions still need a complete owning-domain policy review; the academic policy is deliberately not a universal Action abstraction. Historical academic follow-up after withdrawal/inactivation needs an explicit policy before broadening current fail-closed behavior.
- Remaining school-year/program-launch commands need evidence-parity review.
- Full authenticated route/deep-link and role-switch browser acceptance is pending.
- Retire the pre-change recovery branch only after post-deployment acceptance and recovery retention are reviewed. R2 malware/quarantine, retention and live bucket/CORS acceptance remain release gates.

## Production migration re-verification before main publication

On 2026-10-19, Neon management metadata independently reconfirmed the configured
endpoint as production (`ep-autumn-glade-ar9r1t5q`, branch
`br-restless-sea-ar9ooo55`). All **23 migration ledger entries**, through
`0022_stale_sphinx`, matched local SQL hashes and journal timestamps, allowing
Windows line-ending normalization. There were **zero pending migrations**.
`drizzle-kit generate` confirmed that the current schema exports introduce no
unrepresented schema changes.

Read-only catalog verification checked **120 tables, 1,235 columns, 238 declared
indexes, 288 foreign keys and 62 enum value sets**, plus declared check/unique/
composite-key constraints, with no missing required objects or incompatible
column types/nullability. The two historical foreign-key names on
`subscription_event_receipts` and `notification_preferences` differ from
generated names but have matching columns, targets, actions and validation.
`subscription_delivery_status` contains the expected values in a historical
order with `processing` appended; this was preserved, not rebuilt or restamped.
No new DDL, sample seeds, enrollment repairs or counselor grants were executed
as part of this re-verification. Schema currency is not a claim of application
deployment or live storage acceptance.

## Classroom lifecycle and delivery recovery follow-up (working tree)

- Added revision-checked physical classroom editing and confirmed retirement
  to the existing setup panel and canonical scoped commands. Actual changes
  emit transactional audit/events; exact-response retries are no-ops.
  Retired names/identities remain reserved. Existing Section defaults remain
  visible for explicit replacement/clearing. New room assignments, plan
  submissions and pending plan approvals reject retired rooms. Already approved
  plan snapshots/expiry are unchanged; retirement is not emergency closure.
  Daily planning explicitly clears an unavailable room's visual selection and
  directs pending-plan room mismatches back to school correction rather than
  offering approval; independent rejection remains available.
- Generated additive migration `0063_site_room_lifecycle` adds only `revision`,
  nullable `retired_at` and a positive-revision check. The generated snapshot
  matches those changes and the migration-file/journal chain was checked.
  **This migration is not applied.** The updated room code requires it before
  use against a database. Live lifecycle behavior and isolated database
  integration are unverified; the earlier room-creation browser walkthrough
  does not accept editing/retirement.
- Watch delivery history and individual-watch history share one allowlisted
  status projection. SMS consent, account email, inactive watch, unsupported
  channel, scheduled retry and terminal failure now identify the next actor
  and continuation without raw provider errors or automatic resends.
  Provider acceptance still does not prove inbox/handset delivery or reading.
- Notification-center mutations and personal delivery-preference writes use
  shared synchronous duplicate protection and saved-vs-refresh-failed recovery.
  Delivery-history refresh reads its own result, independently of notification
  status mutations. Per-watch reads use separate keyed queries and explicit
  loading/error recovery, so switching watches cannot show another watch's
  results. Verification refresh preserves an entered, not-yet-verified phone;
  verified identity and explicit SMS opt-in remain server requirements.
- Validation: 170 focused cases across 14 unit files, TypeScript and the
  production build passed;
  route inventory checked 108/108 and migration-file chain/whitespace checks
  passed. Focused lint had zero errors and six existing warnings.
  No migration, message send, database mutation, deployment or new all-app
  browser acceptance is implied by these code checks.

## Watch-delivery history follow-up (2026-10-19 working tree)

- The existing shared notification center now includes recipient-only history
  for event-triggered watches and reminders, with bounded failure explanations,
  refresh, 25-record pagination and explicit empty/unavailable states. History
  failures do not suppress the existing notification list. Reading history
  neither sends a message nor changes notification read status.
- In-app success means the notification was created. External-channel success
  is labeled provider acceptance, not inbox/handset delivery or reading.
  Historical paused/revoked watches expose only the recipient's delivery
  metadata, never student content, resource/event IDs or raw provider errors.
- Local verification passed **5 focused unit files / 18 tests**, plus the
  isolated Neon **delivery-history integration file / 1 test**. Database
  coverage includes recipient and cursor isolation, revoked-watch history,
  31 records paginated across equal sub-millisecond timestamps, outcome
  explanations and exact output fields. Synthetic fixtures rolled back, and
  the test independently verified that its owner identity was not persisted.
- Typecheck, production build and route inventory passed (**69 source routes /
  69 contracts / 0 issues**) against the working tree, including concurrent
  changes. The initial attempt to select this integration file instead started
  the broader suite, which reported failures and was stopped; it is **not**
  passing full-suite evidence. The explicit `delivery-history` runner mode now
  selects only this rollback test with the existing endpoint safeguards.
- No production migration, application-data mutation, deployment or genuine
  authenticated browser acceptance is implied. This is not unified human
  message/weekly-digest history; external receipts, templates and broader
  communications acceptance remain open.

## Qualification evidence readiness follow-up (2026-10-19 working tree)

- Fixed the launch academic-readiness reader checking `verified`/`approved`
  even though canonical reviews persist `approve`. Credential review and
  readiness now share the same decision-to-status interpretation. Unknown
  stored decisions produce an explicit error, not a silent unverified state.
- Readiness selects the latest sequence for each instructor claim in one
  query rather than issuing one review lookup per claim. Only approved,
  non-future-issued, unexpired claims count; evidence stops being current
  exactly at its expiry instant. Later rejection/revocation never falls back
  to an earlier approval.
- This remains an advisory evidence-presence indicator, not configured
  program/jurisdiction teaching eligibility or assignment authorization.
  Existing activation blocking behavior is unchanged. Qualification-to-
  assignment policy enforcement and full coverage planning remain open.
- Local checks passed **3 focused unit files / 19 tests**, the isolated Neon
  **qualification-readiness integration file / 1 test**, typecheck, production
  build, mutation hygiene and route inventory (**69 routes / 0 issues**).
  Integration coverage uses the actual submit/approve/revoke/reject commands,
  denies self/out-of-scope review, verifies eight audit/outbox pairs,
  exercises effective-date boundaries and unsupported decisions, and checks
  that projection reads do not create teaching assignments. All fixtures
  rolled back; a separate query verified the test teacher did not persist.
- No schema change, production mutation or deployment was performed.
  Browser acceptance and the broader integration suite were not run for
  this slice.

## Instructional-capacity expiry follow-up (2026-10-19 working tree)

- Launch readiness no longer counts expired held/committed reservations.
  Candidate matching, instructor totals, reservation/replacement calculations,
  operational capacity gaps and committed-seat enrollment checks now share a
  strict expiry rule: a reservation stops counting at its expiry instant.
- Reservation writes reject invalid or nonfuture expiry. Delivery creation
  and activation lock and validate the referenced reservation before making
  changes, so expired holds cannot be used to activate delivery. Failed
  validation leaves reservation, delivery, teaching assignment and activation
  evidence unchanged.
- Expiry is not automatic cancellation or authorization revocation. Stored
  history and canonical teacher assignments remain until explicit owning
  commands change them. Schedule/closure/manual-replacement reconciliation
  guards remain conservative; they were not loosened for expired rows.
- Local verification passed **3 focused unit files / 6 tests**, the isolated
  **capacity-expiry integration file / 1 test**, and the prior
  **qualification-readiness integration file / 1 test**. Coverage includes
  exact expiry boundaries, offering/demand reallocation, rejected stale
  activation, explicit renewal, release, operational capacity gaps and
  retained audit history. Fixtures rolled back and the test independently
  verified its teacher identity did not persist. An initial expanded fixture
  used an unsupported offering status; that fixture was corrected and rerun.
- Typecheck, production build, mutation hygiene, route inventory (**69 routes /
  0 issues**) and scoped whitespace checks passed. No production migration,
  data mutation, deployment or browser acceptance was performed. Full coverage
  planning and qualification-to-assignment enforcement remain separate work.

## Retry-safe delivery activation follow-up (2026-10-19 working tree)

- The canonical staffing delivery activation command now acquires the site
  configuration lock before re-reading and row-locking the arrangement.
  Completed arrangements cannot be reactivated. Existing active arrangements
  return without mutation only after capability, section/program/site scope
  and any linked reservation's current validity have been rechecked.
- Successful activation retries preserve arrangement/reservation timestamps
  and existing assignments and write no duplicate activation AuditEvent or
  outbox DomainEvent. They do not recreate a removed teacher assignment or
  silently recommit expired/released capacity.
- Verification passed the expanded isolated **capacity-expiry integration
  file / 1 test**, **3 focused unit files / 6 tests**, typecheck, production
  build, mutation hygiene, route inventory (**69 routes / 0 issues**) and
  scoped whitespace checks. The initial typecheck encountered transient
  errors in concurrent Student Today/calendar edits; a later full typecheck
  passed without changing those files as part of this work.
- Database coverage includes all five arrangement states, unchanged retry
  timestamps, exactly one activation audit/outbox pair, denied capability and
  section/program/site scopes on active retries, rejection of expired/released
  linked capacity, and no resurrection of removed teaching assignments.
  Fixtures rolled back and a separate query confirmed the synthetic teacher
  did not persist. These are single-connection checks; multi-connection race
  acceptance remains unverified.
- This hardens the existing domain command, not a new staffing workspace.
  No schema change, production data mutation, deployment or browser acceptance
  was performed.

## Effective-dated delivery readiness follow-up (2026-10-19 working tree)

- The current-delivery reader now filters active arrangements by effective
  time: inclusive `effectiveFrom`, exclusive `effectiveThrough`, with null
  bounds left open. Future/ended arrangements no longer count as current
  delivery or shadow an effective arrangement. Equal update times use the
  arrangement ID as a deterministic tie-breaker.
- Launch readiness passes its evaluation instant into that reader, matching
  the instant used for capacity and qualification evidence. No effective
  delivery produces an explicit blocker; an out-of-window instructor's
  qualification evidence is not shown. Undated legacy arrangements remain
  compatible. Reads do not change status, timestamps or teacher assignments,
  and do not create delivery audit/outbox records.
- Local verification passed **4 focused unit files / 20 tests**, the expanded
  isolated **qualification-readiness integration file / 1 test**, and the
  prior **capacity-expiry integration file / 1 test**. Database checks cover
  exact start/end boundaries, null bounds, empty/inverted windows, future/
  ended/completed alternatives, deterministic equal-time selection, invalid
  evaluation times and preserved delivery state/evidence. Fixtures rolled
  back and separate queries verified the test identities did not persist.
- Typecheck, production build, mutation hygiene, route inventory (**69 routes /
  0 issues**) and scoped whitespace checks passed. No schema change, production
  data mutation, deployment or browser acceptance was performed. This reports
  current readiness, not complete forward-term staffing coverage.

## Working-tree evidence: configured staffing-to-launch handoff

- Launch academic setup now supports explicit, scoped registrar publication of
  initial teacher qualification requirements from the shared catalog. Draft
  policy never grants eligibility. Missing applicable policy blocks assignment
  and opening, as explicitly selected for this workflow.
- The actual Add instructor and optional-instructor provisioning commands now
  share policy enforcement and retry-safe assignment. Instructors are additive;
  existing co-teachers retain delivery and access. Explicit site-bound
  replacement uses the same enforcement and reconciles outgoing delivery/access.
  Retried section codes with conflicting class/title/version are rejected.
- The launch page shows server-derived candidate reasons and section blockers.
  Opening rechecks configured requirements, current independent verification,
  role scope and full instructional-window delivery coverage. Explicit section
  dates override term bounds; fallback term dates use school-year timezone with
  an inclusive last instructional date. Intermediate expiry and policy changes
  are evaluated, not just today's status or the endpoints.
- Successful staffing writes immutable eligibility snapshots with exact
  verification-event references, AuditEvents and transactional DomainEvents.
  Opening records its reevaluated staffing evidence and remains retry-safe.
- Local verification passed **6 focused unit files / 44 tests** and **4 isolated
  integration files / 4 tests**: launch-staffing, the existing two-scenario GF3
  program-launch test, qualification-readiness, and capacity-expiry. The launch
  fixture exercised actual server functions, canonical independent review,
  teacher class directory/access, policy and scope denials, expiry/revocation,
  co-teaching, explicit replacement, retries, opening and Site Today visibility.
  Launch fixtures and the test-only enum migration were rolled back; independent
  reads checked identity absence and restored enum labels. These are not
  multi-connection race or browser acceptance results.
- Final typecheck, production build, mutation hygiene, route inventory
  (**69 routes / 0 issues**), focused whitespace checks and isolated endpoint
  preflight passed. The editor test tool did not discover the unit files;
  the reported unit results came from the repository's Vitest command.
- **Release gate:** generated migration `0024_quick_scalphunter.sql` adds
  `published` to the existing policy-version enum. It is not applied to production.
  Approved rollout must apply it before this application code is deployed.
- **Not complete:** qualification catalog/claim submission/evidence-review UI,
  policy revisions and exception approvals, split-instructor rotation planning,
  continuous post-opening staffing enforcement, unified Launch Studio and the
  full site-director handoff remain outside this slice. Credential review was
  exercised through the canonical service, not through a browser workflow.
  No original capability track is claimed fully finished.

## Working-tree evidence: teacher credential submission and independent review

- Teacher self profiles now expose private qualification submission and review
  history, separate from the public profile DTO. Supported existing catalog
  entries accept issuer, jurisdiction, optional issuance/expiry timestamps and
  bounded PDF/JPEG/PNG evidence. Corrected evidence and renewals create new claims.
- Launch setup provides a teacher selector for independent credential review.
  Registrar session capability alone does not authorize this: the existing
  verifier policy still checks explicit database RoleAssignment capability,
  membership, subject affiliation and intersecting scope. No production grants
  or catalog entries were created. Self-review and unrelated-school access
  are denied server-side.
- Evidence uses private restricted Documents, size/MIME/magic-byte verification
  and signed create-only PUT requests. Successful finish atomically writes the
  claim, document, pending decision, audit and outbox; valid retries do not
  duplicate them, and conflicting retry metadata is rejected. The UI retains
  uploaded-but-unconfirmed submission details for same-page retry.
- Authorized evidence downloads are audited and use 60-second GET URLs.
  Approval requires verified private qualification evidence. Rejection and
  revocation preserve prior decisions and reasons. Review commands compare
  the displayed sequence under the claim lock and reject stale actions.
  The canonical review service now accepts a caller transaction and rereads
  locked claim data, keeping submission and review in their owning transaction.
- Decisions refresh server-computed launch eligibility. The isolated handoff
  test now exercises actual teacher upload/finish and registrar evidence/review
  endpoints through assignment, class access, opening and Site Today, rather
  than constructing approved credentials for that flow. It also verifies absent
  verifier grants, wrong scope/owner, oversized/expired submissions, storage
  verification failure rollback, stale decisions, rejection, revocation,
  immutable audit/outbox evidence and idempotent finish.
- Verification passed **8 focused unit files / 60 tests**, **3 isolated
  integration files / 3 tests** (expanded launch-staffing, two-scenario GF3
  program-launch regression, and qualification-readiness), typecheck,
  production build, mutation hygiene and route inventory
  (**69 routes / 0 issues**). Fixtures and test-only enum DDL were rolled back;
  independent reads verified fixture identity absence and restored enum labels.
  Storage was mocked at the R2 boundary: live-bucket conditional writes/CORS and
  browser acceptance remain **unverified**, not passed.
- **Release gate:** credential uploads default to disabled and require explicit
  `CAN_R2_QUALIFICATION_UPLOADS_ENABLED=true` only after storage/privacy
  acceptance. Required CORS includes `If-None-Match`. Private storage credentials,
  malware/quarantine, retention and abandoned-object cleanup remain operational
  gates. Existing authorized history/review remains available with uploads off.
  The prior policy enum migration still requires approved rollout.
- **Still open:** qualification catalog authoring and specialized attribute
  forms, policy revisions/exception approvals, split-instructor coverage,
  continuous post-opening enforcement and full Launch Studio/site-director
  handoff. This is additional teacher-management/launch progress, not completion
  of either original capability track. No production migration, deployment or
  persistent production-data mutation was performed.

## Working-tree evidence: create-only shared qualification catalog

- Launch setup now allows a verified catalog steward to add a basic shared
  qualification definition with stable key, display title, extensible
  classification, reason and explicit confirmation. It also shows stable keys
  beside catalog labels to distinguish similar names.
- Authoring requires registrar session capability plus an explicit matching
  `profiles.catalog.create` database RoleAssignment, an active Person, same-
  organization membership and intersecting site/program scope. The loader
  exposes the server-derived authoring flag; the command independently
  enforces the same predicate on writes and retries. Ordinary registrars,
  credential reviewers and policy publishers receive no automatic steward
  grant. No production grants were provisioned.
- New entries use schema version 1 with no specialized attributes. Existing
  entries are never edited/deleted. Identical retries reuse the existing key;
  title/classification/schema conflicts are explicit errors. Creation writes
  one AuditEvent and transactional DomainEvent, without changing claims,
  eligibility or published requirements.
- The existing isolated staffing-to-launch fixture now creates its catalog
  entry through the actual authoring endpoint, then publishes policy, submits
  teacher evidence, independently reviews it, assigns instruction and opens
  the program. It verifies missing grant/capability/membership, wrong site or
  program scope, teacher attempts, missing confirmation, malformed/injected
  fields, idempotent retry, conflicting metadata and exact catalog audit/outbox
  counts. An independent read verifies the catalog key did not persist.
- Verification passed **6 focused unit files / 49 tests**, **2 isolated
  integration files / 2 tests** (expanded launch-staffing and existing two-
  scenario GF3 program-launch regression), typecheck, production build,
  mutation hygiene, route inventory (**69 routes / 0 issues**) and scoped
  whitespace checks. Browser acceptance and multi-connection race behavior
  remain unverified. This change needs no
  new schema migration and did not migrate or deploy production.
- **Still open:** policy revisions/exception approvals, specialized catalog
  attribute forms, split-instructor coverage and full opening/site-director
  handoff. Existing live credential-storage gates and the prior policy-enum
  migration rollout gate remain unchanged.

## Working-tree evidence: future-dated teacher policy revisions

- Launch setup now displays policy version history and allows explicitly granted
  institutional staffing-policy publishers to publish complete replacement
  requirements at a future UTC instant. The session role/capability alone is
  insufficient: the shared institutional predicate checks an explicit
  `staffing.policy.publish` RoleAssignment, active Person, same-organization
  membership and matching organization/site/program scope. Existing catalog
  stewardship uses the extracted same predicate without changing its authority.
- Revisions are restricted to pre-opening programs, as is initial publication.
  Under the shared site lock, a revision creates a new published version/rule/
  applicability and records the predecessor's exclusive supersession bound.
  Requirement content is not edited. Audit evidence records the prior window,
  both versions, replacement requirements, reason and confirmation; an outbox
  event commits atomically. Identical retries add no duplicate evidence; stale
  or changed requests reject. Specialized/noncanonical chains fail explicitly.
- Expanded isolated acceptance verifies that a mid-term revision blocks opening
  until **both** assigned teachers independently satisfy the new requirement,
  while preserving their assignments and class visibility. Credentials issued
  exactly at the change instant satisfy the successor, not earlier instruction.
  The opening audit includes both versions' rule IDs. Active-program revision
  attempts are rejected. Independent post-rollback reads verify no revision,
  audit or outbox evidence persisted.
- Verification passed **5 focused unit files / 44 tests**, **2 isolated
  integration files / 2 tests**, typecheck, production build, mutation hygiene,
  route inventory (**69 routes / 0 issues**) and scoped whitespace checks. Unit coverage
  explicitly tests one-millisecond credential gaps at the version boundary and
  confirms that external policies still apply. Browser acceptance and
  separate-connection concurrency remain unverified.
- No new migration, production grants, production mutation or deployment was
  performed. The prior policy-enum migration and live credential-storage gates
  remain unchanged. Policy exceptions, active-program change management,
  split-instructor coverage and the full opening/site-director handoff remain open.

## Working-tree evidence: named opening-to-operations handoff

- New site-based activation requires a deliberately selected existing active
  site registrar/operator. Eligibility checks a matching organization/site
  account grant, registrar role, active Person and enabled account; the opener
  may select themselves if eligible. No role, membership or access grant is
  created by opening. Site-less activation retains its existing behavior.
- Activation atomically creates one owned `program_opening_handoff` Action,
  in-app notification, audit and transactional events with the Program/Journey
  transition. Its metadata retains the launch Journey, opening instant, opener
  and section IDs, while the activation audit retains the staffing evidence and
  handoff reference. Duplicate activation creates no duplicate handoff. A retry
  naming a different recipient rejects instead of silently changing ownership.
- The launch screen requires a deliberate recipient selection, explains missing
  operator access and links to Site Today after success. Launch-list reads now
  honor program/site scope before exposing recipient options. Site Today shows
  named receipt, the historical opening instant and section count, live workspace
  shortcuts and persistent acknowledged notes. Reads are private/no-store;
  earlier active programs without a handoff are not backfilled or represented
  as acknowledged.
- Only the selected recipient with current registrar/operator access, session
  capability and organization/site/program scope may confirm receipt with a
  10-2000-character note. Identical retries are no-ops; changed notes reject.
  Receipt resolves the same Action and emits immutable audit/outbox evidence.
  Generic Operations reassignment/status commands reject this domain type and
  the UI routes to Site Today instead. Recipient notifications deep-link there
  only within the current authorized scope.
- Expanded isolated acceptance covers distinct opener/receiver and eligible
  self-handoffs for both GF3 deployment models, absent/wrong/inactive/disabled
  recipient access, missing capability/scope/confirmation/note, generic-command
  bypass denials, retry counts, Site Today propagation, persisted receipt and
  independent rollback absence checks. Verification passed **4 focused unit
  files / 31 tests**, **2 isolated integration files / 2 tests**, typecheck,
  production build, mutation hygiene, route inventory (**69 routes / 0 issues**)
  and scoped/new-file whitespace checks. Browser and separate-connection race
  acceptance remain open.
- No schema migration, production grants, persistent production mutation or
  deployment was performed. Receipt is post-opening acknowledgment, not a new
  readiness gate or legal approval. Revoked-recipient recovery/escalation,
  external delivery verification, full evidence-review acceptance and the
  broader site-director daily-operations workflow remain outstanding.

## Working-tree evidence: revoked-recipient handoff recovery

- Site Today now identifies pending handoffs whose named recipient is no longer
  an eligible site registrar/operator. Only a scoped registrar with an explicit
  institutional `program.opening.handoff.manage` RoleAssignment capability,
  active Person and same-organization membership can select a replacement.
  The session capability alone is insufficient; no manager grants are created.
- Recovery is limited to pending handoffs with an ineligible current recipient.
  The Action is locked, authority and active Program/scope are rechecked, and the
  replacement must have current eligible site operator access. The command
  requires reason, confirmation, expected revision and a request identity.
  Identical retries create no duplicate audit/event/notification; stale or
  changed requests reject. Manager authorization is checked again on retries.
- Transfer updates ownership of the same open Action while preserving the
  opening snapshot and records previous/new ownership and reason in immutable
  audit/outbox evidence. The replacement receives an in-app notification and
  independently acknowledges receipt. Old notifications remain historical but
  their deep link disappears when the recipient is no longer the owner.
  Generic Action reassignment remains prohibited. Completed handoffs and
  still-eligible recipients cannot be transferred.
- Expanded isolated acceptance exercises lost original access, manager
  capability/grant/scope denials, wrong/inactive replacements, preserved
  opening snapshot, stale requests, changed retries, duplicate evidence counts,
  old-recipient denial and replacement acknowledgment. Verification passed
  **4 focused unit files / 33 tests**, **2 isolated integration files / 2 tests**,
  typecheck, production build, mutation hygiene, route inventory (**69 routes /
  0 issues**) and scoped/new-file whitespace checks. Browser acceptance and
  separate-connection race testing remain outstanding.
- No schema migration, production grants, production mutation or deployment
  was performed. Automatic escalation, proactive credential-change handling,
  full readiness-evidence acceptance and broader daily operations remain open.

## Admissions acceptance-to-class handoff

- Shifted work from launch refinements to the P0 admissions cross-persona path.
  Guardian offers now show school-year names, blocking requirement titles and
  distinct response, activation and class-placement next steps. Acceptance does
  not imply enrollment is active. Historical revoked/declined/expired offers
  retain their status after a subsequent offer activates.
- Registrars can withdraw issued, unaccepted offers with confirmation and a
  bounded internal reason. The command shares the seat-pool lock, releases the
  seat, retains the Application and offer, and writes immutable audit/outbox
  evidence plus a guardian notification without the internal reason. Identical
  retries do not duplicate evidence; changed retry reasons and accepted-offer
  withdrawal are rejected.
- Activation requires both response time and accepting guardian identity, and
  rechecks current enrollment-management authority, including retries.
  Acceptance/activation lock the readiness Journey against checklist review;
  accepting-guardian relationship reads hold a shared lock through the command.
  Checklist changes now record both requirement and Journey status in audit
  and transactional outbox evidence.
- Family Home and Student Today enrollment/class reads now explicitly respect
  program grants as well as site membership. Inactive Sections no longer count
  as assigned classes in the guardian handoff. Canonical identities remain
  unchanged through acceptance, activation and placement.
- Verification passed **15 focused unit files / 104 tests**, **2 isolated
  integration files / 2 tests**, typecheck, production build, mutation hygiene
  and route inventory (**69 routes / 0 issues**). The new cross-persona fixture
  is rollback-isolated and independently checks absence afterward; the older
  separate-connection test retains final-seat concurrency coverage and persists
  its fixtures only in the disposable test database.
- This closes a tested acceptance-to-class handoff slice, not all Admissions or
  all P0 priorities. Family forms/signatures, live document acceptance,
  jurisdiction-specific policy, broader admissions exceptions and browser/
  deployment acceptance remain open. No production mutation, migration, grant
  change or deployment was performed.

## Attendance cross-role reconciliation and operational exceptions

- Continued the P0 work outside school launch. An obsolete submitted excuse
  previously remained in the pending queue with disabled review controls after
  staff corrected its original absence. A scoped registrar can now close it as
  withdrawn with confirmation, a guardian-visible reason and the expected
  current AttendanceEvent. Teachers cannot close it; current, approved and
  rejected excuses are not eligible.
- The closure command shares the marking/review occurrence lock, preserves
  every attendance row, records immutable audit/outbox evidence and sends an
  in-app notice to the submitting guardian. Identical retries do not duplicate
  evidence; changed reason/current-event input is rejected. The guardian sees
  earlier excuse history separately from the effective current mark. Attendance
  notification links recheck academic guardian relationship and site/program
  scope and retain the exact correction-chain context.
- Fixed Family Home and Needs You to project effective attendance before
  counting absences or creating excuse follow-ups. A corrected present mark no
  longer leaves an old absent fact counted as unexcused. Counts and follow-ups
  remain constrained by the current program/site grants.
- Cross-role acceptance exercises real staff marking, guardian submission,
  registrar correction and closure, teacher views and later excuse approval.
  It verifies calendar closure and schedule-period changes update expectations
  and block new marks, committed replay survives configuration changes, stale
  uncommitted writes fail, and revoked teacher assignments block replay.
  The schedule editor's double-escaped time validator was corrected: valid
  `08:30`/`15:00` times now work, while invalid hours remain rejected.
- Verification passed **22 focused unit files / 137 tests**, **2 attendance
  integration files / 2 tests**, and the **2 admissions integration files /
  2 tests** as a shared-family regression, plus typecheck, production build,
  mutation hygiene and route inventory (**69 routes / 0 issues**). The new
  attendance fixture is rollback-isolated and independently verifies cleanup;
  the older GF4 service fixture persists synthetic records only in the
  disposable test database. Email transport is mocked in the new fixture.
- Closed the stuck obsolete-excuse path and corrected cross-role attendance
  read consistency. This is not a declaration that every Attendance or P0
  release gate is complete. Live supporting-document acceptance, browser
  offline queue behavior, separate-connection correction/closure races,
  outbound delivery and jurisdiction-specific policies remain unverified.
  No production mutation, schema migration, grant change or deployment occurred.

## Governed curriculum authoring to classroom delivery

- Continued the Academics/LMS P0 track outside launch-only work. The registrar
  Curriculum Studio creates owning-organization courses, authors syllabus and
  ordered modules/reading lessons, manages HTTPS class resource links, saves
  drafts and publishes validated, immutable releases with confirmation and a
  reason. Published releases can seed the next draft with stable content IDs.
- Publisher authority requires an explicit database-backed `curriculum.publish`
  grant, active person and organization membership, plus matching
  organization/site/program scope. Registrar session capability alone is
  insufficient. Every consequential change writes audit and transactional
  outbox evidence; retries do not duplicate it. Canonical revision hashes
  survive PostgreSQL JSONB ordering and reject stale saves/publication.
- New releases apply to new sections only, as explicitly selected. Existing
  classes keep their release, lesson content and completion records; no class
  upgrade command was added. Drafts already referenced by a section cannot be
  published through this workflow. Actual student, guardian and teacher class
  endpoints read the resulting published release.
- Verification passed **10 focused unit files / 97 tests**, **2 integration
  files / 2 tests**, typecheck, production build, mutation hygiene, route
  inventory (**70 routes / 0 issues**) and fixture coverage (**63 surfaced
  routes / no missing declarations**). The integration mode covers
  authoring, publication, actual section provisioning, cross-role classroom
  reads/completion, invalid input, stale requests, immutable published content,
  revoked grant, missing membership, inactive publisher, scope and foreign-owner
  denials. Both integration fixtures roll back and independently verify
  cleanup. The new synthetic studio seed is applied twice within the rollback
  fixture; route fixture coverage is static declaration, not browser acceptance.
- Closed the structured reading-content authoring-to-release-to-new-class path,
  not the entire Academics/LMS P0. Broader instructional planning, multimedia and
  verified private-document publication remain open. Existing published private
  resources retain their current authorized read behavior; authoring cannot
  publish arbitrary private document IDs. Live authenticated browser acceptance
  and separate-connection publisher-revocation races are not certified.
  No production mutation, schema migration, real grant change or deployment
  occurred.

## Admissions family document completion and correction

- Focused on the original Admissions P0 row: connected the guardian's existing
  enrollment offer workspace to its canonical application Journey checklist.
  Families can see requested/rejected document instructions, upload or replace
  evidence when enabled, view current verified files and retain superseded
  history. Notifications open the exact child/application. Internal registrar
  notes and raw storage keys are excluded from the family DTO.
- Submission returns readiness to registrar review; it does not accept an
  offer, sign a form or activate enrollment. The generic checklist cannot bypass
  pending document review. Registrar approval of the current verified evidence
  restores readiness. Closed checklists remain readable but prohibit new uploads.
  Both upload forms preserve successful PUT keys for an in-page finish retry.
- Read/upload/download authority requires the current managing-guardian
  relationship and organization/site/program scope. Upload finish rechecks
  authority transactionally after object verification, rejects changed retry
  metadata and records audit/outbox evidence exactly once. Document review now
  emits outbox evidence too; request/rejection notices remain retry-safe.
- Verification: **19 unit files / 118 tests**, plus **11 selected Admissions/
  enrollment/navigation tests**, **2 Admissions integration files / 2 tests**,
  typecheck, production build, mutation hygiene and route inventory
  (**70 routes / 0 issues**). Integration exercises real Neon endpoints from
  application through correction/approval, guardian acceptance, activation and
  class placement, including storage-verification failure, outbox rollback,
  superseded-file denials and guardian revocation during verification.
  Signing/object verification are mocked; no actual files are uploaded.
- The broad application-navigation run also found an unrelated study-group
  fixture failure (missing `sections` in its test data while the shared
  worktree's study-group page expects it). It was not changed for Admissions;
  the 11 selected Admissions/enrollment/navigation tests pass.
- Admissions is not yet fully closed: configured enrollment forms and genuine
  signatures, jurisdiction-specific packet/exception policy, live storage and
  authenticated browser/deployment acceptance remain outstanding. No production
  mutation, schema migration, real grant change, upload-switch change or
  deployment occurred.

## Admissions configured forms and required registrar review

- Implemented the user's selected policy: school-configured forms, one currently
  authorized managing guardian signs, registrar review is mandatory, and there
  is no automatic waiver. Forms are snapshots on existing JourneyRequirements,
  not a new workflow engine. Program metadata selects a packet key for both
  family applications and registrar intake; changing the source definition
  does not silently change an existing applicant's form.
- The existing family enrollment checklist renders the exact approved
  instructions/statement, typed answers, explicit acknowledgement and typed
  electronic signature. It records authenticated signer identity, version,
  exact form/answers and signing time. Registrar review either completes the
  requirement or returns it with a family-visible reason and exact-application
  notification. Corrections require a fresh signature. Approval rechecks the
  signer's current managing-guardian relationship.
- Signature/review transactions lock the Journey and requirement, reject
  stale/changed retries and append audit/outbox evidence once. Private answers
  and signatures remain in the restricted application requirement evidence;
  audit records reference/digest evidence and outbox payloads contain IDs and
  decision metadata, not form answers. Generic Journey completion, registrar
  checkboxes and document approval cannot waive a configured form. Offer
  readiness and legacy activation verify actual approved signature evidence,
  not just a manually set `complete` flag.
- Final verification: **22 unit files / 152 tests**, plus **11 selected
  Admissions/enrollment/navigation tests**, **3 Admissions integration files /
  3 tests**, production build and mutation hygiene. Route inventory passes
  (**71 routes / 0 issues**, including a separately added route). Acceptance includes missing/
  revoked signer authority, malformed and stale input, form correction/
  re-signing, review retries, signature/review outbox rollback, no-waiver
  denials, source-definition snapshot preservation and actual registrar intake
  packet selection. The mode also preserves final-seat concurrency and legacy
  GF2 regression coverage. The handoff fixture is rollback-isolated; the two
  older fixtures persist synthetic data only in the disposable test database.
- Typecheck passed during implementation, but the latest workspace check is
  blocked by a concurrent, unrelated nullability error at
  `actions.$actionId.tsx:28`. Final fixture coverage is separately blocked by
  the newly added `/actions/$actionId` route's missing declaration.
  That route was not changed for Admissions;
  this is not a claim that all workspace validation is green.
- This supersedes the earlier statement that no configured form/signature
  interaction exists. It does not constitute approval of real school packet
  text, legal/electronic-signature policy, jurisdiction-specific requirements or
  production release. Live private storage, authenticated browser acceptance
  and broader admissions exception acceptance remain release gates. The
  earlier unrelated study-group navigation fixture failure remains outside this
  change. No production packet, grant, upload switch, migration or deployment
  was changed.

## Admissions exception consistency

- Closed the waitlist/offer inconsistency: waitlisted applications cannot
  receive or accept offers until explicitly restored to review. Withdrawn or
  declined applications cannot be revived by stale issued offers or issuance
  retries, including through legacy acceptance/activation entry points.
- Intake no longer silently strands live offers when declining, withdrawing
  or waitlisting an application. Registrars must explicitly withdraw
  unaccepted offers first, preserving the existing confirmation, internal
  reason and guardian-notification policy. Accepted offers and active
  enrollments are not cancellable through intake. Expired/declined/revoked
  offers do not hold up closure. Closing clears the prior disposition;
  waitlist restoration preserves identities, Journey and all evidence.
  Reopening terminal applications and cancelling accepted enrollment are not
  introduced as implicit side effects.
- Application state transitions and offer/activation commands share a
  transaction-scoped application lock, acquired before seat-pool/row locks.
  The database concurrency fixture races actual waitlisting against issuance
  in both request orders and verifies exactly one decision commits. Existing
  final-seat concurrency, seat release and one-time activation remain covered.
  The rollback handoff fixture now also covers actual waitlist/restore,
  terminal decisions, scope/role denials, stale guardian acceptance, live/
  accepted offer closure denials, identity continuity and stage-outbox failure.
- Registrar pipeline/detail and guardian offer pages display the current
  waitlist/closed state. Applicant-specific links connect intake decisions,
  offers and readiness without dropping the selected application or school/
  program context. UI hiding is not the authorization boundary.
- Verification for this increment passes **22 unit files / 162
  tests**, **13 selected navigation tests**, **3 Admissions integration files /
  3 tests**, full workspace typechecking, production build, mutation hygiene,
  scoped whitespace checks and route inventory (**71 routes / 0 issues**).
  Static fixture coverage passes with **64 / 64 routes** declared. The earlier
  concurrent type and route-fixture errors above no longer reproduce; those
  unrelated files were not changed for this work. The selected navigation run
  intentionally excludes ten unrelated tests; it is not a full-suite claim.
- This advances the original Admissions row: cross-persona acceptance,
  streamlined enrollment and operational exception handling now have
  implementation and automated acceptance evidence. It is not production
  certification: approved school packet/jurisdiction/signature policy, real
  private-storage verification and authenticated browser/deployment acceptance
  remain explicit release gates. No production configuration, migrations,
  grants, upload switches or deployments were changed.

## Admissions authenticated browser acceptance

- The original Admissions row now has repeatable local browser acceptance
  for cross-persona acceptance and streamlined enrollment, alongside the
  existing database exception/concurrency acceptance. A real synthetic
  guardian signs the configured school form, a registrar returns it for
  correction, the guardian signs corrected answers and the registrar approves.
  The same application is waitlisted/restored, receives an offer, records
  guardian acceptance, activates program enrollment and receives class
  placement. The student sees the class and is denied registrar admissions.
  Persisted assertions verify unchanged household/student identities, both
  signatures/reviews, the exact active enrollment shapes and one-time offer/
  activation events.
- Browser verification uncovered a real SSR/hydration interaction defect:
  controls could appear editable before their React handlers were attached,
  losing review input or intake/guardian offer clicks. The enrollment forms
  and Admissions decision controls now remain disabled until interactive.
  SSR unit checks retain this boundary; the browser story verifies that the
  controls subsequently enable and save real mutations.
- `npm run test:e2e:admissions` performs the existing disposable-database
  preflight, starts a separate strict-port local app, and uses real synthetic
  sessions without auth bypasses or mocked application endpoints. It does not
  reuse or alter the shared dev server. Runner tests reject production mode,
  missing write opt-in, missing test URL, missing endpoint comparison and
  application/test endpoints that differ only by Neon pooler spelling. Fixed
  the host-only preflight normalization so that last case also fails closed.
- Two successive browser acceptance runs passed with fresh identities; the
  later run also checks student denial of registrar admissions. **23 unit
  files / 170 tests**, **13 selected navigation tests** and **3 Admissions
  integration files / 3 tests** pass. Workspace typecheck, a separate strict
  typecheck of the browser fixture/spec/config and shared GF1 spec, production
  build, mutation hygiene and scoped whitespace checks also pass. Route
  inventory remains **71 routes / 0 issues**, with **64 / 64** fixture
  declarations. This is not a full unit-suite claim; ten unrelated navigation
  tests are excluded.
- Browser fixtures commit synthetic data and preserve immutable audit history.
  Teardown revokes fixture sessions/grants and disables its accounts, with an
  independent no-usable-access check. It does not delete audits or disable
  database protections. Synthetic fixture evidence remains only on the guarded
  disposable database; R2 uploads are explicitly disabled.
- This closes the previously unverified local authenticated-browser handoff,
  not production certification. Remaining release gates are school-approved
  packet/jurisdiction/signature configuration, live private-storage acceptance
  and verification in the deployed environment. No production configuration,
  migration, grant, upload switch or deployment was changed.

## Consolidated main publication verification (2026-10-20 UTC)

- Verified `main` at `f5407fd` plus the outstanding admissions, enrollment,
  staffing, qualification, curriculum, notification, attendance and shared
  component changes before publication. The seven existing local commits
  include student-created study groups, support/Action detail navigation,
  shared workspace presentation, guardian policy reuse and mutation evidence.
- Full unit validation passes **110 files / 709 tests** with
  `npm test -- --no-file-parallelism`. The initial parallel run overlapped the
  production build and timed out in the application-wide route scan; that
  file passed independently and the complete serial suite passed without
  changing test thresholds or assertions.
- `npm run test:integration` passes **38 files / 54 tests** on the opted-in
  isolated `test01` branch, never production. Authenticated Admissions browser
  acceptance passes **1 test**, using its separate strict-port application,
  real synthetic sessions and the disposable database. Its managed application
  process exits after the run; live R2 uploads remain disabled.
- Workspace typecheck, production build, route ownership (**71 source routes /
  71 contracts / zero issues**), static fixture coverage (**64 / 64**), mutation
  hygiene and whitespace checks pass. Migration generation reports no schema
  changes and leaves the committed migration directory unchanged.
- At **2026-10-20 04:52:36 UTC**, Neon management metadata independently
  confirmed project `sweet-hall-62441909`, production branch
  `br-restless-sea-ar9ooo55`, endpoint `ep-autumn-glade-ar9r1t5q` and the retained
  recovery branches. Read-only production checks matched all **26 migration
  hashes and journal timestamps**, through
  `0025_calendar_occurrence_compatibility`, allowing checkout line-ending
  normalization. No migrations are pending; no production writes, ledger
  changes, seeds or migration replays were necessary.
- Both calendar compatibility triggers remain enabled, all checked calendar
  foreign keys are validated, and all **six** production calendar events have
  linked occurrences with **zero** missing links or schedule/scope mismatches.
  The required published policy-version enum value is present.
- These are local release-validation and live database-state results, not
  evidence of remote CI, application deployment, live external delivery or
  production browser acceptance.

## Updating this snapshot

Verify the current commit, confirm changes from the last baseline, inspect owning service and callers, update route contracts, then record test/CI/production evidence separately. Never carry forward a status label solely because it appeared in an archived sprint or phase report.
