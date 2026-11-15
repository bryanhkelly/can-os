# Classroom Connect Release 3 | The accountable classroom

**Source status:** Committed to GitHub `main`. **Database status:** two
append-only, forced-RLS table patches applied to Neon `test01` and `main`.
**Release status:** Current-site deploy, production auth configuration, build,
and authenticated browser acceptance remain unverified. Never claim this
release is currently serving participants until those checks pass.

## Classroom calendar

Open the **Facilitated learning** workspace. The **Classroom calendar**
shows approved Course/Deployment/Site combinations available to the currently
authorized facilitator. Enter a local start/end time and schedule a meeting.
The system writes the existing canonical `delivery_sessions` timetable
and a small `facilitated_classroom_plans` Course/host relationship.
A plan is not a live room, an enrollment or an attendance record.

Meetings must be 15 minutes to eight hours long, starting at least five
minutes and no more than 180 days from booking. Each plan belongs to exactly
one Site, current host and published approved Course; canonical deployment
Site and modality constraints remain in force. You may reschedule or
cancel **before** a session starts. Scheduled starts are allowed from
15 minutes before the planned beginning until before its scheduled end.
Room creation executes the same current-auth and audited room-start checks
as the immediate workflow. Refresh the room's pairing code as needed.

## Independent attendance verification

Open **Verify session participation** for the room. CAN lists the active
Course attempts currently registered for this Deployment/Course and Site
under the native facilitator grant. The host chooses direct in-person
roll call or a remote-live check and explicitly marks present, absent
or unknown. None of this is inferred from QR scans, device heartbeats or
video playback.

For a learner without a paired device, enter a note describing the actual
verification (15–250 characters), then record the attestation. It
references that person's existing Course attempt, not a synthetic pairing
or second enrollment. Changed statuses/methods require the same explanation.
Every assertion is append-only with facilitator attribution, a request ID,
audit event and a domain event. Corrections close 48 hours after actual room
end or the eight-hour maximum, whichever is earlier. Historic assertions
are not overwritten.

**This is facilitator-attested operational evidence, not official academic
roll call, a credential award or automatic grant reimbursement.**

## Paper, verbal and shared-device formative practice

If a registered learner answers a released question on paper, verbally or
on a shared device, use **Paper and shared-device practice**. Select the
registered learner, the exact previously released question, the response
and the method. Include a 15–500 character source note. The evidence is
written to `facilitated_room_assisted_activity_evidence`, which explicitly
attributes the entry to the facilitator and links the real learner
Course attempt. It **never** creates a fictitious learner-submitted
response or modifies official grades/completion.

The facilitator may record an observed response in the same 48-hour
correction period. Retrying with the same request ID is safe; conflicting
retries are rejected. These records must remain separate in future
reports from responses submitted directly by learners on devices.

## Governed classroom surveys

Use **Approved session surveys** to link an existing current survey campaign
at the same Deployment and organization to entry, pulse or exit. Only
published, permission-verified **identified** learner campaigns are offered.
The current canonical survey system must have already created personal
learner invitations and verified the necessary consent/permission evidence.
Survey responses are collected through the existing course survey service,
not through a new classroom database.

Entry links can appear to a paired learner when invited. Pulse links
are restricted to active live rooms. Exit links appear after that learner
leaves or the room ends. The campaign's own active timeframe, permission
and personal invitation remain authoritative. This embedded workflow
currently supports the approved **noncredit learner** pathway; school,
anonymous, confidential, safeguarding-triage and branching surveys keep
their separate governed routes. Neither raw survey answers nor personal
responses appear on the projector.

## Cross-session continuity

Each meeting has its own calendar event, live room, attendance assertions,
activity releases and facilitator evidence. Every participant retains
their original Course attempt across all sessions; scheduling and
joining cannot create duplicate enrollments or grades. Existing official
assessment and completion processes remain the only source of academic
results. Four-week reporting and exports are Release 4 work, with
assisted responses and personal submissions kept as separate columns.

## Verification needed before real participants

1. `npm run test:classroom:unit`, `npm run typecheck`,
   `npm run lint`, `npm run build` and guarded Playwright with test01
   identities must pass. Confirm a matching deployed SHA.
2. Verify two distinct Sites; a host at Site B cannot see or modify Site A
   plans, class rosters, activity evidence, or survey links.
3. Schedule, reschedule, cancel, start, retry after timeout, and reject
   invalid/expired/withdrawn relationships. Scheduled room startup must
   enforce existing canonical authorization.
4. Verify in-person no-device, remote check, correction notes and exactly
   48-hour correction expiry, including request-ID retry and audit rows.
5. Verify paper/shared-device responses are not written to personal
   `facilitated_room_activity_responses` or official grades.
6. Test unidentified and confidential campaigns denied, absent permission,
   revoked invitations, cross-Deployment links, post-exit surveys and
   private response protection.
7. Verify the restricted CAN auth database login cannot directly select the
   two new tables and that `FORCE ROW LEVEL SECURITY` is enabled.
