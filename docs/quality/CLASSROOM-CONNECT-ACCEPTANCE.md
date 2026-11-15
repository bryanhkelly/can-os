# Classroom Connect release acceptance register

**Updated:** 2026-11-14
**Scope:** canonical facilitated-learning foundation and privacy-safe join/companion routes on `main`.
**Status:** flag-free implementation committed; live rollout **BLOCKED** by Netlify configuration permissions, missing restricted credentials and unverified current-main deployment.

## Evidence actually observed

- Read-only Neon `main` role probe: `can_os_canonical_auth_app` has no direct
  `USAGE` on `education_v30`, no direct room `SELECT`, and no direct
  participant or activity-evidence `INSERT`. A direct room query as that role
  returned SQLSTATE `42501` (permission denied).
- Read-only Neon `test01` catalog inspection: facilitated room, participant,
  and playback tables have `FORCE ROW LEVEL SECURITY` and one policy each.
  Existing `deployment_sites` and `enrollment_site_placements` exist and
  have the columns required by the canonical room Site check.
- The new `/join` and `/classroom/companion` routes, and their pending route
  contract entries, have been committed to GitHub main.
- **No post-change TypeScript, lint, build, connected browser journey, or
  restricted-role positive-write acceptance has been successfully executed.**
- Netlify published `can-os-demo-new` commit `04a93612` on November 5;
  this is not a current-main deployment. The November 14 PR build attempts
  were not a release signal.

## Run only against an isolated, explicitly identified test database

The existing guarded Playwright config requires:

- `APP_ENV=test`, `NODE_ENV=test`, `CAN_TEST_DB_WRITES_ENABLED=true`;
- matching `DATABASE_URL` and `TEST_DATABASE_URL`;
- a verified disposable Neon branch ID and `CAN_APPLICATION_DB_HOST`;
- localhost-only app base URL.

Do not run fixture-writing tests against the Neon `main` branch, production,
or a shared learner database.

### Unconfigured-runtime regression commands

```sh
npm run test:classroom:unit
npm run test:classroom:unconfigured
npm run typecheck
npm run lint
npm run build
node scripts/check-platform-route-contracts.mjs --check
```

Tests are **authored**, not marked passing. The unconfigured-runtime browser
checks verify that missing restricted authentication does not expose eligible
courses or facilitator controls to synthetic student/guardian sessions.
There are no deployment feature flags.

## Required enabled-feature acceptance matrix

Before real learner/facilitator production use, record the exact SHA, build,
database branch/role, actor identity, command, result and error evidence for
each of the following.

| ID | Scenario | Required outcome |
| --- | --- | --- |
| A01 | Signed-out/guardian/student hits facilitator workspace | Denied, no room IDs, pairing codes, learner data or playback URLs |
| A02 | Authorized facilitator starts a room for an active published Course at its Site | One room with a short-lived digest-only pairing code and transactional audit/event |
| A03 | Learner with active school enrollment and current *same-Site* placement pairs | One participant, no attendance or completion |
| A04 | School learner from another Site with same Course/Deployment attempts pairing | Denied, no participant or playback data |
| A05 | School placement ends or changes after a successful pair | Existing companion read loses room status |
| A06 | Host organization, operation-Site or site role withdrawn | Future pairing and room reads denied |
| A07 | Active noncredit participant pairs from remote delivery | Allowed only under existing Course/Deployment authority, without school Site placement |
| A08 | Wrong, expired and rotated codes; seventh failed attempt | Generic denial, persisted per-person throttle, no raw guessed code |
| A09 | Leave/rejoin, retry and second tab | Idempotent participant state, other users' rooms invisible |
| A10 | Media URL request after rights withdrawal | Denied; no persistent public media URL |
| A11 | Two Site facilitators, ten synthetic learners, reconnect and expiry | Isolation maintained, no cross-persona leakage |
| A12 | Host playback observations and learner presence | Cannot issue grades, certificate, attendance, watched minutes or grant claims |
| A13 | Phase 2 released activities, responses, attestations and surveys | Run after these separate capabilities are integrated and migrated; survey privacy preserved |
| A14 | Projector control and approved R2/YouTube/Vimeo content | Verify provider capabilities and real playback observations, not fabricated watch time |

The first twelve scenarios cover the merged foundation; A13–A14 are still
part of the unmerged larger Phase 2 work. Do not promote that PR wholesale,
declare success from code inspection, or claim production acceptance without
executed scoped runtime and browser evidence.

## Release decision

**Blocked.** The repository now has more secure same-Site pairing and
a usable learner-facing path in source, but current main has not passed
runtime, enabled-feature, browser, or deployment verification. The original
Phase 2 PR #291 was closed without merge; its activity-response, attestation,
projector and rehearsal functionality must be ported and accepted separately.

## P1 source fixes committed (2026-11-14)

Four targeted problems were addressed on `main`, **without asserting deployment
or runtime test success**:

1. **Media authorization:** The facilitator's catalog, signed private video URL
   and playback observation command now check the currently paired room
   audience. School learners must have active Enrollment and current placement
   at the room's exact Site. Noncredit learners require their own current
   registration in the Deployment. Every distinct audience adoption must
   independently pass the recorded-track rights, publication and withdrawal
   checks. No random same-Deployment Course attempt grants media access.
   For pilot safety, no media may be played until at least one learner pairs;
   the facilitator UI explains this and offers a refresh. More than 500
   paired learners currently require a separately designed bulk validation.
2. **Expiry:** The server projects an explicit `expired` state at eight hours
   after the room starts. The open browser reevaluates the deadline every
   15 seconds and hides expired playback/pairing controls. Persisted
   `state='live'` is not treated as indefinitely usable.
3. **Availability:** Public capability availability now runs a short-lived,
   read-only probe using the dedicated restricted Neon login and its
   session-context function under `SET LOCAL ROLE`. A correctly shaped
   but unreachable or unauthorized database URL no longer reports ready.
   Each learner/host command still authorizes the actual session separately.
4. **Feedback:** The existing `education_v30.facilitated_room_feedback` table
   (present in both Neon main and test01, with `FORCE ROW LEVEL SECURITY`)
   is now mapped and wired to authenticated learner companion ratings.
   A learner may submit/revise only their own three optional 1–5 ratings
   within seven days after a room finishes, even if they leave early.
   Participation evidence shows only aggregate ratings where at least five
   distinct people answered. Feedback never updates attendance, assessments,
   credit, certificates or funding claims.

Added unit/source tests cover eight-hour boundary behavior, the Site/audience
guard, restricted reader probe, person-bound feedback, the response window,
and aggregation privacy suppression. **They have not been executed in a
validated current-main build or browser session.**

The following enabled-feature browser checks remain important: mixed-adoption
playback denial; wrong-Site pairing; all-participants-revoked fail-closed
handling; first pair then media refresh; expiry while page is open;
restricted reader unavailable vs available; feedback save, revise, leave,
room close, seven-day expiry and cross-person attempts; and aggregation
suppression with four vs five distinct people. Use synthetic test01 data
and never run fixture-writing browser tests against production.

## Release 1–2 application integration (2026-11-14)

The following capabilities are now wired in `main`, pending executable
acceptance. These are source changes, NOT evidence of a successful deploy:

- `/canonical/lab/facilitated`: private V6.1 facilitator console with room
  creation, ephemeral QR, Site/Offering-scoped rehearsal, remote projector
  controls and question release/close
- `/classroom/$sessionId/presentation`: chrome-free shared-screen projection;
  only current question, options and playback commands; no learner PII/answers
- `/join`: typed code or local QR hash handoff; fragment is consumed and
  cleared; reuses signed-in own Course attempts and existing pairing API
- `/classroom/companion`: private live prompts/answers and observed presence;
  idempotent response retry keys, current enrollment/Site/room checks, distinct
  post-session feedback already in main
- Server media authority checks current learner Source, Site placement, current
  approved adoption, published Course rights and current room status for **all**
  paired learners; native R2 signed media plus allowlisted YouTube/Vimeo embeds
- Private projector commands and observed playback remain separate evidence;
  source polling stops on revoked rights/expired rooms or network/auth errors
- Facilitator rehearsal requires current Site and explicit approved adoption,
  and does not invent a Course attempt or learning outcome
- Existing Neon `main` and `test01` have required evidence tables. Source SQL
  patches, read models and guarded schema checker are checked into GitHub

Focused commands to run with a real installed repository and disposable branch:

```bash
npm ci
npm run test:classroom:unit
npm run typecheck
npm run lint
npm run build
# Must point DATABASE_URL/TEST_DATABASE_URL to the SAME explicitly isolated test branch.
npm run test:classroom:browser
# Read-only schema check, explicitly against a NONPRODUCTION database:
CAN_CLASSROOM_SCHEMA_VALIDATION=1 npm run db:canonical:classroom-schema
```

These commands have NOT been observed passing in the connected environment.
GitHub Actions is still not furnishing an executable status and the live Netlify
site has not been updated to the matching GitHub SHA. Deployed native restricted
reader credentials are also unconfigured due Netlify permission denial.

### Mandatory signed-in journey matrix before marking pilot-ready

1. Facilitator A creates a room at Site A. Facilitator B at Site B cannot read
   that room's command, question or playback data.
2. Five or more learners sign into their own Course attempts, scan QR/enter
   code, pair, and submit a choice/text response. Cross-Site school learner,
   withdrawn registration, revoked facilitator and expired code must be denied.
3. Validate exact same-session response retry after a simulated network timeout,
   including retry after the facilitator has closed the question. Repeated
   answers must remain distinct formative evidence and never official grades.
4. Test 45-second active-device observations, hiding tabs, dropped connections,
   rejoining, and voluntary leaving, without fabricating verified attendance.
5. Test Course A/Offering adoption A and mixed adoption B. A learner whose
   adoption or Site placement is withdrawn must stop new signed media URLs and
   projector playback; wrong-rights media and external arbitrary URLs denied.
6. Open the projector from an ephemeral code and validate it has no learner
   names, answers, member identifiers, or attendance. Restart or expire room
   while projector is playing; playback stops, with denial on authorization
   or network refresh error.
7. Rehearse an approved Course before any participant enrollment, including
   approved R2 video and allowlisted YouTube/Vimeo; no room participation,
   presence, attendance or learner completion rows may be written.
8. Verify private learner feedback and Site-scoped aggregate reporting remain
   separate from activity response counts, attendance decisions and funding.
9. Repeat sessions over four weeks without duplicating account, learner,
   registration or Course attempt identity. Scheduling, manual attendance and
   rollup/export remain separate upcoming workstreams.

No broad production rollout or sponsor-facing claims should be based solely on
the anonymous QR smoke tests or source-code checks.

## Release 3: scheduled, accountable classroom (2026-11-14)

Source-level Release 3 has been committed to `main`. New additive
canonical tables `facilitated_classroom_plans` and
`facilitated_room_assisted_activity_evidence` have been installed on
Neon `test01` and `main`. Both are forced-RLS, owner-only-policy
relations without PUBLIC SELECT grants, and all ten expected Phase 2/3
classroom indexes were verified on both branches. No existing learner
rows or academic decisions were changed.

**Built:**

- Authoritative `delivery_sessions` calendar and separate Course/host
  overlay; schedule, reschedule, cancel, and start during the permitted
  15-minute early window. Starting reuses the existing audited room
  creation path and current Site/Deployment authority.
- Private, bounded active Course roster; explicit in-person/remote
  facilitator attestations; no-device fallback using existing course
  identity; append-only 48-hour correction with notes, audit events
  and retry-safe request IDs.
- Independent facilitator-attributed paper, verbal, and shared-device
  formative activity records, without creating learner-submitted responses,
  new enrollment, official grade, certificates or completion.
- Centrally published, active, permission-verified survey campaign
  linkage, current personal invitation checks, and existing canonical
  identified noncredit course survey submission. Entry, pulse and exit
  stages remain separate from operational quick ratings.

**Focused tests authored:** `tests/unit/classroom-release3.test.ts`
covers calendar duration and start boundaries, attendance correction expiry,
required no-device notes, distinct response provenance, forced RLS contracts
and invitation/consent/stage checks. The read-only schema checker
`npm run db:canonical:classroom-schema` now includes the new relations.

**Not verified as passing:** full TypeScript compilation, unit tests,
production build, signed-in browser flow or current SHA deployment.
The earlier Netlify deployment and restricted runtime credentials blockers
have not been confirmed resolved.

**Additional two-Site negative browser acceptance:** unauthorized plan
creation/start/reschedule; concurrent schedule retry; Site B roster leakage;
no-device name/registered Course mismatch; no-device correction without
note; duplicate request IDs with conflicting content; paper activity not
reported as a personal device response; survey campaign with missing
permission, revoked invitation, wrong Deployment or confidential mode;
post-room entry/pulse/exit boundaries; and no PII projected.

Read the [Release 3 operator guide](../product/classroom-connect-release-3-operator.md).

## Flag-free product availability (2026-11-14)

Learning and facilitated-delivery handlers no longer consult environment
rollout flags, and the capability-lab navigation always exposes the rooms and
participation evidence links. The secure canonical-auth URL and signing secrets
remain mandatory runtime configuration, not feature-selection switches.

The current Netlify site lacks these credentials. Attempted production secret
provisioning through the connected Netlify integration returned **HTTP 403**.
A site administrator must authorize provisioning and trigger/enable a current
build. These obstacles prevent honest live-site acceptance claims.
