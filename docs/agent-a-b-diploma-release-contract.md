# Agent A → Agent B: diploma freshness at authorized release

Agent A owns graduation decisions, cohort policies, canonical academic eligibility and diploma lifecycle. Agent B owns recipient consent, secure delivery and download-time authorization. No duplicate release endpoints in A.

Before every diploma release, B must invoke an A-owned server-side freshness check by diploma issuance ID. It must recheck that diploma is not revoked, linked approval is latest student/issuer decision, transcript is latest usable issuance, cohort policy remains applicable, and canonical credit/withdrawal data matches adjudication. This check must be non-cacheable and repeated at download, not only at authorization creation. Denials are audited without delivery.

The issuance service currently checks much of this at issue time, but a reusable release-time check remains outstanding. Until A delivers the check, B must fail closed for diploma release. B owns separate consent and recipient revocation checks.

A policy revision must specify grandfathering and retroactivity. Until this is implemented, existing diplomas affected by changed policies require institutional review; they must not be silently treated as fresh.

Coordinator owns numbering/journaling migration proposal drizzle/agent-a-graduation-cohort.proposal.sql. Existing null-cohort policies require registrar review and cannot be inferred from academic_year.