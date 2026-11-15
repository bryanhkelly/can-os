# Classroom Connect | Facilitator and learner quickstart

**Source status:** Integrated in GitHub `main` on November 14, 2026.
**Deployment status:** Do not use with real learners until the same-source
Netlify build, restricted canonical-auth credentials and signed-in pilot
browser tests are verified. No environment rollout feature flags exist.

## Facilitator

1. Sign in using a native CAN account with an active `room_facilitator`,
   `site_admin` or authorized facilitator grant for the intended Site and
   Organization. Open **Facilitated learning** in the capability lab.
2. Under **Facilitator rehearsal**, select a published, approved Course at
   the Site and preview a recording. Rehearsal creates **no** learner course
   attempt, attendance, pairing, credit or completion.
3. Under **Start a room**, select the current Deployment/Course/Site and
   create the room. It is valid for up to eight hours. Its current pairing
   code is valid for no more than fifteen minutes.
4. Choose **Launch projector with joining QR** to open a separate shared
   display. The QR is generated locally; code data is carried in a temporary
   browser URL fragment, never in the HTTP request path. If refreshed or
   rotated, reopen the projector from the current code panel. The typed
   alternative is `/join`.
5. Learners sign in and pair **their own existing Course attempts**. Wait for
   at least one eligible learner to pair, then choose **Refresh approved
   recordings** in the facilitator console. Media is unavailable before
   an eligible audience exists.
6. Activate playback on the projector. The private console can send load,
   play, pause, seek and stop commands. Native R2 video follows available
   controls. YouTube/Vimeo embeds may need manual provider controls or a
   local play gesture.
7. Enter a short prompt, select **Multiple choice** or **Short written
   response**, and choose **Release to learners**. Responses arrive under
   learners' own identities; the private console shows bounded counts.
   Select **Close responses** when finished.
8. End the room from the private facilitator workspace. Expired/ended rooms
   cannot continue projecting. Learner feedback remains available for its
   separately bounded seven-day window.

## Learner

1. Scan the QR or visit `/join`, sign in if needed, and select the matching
   existing Course registration. A code alone never grants a Course.
2. After successful pairing, use `/classroom/companion` to see the current
   shared playback status and answer new facilitator activities.
3. Retrying a timed-out response reuses the same submission identifier, so
   a network retry is not a second answer.
4. Select **Leave room** when finished. You may still provide optional
   session ratings afterward.

## Evidence rules

- The facilitator controls the projector, but learner answers are not
  shown on the shared screen.
- Device pairing is not verified attendance. Device heartbeats do not prove
  watching a video or being physically present.
- These questions are **formative only**. Grades, credit, assessments,
  certificates and funding claims remain under their existing independent
  authority.
- Report aggregates are privacy-suppressed for fewer than five distinct
  feedback respondents.
- Phase 2 follow-on work still includes scheduling, facilitator-attested
  attendance/no-device procedures, governed session surveys and complete
  four-week Site/network reporting and exports.

## QA before inviting participants

Run `npm run test:classroom:unit`, `npm run typecheck`,
`npm run lint`, `npm run build` and the guarded Playwright scenarios
from `docs/quality/CLASSROOM-CONNECT-ACCEPTANCE.md` using **test01**.
Verify the deployed SHA, restricted-auth reader, private storage access,
cross-Site denials, mixed-adoption rights, expired codes, reconnect/retry,
room closure and failed-command-poll stop behavior.
