# WS3: Governed Outcomes and Completion

**Workstream:** WS3, `feature/outcomes-completion`  
**Verified common baseline:** `5e50d26c197330b3f01403c221f6646f8cbef823`  
**Integration target:** `integration/programs-courses-classes`  
**Release state:** **NOT APPROVED**. No database migrations or production flags enabled.

## 1. Authority inventory

| Learning path | Authoritative evidence | Decision/award source | Current WS3 boundary |
| --- | --- | --- | --- |
| Noncredit training | `learner_course_attempts`, `noncredit_participation_events`, verified `evidence_document_versions`, `assessment_attempt_results`, `learner_lesson_progress` | Pinned `noncredit_completion_policies`, append-only `noncredit_completion_decisions`, `noncredit_completion_certificates`, `learning_award_issuances` and `learning_award_issuance_events` | Existing decision retained; self-award denied, exception correction and issuer revocation implemented behind separate disabled flags |
| Native Class | Native `class_enrollments` and one canonical `learner_course_attempts` row, published Course version, canonical assessment execution/results and evidence-backed Sessions | `class_outcomes` and `class_awards` exist but lack an approved participant-pinned completion-policy linkage and separate issuer workflow | **Read/evaluation only**. No Class completion/award writer is enabled |
| Academic Section | Canonical assignment, grade, student record and graduation/credit audit | Existing academic issuer, authorized grade/transcript/credit services | No duplicate gradebook or credit issuance |
| Standalone Course | Canonical Course Attempt, versioned Course and its authorized learning evidence | A governed course-specific policy/decision is needed unless already backed by noncredit or academic authority | Pure evaluator; **no new unapproved decision ledger** |
| Program aggregation | Authoritative component completion/outcome references, not copied attendance, grades or scores | Program composition/policy authority belongs to WS5 and integration owner | Versioned aggregation predicate; **no independent Program award writer** |

## 2. Shipped WS3 branch changes

- `src/domain/verified-completion.ts`: pure fail-closed Course/Class readiness, Program component aggregation and award authority evaluation. The `readyForIndependentReview` result is **never** a decision or an issued award.
- `src/modules/learning/noncredit-completion-decisions.functions.ts`: strengthens the existing provider decision with independent Person check and explicit participant-pinned policy enforcement; database completion trigger remains authoritative.
- `src/modules/learning/noncredit-completion-corrections.functions.ts`: gated append-only evidence-backed correction to `not_yet_completed` or `voided` with registration row lock, expected-current-decision concurrency control, exact provider scope, independent verified evidence, current-session revalidation, audit event and domain event. Prior completion is preserved. The existing DB source-validity function considers superseded completion invalid for new award validity.
- `src/modules/learning/credential-revocation.functions.ts`: separately gated issuer-authorized append-only revocation, shared lock, verified issuer-owned evidence, independent reviewer/learner separation, current expiring issuer-approval revalidation, canonical legacy certificate status change when applicable, audit and domain events. No new ledger.
- `src/components/learning/VerifiedCompletionChecklist.tsx`: reusable design-system 6.1 presentation for scoped learner/operator pages. This is **not yet mounted on an authenticated route**; integration with WS1/WS4 must use their approved contracts.
- `tests/unit/verified-completion.test.ts`: readiness, passed/failed/provisional results, missing attendance, wrong Person/Course, superseded evidence, policy pinning, withdrawals, Program deduplication and independent awards.
- `tests/unit/ws3-completion-command-contract.test.ts`: source-level guard regression assertions. These **do not replace** authenticated DB integration tests.

## 3. Shared completion contract proposal: needs WS00 approval

Version candidate: `CompletionEvidenceExtension.v0.1` to be reviewed against WS1's **provisional** `docs/integration/participation-read-model-v0.1.0.md` on the integration branch. This is a **nested completion-specific extension**, never a competing participation envelope:

```ts
type CompletionEvidenceExtension = {
  // Attach to WS1 ParticipationRecordV1, keyed by
  // (sourceKind, sourceId) and the server-resolved personId.
  pinnedPolicyVersionId: string | null;
  lessonsRecorded: number;
  totalLessons: number;
  verifiedAttendanceSourceIds: readonly string[];
  currentFinalizedAssessmentResultIds: readonly string[];
  currentDecision: {
    id: string; outcome: "completed" | "not_yet_completed" | "voided";
    decidedAt: string; independentReviewerPersonId: string;
  } | null;
  currentAwards: readonly {
    issuanceId: string; kind: string; issuedAt: string;
    revokedAt: string | null;
  }[];
};
```

Use WS1's `personId`, `sourceKind`, `sourceId`, `courseAttemptId`, `operatorOrganizationId`, and `actualDeliverySiteId` unchanged. For an activated native Class or published enrollment release, a missing actual delivery Site is a reconciliation blocker under WS00's current provisional contract, **not** permission to fabricate a Site. Never manufacture a Program enrollment to attach completion data.

Invariants:

1. **Identity** is Person-bound, not an account-email match. Organization/Site attribution comes from the originating governed enrollment/decision, not a UI-selected network.
2. Registration, active enrollment, lesson progress, room pairing, attendance, assessment submitted, assessment scored, assessment finalized, eligible for review, completion decided and award issued are **different facts**.
3. Published **policy version must be pinned** at entry; changes govern future participation only unless an independent authorized correction is recorded.
4. A Class's attendance requirement counts independently verified canonical attendance evidence, **not** join/presence/heartbeat/projector metrics. One session counted once. Assessment results must be finalized, current, independently reviewed, bound to the participant's exact Course Attempt/version, and pass under the policy.
5. Class Outcome cannot silently count as an academic grade or credit. An award needs separate issuer authority, approved policy evidence and independent grant; an audit/for-credit enrollment flag is not an award.
6. Program completion points to authoritative component outcome IDs. Do not double-count an outcome reused in multiple Program components, and do not copy evidence into another completion store.
7. Corrections/revocations are append-only (or canonical revocation state where the existing ledger requires it), audited and idempotent with explicit concurrency checks.

### Required WS00/WS5 schema decision before native Class writer

The baseline `class_outcomes` supports `source_kind/source_id` but does **not** bind each enrollment to a published, approved, immutable completion policy or identify its own authorizing reviewer/policy decision. `class_awards` has issuer/policy fields but lacks the separately approved Class issuance/revocation command and an append-only revocation event contract. A general `evidence_document_version` UUID alone does not encode verified per-participant thresholds.

WS00 must approve the canonical source for published Class completion policies (including applicability to Course, Class, and Program), immutable policy pinning on participation, correction history, reviewer authority and the migration order. WS5 owns Program component rules and published composition. WS2 owns changes to enrollment lifecycle state. **Until that contract is reviewed, WS3 MUST NOT infer an official Class completion decision merely from a passing quiz, completion tick, or playback.**

## 4. Event and consumer contracts

| Event | Source | Suggested WS1 / WS6 handling |
| --- | --- | --- |
| `NoncreditTrainingCompleted` | Existing canonical decision | Count current, unsuperseded completed decisions only |
| `NoncreditCompletionCorrected` | WS3 correction, existing decision ledger | Recompute historical/current status; don't erase prior decision |
| `CredentialIssued` | Existing issuer command | Count awarded credentials separately from completed training |
| `CredentialRevoked` | WS3 canonical revocation | Exclude from current valid award count; retain historical issued/revoked counts |
| Class completion decision (future) | Owner-approved canonical `class_outcomes` command | Do not emit until policy, authorization, idempotency, and database constraints pass |

Consumers must use the authoritative read model, not treat event delivery as a second truth source. A withdrawn participation record remains in history. Corrections cannot cause a deleted grade, Course Attempt, or attendance event.

## 5. Flags, preflight, negative authorization and rollback

All new mutations are disabled by default. Do **not** enable `CAN_NONCREDIT_COMPLETION_CORRECTIONS_ENABLED` or `CAN_WS3_AWARD_REVOCATION_ENABLED` in production. Credential revocation additionally requires existing `CAN_CREDENTIAL_ISSUANCE_ENABLED=true` and the independently approved `credential.issue` issuer capability. Native Class completion remains disabled regardless of flags.

**Preflight (read only):** verify canonical v3.0.1 migration chain, installed completion-policy pin trigger, `v28_validate_completion`, issuer-approval function, RLS policies, correct database credentials, and scoped writer privileges. Record table/grant and SHA evidence on a disposable test database. No WS3 migration is included in this PR.

**Rollback:** switch new flags off immediately; do not delete committed completion decisions, audit events or revocation events. Because corrections and revocations are intentionally historical, a compensating authorized decision (where canonical policy permits) is required instead of deleting evidence.

**Required executable acceptance:** current staff + active correct grant, wrong Site/Organization, learner impersonation, same-Person issuer/recipient, expired/revoked issuer approval, duplicate retry, contested current decision, missing/unverified/expired evidence, passed/failed/superseded assessments, withdrawals, pinned policy changes, duplicate Program components, legacy certificate consistency and revocation visibility. Run the one-hour pilot, four-session two-Site pilot and school/guardian pathway using disposable accounts, with signed-in browser proof.

## 6. Execution status

Source files and tests are committed to the WS3 feature branch. No authenticated environment, Neon schema migration, feature-flag activation, typecheck, build, unit/integration run, Playwright or deployment success has been verified by this document. Regressions are authored **but have not been demonstrated passing**.

**Integration handoff:** WS00 to reconcile contract/policy schema with WS1/WS2/WS5/WS6, approve reviewed additive migrations, and schedule database/write-grant acceptance. WS1 may mount the learner component once completion payload is authorized; WS4 may mount the operator component without granting issuer rights. Do not merge WS3 to main individually.


## November 16 continuation: security, UI, contract and QA update

- **WS1 now has an implementation proposal v1.0.0** on `feature/my-activity`: `docs/architecture/participation-read-model-v1.md` and `src/domain/participation-read-model.ts`. The WS3 source extension consumes its existing `outcome: {label,referenceId?}|null` shape with no edits to WS1 files. Source identity for noncredit is `(noncredit_course, registrationId)` and native Class is `(native_class, classEnrollmentId)`; WS00 ratification is still required.
- `src/modules/learning/verified-completion-site.server.ts` now requires a **matching immutable noncredit delivery Site attribution**, current exact Site/Organization staff context, and matching self-enrollment claim if one exists. This protects the existing noncredit completion command as well as WS3 corrections against cross-Site adjudication. An old registration without provable delivery-Site attribution **fails closed** until canonical repair is reviewed. A national provider role is not a cross-Site reviewer approval.
- `src/domain/verified-completion-projection.ts` validates the original noncredit decision supersession graph and projects only the latest unambiguous decision. Invalid/branching history is **unavailable**, not automatically completed. The Class outcome projection remains null until policy approval; no Class completion is fabricated.
- `src/modules/learning/noncredit-completion-review.functions.ts` is an exact-Site provider-verified read-only decision history, gated by `CAN_WS3_OPERATOR_REVIEW_ENABLED` (OFF). `src/components/learning/NoncreditCompletionReviewPanel.tsx` can render it and issue the independently verified correction command, but is **not wired to navigation or an authenticated route**; WS00 controls route placement.
- Existing native Class canonical evidence reader and learner panel explicitly distinguish a recorded Class outcome from **independently policy-verified completion**. They do not issue an academic grade or award.
- Regression additions: `tests/unit/verified-completion-projection.test.ts` plus cross-Site source guards in `tests/unit/ws3-completion-command-contract.test.ts`. All execution remains **NOT RUN**.
- Added `scripts/acceptance/check-ws3-completion-readiness.mjs`, a **read-only** schema/RLS/trigger/function preflight requiring `CAN_WS3_SCHEMA_VALIDATION=1` and an explicit isolated `DATABASE_URL`. This is not a substitute for restricted-principal positive/negative transaction tests.
- WS00 approval request: `docs/contracts/WS3-NATIVE-COMPLETION-AUTHORITY-PROPOSAL.md` proposes an additive participant-pinned native Class policy and provenance through existing `class_outcomes`. No DDL was created, applied, or enabled.

### Actual Neon test01 read-only evidence (November 16, 2026)

Neon project `can-os`, branch **test01**, not the default/production branch, was queried through read-only SELECT statements. The following canonical tables exist with RLS **enabled and forced**: `class_outcomes`, `class_awards`, `noncredit_completion_decisions`, `noncredit_completion_certificates`, `learning_award_issuances`, `learning_award_issuance_events`, `participation_attributions`, `noncredit_self_enrollment_claims`. Existing `v28_validate_completion()`, `v301_credential_is_current(uuid)` and `v301_can_sensitive_capability(text,text)` are present; relevant noncredit decision, Class outcome, and award revocation triggers exist.

Observed data counts on test01: **0 native Classes, 0 native Class Enrollments, 0 noncredit Registrations, 0 noncredit Completion Decisions, 0 noncredit Attributions, 0 credential Issuances, 0 credential Revocation Events**. These are schema/preflight observations only. They do **not** prove a successful completion, correct issuer/RLS privilege under a restricted role, an authenticated learner review, or either pilot. Test fixtures and migration approval remain blockers. No database writes were performed.

### Additional flags (OFF)

`CAN_WS3_OPERATOR_REVIEW_ENABLED` protects the new provider history reader. `CAN_NONCREDIT_COMPLETION_CORRECTIONS_ENABLED` protects corrections. `CAN_WS3_AWARD_REVOCATION_ENABLED` protects revocation and requires the existing gated credential issuer authority. `CAN_WS3_SCHEMA_VALIDATION` is a **local script opt-in**, not an application flag. No toggle was changed in an environment.

### Cross-workstream handoff

WS1 receives current valid noncredit completion references and explicit unavailable Class completion (do not fabricate a verified result from the Class source). WS2 retains Class enrollment status authority; completion status transitions require an independently approved command. WS4 must provide only verified host attendance evidence, not Session agenda/device presence. WS5 and WS00 must approve native Class pinned policy and Program composition. WS6 must count current decisions by authoritative source and preserve correction/revocation event history, not sum every revision. No WS1, WS2, WS4, WS5 or WS6 implementation file has been modified here.


## November 16 follow-up implementation: P0 evidence and policy hardening

**Source-bound approvals:** `database/canonical/v3.0.1/patch-ws3-source-bound-evidence.sql` is an **unapplied, WS00-approval-required** additive schema proposal for `learning_completion_evidence_bindings`. It does not create a new completion or credential ledger. Every immutable approval binds a verified evidence document version to exactly one registration + expected current completion decision + reviewed correction outcome, or to exactly one previously issued award. It additionally pins the learner Person, provider Organization, original delivery Site, submitting Person, independent reviewer, review reason and approval time. The migration checks canonical target referential integrity and verified owner evidence under forced RLS. **No application writes to the binding table are granted.** A separate independently authorized evidence submission/review writer and exact noncredit staff reviewer-grant approval remain integration blockers; simply possessing Site Admin status is insufficient to approve one's own request.

**Command enforcement:** `src/modules/learning/verified-completion-evidence.server.ts` and the pure `src/domain/completion-evidence-bindings.ts` require a source-specific independent approval before corrections or revocations. `correctNoncreditCompletion` also projects the canonical supersession chain and refuses ambiguous/branching decision histories. For a correction, the binding must match the exact historical decision being superseded, proposed replacement outcome and approved reason. For revocation, it must match the exact issuance, recipient, Site and reason. Existing current CAN/canonical session and independent credential issuer checks remain mandatory in the write transaction. **These writes will fail closed until the migration, role review and approved evidence-binding workflow are separately enabled.**

**Credential validity:** A completion correction does not erase an historically issued canonical noncredit certificate or falsely mark its issuance as a separate revocation. Instead, the **effective current credential validity** comes from existing `education_v30.v301_credential_is_current(issuance_id)`, which checks completed unsuperseded source, independent revocation event, expiration and legacy certificate status. The learner wallet already uses that function for list and download; WS3's exact-Site operator review now shows the same authority-derived current/not-current status. This ensures a superseded source cannot be downloaded as currently valid even if its historical `noncredit_completion_certificates.status` remains `issued`. WS6 must separate historically issued, currently valid, explicitly revoked, expired and source-superseded semantics in metrics, not reinterpret a stored certificate status alone.

**Class policy pinning:** `database/canonical/v3.0.1/patch-ws3-class-completion-policy-pins.sql` is a second **unapplied, WS00-approval-required** additive patch. It defines immutable independently reviewed published Class/Course policy versions and an immutable Class Enrollment-to-policy pin. An AFTER INSERT trigger pins the latest as-of-enrollment published/effective version for either public self-enrollment or private assignment. A missing eligible policy produces no pin; a later published version NEVER backfills an old enrollment. `src/db/canonical-v301/ws3-class-completion.ts`, `src/domain/class-completion-policy.ts` and their tests reflect this proposal. No Class completion outcome is issued, no Class Enrollment status is changed, and no learner/operator write permissions or academic credit are granted by this patch.

**Regression coverage added but NOT executed:** `tests/unit/completion-evidence-bindings.test.ts` exercises another Person/Site/Organization, wrong original decision, wrong outcome, altered reason, other award, self-review, invalid timestamps and empty approval. `tests/unit/class-completion-policy.test.ts` covers independent approval, original-enrollment effective dates, later publication, wrong Class/Course version, duplicate/ambiguous policy and private assignment. `tests/unit/ws3-source-authority-sql-contract.test.ts` cross-checks migration RLS/immutability, command guards and the canonical wallet/download/reader credential-validity function after corrections.

### WS00 decisions required before Class completion can issue an official outcome

1. Approve both additive migrations, order/role access, tested trigger permissions under the **actual** Class and provider writer roles and an independently governed evidence binding approval workflow (no client-provided reviewer IDs).
2. WS2 confirms the enrollment-time policy pin trigger with every native Class enrollment/assignment/withdrawal path, including instances created without a Class Offering; ensure no schema conflict and no backdated enrollment.
3. WS3 has now **implemented a gated draft writer for existing `class_outcomes`** with exact active Class reviewer grants, original policy pin, canonical Session/assessment validation, audited corrections and atomic enrollment/attempt transition. WS00 must still approve its restricted role privileges, migration order and signed-in negative-case acceptance. A raw Class Outcome or policy pin alone is not verified completion.
4. WS1/WS6 adopt only canonical latest completion references and authoritative effective credential validity. Do not aggregate provisional Class outcomes as verified completions. An invalid source history must be reported as unavailable, not as zero.
5. Run full source SHA typecheck, unit/integration, SQL migrations on isolated disposable QA with restricted DB roles, negative cross-Site/Person/issuer cases, credential supersession/download cases, signed-in pilots and rollback. No production migration, flag change or backfill occurred in this follow-up.


## November 16 final WS3 source implementation and integration gate

Implementation has advanced beyond the earlier proposal above. The following code is now committed to **feature/outcomes-completion**, and all new production flags remain **OFF**.

### New governed Class decision and operator workflow

- `src/modules/classes/native-class-completion-policy.functions.ts`: independently authorized, immutable Class/Course policy publication for **future** enrollments; original Class creator cannot approve their own policy; independently verified policy evidence, current Site/Organization/Deployment and optimistic version checks are mandatory.
- `src/modules/classes/native-class-completion.functions.ts`: bounded current-Site Class review queue; individual learner readiness; Class outcome decisions in **existing** `canonicalClassOutcomes` with original enrollment-pinned version, independently approved source-bound evidence, exact Session host roll-call, finalized passing assessments and completed Course lessons as required. Successful first completion atomically transitions the existing Class Enrollment and Course Attempt. Corrections append to the Class outcome chain; no resurrection, academic credit, second award or gradebook is created.
- `database/canonical/v3.0.1/patch-ws3-class-governed-outcomes.sql`: **unapplied**, adds Class outcome provenance columns, immutable replacement uniqueness and a database completion decision guard that rechecks policy/lesson/attendance/assessment evidence and source-bound independent review. The `v301_ws3_class_completion_is_current` function checks original source freshness, terminal status and correction, rather than equating a raw historical outcome with current verified completion.
- `database/canonical/v3.0.1/patch-ws3-independent-evidence-review.sql`: **unapplied**, adds scoped independent evidence review requests only, **not a second completion ledger**. `src/modules/learning/completion-evidence-review.functions.ts` implements separate submit/review/approve/reject operations, source-derived Person/Org/Site authority, current staff and issuer checks, auditable transitions and final approved evidence binding. No direct browser-controlled Person/Site or approval identity.
- `src/components/learning/NativeClassCompletionOperatorPanel.tsx` and `src/routes/canonical.classes_.completion.tsx`: 6.1 operator workspace with paged Class readiness and independent approval queues, evidence review, governed policy publication and final decision. The dedicated route is not yet connected to WS00's primary navigation.
- `src/modules/classes/native-class-canonical-evidence.functions.ts` and `src/domain/verified-completion-projection.ts`: learner and WS1/WS6 source projections only report native Class completion as verified when the canonical SQL current-validity function confirms it; earlier `class_outcomes` remain recorded historical evidence only.

### Required integration order

1. WS00 reconciles the **newer main** changes and all six workstreams on `integration/programs-courses-classes`; no direct WS3-to-main merge. Baseline for WS3 remained `main@5e50d26c`. Do not overwrite the other agents' work.
2. Approve migrations, then on a disposable QA database apply **in dependency order**: `patch-ws3-class-completion-policy-pins.sql`, `patch-ws3-source-bound-evidence.sql`, `patch-ws3-independent-evidence-review.sql`, `patch-ws3-class-governed-outcomes.sql`. Source-bound evidence schema references existing canonical Class outcomes; the governed outcome patch references the new evidence-binding and policy tables. Existing network attribution and credential hardening must precede all four.
3. WS2 confirms Class original-enrollment pin trigger coexists with its canonical enrollment command, including assigned/private, invitations, waitlist and Site attribution. WS4 confirms attendance's valid source and correction order. WS1 consumes the safe latest Class/noncredit projection. WS6 counts only current verified decisions and differentiated award states. The Class outcome writer and SQL triggers must agree on lifecycle transition ordering.
4. Authorize tested DB roles for **only the scoped commands they need**. Current SQL grants policy/binding/review tables to owner only and the Class outcome insert privileges remain owner-restricted. Enabling flags before QA would produce authorization failures or unverified effects.
5. Run `npm run typecheck` (or repository equivalent), `vitest` focused WS3 and all unit regressions, authenticated multi-Site/Person negative acceptance, suspended/revoked reviewer checks, enrollment policy pin timing, Class Session latest absent correction, reassessed pass-to-fail, completion supersession, credential download invalidation, and rollback. Validate production-specific deployed source SHA, then only WS00 may clear release gates.

### Current readiness and known blockers

**NO-GO / draft only**. The private repository is not checked out in the available execution container. GitHub Actions workflows triggered but have reported `startup_failure` before any jobs, and the Cloudflare preview for an earlier WS3 commit reported build failure. These are **not passing CI results**. A disposable Neon QA child branch from test01 could not be created because the Neon project reported **`branches limit exceeded`**. No migrations, seed fixtures or write acceptance were performed against test01 or production. A rollback-only PostgreSQL SQL validation on the existing `test01` branch succeeded for **53 statements across all four staged migrations**, including table, trigger and function definitions. The final in-transaction check reported `changes_rolled_back=true`. This is a real SQL syntax/schema check, **not an authenticated data fixture, RLS-permission acceptance, or persistent migration**. A repeatable, explicitly guarded script is committed at `scripts/acceptance/validate-ws3-rollback-ddl.mjs`. No production flags were changed. The source code, contract tests and migration proposals are an integration review candidate, **not a validated merge-ready release**.

Additional guarded flags: `CAN_WS3_CLASS_POLICY_PUBLICATION_ENABLED`, `CAN_WS3_EVIDENCE_REVIEW_ENABLED`, `CAN_WS3_NATIVE_CLASS_COMPLETION_ENABLED`. Existing `CAN_UNIFIED_CLASS_COMMANDS_ENABLED` remains required for native Class command paths. Keep all new flags OFF pending WS00 approval and successful QA.


### Status update: SQL acceptance and native Class proof boundary

- The four staged WS3 patches were executed on Neon `test01` inside a single transaction with a SAVEPOINT; all **53** statements succeeded and the savepoint was rolled back. The branch was not mutated persistently. The SQL migration compilation issue with the Class policy-pin function's dollar quoting is fixed.
- Exact feature gates for `CAN_WS3_CLASS_POLICY_PUBLICATION_ENABLED`, `CAN_WS3_EVIDENCE_REVIEW_ENABLED`, `CAN_WS3_NATIVE_CLASS_COMPLETION_ENABLED` remain **OFF**. Native Class verified decisions require **both** the existing unified Class gate and the WS3 gate.
- Source checks added: `tests/unit/ws3-evidence-review-and-class-current.test.ts`, `tests/unit/ws3-native-class-completion-contract.test.ts`, `tests/unit/ws3-class-policy-publication-contract.test.ts`, and expanded `tests/unit/verified-completion-projection.test.ts`. **These tests are committed but were not run by a passing GitHub Actions job.** Manual source-string assertion inspection is not a substitute for Vitest.
- The learner evidence panel now recognizes the canonical `v301_ws3_class_completion_is_current` result and does not show the former provisional-only warning for a truly verified current Class completion.
- **Remaining release gates:** align with WS00/WS2/WS4/WS6, isolate the QA database with enough Neon branch quota or obtain explicit approval for an isolated disposable schema, run restricted-current-user source integration fixtures and negative tests, run typecheck/unit/build on the exact integration SHA, confirm deployment, then obtain WS00 schema and release approvals. The PR must stay draft until those verifiable gates pass.


## Final source-branch work completed: gated native Class outcomes and reviewer workflow

This section supersedes earlier **read-only Class** and **unimplemented decision-writer** statements above. On `feature/outcomes-completion` a complete **feature-flagged** Class completion pathway is now authored, though not enabled: independent immutable Class policy authoring for future learners, original enrollment pins (also for private assignment without a Class Offering), exact canonical Course/Session/learner/assessment readiness, append-only original Class Outcome decisions with independently reviewed evidence, atomic Course Attempt and Class Enrollment completion, safe corrections, authoritative re-evaluation against current source evidence, and learner Activity projection.

An independent 2-person source-evidence review flow exists for noncredit corrections, native Class completion and award revocation, with source-bound immutable evidence references, audit events, cap/reviewer/Site authorization checks, and 6.1 operator screens. Revocations reuse the existing award issuance ledger and issuer approval, **never creating academic credit**.

**Validated SQL, not production:** Four staged patches, 53 DDL statements, six expected triggers, four forced-RLS tables, and a fail-closed unknown outcome were verified on Neon `test01` inside a rolled-back transaction. No migration, seed, feature flag or data change persisted. No signed-in E2E, real participant, restricted-role RLS acceptance, TypeScript typecheck, Vitest or GitHub CI has passed on this feature SHA. GitHub Actions continues reporting `startup_failure`. The repository cannot be cloned from the available environment and Neon project cannot currently create a separate QA branch because its branch limit was exceeded. **Draft PR #311 remains NO-GO for integration/main until WS00's gates pass.**

Authoritative handoff, exact four-patch migration order and repeatable checks: `docs/workstreams/WS3-MERGE-HANDOFF.md`.

### Final merge handoff update

- Native Class review uses each participant's immutable `participation_attributions.delivery_site_id` even where `classes.site_id` is null. The Class queue filters by learner delivery Site before pagination. Class policy publication for a Class with no Class-level Site still requires an independently approved WS00 extension; do not assume one operator has all network permissions.
- The distinct exact-Site noncredit queue is mounted at `/canonical/noncredit-completion` via `src/routes/canonical_.noncredit-completion.tsx`, reusing original Registration and decision history rather than treating noncredit as a Class.
- The Class completion workspace is non-nested `src/routes/canonical.classes_.completion.tsx` to avoid the `/canonical/classes` parent route without an Outlet.
- A strengthened rollback-only Neon `test01` run executed the four staged WS3 SQL patches and checks in **57 statements**, verified all four new tables had FORCE RLS, WS3 guard triggers existed, unknown-source completion was false, and all DDL rolled back. No persistent test01 or production changes. This is SQL acceptance, not role/fixture or authenticated acceptance.
- GitHub Actions and full repo build/typecheck are not confirmed passing for the latest WS3 SHA; PR #311 must remain draft until WS00 integrates, reruns exact-SHA checks, and authorizes schema plus role grants. See `docs/workstreams/WS3-MERGE-HANDOFF.md`.
