# CAN OS — unified multidisciplinary student support cases

**Status:** Required product scope for the user-approved Teacher Intervention → Student Success workstreams. **Design and integration backlog; not yet fully implemented.**  
**Branch:** `FullFlow`, draft PR #172. Do not merge to main or migrate production without authorization.

## Separate, mandatory safeguarding path

**Critical distinction:** Room facilitators, site leaders, site administrators and other onsite adults may see suspected abuse, neglect, exploitation, bullying, unsafe substance use, violence, self-harm or other welfare/safety concerns before any academic staff sees them. These concerns **must not** be forced through the ordinary teacher referral/counselor queue or treated as clinical or criminal determinations. See [Site Student Safeguarding and Welfare](./site-student-safeguarding-and-welfare.md) for urgent-response, external reporting, implicated-guardian, school/site responsibility, and case-confidentiality requirements.

The safeguarding/incident and ordinary student support pathways may link **only through permissioned, minimum-necessary tasks**, never by copying allegation narratives or privileged notes into standard Academic Actions or family notifications. A reporting adult's outside legal obligations cannot be delayed by internal triage or software workflow.

## Product requirement

A teacher's concern may require academic coaching, tutoring, counseling, accessibility-related instructional support, special education services, or local supervision. CAN OS must support **one coordinated, auditable student support case** spanning the right professionals, with clearly separated responsibilities and sensitive case information.

This is not a teacher-only action tracker, a site-wide free-for-all, or a second disconnected referral application.

## What already exists

- `src/db/schema/support.ts`: `support_referrals` linked 1:1 to canonical `actions`, `support_plans`, `support_services`, and `support_referral_stage_events`.
- `src/modules/support/support-referrals.functions.ts`: typed stages **submitted → accepted → plan_created → in_service → review → closed**, referral routing, plans, service scheduling, service completion/outcome, history and notifications.
- `src/modules/learning/teacher-learning-followup.functions.ts` and `teacher-followup-resolution.functions.ts`: teacher-owned academic Actions based on teacher judgment and specific learning evidence.
- `src/domain/access-context.ts`: roles `teacher`, `specialist`, and `counselor`. The current `ActorRole` list and case mutation handlers **do not** recognize paraeducator roles.

**Known security/product gap:** support-case readers and writers currently rely substantially on site/program authorization. A site-wide specialist/counselor must not automatically receive all counseling narratives or detailed case records. Case assignment, participation, discipline of practice, need-to-know visibility, and service-specific delegation need explicit enforcement **inside every case read and write**. Do not expand site-wide visibility as a shortcut.

## Role model (permission templates, not unfettered job-title powers)

| Professional | Primary scope | Expected case contribution | Must not receive by default |
| --- | --- | --- | --- |
| Teacher | Current assigned section(s) and enrolled students | Raise concern, give classroom evidence, implement instructional strategies, receive permitted recommendations, report classroom outcomes | Private counseling/medical/diagnostic notes |
| Case coordinator (qualified counselor, support lead or specialist) | Cases expressly assigned to them, plus approved supervisory assignment queue | Triage, assign multidisciplinary contributors, coordinate plan, schedule reviews, approve permitted disclosure, close with evidence | Unassigned cases outside explicit supervision and school scope |
| Counselor | Explicit case assignment and approved counseling scope | Assess, meet with student, document restricted counseling work, suggest shareable school accommodations/actions | Every unrelated student's case merely because employed at the site |
| Academic coach / tutor | Explicit assignment to a support service or selected case goal | View instructional task, schedule/perform tutoring, record delivered service and academic observations, request escalation | Confidential counseling notes or unrelated case history |
| Paraeducator / instructional aide | Narrow school/site/classroom + **named case or service assignment** | Perform delegated accommodations/support, record time/evidence, observations, and completion | Diagnosis, confidential plan parts, approvals, case closure, changes to official grades/credits |
| Special education professional / service provider | Approved qualification and need-to-know case assignment | Record required instructional service, plan implementation, progress evidence, and coordinate approved supports | Unrelated case files; privileged notes beyond their function |
| Site leader / room facilitator | Named onsite supervision tasks and schedule | Execute permitted onsite support task and flag escalation; do not conflate with attendance | Full counseling history or academic assessment details |
| Guardian / student | Related student and disclosure-eligible views | Consent/acknowledge where required, see permitted plans and actions, communicate progress | Internal restricted counseling notes or other students' records |
| School/CAN authorized support administrator | Explicit institutional oversight and program boundaries | Assign/reassign case coordinator, review aging and compliance, escalate unmet services | Blanket access to restricted clinical/counseling narratives |

Job title is not itself permission. Membership grants, scope, active professional relationship, case assignment, role capability, and record sensitivity must all pass.

## One workflow, with appropriately separated disclosure

1. **Identify:** A teacher or qualified staff member opens a concern from actual enrollment, work, learning activity, attendance or human observation. Learning telemetry **never diagnoses** a student or auto-generates a counseling referral.
2. **Triage:** An authorized support intake coordinator accepts, declines with a safe explanation, or routes the concern to academics/learning/counseling/planning. Teacher-owned academic Action can remain for classroom follow-up while a linked `support_referral` handles specialist services. Link records; do not duplicate case state.
3. **Assign:** Explicitly assign case coordinator and named participating professionals and their permitted responsibilities. A paraeducator can be assigned a **specific service** without inheriting complete case access.
4. **Plan:** Authorized staff create goals, interventions, service schedule, responsibilities, review date, and measures of success; sensitive case-plan sections stay appropriately restricted.
5. **Deliver:** Teachers and paraprofessionals record actual services/support, date, actor, outcome, and evidence; record an unmet appointment as not delivered. Offline support is staff-attested and separate from browser engagement.
6. **Review:** Compare relevant academic and service evidence (assignments, teacher observations, assessment progress, delivered sessions) to goals. Record unresolved needs and next owner; do not treat increased click counts as success.
7. **Close / Reopen:** Authorized coordinator closes only with required reviews/services recorded and a rationale. Support another review cycle, follow-up, reopening, and durable history. Do not silently resolve the teacher Action or the case because one support visit occurred.
8. **Communicate:** Students/guardians and referring teachers get minimum-necessary, consent-appropriate summaries, not case-private notes. Notify on real handoffs, upcoming deadlines, service gaps, and permitted closure status.

## Data relationships and visibility requirements

Extend the **existing** `support_referrals`, `support_plans`, `support_services`, `support_referral_stage_events`, `actions`, `notifications` and `audit_events` model rather than replacing them.

Design missing boundaries before new migrations:

- `support_case_assignments`: named actor/person, case/referral, assigned responsibility (`coordinator`, `counselor`, `teacher_contributor`, `academic_coach`, `paraeducator`, `service_provider`), scope/permissions, start/end/acceptance and assigned-by.
- Service ownership/assignment, delivered-vs-scheduled status, attested staff member, evidence and outcome tied to one approved case goal.
- Record sensitivity tiers such as **general academic support**, **restricted student support**, **counseling-confidential**, with field/content-aware filtered projections instead of allowing the UI to hide server-returned sensitive text.
- Explicit case links back to originating academic `action`, learning evidence, enrollment/section/program, and authorized goals. Do not merge official transcript, diploma, attendance, credit or health records into unstructured support notes.
- Staff credentials/supervision requirements where appropriate, guardian consent/notice flags when applicable, time-bound service access, and immutable audit of each sensitive read/mutation.
- Visibility-policy version, minimum necessary data export, retention/deletion rules, and permitted family/student summaries. Regulatory privacy and educational-record obligations require institution/jurisdiction-specific review.

## Strict access acceptance tests

- A counselor assigned to Case A may view Case A restricted information only within their documented permissions; a site colleague assigned only to Case B cannot read Case A's restricted notes.
- A tutor or paraeducator assigned to a service can see the task, student identification needed to provide it, date and progress target. They **cannot** fetch the parent's counseling messages or the child's unrelated cases.
- A teacher who referred the case sees acknowledgment and approved academic recommendations, not private counseling narratives.
- Moving/revoking an assignment immediately removes access to private case content and service updates; switching browser role or requesting a foreign case ID does not bypass it.
- The current staff assignment and active student placement are verified server-side for each access. Dormant, revoked, unrelated-program, sibling-site, wrong-student and expired-service access is denied.
- The assigned paraeducator records delivered/missed sessions but cannot approve or close a case without explicitly granted qualifying authority.
- A counselor can hand off to an academic coach with an intentional filtered task; audit the disclosure/recipient and avoid copying counseling notes into ordinary notifications or Actions.
- Teacher → coordinator → tutor/paraeducator → counselor (when appropriately authorized) → review → next action → completion works on **the same student, school, program, and linked case**. Actual independent browser sessions and disposable Neon integration tests are required.
- Case notes and outcomes remain accurate after a support staff reassignment, failed network write, or duplicate retry, without duplicate service completions or notifications.

## Priority and execution order

**P1 (next after teacher follow-through):** existing referral lifecycle audit, role/visibility matrix, explicit case assignment + scoped queries; first counselor–teacher–paraeducator handoff with one support service and negative authorization tests.  
**P1:** service delivery/attestation, support-plan review, follow-up task to teacher and student success, visibility-safe staff/family summaries.  
**P2:** case load/aging dashboards, missed-service escalations, resource scheduling, multi-program support assignments, compliance-related reports.  
**Later:** AI-assisted case summaries only from authorized records, with human approval and strictly filtered retrieval.

**Non-negotiable:** no standalone paraeducator application or secondary support database; no deployment claim based only on TypeScript, static CI, or migration existence.
