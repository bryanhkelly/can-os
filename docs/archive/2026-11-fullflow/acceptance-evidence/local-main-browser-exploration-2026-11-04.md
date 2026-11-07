# Local Main browser exploration - November 4, 2026

## Scope and authority

Exploratory evidence only, not a release certificate or exhaustive button inventory.
The operator explicitly authorized synthetic Valor business writes on local Main.
No FullFlow branch, database fixture, migration, provisioning command, authentic
identity, authorization bypass, payment, deployment or production merge was used.

The configured development database was read-only attested as Neon project
`sweet-hall-62441909`, primary branch `br-restless-sea-ar9ooo55` before mutations.
Normal browser commands persist in this database; the synthetic changes below remain.

Initial exploration used `http://127.0.0.1:5173`. On the operator's subsequent
instruction, execution switched to `http://127.0.0.1:5174`, which is now the runner
default. All five roles were rechecked there. Journal timestamps are UTC and span
November 5; scenario labels retain the operator's November 4 local session date.
HEAD observed during execution: `5379c38b1cc61e224f2ed1be14a81856b78edf5a`.
The checkout had extensive concurrent edits; this is not immutable-source acceptance.

## Evidence

- Runner: [run-local-main-exploration.mjs](../scripts/run-local-main-exploration.mjs).
- Append-only [scenario journal](../test-results/local-main-exploration/events.jsonl):
  161 events, including retries, corrections and blockers, not 161 passing tests.
- [Evidence directory](../test-results/local-main-exploration/): 67 screenshots and
  corresponding text snapshots. These are local generated artifacts, normally ignored by Git.
- 38 role-route checks and 8 explicitly clicked teacher classroom tabs were logged.
- No `pageerror` entries were captured by the runner. This does not establish that
  every interaction or request was error-free; see the failures and limits below.

## Completed workflows

| Actor | Browser evidence |
| --- | --- |
| Student: Jordan | Signed in; opened courses, assignments, discussions, groups, support, calendar and messages. Saved and submitted assignment text; submission receipt survived reload. |
| Student + guardian + teacher | Created a synthetic Algebra I group with an explicitly synthetic classmate invite. Missing-invite validation rejected the first attempt. Morgan granted consent, Riley approved Jordan, and Jordan subsequently saw approved membership on 5174. |
| Teacher + student | Created a class discussion, posted student reasoning and respectful disagreement, hid/restored the test post, locked/unlocked the thread and posted a teacher response. |
| Teacher + student | Scheduled a future study-group session. Jordan changed RSVP from maybe to going and posted an original synthetic group message on 5174. No attendance was invented. |
| Student | Recorded a fictional, nonviolent classroom-disagreement support request. This was ordinary student support, not a safeguarding report or real emergency. |
| Site admin + guardian | Proposed and approved a zero-cost fictional museum trip, invited Jordan, and recorded Morgan's acknowledged permission. No real travel, boarding or return attendance was recorded. |
| Site admin | Created a new synthetic student admissions inquiry. It remains at inquiry stage, with guardian verification and sign-in provisioning required. |
| Site admin | Saved a synthetic disclosure in the Meals service description, preserving its existing `not_offered` status. Reload verification succeeded again on 5174; no school name, domain or publication gate was changed. |
| Guardian | Opened two enrollment checklists; no available new Accept button was present. Existing accepted offers were left intact. |
| Room facilitator: Sally | Authenticated and followed her ordinary Attendance sidebar link. Opened attendance, safeguarding and messages. Admin console exposed only an authorization notice, not management controls. |
| Available roles | Clicked search, notifications, account-menu and mobile-navigation controls where present; checked 390x844 workspace overflow. |

## Persistent synthetic records

- Group: `88081ee4-46db-45f7-bc72-c0ed3542bd2c`,
  `SIMULATED QA 20261104 Algebra collaboration`.
- Session: `SIMULATED QA 20261104 Algebra practice session`,
  November 10, 2026, 15:00-16:00 America/Los_Angeles.
- Assignment receipt: `5cd6441a-679d-475d-a7ba-a45310e92975`,
  Algebra I Unit 1 Guided Problem Set. The submitted view is read-only and hides response text.
- Discussion: `SIMULATED QA 20261104 Respectful algebra debate`.
- Trip: `SIMULATED QA 20261104 Science museum planning`,
  November 20, 2026, 09:00-14:00 America/Los_Angeles; fee zero.
- Admissions application: `3828b479-0245-4335-bb50-9c18919c33cc`,
  `Synthetic QA Walkthrough 20261104`.
- Support request and Meals disclosure use the `SIMULATED QA 20261104` marker.

## Blockers and corrections

1. Sally's native credential POST returned 303 to `/access` despite an authenticated
   Room facilitator workspace. Clicking her visible Attendance link worked on 5174.
   This is a landing/navigation finding, not evidence that her credentials were rejected.
2. Teacher MP4/WebM upload is disabled by the deployment, including on 5174.
   No video was selected or uploaded, and no storage switch was changed.
3. Attendance has no configured expected roster for the checked date and reports a
   missing academic calendar classification. No student was marked present or absent.
4. Valor's online safeguarding intake is inactive. No safeguarding report was created;
   the UI directs users to the designated offline procedure and emergency help as needed.
5. Student signup is not end-to-end enrollment acceptance: the new inquiry has not
   completed independent guardian verification, eligibility, offer or activation.
6. Initial runner failures included obsolete confirmation wording, hidden-message
   selectors, Jordan's first-name-only review label and mixed Playwright package
   imports. Later journal entries record the successful recovery checks. A successful
   write was not repeated merely because its first confirmation assertion failed.
7. Early route labels of `permission-denied` on field-trip pages were false positives
   from an older trip's legitimate boarding-denial text. Later inspection confirmed
   normal guardian access; classification was narrowed to authorization alerts.
8. Shared integrated-browser click/keyboard attempts were unreliable. Standalone
   headless Playwright performed the successful normal form and UI interactions.

## Executed checks

On 5174, this existing read-only desktop/mobile subset passed **18/18**:

```powershell
$env:CAN_ROUTE_TEST_BASE_URL = 'http://127.0.0.1:5174'
npx playwright test --config playwright.routes.config.ts --grep 'Valor local public website|unknown public school|sign-in uses shared accessible controls'
```

The same subset also passed 18/18 earlier on 5173. These are separate runs of the
same checks, not 36 distinct scenarios. Focused runner ESLint passed and editor
diagnostics reported no errors. Application-wide typecheck, integration tests,
transactional audit/outbox inspection and complete enrollment acceptance remain
unverified by this exploration. No application source fix was made.