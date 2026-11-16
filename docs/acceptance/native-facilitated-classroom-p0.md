# P0 acceptance: Native facilitated classroom

**Scope:** CAN OS, `feature/unified-class-offerings`. COGIC/COGBF phase 2 and any
independent school/community site. Native Class identity is
`/classes/:classId`. Instructor media is selected per Course version;
each learner's evidence belongs to that learner's Course Attempt.

**Status: SOURCE INTEGRATION ONLY. NOT RELEASED.** This plan is a release gate,
not a claim that these cases already pass. Do not run against production.
Migrate an isolated reviewed Neon QA database and provision purpose-specific
RLS before enabling any Class server functions.

## End-to-end user journey

1. Authorized operator creates a single approved Class without requiring a
   Class Offering. Optionally publish Class Offering terms for self-enrollment.
2. Grant approved local facilitator a Class teaching assignment; separately
   choose whether **attendance verification** is authorized. The latter is
   an immutable, audited assignment privilege. Changing it requires ending
   and reassigning the person's role.
3. Facilitator opens `/classes/:classId?view=teach&tab=classroom`, schedules
   four weekly dated Sessions, and opens one scheduled Session near its start.
4. Shared-screen recorded lesson rights are checked against the **active
   enrolled Course Attempts of that exact Class**, so the facilitator may
   select content **before** anybody pairs a phone. This does not create
   any learner watch-time or completion event.
5. Presenters choose one of:
   - **One laptop:** navigate to
     `/classroom/:sessionId/presentation?layout=single`; this contains
     approved playback and *public-safe question drafting only*. Do not
     mirror the private facilitator console.
   - **Dual screen:** use the private Class facilitator console on the
     laptop, and the dedicated audience-only presentation on the TV.
   - **Distributed:** TV presentation plus tablet facilitator console,
     with learners on phones. The presentation browser must authenticate
     with an authorized facilitator account; there is no public-display
     privilege handoff or shared staff password.
6. Show a QR generated locally from a short-lived pairing code. Its
   `/join#pair=...` fragment is stripped on arrival. If sign-in is
   required, the code is kept only in that tab; expired codes must be renewed.
   Anyone without a permitted Class Enrollment is offered catalog navigation
   or private invitation instructions. The QR does not enroll them.
7. Signed-in participant pairs *their own* native Class Course Attempt, then
   receives questions via `ClassroomCompanionRoom`; responses and presence
   are recorded against their Course Attempt and room identity.
8. Facilitation console sees response aggregates from currently enrolled,
   active and correctly paired Class members only. Withdrawn/transferred
   learners disappear from live aggregate denominators. Text answers,
   named rosters, moderation and attendance never reach the projector API.
9. If the manager explicitly approved attendance delegation, the facilitator
   can attest present/absent/unknown with the existing append-only evidence
   and no-device correction workflow. Device pairing, responding, verified
   physical presence, course completion and mastery are separate facts.
10. Facilitator confirms End Session. No further pairing, new activity
    submissions or playback commands are accepted. Historical evidence is
    retained under existing policy.

## Isolation fixture

Prepare two distinct Organizations/Sites and two active Classes using **the
same publisher Course version**, plus 25 registered adult learners in each
Class. Include one learner with no phone. Use fake/test people and a QA-only
application origin, never a real school or church roster.

| Test | Expected |
| --- | --- |
| Room A QR + current Class A learner | Pair succeeds |
| Room A QR + Class B learner, same Course | Denied, rate-limited |
| Room A QR + formerly enrolled/withdrawn Class A learner | Denied |
| Class A Session ID with mismatched Site, Course, plan or facilitator | Denied |
| Revoked operator/host/Site or Course adoption | Start, pairing, playback denied |
| Revoked facilitator grant or Class staff assignment | Controls and projector fail closed |
| Projector API and HTML state inspection | No names, roster, raw responses, attendance or moderation |
| 25 paired devices, 25 distinct learner responses | Separate Course Attempt evidence, aggregate 25 |
| Remove one learner from Class A after an earlier pairing | Live aggregate filters that learner out |
| Correctly enrolled learner with no device | No phantom pairing; authorized facilitator may attest observation |
| Assigned facilitator without attendance delegation | Cannot read personal roster or attest attendance |
| Manager-approved attendance delegate for Class A | May view and attest **Class A only** |
| Four dated sessions across DST transition | Correct local dates and duration |
| Native presentation with no paired device but enrolled Class audience | Approved recording may load; no watch-time attribution |
| Video on R2 signed URL after expiry | Rights rechecked; graceful refresh or explicit error |
| YouTube/Vimeo embed | Playback/seek limitations explained; no invented synchronization |
| End room, renew QR, retry stale question submission | No access to closed room or new evidence |

## QA and deployment gates

- Run `npm run typecheck`, `npm run test:classes:unit`,
  `npm run db:canonical:classes` on an isolated QA DB with the explicit
  read-only acceptance flag.
- Run authenticated Playwright across **two Classes and two Sites** and the
  three display configurations. Check negative access and revoked-grant cases.
- Inspect network responses for the presentation route and projector media
  for learner identifiers. Confirm Referrer-Policy and QR fragment scrubbing.
- Verify current restricted RLS and grant boundaries under the actual
  application database role (not just the database owner).
- Confirm credential/academic credit issuance cannot be triggered by
  pairing, video events, questions or attendance.
- Confirm every required hosted-video right, publication approval and
  instructor rights policy in the signed-media API.
- Validate devices on a real TV, laptop, tablet and phones with browser
  autoplay restrictions, accessibility, and poor/Wi-Fi-loss behavior.
- Resolve GitHub Actions `startup_failure`: zero executed jobs cannot count
  as passing CI.

**Release decision:** hold until database migration, read/write role isolation,
correct Class Session lifecycle, signed-in E2E and multi-Site negative tests
have actual passing evidence. Do not merge to main or enable for users
solely because source code exists.
