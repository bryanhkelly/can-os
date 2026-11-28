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
