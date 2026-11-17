# WS3 Outcomes & Completion: integration and main-merge handoff

**Status:** implemented as a **gated draft**, prepared for WS00 contract and integration review. **NO-GO for main/production** until all release gates below are independently proven. Branch: `feature/outcomes-completion`. PR #311 targets `integration/programs-courses-classes`, not `main`.

## Source features delivered

1. **Independent noncredit corrections:** Existing `noncredit_completion_decisions` appends an immutable correction to the exact latest decision, with original provider Organization/Site/Person, participant-pinned completion policy, evidence version, audit/domain event and independent approval. Concurrent correction locks the original registration. A review panel can request evidence review and then record the approved decision.
2. **Native Class outcomes:** `src/modules/classes/native-class-completion.functions.ts` provides an exact-Site operator queue, read-only readiness projection and a feature-gated official decision command against **existing** `class_outcomes`. A successful original decision atomically completes the original Class Enrollment and Course Attempt, never issues an award or academic credit. Corrections append a reviewed outcome and do not resurrect the terminal enrollment. Source projection returns verified completion only if the canonical SQL function still validates all evidence.
3. **Class completion policy:** `native-class-completion-policy.functions.ts` publishes independently approved immutable policy versions for future enrollments; an SQL AFTER INSERT trigger pins the latest approved as-of-enrollment Class/Course policy, whether or not a Class Offering exists. Existing enrollment pins never backfill/rewrite.
4. **Evidence governance:** `completion-evidence-review.functions.ts` stages a source-scoped, original-Site, independently reviewed request, then creates an immutable evidence binding only after a different currently authorized staff Person approves. Supported targets: exact noncredit registration/previous decision/outcome, exact Class Enrollment/prior outcome/outcome, and exact canonical award issuance. Every mutation rechecks original participant, provider, delivery Site, independently verified evidence and current staff session; award revocation requires separate expiring issuer approval.
5. **Awards:** Existing `learning_award_issuances` and revocation events stay authoritative. Corrections and explicit revocations use `v301_credential_is_current`; historical `noncredit_completion_certificates.status='issued'` is **not** current award validity. No parallel credential ledger or public verification endpoint.
6. **6.1 operator surfaces:** `/canonical/classes/completion` has policy publishing, Class queue, independent approval and decision. `/canonical/completion-evidence-reviews` supports independent noncredit/Class/award approvals and issuer-gated revocation. Existing noncredit correction panel now requests approval. WS00 owns production route, navigation and rollout.

## Migration dependency order: all **unapplied**

1. `database/canonical/v3.0.1/patch-ws3-source-bound-evidence.sql`
2. `database/canonical/v3.0.1/patch-ws3-class-completion-policy-pins.sql`
3. `database/canonical/v3.0.1/patch-ws3-class-governed-outcomes.sql`
4. `database/canonical/v3.0.1/patch-ws3-independent-evidence-review.sql`

Pre-existing native Class, network attribution, noncredit and credential patches must be present first. Every new table has forced RLS and owner-only policies. Nothing is applied on production or test01. **WS00 must ratify policy, trigger and actual restricted role privileges before migrating.** No silent old-record backfills.

### Verified on 2026-11-16

Executed **all 53 SQL DDL statements** in the declared order inside a transaction on Neon `test01` with `SAVEPOINT` and `ROLLBACK TO SAVEPOINT`. Verified 6 expected guard triggers, 4 protected tables, and `v301_ws3_class_completion_is_current('00000000-0000-4000-8000-000000000000')=false`. Post-rollback verification returned true: **no schema changes persisted**. This validates SQL acceptance and simple function behavior, not role isolation or real participation. The isolated QA branch creation attempt returned `branches limit exceeded`, so a separate disposable branch has **not** been provisioned.

### Reproducible gates

- `node scripts/acceptance/check-ws3-merge-gate.mjs` runs `npm run typecheck` and the WS3 unit/contract suite. **Not run here:** GitHub Actions return `startup_failure`, and the repository/dependencies cannot be checked out through the available runtime. Source assertions were inspected, but they are not substituted for executed tests.
- `CAN_WS3_SCHEMA_VALIDATION=1 CAN_WS3_REQUIRE_PROPOSED_SCHEMA=1 DATABASE_URL=<QA> node scripts/acceptance/check-ws3-completion-readiness.mjs` checks full schema after an approved temporary migration.
- `CAN_WS3_ROLLBACK_QA=1 CAN_WS3_QA_BRANCH=test01 DATABASE_URL=<test01> node scripts/acceptance/dry-run-ws3-migrations.mjs` reproduces the four-patch rollback-only test; it **never commits DDL**.

## Release gates before WS00 promotes to main

- [ ] CI startup fixed; exact WS3 head SHA **TypeScript typecheck and focused Vitest** pass.
- [ ] Integrate and run all six WS1–WS6 branches against a current `main` baseline, passing full build, unit and contract tests. Resolve route/DB mapping conflicts; do not merge WS3 directly into `main`.
- [ ] WS00 approves and applies migrations in a disposable **separate** QA branch in the stated order. Verify RLS under real production-like restricted writer/learner principals; deny wrong Person/Site/Org, self-approval, teacher reviewer, stale grant, revoked issuer and fake evidence.
- [ ] Signed-in happy-path + negative acceptance: Class without Offering, policy pinned before enrollment, attendance corrections, finalized assessment revision, completion, corrections, award revoked/superseded and wallet download invalidation. Roll back all fixtures, verify activity/reporting views.
- [ ] WS2 confirms atomic native Class Enrollment/Course Attempt terminal transition and WS4 exact verified attendance semantics; WS1/WS6 adopt the source-fresh completion projection and distinguish completed participation from verified outcome.
- [ ] Release operations: production migration approval, backup/rollback rehearsal, one Site/Organization pilot, monitored feature flags, and explicit GO decision.

Feature flags **not activated** by this branch: `CAN_WS3_CLASS_POLICY_PUBLICATION_ENABLED`, `CAN_WS3_EVIDENCE_REVIEW_ENABLED`, `CAN_WS3_NATIVE_CLASS_COMPLETION_ENABLED`, `CAN_NONCREDIT_COMPLETION_CORRECTIONS_ENABLED`, `CAN_WS3_OPERATOR_REVIEW_ENABLED`, `CAN_WS3_AWARD_REVOCATION_ENABLED` and existing credential issuance/reader gates. Do not set any to true until the corresponding feature and role acceptance gates pass.

**Known deliberate constraints:** An independently operated Class with no canonical delivery Site is excluded from current WS3 verified completion. Central/national delegated reviewer authority requires separate approved scoped capability, not inferred affiliation. An old Class enrollment without a policy pin cannot retroactively become verified; create an authorized new enrollment or reviewed migration plan rather than rewriting history. The new review tables are evidence-authorization workflow, not a competing outcome or award ledger.
