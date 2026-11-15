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

## Flag-free product availability (2026-11-14)

Learning and facilitated-delivery handlers no longer consult environment
rollout flags, and the capability-lab navigation always exposes the rooms and
participation evidence links. The secure canonical-auth URL and signing secrets
remain mandatory runtime configuration, not feature-selection switches.

The current Netlify site lacks these credentials. Attempted production secret
provisioning through the connected Netlify integration returned **HTTP 403**.
A site administrator must authorize provisioning and trigger/enable a current
build. These obstacles prevent honest live-site acceptance claims.
