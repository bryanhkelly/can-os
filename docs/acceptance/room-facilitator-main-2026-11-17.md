# CAN OS · Room Facilitator acceptance on Neon `main`

**Status: blocked on independently verified setup, NOT production-accepted.**  
Scope: GitHub `main`, Neon project `sweet-hall-62441909`, branch `br-restless-sea-ar9ooo55`. No `test01` operations. Last read-only data inspection: November 17, 2026 (America/Los_Angeles).

## Confirmed implementation

- A verified CAN `room_facilitator` role now resolves through the existing CAN sign-in and restricted `v301_can_staff_session_context` reader. No duplicate Person, account, Site or login.
- The projected role grants `learning.room.facilitate` only. Independent Course/Class staff and resource authorization still apply.
- Sensitive `credential.issue` approval is explicitly limited to Site Admin and Registrar even after the reader expansion. The restricted role retains EXECUTE; an unknown session returned no authority.
- Physical-room attendance and supervision remain separate from learner device pairing and Course progress.
- Shared V6.1 status, notices, mutation feedback and dialogs are used in the facilitator and Site-day surfaces.

## Production `main` snapshot

| Finding | Observed |
|---|---:|
| Active Site-scoped room facilitator grants | 2 (Valor and Barton demo identities) |
| Independent verified, email-verified facilitator identity eligible for restricted canonical reader | 0 |
| Physical rooms | 1 (simulated Valor classroom) |
| Active room-coverage schedules | 0 |
| All room-coverage schedules | 0 |
| Active `education_v30.program_deployments` | 0 (one planning deployment) |
| Active `education_v30.learner_course_attempts` | 0 |
| Facilitated classroom plans and sessions | 0 each |
| Native `education_v30.class_sessions` | 0 |

The Valor and Barton demo facilitator accounts do not meet the restricted reader's independent verification rules. Their Site lifecycle statuses are unset, and the reader requires `planning` or `active`. **Do not change these statuses or verification fields without the normal independently governed approval process.**

## Prerequisites to an honest live acceptance

1. Establish a real, independently verified CAN staff Person and accepted exact-Site `room_facilitator` grant; verify original account, Person, Organization and Site lifecycle. Demo or delegated identity does not satisfy protected canonical access.
2. Using the existing authorized Site administration workflows, establish a qualified primary and **separate** accepted backup facilitator, a valid physical room and linked onsite Sections. A saved schedule never certifies safety or staff presence.
3. Using normal publication and approval workflows, release a Site-authorized deployment, a published Course and a current learner Course attempt (or approved rehearsal for preview only). Never promote a planning deployment solely to make this acceptance pass.
4. Confirm runtime `CAN_CANONICAL_AUTH_DATABASE_URL` uses a restricted login and both canonical and facilitated pairing peppers are configured. Do not use owner database credentials for authorization.
5. Then perform an authenticated web journey with an authorized facilitator: check assigned room, schedule dated session, open session, use pairing and no-device fallback, record human-observed attendance, facilitate activity, complete closeout. Verify unauthorized Site/role, expired appointment and revoked grant denials.

## Acceptance evidence needed

- Authorized login succeeds with **one** CAN sign-in; current role is not inferred from a query parameter.
- Classroom scheduling, playback, surveys and attendance are scoped to the correct Site and existing Course/Class, and audit and underlying records reconcile.
- Room coverage, witnessed human presence and custody release remain independently authoritative. Pairing and Course activity never create physical attendance or authorize dismissal.
- Attendance retries reuse mutation IDs; saved-but-refresh-failed responses do not replay successful writes.
- Unauthorized roles cannot publish assessments, alter grades, approve credentials or read unrelated learner records.
- Relevant unit and integration suites and an authenticated browser walkthrough pass against the exact tested commit. GitHub Actions/Netlify payment blockers are not test passes.

**No room-coverage assignments, learner enrollments, safety approvals or attendance evidence were manufactured during this pass.** Do not retire `/canonical/lab/facilitated` into the primary route until the above runtime journey is proven. Keep the legacy link for legitimate authorized testing.
