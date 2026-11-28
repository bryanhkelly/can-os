# Pilot release acceptance

This runbook covers any authorized noncredit offering, not a denomination-specific application. Universal Work and Approval Management is excluded.

## Source changes

- Publication: exact authorized site/offering selection, session-scoped readiness, registration-window and capacity validation.
- Participant: shared course activities, progress and separate baseline/final knowledge checks.
- Distribution: governed Go link and existing engagement invitation service; scoped draft, validation, retry and in-flight fencing. Native pilot-scale campaign sending is implemented; provider, consent, suppression, and receipt acceptance are outstanding. Do not reuse transactional delivery as an unconsented bulk sender.
- Evidence: canonical current verified participation minutes, distinct delivery sites, distinct-person disclosure thresholds, complementary-cell suppression, and shared metric components. A delivery site is not necessarily a congregation; participant hours are not unique clock hours. Private evidence must not be represented as publishable national impact.
- Site Intelligence: shared stored content package, selection-scoped UI, canonical 6.1 controls and explicit processing/failure state.
- Use existing design system 6.1 components and domain services. No pilot-specific parallel platform.

## Exact revision validation

On an approved runner with a clean checkout:

```sh
npm run verify:release -- --profile=pilot --install --database --browser --live
```

Supply only approved test and deployment configuration. Never expose secrets in evidence. The release command records its Git SHA and each pass, failure or blocked check. It does not deploy, approve partner content, or certify the complete pilot journey. Manual acceptance remains explicitly blocked in the automated report. Do not interpret a successful unit test as a successful pilot.

## Required independent launch evidence

1. Verify real publisher authority, offering version, delivery site, content rights and actual approved recordings and assessment/feedback instruments.
2. Apply required migrations via the reviewed database release path. Verify production parity; create a disposable Neon environment for writes. Verify the deployed preview fingerprint matches the tested revision and that its runtime uses that disposable database before any mutating browser test.
3. Establish two distinct verified QA identities. Exercise real Go invitation, registration, instruction, baseline and final assessment, feedback, completion and withdrawal. Verify retry/idempotency and cross-tenant denial.
4. Reconcile attendance corrections, superseded evidence, verified minutes, unique people, site reach, completion and disclosure suppression against canonical records. Do not extrapolate national reach.
5. Verify Gloo provider configuration, permissions, data minimization, actual generation and persistence.
6. For native bulk distribution, verify durable consent and suppression/unsubscribe records, idempotent delivery, retry and signed receipt ingestion before sending any campaign. Existing authorized external distribution is a separate pathway.
7. Record independent partner authorization and rights-withdrawal handling before any live rollout. Never fabricate a partner approval, participant or verified outcome.

A source commit alone satisfies none of the runtime or partner gates.

## Independent training rehearsal

Use a new dedicated Neon QA branch, never production or retired test01. Mark the independently authorized synthetic publisher and operator organizations with metadata qa_only=true and intended_branch=<exact branch ID>. Author and review a fresh training through existing publisher workflows; use short native MP4 recordings matching the fixture (seven for the first rehearsal and four for the second), separate five-question baseline and final forms, a matching identified five-question feedback campaign, an independently approved automatic completion policy (all lessons, final threshold 0.8, no verified minutes required for short QA), a single authorized Site, and a Go invitation. Do not reuse real partner approvals or publish a synthetic pilot in production.

Set APP_ENV=test, NODE_ENV=test, CAN_TEST_DB_WRITES_ENABLED=true, TEST_DATABASE_URL, CAN_APPLICATION_DB_HOST, CAN_PILOT_QA_BRANCH_ID, CAN_RELEASE_SOURCE_SHA (clean checked-out SHA) and CAN_PILOT_QA_LEARNER_SESSION, CAN_PILOT_QA_OTHER_SESSION, CAN_PILOT_QA_PROVIDER_SESSION (three distinct verified isolated accounts; never log session values). Set CAN_PILOT_QA_FIXTURE_JSON with releaseId, goCode, optional goActionLabel, trainingTitle, instructorTitle, lessons (1–40 distinct exact titles; seven and four for the two rehearsals), baselineAnswers and finalAnswers (five exact option labels each), surveyTitle. The baseline answer set should deliberately score below the final set in this synthetic exercise. Choose an actual approved automatic-finalization assessment policy. The local browser test uses a newly started application and refuses an unverified database, a used fixture or a production URL.

```sh
npm run test:e2e:noncredit:journey
```

The same test is run separately against each fresh fixture; use a separate approved synthetic publisher per fixture so the provider report remains unambiguous. The release runner invokes it when explicitly supplied the browser flag and isolated fixture configuration. Real email and Gloo credentials are disabled in automated browser rehearsals; independent provider acceptance is separate.

The test covers Go referral, consent, enrollment, cross-Person denial, real short-video playback, persistent lesson progress, two objective assessments, feedback, governed completion and the exact provider report row. It does not replace publisher review or prove actual COGIC training hours. Fixture preflight is read-only. An unavailable environment or missing approved fixture is a blocker, never a pass.

### 2026-11-24 discovery

Neon main returned SQLSTATE 42883 for min(uuid) on assessment_administrations.id. Migration 0117 replaces the unsupported aggregate while preserving the exact-one-administration gate. A read-only zero/one/multiple-candidate query confirmed the corrected expression; the migration and full browser scenario require isolated acceptance. Neon rejected creation of pilot1-acceptance-20261124 with branches limit exceeded. No real pilot records were changed.

### P0 follow-up, November 24

- Migration 0117 was exercised using the exact committed SQL in a rollback-protected PL/pgSQL subtransaction on existing isolated validation branch `v61-launch-brand-migration-validation-20261119`. The corrected definition exactly matched the intended replacement; function OID, owner, ACL, SECURITY DEFINER and configuration were preserved. A second execution was idempotent; intentional rollback restored the original function. No production mutation or migration journal change was made. This older branch does not establish full release schema parity or learner acceptance.
- The shared full learner journey accepts variable lesson counts, verifies progress against the fixture, and is connected to the release runner. The fixture preflight continues to require independent approvals and branch-bound synthetic organizations.
- The runner includes campaign settlement, webhook, owner delegation, pilot role and full Gloo package regression tests. Campaign worker totals now require a successful fenced settlement; provider redirects are rejected. The full Gloo package adapter uses a shared synthetic contract fixture for both domain and transport validation.
- No provider sends, external Gloo calls, live partner publication or owner grants were created in this work. Exact-SHA compilation and browser tests remain required. An operator must record independent provider and owner acceptance; a passing synthetic browser run alone is not launch authorization.

### Isolated database verification (2026-11-24)

Dedicated Neon branch `pilot1-acceptance-20261124` (`br-spring-frog-arnmih9w`) created from main. Migration 0117 was applied twice; exact replacement, unchanged function authority and idempotency verified. The real Course Attempt insert then exposed SQLSTATE 42702, an ambiguous administration_id variable in ON CONFLICT. Migration 0118 renames only the local variable and preserves conflict semantics; applied twice with unchanged authority. Neither fix has been applied to main by this QA run.

The rollback-only regression `database/canonical/v3.0.1/accept-noncredit-assessment-provisioning-qa.sql` executed successfully on the new branch: two assessment grants, idempotent provisioning, identity/policy linkage, premature completion denial, ambiguous final administration denial, distinct learner grants, assessment-alone denial, all seven lessons required, single automatic completion, and its audit/domain event. It exercises actual database triggers and state transitions using synthetic reviews, an item response and a supplied synthetic item-level score. It is NOT evidence of browser authentication, actual media playback, server scoring, public Go links, feedback, or reporting UI. It uses the connected database owner, not restricted application-role/RLS acceptance. No synthetic fixture data was retained.

With the same isolated branch guard variables as above (including APP_ENV=test and CAN_TEST_DB_WRITES_ENABLED=true), run `npm run verify:pilot:noncredit-regression` to repeat this database regression. The full approved browser fixture and runtime remain separate gates.

### Feedback regression (November 24)

The dedicated QA branch lacked the opt-in knowledge-check feedback trigger and vocabulary. The canonical survey campaign scope CHECK also prohibited the exact deployment/Offering pair required by the existing learner service. Migrations 0119 and 0120 install the scoped in-app trigger and allow only a matching identified deployment/Offering pair in addition to existing single-scope campaigns. No actual invitations are backfilled. Both were applied to the dedicated QA branch only.

The rollback regression now passes 15 checks, including a real baseline/final assessment state transition, no baseline invitation, exact operator/Offering invitation with disabled and different-operator campaigns excluded, idempotent invitation, five saved feedback answers and duplicate-response denial. It executes SQL as the database owner; restricted app-principal acceptance, actual server scoring, browser, media, Go and report reconciliation are not established. Synthetic review and response rows are rolled back.

### Go, identity and evidence reconciliation (November 24)

The isolated regression now passes 22 assertions. It exercises actual SET LOCAL ROLE can_go_gateway with exact-code visibility, paused link denial and two atomic daily counter upserts. It creates a synthetic verified account correspondence using the existing public Person, verifies a wrong-Site claim fails, inserts a valid consent claim with immutable attribution and independently reconciles one registration, one distinct Person, one delivery Site, seven lessons, one baseline result, one final result, one feedback response and one completion. The full transaction rolls back. Only the gateway segment runs under the restricted gateway role; other SQL uses the connected owner. No HTTP route, server-side assessment scoring, reporting service/UI or browser was exercised.

Ordinary noncredit self-enrollment no longer creates a second legacy Person; it requires the active public Person, same-Person bridge and verified native account. Reviewed adult/Class flows retain their separate existing evidence gates and need their own cutover verification. Source changes require compilation and authenticated browser acceptance.

### Application HTTP RPC acceptance (November 24)

Run `npm run test:e2e:noncredit:api` against a fresh, independently approved, branch-tagged fixture. This test is designed to call the existing Vite-transformed production server-function clients from an inert local browser document over the application's HTTP transport. It exercises direct adult-training Go resolution, authenticated registration and consent, idempotent retry, cross-Person denial, session recovery, server assessment draft/submission/scoring, recorded instructor selection and lesson completion, automatic completion, identified feedback idempotency, provider reporting, and independent read-only database reconciliation. No test-only production endpoint or mocked API/DB handler is introduced. Playback/layout acceptance is separate and requires another fresh fixture.

The shared fixture preflight independently attests the restricted authentication connection to the exact QA branch, session/assessment configuration, three distinct current branch-tagged QA accounts and an active matching self-paced Class. Supply CAN_CANONICAL_AUTH_DATABASE_URL for the isolated restricted login, CAN_ACCESS_TOKEN_PEPPER, CAN_CANONICAL_ACCESS_TOKEN_PEPPER, CAN_NONCREDIT_ASSESSMENT_KEY_HEX, and CAN_NONCREDIT_AUTO_FINALIZATION_ENABLED=true. Do not use production secrets/sessions or bypass independently reviewed adult identity. The API scenario requires a direct adult-training Go link and an unambiguous eligible Class. Course-to-Class placement now leaves the release FK null for Class-only attribution, preserving release provenance in the relationship snapshot, as required by the installed source CHECK. Cross-operator attribution and reviewed Person cutover still require acceptance.

These sources are committed but uncompiled and unexecuted. The isolated branch currently has zero published branch-tagged QA releases and zero matching QA Classes, and the execution environment cannot resolve GitHub for checkout. Do not interpret the earlier database-only regression or authentication-reader tests as actual API acceptance. A successful exact-SHA run with real API results and database reconciliation is required.

### Recovered QA execution and restricted authentication (November 24)

Re-executed the committed 22-assertion SQL regression on br-spring-frog-arnmih9w. All assertions passed, including restricted Go role, identity/consent claim, attribution and independent SQL evidence reconciliation. Verified no synthetic Organizations or Sites remained. The release profile now runs the rollback-only integration as a distinct gate, requiring explicit CAN_TEST_DB_WRITES_ENABLED=true and an independently attested nonproduction target. It never converts a skipped regression into a pass.

A separate direct Neon connection as can_os_canonical_auth_app successfully assumed can_v30_canonical_auth_reader, returned zero rows for an unknown session digest and failed a direct public.people SELECT with SQLSTATE 42501. The database-owner login cannot assume the restricted auth reader (SET option denied), so a valid-session/revocation scenario inside the owner rollback test could not execute; no role grants were broadened. The direct restricted login probe does not establish successful authenticated participant access. The 22-assertion regression remains the verified integration count.

The persistent approved browser/API fixture is still missing: zero branch-tagged QA releases and Classes. The local execution environment still cannot resolve github.com. Do not report source-only runner integration, restricted authentication probes or canonical evidence SQL as a successful application journey.

### Persistent rehearsal draft and restricted session lifecycle (November 24)

The dedicated QA branch contains the isolated organization tagged qa_fixture_key=pilot1-api-rehearsal-v1, one draft Community Decision-Making training/course/Offering, seven lessons, two draft five-item assessments sharing five questions, and one five-question draft survey. Executed `database/canonical/v3.0.1/prepare-pilot1-rehearsal-draft-qa.sql` twice: one proposed operator relationship, operation/Site association, proposed adoption, draft self-paced Class and draft primary instructor track were retained without duplicates. No approval or publication was manufactured. Seven local MP4 recordings and VTT captions are available in the original rehearsal media ZIP; R2 upload/readback and independent content review remain required. Offering requires one approved primary track with complete coverage. Five answer keys are missing; `npx tsx scripts/acceptance/prepare-pilot1-rehearsal-keys.ts` uses the existing canonical encryption helper and the isolated runtime key, with explicit branch/write guards and idempotent key validation. This new script is source-only, not yet executed or compiled. No real partner keys are needed or permitted.

A short-lived synthetic digest on the existing separately tagged QA auth fixture was read through a direct connection as can_os_canonical_auth_app with SET LOCAL ROLE can_v30_canonical_auth_reader. Exact learner, grant, role and session resolution succeeded. Revoked the synthetic session immediately and confirmed the same digest returned zero rows. No usable HTTP bearer was created or exposed; no active QA native sessions remained. This proves the restricted database reader lifecycle, not actual CAN cookie issuance or HTTP authorization. Neon main has no rehearsal fixture. The draft still has zero enrollment releases and registrations. Runtime and independent review remain blocked.

### Canonical media publication handoff

Existing ProviderVideoUploadForm and private R2 storage remain the only native recording ingestion path. Added an explicit creator submission marker on the existing asset-version metadata, Course-scoped independent reviewer inventory, private preview through ClassVideoPlayer, decisions in published_asset_reviews, exact content hash review receipts in the existing audit ledger, and a guarded immutable publication command. Publication requires latest independent academic, rights and accessibility approvals, same-publisher current verified evidence, intact R2 bytes and current Course appointment. The existing track and Offering publication services then consume the published version; no pilot-specific media table or storage convention was added. Reviewer UI uses existing V6.1 workspace controls. Evidence IDs are currently entered explicitly, consistent with the existing track review panel; governed evidence selection and caption delivery need further validation. Source-contract tests added, not executed. No storage upload, live review, asset publication or production migration was performed. Real restricted-session browser acceptance, review concurrency and storage readback are required before closing this gate.


### Read-only QA readiness triage (November 27)

Run `npm run verify:pilot:qa-readiness` before requesting HTTP or browser acceptance. It loads local environment settings if present, prints only configuration presence/shape (never values), and inventories branch-tagged synthetic training, published primary lesson coverage, sealed assessment items, open administrations, current policy/campaign counts, active self-paced Classes, open releases and current verified accounts. The database inventory requires the existing isolated Neon attestation settings; the command never publishes, grants authority, creates sessions or writes evidence. A candidate inventory is not strict fixture validation. The exact fixture preflight still validates the restricted auth connection, session digests, approvals, exact offering/site/adoption scope, one active matching Class, and registration freshness.

On the dedicated QA branch `br-spring-frog-arnmih9w`, both diagnostic SQL queries executed successfully: one draft training, draft course and draft Offering, seven lessons, zero published primary coverage, zero sealed items, zero open assessment administrations, zero current completion policies, zero active survey campaigns, zero active self-paced Classes, zero open registration releases, zero registrations, one verified tagged QA account and zero accounts with current sessions. These are inventory observations, not an HTTP acceptance result.

Rehearsal order: configure isolated runtime and prepare the existing draft answer keys using the canonical encryption helper; ingest the existing synthetic recordings through the native upload workflow; obtain actual independent QA academic/rights/accessibility decisions; publish the primary track, Course, Offering and training under the existing governance path; authorize deployment/adoption, assessment administrations, automatic completion policy and identified survey campaign; activate exactly one matching self-paced Class; publish/open the registration release and create its governed direct Go link. Establish distinct reviewed adult learner, unrelated learner and provider identities through approved identity workflows; obtain current QA sessions. Run strict preflight and `npm run test:e2e:noncredit:api`; use a separate fresh fixture for browser/media acceptance. Do not insert learner outcome evidence, forge reviews or use production credentials.

The diagnostic source and exact-class preflight tightening are committed; only the inventory SQL has been executed against Neon in this pass. Full exact-revision Node/Playwright execution remains outstanding.


### Permanent QA rehearsal runner (November 27)

Use a **separate clean checkout** of the release branch, not the normal development checkout containing production or development environment files. The initial implementation is deliberately pinned to the existing dedicated Neon branch `br-spring-frog-arnmih9w`. Run Node 22+ and install the checked-in dependencies and Chromium first.

```sh
npm ci
npx playwright install chromium
npm run qa:pilot -- init
```

The initializer creates an ignored `.env.pilot-qa` with separate random access peppers and assessment encryption key. It refuses to overwrite an existing file. Preserve those values across fixture preparation and runtime execution; rotating a key invalidates existing sealed items or sessions. On Windows restrict the file ACL to the QA operator. Do not commit, paste or include its contents in artifacts.

Fill in the isolated database URL, the **production hostname only** for the existing isolation comparison, and the dedicated restricted authentication login URL. The optional operations login must be the separate restricted `can_os_canonical_ops_app` on the same QA database; its role is not provisioned by this runner. For QA content and identity evidence use the dedicated private R2 bucket `can-os-pilot-qa` and a bucket-scoped credential. No real partner files or production storage credentials. Configure these through the approved DBA/storage operator path, not in source.

```sh
npm run qa:pilot -- readiness
npm run qa:pilot -- keys
```

Readiness is a presence/shape check and branch-attested inventory, not publication approval. It is expected to exit nonzero until the fixture and sessions exist. The keys command seals the five existing QA draft items with the runtime key via the production crypto helper. It does not publish an assessment. It refuses a different branch, item set, or incompatible existing key. No credentials, sessions or approval records are minted by this script.

#### Rehearsal completion sequence

- Use the canonical signup/session workflow with individually controlled QA inboxes; verify each distinct adult learner, provider, author and reviewer through the existing workflow. Assign only the required roles. Tag synthetic Persons and Organizations `qa_only=true` and `intended_branch=br-spring-frog-arnmih9w` after verifying the exact records in the isolated branch. Do not use fixed school demo accounts, copy production sessions, create a second Person, fabricate birth-date review, or hand-insert session bearers.
- Upload the seven existing synthetic MP4s and VTTs through the native private provider-media workflow. Complete independent academic, rights and accessibility reviews and publish each asset; bind coverage to the primary track. Complete actual track and Offering review/publication.
- Publish the two assessment versions/forms, open exactly one administration per phase for the same deployment/course/provider, publish the approved automatic completion policy, and activate the exact identified feedback campaign.
- Approve Site adoption, activate exactly one self-paced Class, publish/open registration, then publish a governed direct adult-training engagement Go link.
- Generate the JSON fixture from the current published records using the command below. Place the emitted single JSON line in `CAN_PILOT_QA_FIXTURE_JSON` in the private local environment file. Obtain three fresh verified CAN sessions through the real application and set the three local session entries. The runner does not emit or provision session tokens.

```sh
npm run qa:pilot -- fixture
npm run qa:pilot -- readiness
npm run qa:pilot -- api
```

The API and browser journeys both **consume a fresh fixture**; do not run them sequentially on the same used training. A separately approved fresh fixture and the strict test configuration are required for the browser run. The convenience fixture generator currently supports only the original seven-lesson reference; generalized fresh-fixture authoring and provisioning remain follow-up work. The QA wrapper uses the exact clean checkout SHA, an explicit environment allowlist, no inherited app/provider credentials, and refuses normal Vite environment files. It attests the dedicated database and configured restricted login branch before starting a child process. It does not deploy Cloudflare, configure R2 credentials, or independently prove bucket access. Do not point a QA deployment at a production database, production R2, or production delivery providers.

Current November 27 inventory on the isolated branch: one draft training, seven course lessons, five draft shared assessment items, zero published primary lesson coverage, zero sealed keys, zero open administrations, zero policies, zero active survey campaigns, zero active Classes, zero open releases, one verified tagged account and zero current tagged sessions. All six new fixture-generator SQL queries were executed read-only against the QA schema; zero qualifying published records are expected. No application test, provider upload, publication, or independent approval was completed by this source work. No production data was modified.


### QA schema and persona gates — November 27 follow-up

The existing QA branch is journaled through 0116, while the checked release has 0133. Two historical journal rows have malformed hash lengths (timestamps 1794690003000 and 1795462010000); 0116 differs from the same immutable SQL blob on main and release. Main's 0116 hash matches source and its journal has no malformed-length hashes. Main was queried read-only. Do not rewrite old ledger rows, run a partial migration chain as though it were complete, or delete a recovery branch to obtain quota.

Creation of a separate fresh branch `pilot-acceptance-20261127` from current Neon main was attempted and rejected by Neon (HTTP 422, branches limit exceeded). The original QA branch and its draft training are retained. An approved additional branch slot or explicitly approved recovery/replacement plan is required. Rebind the QA runner and fixture authoring to the new attested branch only after creation; never target main for mutating acceptance. The current rehearsal authoring is pinned to the old branch, and the new fixture must be created and reviewed on the replacement.

```sh
npm run qa:pilot -- schema
```

The read-only schema gate checks exact committed SQL SHA-256 hashes for journal entries 0079 onward (the existing production parity boundary), malformed hashes across the ledger, duplicate timestamps, missing/extra modern migrations and required current application objects. Readiness reports this gate, and both HTTP/browser configurations enforce it before learner mutations. The rollback-only canonical regression is a separate historical-schema test; a pass does not override drift.

Strict fixture preflight now independently maps the three supplied session digests to the intended actors, checks direct verified email-link authentication, fresh/nondelegated sessions and same-Person grants, and requires the primary learner's unconsumed independent adult review. The provider session must have an active Site Admin or Registrar grant for the exact registering Organization and delivery Site. These checks do not create personas, assign grants or replace the runtime independent identity evidence validation. Provisioning verified accounts, actual private identity evidence, and R2/media publication remain outstanding.


### Replacement QA branch established — November 27

After the explicitly authorized retirement of `main-pre-migration-recovery-20261102`, Neon branch `pilot-acceptance-20261127` (`br-solitary-art-arun91gj`) was created from current main and reached ready state. Default compute settings were used because the account does not permit a custom suspend interval. The original `br-spring-frog-arnmih9w` branch and its draft are preserved.

All 55 migration SQL hashes (0079–0133) match the new branch's journal, all 135 ledger records have valid hash shape, and all seven required schema checks pass. The QA runner, fixture generator, draft bootstrap, planning scaffold and assessment key preparation now target only the replacement branch. Historical references above describe the previous branch, not current runtime instructions.

The committed draft bootstrap and planning scaffold were executed twice on the replacement branch, retaining the exact same synthetic organization and training IDs on repeat:
- Organization: `10e95da8-40d8-49db-b78e-786dec681040`, domain `pilot-acceptance.can.demo`
- Training: `2b386aac-03ca-4b18-a901-2fb188006ead`
- One draft Offering/Course/training, seven lessons, five objective questions, one draft survey, one draft Class, one draft primary instructor track; zero releases or registrations.

The canonical 22-assertion SQL regression also passes on the migrated branch with rollback-only synthetic test records. No published content, verified adult identity, assessment key, active Class, enrollment release or application acceptance was created. The draft author is an unauthenticated synthetic Person, not an independent reviewer.

**Data boundary:** this branch is a production-derived database clone, not a synthetic-only database. Keep it private, restrict access to authorized operators, use fresh branch-only credentials and secrets, and do not expose copied real accounts, data, sessions or media to QA testers. Do not deploy publicly or send real delivery traffic. A sanitized/schema-only QA environment or formal reviewed de-identification process is still required before broad tester access. No production row was changed during this work. New QA Personas must use independently verified controlled accounts and the standard identity-review flow; never reuse copied credentials or reviews.

Runtime execution, actual R2 access, approved independent reviews and a full HTTP/browser journey remain outstanding.


### Executive acceptance gate — November 27

The provider HTTP test already asserts the authorized provider learning-outcome response against canonical database rows. It does not verify a national executive report, and the current report catalog marks `network-impact` as `not_available`; the network setup service returns `executionAvailable:false`. Do not mark national reporting accepted after the provider test.

```sh
npm run qa:pilot -- executive
```

The new count-only diagnostic independently attests migration parity, queries only branch-tagged rehearsal organizations/people, and reports enrollment and executive blockers separately. Its SQL was executed against the replacement branch: one tagged draft author Person, zero verified accounts/grants/adult reviews/verified identity documents/current sessions, zero published trainings/active Classes/open releases/registrations/course attempts/completion decisions, zero tagged denomination HQs, approved reporting memberships, current host grant records and accepted relationship records. Full Node execution remains unverified. The diagnostic intentionally exits blocked until a real governed executive report exists.

Remaining work:
1. Local private runtime with independent QA secrets, restricted auth connection, controlled test mailbox or approved email transport, isolated R2 and actual reviewed identity/media evidence. Existing access-mail outbox supports only .test recipients in APP_ENV=test/NODE_ENV=test; do not disable real authentication policies or expose outbox tokens, and do not use copied production accounts from the cloned database. The current pilot runner lacks an interactive provisioning command/outbox configuration; the HTTP test assumes pre-existing sessions.
2. Provision the initial distinct learner, negative-control learner and provider plus independent authorized reviewers; publish the seven-lesson training, assessments, completion policy, campaign, Class and Go link via existing workflows. Verify provider results after the first HTTP journey, then use a distinct fresh fixture for browser acceptance and a dedicated multi-learner cohort acceptance scenario.
3. Provision a branch-tagged synthetic HQ with separately authorized direct recipient/host actors and independently reviewed reporting agreements. Reuse governed reporting source contracts, canonical attribution and bottom-up relationship scope; no broad host grants substituted for narrower consent, no cross-tenant raw facts or copying provider dashboard totals. Existing pure relationship registration projection covers four count metrics; its source adapter, trusted disclosure policy and external endpoint are not complete. Add permitted learning outcome/feedback/engagement measures only through the versioned metric policy.
4. Implement governed executive aggregate query and V6.1 reporting surface with explicit source reconciliation, distinct-person rollups, period/metric/permission definitions, denial, revocation, and disclosure tests. Five synthetic learners are appropriate for an internal private QA check, not public release: the current publication-safe helper defaults to ten distinct people and protects complementary cells too. Never lower the production threshold to make the demo pass. Synthetic data stays separate from real network totals; public-impact acceptance requires independently approved disclosure-safe fixtures.
5. Verify actual browser rendering with an authorized HQ reader and denial for unrelated readers; verify suppression for small cells, duplicate-tag deduplication and metric totals against the same canonical facts. Distinguish zero from unavailable/suppressed. No claim of public report readiness until these tests pass.

Cloudflare/R2 connector discovery returned no matching plugin; configuration and media operations remain unverified.


### Standard capability availability — November 27

QA acceptance is release evidence, not a runtime entitlement. The objective noncredit scoring service now selects automatic finalization by its actual noncredit source rather than the legacy CAN_NONCREDIT_AUTO_FINALIZATION_ENABLED opt-in. It checks the enabled canonical result trigger before finalizing. The trigger still independently validates assessment source, publication, scoring and accountable reviewer boundaries; Class/academic assessments remain provisional. Verified on both main and replacement QA: enabled assessment_result_consistency, objective auto-finalization marker, baseline support and independent reviewer requirement. The legacy variable is ignored and no longer required by the QA initializer, diagnostic or journey preflight.

Source projection and private snapshot creation now operate by default. The old CAN_REPORTING_SOURCE_PROJECTION_ENABLED and CAN_REPORTING_SOURCE_SNAPSHOTS_ENABLED rollout variables are ignored. Explicit operational maintenance pauses are CAN_REPORTING_PROJECTION_MAINTENANCE_PAUSE=1 and CAN_REPORTING_SNAPSHOT_MAINTENANCE_PAUSE=1; these affect processing and creation, not authorized reads. Existing source quality, privacy, access and manifest reconciliation checks remain. Read-only Neon queries verified all three source receipt/snapshot tables on main and QA have forced RLS, owner read/write access, enabled triggers and no anonymous/authenticated SELECT. Actual application-role runtime execution has not been verified.

The HQ workspace now opens with a V6.1 executive overview of directly operated Site records, distinct approved affiliated Sites/organizations and pending requests, using the existing authorized HQ loader. Reporting relationship inventory is visible by default and no longer returns a hardcoded global executionAvailable=false. Zero institutional records show as zero. The setup inventory is not an outcome report and no learner metric is inferred from affiliation or shown without its own permission. National cross-provider outcome source adapters and independently governed disclosure execution remain unimplemented; the separate network-impact catalog entry stays truthful about that limitation. Do not mark national learning outcomes accepted from these changes.

No production database writes, deployment or end-to-end learner execution performed. Full exact-SHA build, typecheck, unit and browser suite execution remain required. Added tests cover default-on reporting, explicit maintenance pauses, empty HQ counts and deduplication, and updated assessment/readiness contracts.
