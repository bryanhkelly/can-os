# Agent A → Agent B: diploma freshness at authorized release

Agent A owns graduation decisions, cohort policies, canonical academic eligibility and diploma lifecycle. Agent B owns recipient consent, secure delivery and download-time authorization. No duplicate release endpoints in A.

Before every diploma release, B must invoke an A-owned server-side freshness check by diploma issuance ID. It must recheck that diploma is not revoked, linked approval is latest student/issuer decision, transcript is latest usable issuance, cohort policy remains applicable, and canonical credit/withdrawal data matches adjudication. This check must be non-cacheable and repeated at download, not only at authorization creation. Denials are audited without delivery.

A now exposes registrar-only getDiplomaFreshness by diploma ID returning current, review_required, or revoked. This endpoint MUST NOT be called directly from recipient release because it requires registrar authorization. B must create a narrow server-to-server authorized release-time adapter using the same A-owned checks; until that is delivered, fail closed on recipient diploma release. B owns separate consent and recipient revocation checks.

A policy revision must specify grandfathering and retroactivity. Until this is implemented, existing diplomas affected by changed policies require institutional review; they must not be silently treated as fresh.

Coordinator owns numbering/journaling migration proposal drizzle/agent-a-graduation-cohort.proposal.sql. Existing null-cohort policies require registrar review and cannot be inferred from academic_year.## Implemented server-to-server contract

Agent A now exports `assertDiplomaFreshForAuthorizedRelease(tx, schema, {diplomaId, issuerId, studentProfileId})` via `src/modules/learning/diploma-release-freshness.server.ts`. This is a **server-only function**, not an endpoint or recipient grant. It fails closed on revoked or superseded diplomas, mismatched issuer/student, inapplicable cohort policies, withdrawn credits, changed graduation audits, and newer transcripts or decisions.

Agent B must call it from within the **same transaction** that authorizes a recipient release and again from within the **same transaction** that checks the live recipient and prepares private download bytes. The function takes the issuer/student from B's independently verified ledger, acquires the issuer-policy advisory lock and a share lock on the diploma row to coordinate against registrar revocation. Do not call the registrar-facing `getDiplomaFreshness` as a recipient, and do not make the function accessible through an unguarded RPC.

Agent A also reconciles every issued finalized grade row against the current issuer-owned SectionGrade and credit configuration. In-place grade corrections after transcript issuance (including corrections that restore the same letter grade) require transcript reissuance and graduation review. The gradebook query takes a SHARE lock in the calling transaction, coordinated with the grade-correction UPDATE lock.

Agent B's current explicit transcript-only eligibility remains intact. **Do not enable diploma or external school delivery** until B adopts this contract and connected authenticated DB/browser concurrency checks pass.

