# WS3: Merge and Release Handoff (2026-11-16)

**Branch:** `feature/outcomes-completion`
**Draft PR:** #311 to `integration/programs-courses-classes`
**Coordination:** WS00 PR #307, governance issue #315.
**Baseline:** original shared `main` commit `5e50d26c197330b3f01403c221f6646f8cbef823`.
**Latest verified working SHA:** `c5afd6025202b1b5ffafcb41e0972c4f6ea9951b`.
**Divergence at final check:** WS3 ahead of current main 104 commits, behind main 9 commits. WS00 must reconcile; do not merge this feature directly into `main`.

## Source implementation included
- Existing noncredit completion decision chain, independently source-bound correction approvals and credential revocation.
- Canonical `v301_credential_is_current` validity in both learner wallet and operator history; recorded issued certificates are not automatically equivalent to currently valid certificates.
- Read-only native Class completion readiness checks using original enrollment-pinned published/approved policy; exact Course Attempt, canonical lesson evidence, **ended canonical Class Session with latest independent host roll-call** (not room presence), finalized passing assessment result, exact participant, Org and Site.
- Gated independently authorized Class completion writer in **existing** `class_outcomes`, with append-only corrections and atomic Course Attempt + Class Enrollment completion, no alternate grade/assessment/credential ledger.
- The writer allows a previously independent `not_yet_completed` decision to progress to `completed` while active, but cannot resurrect a terminal completed/voided learner.
- Two-step evidence review request and independent approval on original source and current exact-Site scope. A general Site grant cannot issue a credential.
- Governed Class completion-policy publication (for future enrollments only), operator review queue, protected operator route/panel, and learner-only current official Class completion projection.
- WS1/WS6 native Class outcome projection with explicit current validity and fail-closed source history; not yet wired by the integration owners.

## Four additive database migrations, IN THIS ORDER, not applied
1. `database/canonical/v3.0.1/patch-ws3-source-bound-evidence.sql`
2. `database/canonical/v3.0.1/patch-ws3-class-completion-policy-pins.sql`
3. `database/canonical/v3.0.1/patch-ws3-class-governed-outcomes.sql`
4. `database/canonical/v3.0.1/patch-ws3-independent-evidence-review.sql`

All are intentionally staged rather than automatically deployed. Exact function ownership and restricted principal grants require WS00/DB security approval.

## Database validation performed
The 53 executable statements from the four patches ran successfully on Neon **test01** `br-bitter-feather-ar0u63x7` within a single transaction with `SAVEPOINT` and `ROLLBACK TO SAVEPOINT`. Validation was repeated after the latest Class correction behavior change. The final query returned `clean = true`. No WS3 schema was persistently applied to test01 or production. This demonstrates SQL DDL executes against the current test01 baseline; it does not prove scoped real-user mutation authorization.

A dedicated disposable Neon QA branch could not be created because the project account has reached its branch quota. No existing Neon branch was removed.

## Tests and merge gates
**Added but not successfully executed in CI:** pure completion readiness, independently reviewed evidence, noncredit projection, native Class projection, policy publication, SQL source-authority, and operator/approval route source-contract tests. Do not report test passing from static source assertions.

Before marking PR #311 ready:
1. Restore runnable GitHub Actions/Cloudflare build and obtain successful **exact-SHA** `tsc`, `vitest`, frontend Vite build, lint and controlled integration tests.
2. Review new backend code for type and bundle errors, server-function import boundaries, native Class transitions and source integrity under the actual restricted roles (database functions with forced RLS).
3. Approve the four migration files and staged migration ordering, verify rollback plan, audit security-definer function ownership/grants, then run **disposable** authenticated QA for two Persons, two unrelated Sites, staff role revocation, independent reviewer, repeated idempotent requests, cancelled/withdrawn learner, initial not-yet-completed -> completed, evidence correction -> current-invalid, and credential revocation/expiration.
4. WS00 reconciles newer main and WS1/WS2/WS4/WS5/WS6 contracts, wires approved learner + reporting projection and operator entry point, and validates all six integrated PRs.
5. **No automatic rollout:** Keep `CAN_WS3_EVIDENCE_REVIEW_ENABLED`, `CAN_WS3_CLASS_POLICY_PUBLICATION_ENABLED`, `CAN_WS3_NATIVE_CLASS_COMPLETION_ENABLED`, `CAN_WS3_OPERATOR_REVIEW_ENABLED`, `CAN_NONCREDIT_COMPLETION_CORRECTIONS_ENABLED`, `CAN_WS3_AWARD_REVOCATION_ENABLED` OFF until targeted QA and WS00 release approval.

## Deliberately outside WS3 launch
- Academic grades, transcripts, or Class-award issuance are not implied by a completion decision; existing independent issuer governance still applies.
- Centralized cross-Site reviewer access requires a separately reviewed explicit delegation contract and authorization acceptance. It is **not** inferred from a denomination, provider organization or reporting affiliation.
- No production migration, secret, credential, branch deletion, flag enablement, or direct `main` merge was performed.

**Current release judgment: IMPLEMENTATION STAGED; INTEGRATION/PRODUCTION NO-GO until exact-SHA validation and authorization acceptance succeed.**
