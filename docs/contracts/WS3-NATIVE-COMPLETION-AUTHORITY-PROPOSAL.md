# WS3 / WS00: Native Class completion authority decision

**Status:** Proposal for integration-owner approval. **NOT an applied migration, policy publication, or working completion command.**  
**Baseline:** main at 5e50d26c197330b3f01403c221f6646f8cbef823  
**Owner:** WS3 completion domain; WS00 owns shared schema sequence.  
**Dependencies:** WS1 PRM v1.0.0, WS2 Class lifecycle, WS4 attendance, WS5 Program composition, WS6 metrics.

## Architectural decision requested

Native Class has canonical class_enrollments, learner_course_attempts, assessment results, class_outcomes, class_awards and recorded Sessions. The test01 schema confirms that class_outcomes currently stores only enrollment, outcome_kind, result_code, source_kind/source_id and recorded_at. It cannot prove whether a learner was subject to a published participant-pinned completion policy, what independent reviewer approved a decision, or whether a later decision corrected it. class_awards stores an issuer and policy-evidence version but has no append-only revocation explanation.

**Approve a small governance layer around these existing authorities**, not a second enrollment, attendance, assessment, Course Attempt, completion or certificate ledger.

### Policy publication and pinned applicability

1. Proposed immutable version: class_completion_policy_versions. Scope: the exact Class ID and published Course version. Fields: id; Class/Course keys; version number; requirements JSON schema validated on both server and DB; minimum independently verified distinct Sessions; all-lessons required; finalized passing canonical assessment required; effective_at; published_at; created_by_person_id; approved_by_person_id; approved policy evidence document version. Require an independent approver, positive evidence requirement, and immutable published versions.
2. Proposed immutable Enrollment-to-policy link: class_enrollment_completion_pins. One Class Enrollment ID plus one approved policy version ID; captured on creation by WS2's Class enrollment/assignment transaction. A private Class may legitimately have no Class Offering. A Class without a published completion policy can deliver content, but cannot award **verified completion**.
3. A new policy version affects **future** enrollments. No backdating of requirements. Existing active learners lacking an authoritative policy are flagged as not eligible for official completion until an independently approved retrospective accommodation/exception process is agreed. Do not silently choose the latest policy during decision.
4. Course standalone and Program participation: preserve the same rules using their owning enrollment/registration authority, without manufacturing a native Class or Course Attempt. WS5 defines Program requirement versions referencing verified component decisions, never copies of responses/attendance.

### Completion decisions in existing class_outcomes

Use class_outcomes as the authoritative Class outcome record. Proposed additive nullable fields for completion-kind rows only: completion_policy_version_id, decided_by_person_id, supersedes_outcome_id, decision_evidence_version_id, and reason for corrected/voided decisions. Existing academic/competency/assessment outcome rows remain unchanged.

At decision time, the authorized command must lock the Class Enrollment; reject withdrawn, cancelled, pending or incorrect Course Attempt; require an eligible pinned policy and active exact-Site staff grant; prohibit learner self-approval and course/policy author self-approval; query verified attendance and latest finalized canonical assessment **inside the same transaction**; validate evidence ownership, date, and source version; append one outcome with result_code completed/not_yet_completed/voided; prevent double-completion or decision branching; and append audit/domain events. The existing (enrollment,kind,source_kind,source_id) uniqueness must remain valid; a correction needs a new individually verified decision-evidence version and an explicit supersedes reference.

**Negative contract:** playback, opening a video, projector use, paired device, self-marked lesson, classroom formative response, survey, submitted-but-unfinalized assessment, failed assessment, or published Course cannot alone authorize a decision. Academic grades/credit remain under the separate authorized school record and issuer.

### Awards and revocations

- Do not issue any native Class certificate, credential, participation award or credit in the initial migration. Approve the existing class_awards issuer policy/revocation story separately.
- The existing noncredit learning_award_issuances/issuance_events model already supports audited issuer-origin certificates and revocations. Its source-kind constraint currently excludes Class outcomes: do not simply insert a Class record into a noncredit decision field.
- If generic credential issuance later supports Class completion, add an **explicit, independently reviewed Class source-kind** and Class outcome FK to the existing learning-award definition/achievement/issuer path, with DB gates and artifact source validity checks; no second credential wallet.
- Existing class_awards academic_credit is not authority to write a transcript, transcript-credit claim, or school grade. Require the official institutional academic issuer.

### SQL/RLS and rollout ownership

WS00 must approve the migration name/order, exact DDL, immutability triggers, FK/checks, role grants, CREATE FUNCTION execution model, guarded audit writes, and restricted learner/operator read projections. Do not add permissive ALL/USING(true) policies for new application roles.

Suggested order **after approval only**: (1) schema and owner-only forced RLS; (2) verified session/policy read-model and staff authorization command; (3) WS2 Enrollment policy pinning; (4) learner and operator read surfaces; (5) disposition + correction command with negative SQL tests; (6) optional separate award authorization later; (7) WS1/WS6 projections and signed-in acceptance. The new feature flag remains false through the entire staging sequence.

### Query and history semantics

- Exact participation identity: WS1 source=native_class, sourceId=Class Enrollment UUID. Person is server resolved; Course Attempt is a child pointer; Organization and delivery Site are from the original Class and immutable attribution.
- State active/completed is the **Enrollment** state; verified outcome is a separate decision reference. Withdrawal preserves old evidence and history, never automatically voids issued academic records.
- Candidate event names: ClassCompletionDecided and ClassCompletionCorrected, aggregateType=class_outcome, aggregateId=outcome UUID. Include Class, Enrollment, Course Attempt, policy version, source evidence IDs, effective timestamp and operator/delivery Site. WS00/WS6 must ratify event version and metric definitions before production.
- Aggregate current completed learners by unique Enrollment ID with latest valid decision; report issued, currently valid and revoked awards separately.

## Verification plan and NO-GO conditions

Run on a **disposable isolated Neon child**, not the default/production database. Preflight versioned schema, RLS, limited application role, authenticated Person binding and policy pin; negative permission tests for other Site, other Organization, learner self-award, former staff, revoked approval, policy author, wrong Course version, unverified attendance, expired evidence, submitted/provisional/failed assessment, forged evidence reference, double issuance, concurrently superseded decisions and historical withdrawal. Run one-hour adult training, four-week two-Site Class, student/guardian Section non-regression and Class private assignment with no Offering. Record exact SHA and evidence, then WS00 sign-off.

**Current blocker:** No migration approval or authenticated acceptance. A pure WS3 evaluator and native Class read surface may exist while authoritative completion commands remain disabled.
