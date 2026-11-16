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
