# CAN OS Classroom Connect

**Product capability specification and Phase 2 pilot plan**  
**Status:** Releases 1–2 source integrated on `main`; runtime/browser acceptance and production deployment remain unverified  
**Date:** November 13, 2026  
**Primary use case:** COGIC Phase 2 four-week training pilot  
**Broader applicability:** Churches, microschools, community learning centers, afterschool and summer programs, adult/workforce education, and grades 6–12

---

## Implementation reconciliation with canonical `main` (November 14, 2026)

This document defines the **target product experience**. It is not a claim that every P0 requirement is implemented or production-enabled. PR #293 has since merged the canonical foundation into `main`:

- `education_v30.facilitated_learning_sessions` records authorized Site, Deployment, Course version, host organization and facilitator. It is the authoritative shared-room identity, not a second public-schema `classroom_sessions` table.
- `education_v30.facilitated_learning_participants` pairs a verified learner's existing `learner_course_attempts` record with a room. It is not attendance, an additional enrollment, or course completion.
- `education_v30.facilitated_learning_playback` records validated facilitator actions without mutating learner course progress. Approved private recordings use the existing rights checks.
- `education_v30.learning_sessions` and `learning_session_events` are separate learner evidence, not login sessions and not a substitute for the room model. Existing noncredit participation and completion rules remain authoritative.
- The pairing service already has a short-lived ten-character, HMAC-digested code, per-Person rate limit, 15-minute pairing window, and bounded room age. Do not add PR #291's six-character code / per-token failure counter or its `drizzle/0079` / `0080` duplicate tables.
- The `/canonical/lab/facilitated` host workspace and `FacilitatedLearnerPairing` component are the integration points for the classroom QR / learner join UX. Preserve native canonical authentication, per-Course authorization and the 6.1 right-angle design system.
- Classroom Connect and learning sessions are normal product capabilities in `main`, with no environment rollout flags. Protected operations require restricted native-auth credentials, current grants, Site/Course eligibility and content rights. Source and schema acceptance are not a substitute for authenticated browser tests or a current successful deployment.

**Implementation update (2026-11-14):** The QR/projector/typed join flow, private facilitator console,
remote media commands, independent rights-checked rehearsal, learner activity release/close,
idempotent formative response writing and observed device presence are now integrated directly
into `main`. The previously unmerged PR #291 was a source reference; it was not wholesale
merged. The existing Neon `main` and `test01` databases already contain the required
additive tables, forced row-level security and report views. Reproducible SQL files and
a read-only schema acceptance script have been restored to GitHub.

The existing `/join` form handles code entry. QR handoff carries the code in a disposable
URL fragment, which is cleared when consumed. Classroom video playback rechecks every
currently paired learner and each current Course adoption, including Site placement,
instead of the old `representativeAttempt` shortcut. The projector receives only
current prompts/choices and commands, not the learner roster or private responses.
Both R2 recordings and allowlisted YouTube/Vimeo embeds require approved content
distribution rights; provider embeds may require manual player controls.

**Still incomplete:** Site scheduling, attendance/fallback, governed survey delivery
through room UI, four-week Site/network evidence exports, full two-Site synthetic
browser acceptance, typecheck/build verification and a current-production deployment.
There are no runtime environment feature flags.

**Pre-release acceptance:** Verify a real current-commit preview against dedicated test learner/facilitator/cross-site accounts. The primary successful path is authorized Site → active Deployment → published Course → active Course attempt → 15-minute pairing code → learner's explicit pairing → playback. Negative paths must reject foreign learners, withdrawn/expired registration, stale/revoked codes, role bypass and cross-Site access. Manual/QR joining must not generate attendance, watch time, grades or completion.

---

## 1. Executive summary

**One shared screen. Many connected learners. One coordinated learning experience.**

CAN OS Classroom Connect allows an organization to play instruction on a television or projector while participants pair their own phones, tablets, or laptops with a live classroom session. The shared screen handles common instruction; each learner's personal device handles participation, practice, responses, progress, and follow-up. The facilitator controls the live classroom experience without needing to be the expert who created the course.

For the planned **COGIC Phase 2 four-week training pilot**, Classroom Connect can turn local church gatherings into measurable instructional sessions using the same centrally approved course. A church may have one screen and a local facilitator, while 10–30 people join from personal devices. CAN OS can distinguish the session being presented, the learner's own work, and the program's verified attendance and outcomes.

This is **not just screen casting, QR-code attendance, or an LMS feature**. It is a reusable classroom orchestration layer across program types and instructional modes, including recorded lessons, live local instruction, remote expert instruction, and multi-site broadcasts.

### Key product outcomes

1. Lower the cost and complexity of delivering courses to groups without assigning each learner a separate video stream.
2. Preserve real-time interactivity and individual learning evidence in a group setting.
3. Let a facilitator run a course designed and taught by a separate instructor or content provider.
4. Produce trustworthy site-, program-, network-, and funder-level reports without equating a device connection to verified attendance.
5. Provide a compelling demonstration of CAN OS capabilities in the four-week pilot, and a reusable foundation for future free-library and funded programs.

---

## 2. Context: where this fits in the COGIC pilots

The previously discussed COGIC sequence is:

| Stage | Proposed scope | Primary proof |
|---|---|---|
| Phase 1 | One-hour private organizational training: five-minute bishop introduction; five ten-minute modules hosted by another presenter; five knowledge questions and a five-question feedback survey; approximately five-minute bishop closing | Content access, enrollment, participation, basic assessment and feedback, initial organizational adoption |
| **Phase 2** | **Four-week training course**, deployed to a small set of participating sites, with local facilitation and common centrally prepared teaching material | **Repeated educational delivery, session management, paired learners, verified participation, continued engagement, outcomes, and multi-site coordination** |
| Later expansion | More churches/sites, summer programs, adult digital skills, workforce programs, 6–12 education when appropriately authorized | Repeatability, organizational scale, sustainable operations, funding and compliance readiness |

These pilots are private organizational training, not a representation that CAN offers an accredited school, government-approved credential, or national third-party certification.

**Why Classroom Connect belongs in Phase 2:** Four weeks provide enough repeated sessions to test joining, reconnecting, facilitator controls, lesson pacing, completion, site differences, learner retention, support burden, and reporting. Phase 1 can validate basic content delivery without making live pairing a dependency.

The initial four-week content could be AI/digital skills, but the capability must be **content-neutral**. The same system should work for calendaring, financial literacy, healthy relationships, entrepreneurship, and other approved courses. Sensitive subjects require appropriately qualified content reviewers, facilitators, privacy design, and escalation procedures.

---

## 3. Users and responsibilities

| Role | Responsibilities | Key controls |
|---|---|---|
| Network program administrator | Defines the centrally approved offering, eligibility, reporting scope, campaign and participating sites | Publish approved course, assign sites, view authorized aggregate reports |
| Site/program administrator | Configures a local deployment, dates, room, staff, registration and local readiness | Manage enrolled participants and local operating settings |
| Local facilitator | Opens and runs sessions, presents content, releases activities, supports and verifies participation | Start/pause/advance, display aggregate responses, manage the room, record attendance evidence |
| Instructional creator/master teacher | Provides recorded or live lesson material and practice content | Manage approved instructional content; no automatic control of local enrollment or grades |
| Learner | Joins a session and completes individual activities | Join, respond, access personal work and progress, resume where permitted |
| Guardian (when needed) | Authorizes and supports a minor participant | Consent, relevant notifications and restricted learner information |
| Remote instructor/moderator (later) | Teaches or supports multiple participating sites | Broadcast and moderation capabilities within authorization scope |
| CAN operations/support | Monitors technical health and assists within scoped support permissions | Operational diagnostics, not default access to private responses |

**Permission rule:** Network administrators receive aggregate and authorized site-level evidence; they do not automatically receive all learner-level sensitive data. Local roles must be scoped to their site, deployment, and sessions.

---

## 4. Core experience

### 4.1 Before the session

1. A published **Offering** (course/program) is deployed to an approved local **Site**.
2. An administrator configures the session schedule, facilitator, room, lesson or instructional track, available device/internet capability, and attendance rules.
3. Participants register or are enrolled under the correct program deployment; sponsored, grant-funded, family-paid, and free enrollment are supported by separate commercial/funding objects.
4. The facilitator opens a session in **Presentation Mode** on the main display. The screen shows the lesson title, joining instructions and a rotating/expiring session code or QR code.
5. The facilitator can preview the lesson, activity release points, accessibility accommodations and a paper/no-device fallback.

### 4.2 Learner pairs with the classroom

1. Learner visits a short join URL or scans the displayed QR code.
2. CAN OS resolves the **session**, not an unsecured permanent classroom URL.
3. Returning enrolled learner authenticates (or uses an approved low-friction identity mechanism). A guest/visitor is directed through minimum required registration and consent rules.
4. CAN OS checks session eligibility, program enrollment or approved guest status, capacity, appropriate consent and any facilitator approval requirement.
5. Learner joins and sees current class status, lesson topic and available activities. The participant may remain paired across multiple lessons within the same meeting.
6. On reconnect, CAN OS restores the same learner and activity state; it does not manufacture a second enrollment or attendance record.

**Important:** The join code identifies or requests access to a session. It is **not** proof of identity, proof of attendance, or authority to view private learner data. Codes are short lived, rate limited, revocable and scoped.

### 4.3 During the session

- **Shared screen:** Displays recorded video, slide content, live speaker, group prompts and approved aggregate results; does not expose individual grades or personally identifiable information.
- **Facilitator console:** Controls presentation playback, lesson navigation, activity release, discussion breaks, attendance review, help requests, and end-of-session workflow.
- **Learner device:** Shows an activity companion, poll, knowledge check, notes, practice, questions, accommodations and personal progress; it need not stream the main video.
- **Real-time events:** The server broadcasts session state and activity availability to connected devices. Individual responses are stored privately under the learner's identity and scoped permissions.
- **Pacing:** Facilitator can pause shared instruction for discussions without automatically changing individual lesson completion or official grades.

### 4.4 After the session

1. The facilitator reviews attendance evidence and records exceptions (late join, device sharing, no-device participants, connectivity interruption).
2. Learners can finish eligible asynchronous work; official completion follows defined assessments and rules, not merely session presence.
3. CAN OS closes the meeting, retains session and learning events under the applicable retention policy, and produces local session reporting.
4. Program staff see longitudinal engagement across all four weeks, and network administrators see authorized site/program aggregates.
5. Survey and feedback data inform improvements without exposing sensitive responses unnecessarily.

---

## 5. Instructional modes and control boundaries

| Mode | Shared-screen instruction | Learner device | Person in room |
|---|---|---|---|
| Recorded instructor + local facilitator (**Phase 2 default**) | One screen plays approved lessons | Activities, knowledge checks, progress, feedback | Facilitator manages class and discussion |
| Live local teacher | Teacher presents in room | Companion activities and evidence | Teacher/facilitator |
| Live remote instructor + local facilitator | Remote teacher is displayed | Questions, polls, practice | Local facilitator |
| Multi-site live broadcast (**later**) | Same central instructor displayed at multiple sites | Individual and local site participation | Facilitator at each site |
| Independent/asynchronous | Personal device or self-directed screen | Full personal lesson interface | Optional |

**Architectural invariants:**

- A learner's **Section enrollment and official gradebook** are not replaced by a temporary session connection.
- The **current presentation position** is not the same as each learner's **lesson progress**.
- Supplemental teacher-specific practice may vary while centrally approved graded assessments remain authoritative.
- Switching presenter or instructional track should not erase learner practice history or change official enrollment or grades.
- A single physical screen can serve multiple learners, and a single learner may reconnect from different devices.

---

## 6. Functional requirements

### P0: required for a meaningful Phase 2 pilot

**Session management**

- Create and schedule a session linked to an existing program deployment, course/lesson and site.
- Assign facilitator and optionally a separate recorded instructor.
- Start, pause, resume, end and cancel sessions with clear lifecycle states.
- Present a projector/TV-friendly view with a session join code and QR code, title and access instructions.
- Join with code or URL, not QR only; permit code expiration, rotation and revocation.

**Identity and participation**

- Authenticated join for enrolled learners, with a controlled guest/registration pathway where allowed.
- Multiple participants per shared display; BYOD first, with shared/no-device participation fallback.
- Reconnection and multi-device handling without duplicating learners or attendance.
- Presence and connection history distinguished from verified attendance.

**Instructional interaction**

- Recorded content playback in presentation mode using approved sources (R2-hosted, YouTube and Vimeo, subject to provider embedding rights/limits).
- Facilitator-triggered polls, multiple-choice questions and activities linked to the lesson.
- Learner response capture, saved practice history and private formative feedback.
- Aggregate, privacy-safe response display on the shared screen.
- Discussion pauses with visible facilitator prompts.

**Reporting and operations**

- Session roster and engagement summary; facilitator-verified attendance.
- Individual learning and assessment records retained under applicable program rules.
- Four-week program dashboard showing sessions delivered, registered learners, verified attendance, activity participation, completion and survey results.
- Basic site-level and permissioned network-level aggregates.
- Exportable, clearly labeled pilot evidence; audit log of instructor/facilitator actions and attendance overrides.
- Captions, keyboard navigation, accessible join alternatives and readable projector presentation.

### P1: after P0 pilot validation

- Learner questions/help queue with facilitator moderation.
- Small-group collaboration and breakout activities.
- Remote participants joining the same local session.
- Live remote teacher with multiple local rooms.
- Facilitator handoff and co-host roles.
- Offline-tolerant response queue where feasible.
- Advanced accommodations and multilingual materials.
- More granular site readiness, device inventory and connectivity diagnostics.

### P2: network-scale capabilities

- Multi-site synchronized broadcast with each local site retaining its own session and attendance evidence.
- Network moderator controls and site-level escalation.
- Broadcast-specific analytics, live site health and event observability.
- Reusable cross-site campaign orchestration, audience segmentation and delivery templates.
- Synchronous learning experiences across very large networks and optimized streaming distribution.

**Non-goals for Phase 2:** Native mobile apps, arbitrary remote device control, video conferencing built from scratch, proctoring claims, AI auto-grading for high-stakes work, automatic recognition of grant-allowable expenses, or automatic awarding of accredited credentials.

---

## 7. Data model guidance for CAN OS

**Design note:** Reuse and extend the canonical CAN OS schema where it already models these concepts; do **not** add parallel representations that duplicate existing Operations, Offerings, Deployments, Sections, enrollment, assessment or funding lifecycle entities. Confirm exact names and relationships against the current canonical database before migration work. The names below are logical concepts, not a claim that these tables already exist.

### 7.1 Logical entities

| Logical entity | Purpose / suggested relationships |
|---|---|
| `classroom_session` | Single scheduled/live occurrence; links deployment, site, optional section, lesson, facilitator, session status and time window |
| `session_presentation_state` | Current content item, time position, active activity, paused/live state; authoritative for shared display only |
| `session_join_token` | Short-lived signed or opaque join code; expiry, rotation, revocation, allowed scopes; no private learner data in code |
| `session_connection` | Ephemeral device connection and status; links session to an authenticated actor/temporary approved guest, device fingerprint-safe reference and timestamps |
| `session_participant` | Stable participant membership per learner/session, independent of changing device connections |
| `session_attendance_evidence` | Join/leave events, activity evidence, facilitator verification, reason codes, override history and verifier identity |
| `session_activity_release` | Which approved question, poll, exercise or discussion prompt is released to which session at what time |
| `session_activity_response` | Privately scoped learner response linked to release, approved activity and learner; maintain submissions and amendments |
| `session_facilitator_event` | Playback, pause, advance, activity release, attendance confirmation and session close; audit trail |
| `session_feedback` | Learner/facilitator session survey responses and optional privacy restrictions |
| `session_media_binding` | References approved video/media and provider-specific playback metadata, without persisting unauthorized copies |
| `session_aggregate_snapshot` (optional) | Performance optimization for privacy-safe dashboards, derived from authoritative records |

### 7.2 Core relationships

```text
Network / Organization
    └── Site
         └── Program Deployment (authorized Offering)
              ├── Enrollments / Learners / funding assignments
              └── Classroom Sessions (one per local meeting)
                   ├── Assigned facilitator and content/lesson
                   ├── Presentation state and session join tokens
                   ├── Participants -> device connections (0..many)
                   ├── Attendance evidence and facilitator verification
                   ├── Released activities -> learner responses
                   └── Feedback and session operational events

Official course progress and grades remain in authoritative
learner / section / assessment records, not in connection tables.
```

### 7.3 Important invariants and constraints

- Unique stable participant per learner per session, with multiple connection records permitted.
- Support guest participation only when the particular program and legal/consent rules allow it; reconcile guests to enrolled identities intentionally.
- Enforce server-side permission checks for session joins, activity releases, learner responses and report access.
- Do not infer `attended`, `completed`, or `mastered` solely from connection duration or poll participation.
- Use event timestamps, idempotency keys and durable ordering/version checks for replay/reconnect safety.
- Set data retention, deletion, export and minimum-necessary permissions for minors and sensitive content.
- Preserve attribution to funding/program/site where needed for reporting, while not creating billable events merely because devices connect.
- Separate anonymous/aggregated projector results from identifiable learner analytics.
- For network-level reporting, compute unique learners by stable learner identity within authorized reporting boundaries; do not sum session participants indiscriminately.

---

## 8. Reference technical architecture

The proposed implementation should fit the existing CAN OS stack and patterns; the following is an engineering direction rather than an exact code change prescription.

**Interfaces**

- **Facilitator Console:** session start/stop, shared content, roster, activity controls and verification.
- **Presentation View:** TV/projector-safe, fullscreen, QR/code, approved content and aggregate displays.
- **Learner Companion:** responsive web page; join, identity/consent, activities, responses, saved progress and reconnect.
- **Admin/Network Reporting:** dashboards, exports, audit logs and permissioned cross-site aggregates.

**Services**

- CAN OS APIs for session management and authorization.
- Real-time messaging layer (e.g., managed realtime/WebSocket infrastructure) for session state and activity release; use durable backend records for anything requiring auditability.
- Relational records in Neon Postgres for the authoritative session, participant, activity and evidence state.
- Existing approved media bindings; direct/embedded playback from R2, YouTube or Vimeo as rights and provider terms permit.
- Existing identity, enrollment, permission, assessment, survey, reporting and notification services wherever possible.

**Sync principle:** Broadcast lightweight control events (lesson changes, activity releases, aggregate counts), not full learner records or a duplicate video stream to each paired phone.

**Connectivity degradation:** Presentation playback and local classroom facilitation should have a clear recovery workflow if internet drops. Responses cannot be claimed saved until confirmed by the server. Provide a manual attendance and activity fallback with later authorized entry and audit labeling.

---

## 9. Privacy, safety, accessibility and content rights

- Use age-appropriate identity and guardian-consent workflows for programs involving minors; apply relevant privacy and education laws based on the actual operator, program and jurisdiction.
- Minimize PII on publicly visible displays; facilitator devices must use scoped roles and session expiration.
- Protect join codes against guessing, reuse, unauthorized sharing and classroom hijacking.
- Treat responses to personal/sensitive questions differently from ordinary comprehension checks; avoid public display of sensitive individual answers.
- Support captions/transcripts, contrast/readability for large screens, keyboard/screen-reader usability, short-code alternatives to QR and appropriate accommodations.
- Screen-sharing a video to a room may involve different licensing rights than individual access. Validate content embedding, group exhibition and derivative practice rights for each provider.
- Require content review, age suitability and rights clearance before publication; sensitive life-skills subjects may require trained facilitators and reporting/referral protocols.
- Maintain incident, moderation, reporting and retention workflows; classroom participation is not a substitute for site child-protection policies.

---

## 10. Phase 2 four-week pilot design

### 10.1 Pilot objective

Demonstrate that several independent COGIC sites can reliably deliver the **same approved four-week course** through a shared-screen/local-facilitator model, while each learner has a personal interaction and progress record and CAN produces trustworthy site and network evidence.

### 10.2 Suggested pilot configuration

These are planning assumptions, not previously committed counts:

- **Sites:** 3–5 COGIC churches with appropriate facilities and designated local leads.
- **Learners:** 15–25 per site, including adult participants initially to minimize added minor-consent complexity; youth cohorts can be added when safeguarding and consent requirements are ready.
- **Course:** Four-week private AI & Digital Skills program (or another approved free-library course).
- **Cadence:** Two 60–90 minute meetings per week, for eight total sessions per site, with optional between-session work.
- **Primary mode:** Approved recorded master teaching on one shared screen, facilitated by a local person.
- **Devices:** BYOD for paired responses; one internet-connected presenter device and projector/TV per site, with paper/shared-device accommodations.
- **Costs and commercial terms:** Pilot sponsorship and permitted usage established separately; do not represent participation as paid or grant-reimbursable by default.

### 10.3 Four-week learning and product validation outline

| Week | Teaching example | Classroom Connect validation |
|---|---|---|
| 1 | Digital foundations and responsible AI | Site setup, registration, pairing, accessibility, facilitator start/end, baseline assessment |
| 2 | Research and information evaluation | Rejoin/reconnect, discussion pauses, activity release, individual practice and verified attendance |
| 3 | Create a digital artifact | Multi-step assignments, saved progress, facilitator interventions, learner-device diversity |
| 4 | Showcase, assessment and feedback | Completion rules, final assessment, surveys, site report, aggregate network report and evidence review |

The actual teaching syllabus should be approved independently from this product specification. Classroom Connect must not assume particular instructional subject matter.

### 10.4 Evidence collected

**Adoption and delivery:** invited sites, activated sites, session start/completion, registered and unique learners, first join success, connection failures, facilitator interventions, active device type and support requests.

**Learning participation:** verified attendance, active respondents, questions attempted, activities submitted, completion, pre/post assessment (where appropriately designed), and retention across weeks.

**Program quality:** learner/facilitator feedback, accessibility barriers, lesson pacing, site network quality, and no-device accommodation rates.

**Network readiness:** time to configure a new site, local facilitator training time, deployment fidelity, variance across sites, data quality and aggregate reporting turnaround.

**Funding-readiness evidence:** documented learner activity, delivery dates, agreed services, participant counts and validated outcomes; do **not** imply these automatically satisfy any funder's eligibility or reporting terms.

### 10.5 Proposed success gates (targets to confirm before pilot)

- All participating sites complete a readiness checklist and successfully run a facilitator rehearsal.
- At least 90% of participating learners can join or use an approved fallback in the first session.
- At least 95% of scheduled sessions start with a usable presentation and join pathway.
- At least 90% of submitted activity responses persist correctly with learner identity and session attribution.
- Attendance overrides are identifiable, justified and audited; no duplicate attendance on reconnect.
- Reporting reconciles enrollment, unique learners, sessions, attendance, activities and completion across sites.
- At least one site completes the four-week program without requiring CAN staff to operate the live classroom.

These are **candidate acceptance targets**, not claims of achieved pilot outcomes. Set baselines and confirm thresholds with the pilot team.

---

## 11. Implementation sequence

### Workstream A: data and authorization foundation

1. Map the latest CAN OS schema to session/participant/connection/activity/evidence concepts; avoid duplicate canonical tables.
2. Implement scoped server-side permissions and session lifecycle transitions.
3. Add short-lived join tokens and stable learner/session participation records.
4. Define attendance policy and audit model before reporting is exposed.

### Workstream B: first working classroom

1. Facilitator creates/opens session and launches Presentation View.
2. Learner scans QR or enters code, identifies and joins.
3. Shared-screen recorded lesson plays from an approved media binding.
4. Facilitator launches question; learners respond; aggregate result is displayed.
5. Facilitator closes session and verifies attendance.

### Workstream C: four-week continuity and reporting

1. Link repeated sessions to the same program deployment and learner enrollment.
2. Preserve practice, assessments and personal progress across weeks.
3. Add reconnect/re-entry handling and no-device attendance workflows.
4. Produce local and network pilot dashboards and exports.
5. Validate across multiple sites, devices, presenter configurations and unstable internet conditions.

### Workstream D: scale after evidence

1. Support remote live instruction and multi-site broadcasts.
2. Add advanced interaction formats, moderation, local breakouts and multilingual/accessibility improvements.
3. Integrate network promotions, sponsor reporting and approved funded-program billing where contracted.

---

## 12. Acceptance scenarios for engineering and QA

1. **One projector, 25 learners:** All pair to one session and receive the same activity without initiating 25 separate instructional video streams.
2. **Learner reconnects:** They switch from phone to laptop; prior answers and progress persist, attendance is not duplicated.
3. **Late arrival:** Joins the current session and sees the active activity; attendance captures actual timing and later verification.
4. **No device:** Facilitator records participation under a documented fallback; the record is visibly distinguished from direct device evidence.
5. **Pause and discuss:** Shared lesson pauses, phones show a discussion prompt, and personal academic progress is unaffected.
6. **Privacy:** Projector shows aggregate poll counts but never discloses identifiable private responses or grades.
7. **Multiple teachers:** Same Section has learners using different approved recorded instructional tracks; official enrollment, graded assignments and progress remain stable.
8. **Cross-site separation:** Two churches play the same lesson simultaneously; their rosters, local attendance and session controls remain separate.
9. **Network summary:** Authorized national lead sees valid aggregates and site-level differences, not unrestricted learner PII.
10. **Connectivity failure:** System shows clear disconnect/retry state and does not silently claim an unsaved answer was recorded.
11. **Invalid join code:** Expired, revoked, guessed or unauthorized codes cannot access a session or sensitive records.
12. **Accessibility:** Non-QR joining, captions, accessible forms and keyboard interaction work in supported browsers.
13. **Provider media rights:** Restricted third-party content is not exposed outside permitted player or license terms.
14. **Evidence integrity:** Attendance and completion are computed by published program rules rather than raw connections.

---

## 13. Decisions to make before build

1. **Pilot learner population:** Adults only initially, or minors with full consent/safeguarding workflows?
2. **Session cadence:** How many synchronous meetings per week, and expected duration?
3. **Facilitator authority:** Can local facilitators skip/reorder approved segments, or only pause/release activities?
4. **Guest joining:** Anonymous guest mode versus lightweight identity and enrollment required?
5. **Attendance criteria:** What evidence meets the pilot definition of verified participation?
6. **Media rights:** Which owned or licensed content is approved for in-room group playback?
7. **Device accommodations:** Expected number of shared-device and paper participants per site?
8. **Reporting scope:** Which site, jurisdiction and national leaders can see what granularity?
9. **Support model:** Who responds when pairing or playback fails during a live session?
10. **Pilot economics:** Who covers content production, hosting, facilitator time and support; any sponsor-funded reporting obligations?

---

## 14. Positioning and demo script

**Product one-liner:** *CAN Classroom Connect turns a room watching one lesson into a connected class with individual participation and measurable outcomes.*

**Phase 2 demonstration (5 minutes):**

1. Open a four-week AI course at a local church site.
2. Launch a session on the large screen; display join QR/code.
3. Three example learners join on phones (representing a larger room).
4. Play one recorded lesson on the shared screen.
5. Pause for a comprehension check; each learner answers privately.
6. Show aggregate responses on the projector and facilitator dashboard.
7. Close the session, verify attendance and review saved learner progress.
8. Show a four-week site dashboard and an authorized aggregate view across several churches.

**What this proves:** CAN provides the operational infrastructure connecting teaching, local facilitation, learner experience, evidence, and network reporting. It is not dependent on every church finding its own expert teacher or building its own program-management workflows.

---

## 15. Bottom line

Classroom Connect should be treated as a **shared capability inside CAN OS**, not a separate product or a one-off COGIC customization. The four-week Phase 2 pilot is a strong initial proving ground because it exercises the complete operating lifecycle over repeated meetings and multiple sites.

The minimum valuable outcome is straightforward: **a local facilitator can play one approved lesson to a room, learners can pair their devices and participate individually, and CAN OS can prove what was delivered and learned without conflating registration, connection, attendance and mastery.**

If that works reliably, it creates a reusable foundation for a free community course library, multi-site denominational delivery, microschool and afterschool programs, sponsor-funded education, and eventually more complex academic settings.
