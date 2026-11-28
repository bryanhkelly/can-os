# Governed pilot API provisioning

`npm run qa:pilot -- provision` starts a private local application against the existing branch-attested QA runner, uses the standard site signup and personal account routes, redeems the standard one-time email credential through the local .test-only outbox, verifies session state, rejects token replay, and checks distinct Organization, Site, Person and grant ownership. It uses two independently created Sites and two fresh personal accounts. It verifies account creation creates neither noncredit registration nor native Class enrollment; this is not the full registration-versus-enrollment transition test.

The runner does not create real partner authorizations, synthetic identity review decisions, roles beyond those resulting from ordinary signup, or published content. New QA records use unique .test email addresses and are retained on the private QA clone; they are not automatically branch-tagged or authorized for the existing published fixture. Do not use copied production identities. The test does not send real email, persist bearer tokens, alter authentication rate limits, or use direct SQL writes. A rejected request or missing local email is a failure, not a pass. The existing learner API/browser fixture preflight remains mandatory.

Follow-up: complete independently governed author/reviewer grants, evidence/media, Offering and adoption workflow; orchestrate four real dated native Class meetings, pairing and attendance corrections at two Sites; exercise the distinct course registration and Class enrollment states; test accepted and revoked narrow reporting relationships and national disclosure. The existing relationship projection is internal and explicitly not approved for disclosure; no external report endpoint should expose it without completeness and disclosure gates. Source addition is not proof of actual execution.

## Governed stage runner

`npm run qa:pilot -- governed` runs one scenario from private `CAN_PILOT_QA_GOVERNED_JSON` in the ignored QA config. See the strict discriminated schema in `tests/e2e/live/pilot-governed-api.spec.ts`. Existing actors must be independently verified branch-tagged QA Persons with branch-tagged Organizations and exact active grants. The test acquires fresh sessions via .test email. No manual session bearer is required.

- publish: consumes an independently reviewed manifest and existing asset/policy evidence through native Course/Offering publication commands. It intentionally cannot create or fake the evidence/approvals.
- schedule: two separately authorized Sites, four native Class Sessions per Site, exact request retry and published lesson agendas; requires active Classes and four future windows per Site. Scheduling is not delivery.
- deliver: one fresh due session at one Site; existing active participants, cross-Class pairing denial, paired and no-device attendance, retry, corrections, close. Repeat for each of eight scheduled meetings at its actual authorized window. No clock override, no playback or assessment claim. This stage is QA role-play and never real participation evidence.
- relationships: narrow Site proposal, distinct recipient acceptance, owner and foreign actor acceptance denial, portfolio reconciliation, revocation. This is relationship lifecycle evidence, not national learner metric authorization or disclosure evidence.

All stages preserve existing authorization and source business rules. Aggregate-only test attachments omit access tokens, pairing codes and identities. Actual app execution and build remain required. Missing fixture prerequisites fail closed; this is not an all-pilots acceptance command. Native Class enrollment/registration transition, authoring/reviewer/media orchestration, full multi-session cohort evidence, and national outcome disclosure remain separate work.

### Registration, identity and executive evidence

The separate `enroll` stage exercises ordinary direct native Class enrollment against a reviewed, branch-tagged learner and published Class Offering. It reconciles one enrollment and attempt with no new noncredit registration. Pilot 1 additionally verifies that its atomic Course registration path creates two distinct linked canonical records and retries return the same IDs.

The .test email-link path cannot establish reporting relationship manager authority. The relationship stage therefore requires existing individually issued synthetic .demo credentials from the standard access workflow, not a shared fixed code, plus approved direct reporting relationship manager grants. It refuses .test actors for that stage. The same production credential and reporting policies apply; no exception or automatic privilege assignment has been introduced. Keep the private manifest in the ignored QA environment, never commit codes. No relationship grant is minted by this runner.

`npm run qa:pilot -- report` emits a private aggregate QA inventory across all branch-tagged organizations/people, distinguishing registration, enrollment, distinct people, ended rooms, current attendance assertions, unsuperseded completions and accepted/revoked relationships. It intentionally reports national impact as blocked rather than publishing unreviewed cross-tenant data. The network-impact catalog remains unavailable. Full national executive integration still requires trusted reconciled source manifests, independent disclosure records, approved report scopes and guarded report/UI execution.


### Native release preparation via standard application APIs

Two additional governed stages use the same native Offering release commands as the application:

- `configure-release`: independently authorized reviewer reads the exact manuscript and policy revisions, submits the already reviewed Course requirements and existing verified evidence through the native policy command, then rereads the revision. Both pilot policies require approved primary tracks and complete lesson coverage. The runner does not issue evidence or assign reviewer authority.
- `submit-release`: authorized author reads the exact unchanged draft and submits a manuscript-only or asset-bearing publication manifest. Exact retry must return the same manifest and the canonical Offering must remain draft. The resulting manifest ID/hash can be used for independent review and later publication. The runner never converts submission into approval.

The `publish` stage still consumes independently approved evidence. A manuscript-only submission is not an asset release. Use the normal reviewer workflow and real approved assets; any missing evidence blocks publication. These stages are orchestration of production RPCs, not new test-only business APIs. No SQL mutations, session injection, review fabrication, or runtime authorization changes are introduced. They are source changes pending exact-revision execution.


### Independent review and two-Site cohort reconciliation

- `review-release`: an authorized reviewer submits explicitly supplied, independently made decisions pinned to the exact manifest ID and digest using the ordinary review API. Existing verified evidence is required for approval. The author must not be able to read the independent review command, and the canonical decision order, reviewer and evidence are reconciled. Do not generate approval decisions from a test script; an accountable reviewer must supply them.
- `cohort-report`: after the eight real scheduled meetings have been individually delivered, two authorized Site managers retrieve their existing native Class reports. It requires four exact ended sessions per Site, explicit expected distinct-person and latest-present occurrence counts, verifies report totals independently from canonical records, and denies the other Site's manager. It intentionally does not sum unique people across Sites or represent these private reports as national outcomes. Use a fresh isolated Class at each Site and a UTC window spanning enrollments and all eight meetings.
- No new business endpoints, clock overrides, fabricated approvals, or SQL business writes are introduced. These tests remain pending execution on the exact release and require real scoped application credentials and approved fixture inputs.


### Cohort enrollment and instructional interaction

- `enroll-cohort`: two distinct approved Sites and Class Offerings, 2–20 distinct learners per Site. All target publication and QA actor boundaries are checked before writes. Uses the same native enrollment operation as `enroll`, verifies ordinary idempotent retries and that each direct Class enrollment creates no noncredit registration, then reconciles distinct attempts. Partial completion remains a failure; the operator must use fresh fixtures or reconcile existing enrollments before retrying.
- `deliver` accepts an optional `instruction` object with exact lessonId, assetVersionId, formative prompt and choices. After pairing, the authorized host requests the actual media catalog and protected media access; a foreign learner is denied. Paired learners retrieve the host's activity, respond, retry idempotently and the host closes it. Responses are independently counted from canonical records. The fixture supplies synthetic formative content; it is not an assessment grade.
- No signed media links are attached to evidence; playback events are not simulated. An API response granting media access does not establish real video playback, duration, or learner comprehension. The four-session API delivery sequence still runs at the normal authorized meeting windows. These source changes have not been runtime accepted.

The `readiness` command now checks the ordinary email-link actor selections instead of requiring pasted session cookies; it remains an inventory check, not authorization or successful execution. For `all`, supply both reviewed fixture configurations before starting. The local runner intentionally does not claim successful application execution from source commits alone.
