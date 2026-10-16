# Admissions offer lifecycle (domain layer)

This release adds a deterministic, tested offer state machine. The domain module does not create offer records, change enrollment records, or reserve seats.

Statuses: draft → issued → accepted / declined / expired; draft and issued may be revoked. Accepted offers cannot be revoked through this lifecycle.

Offer issuance and acceptance must be implemented in an authenticated Neon transaction. Lock the capacity allocation for the **program and school year** before counting active enrollments and unexpired issued/accepted offers. Enforce unique active offers and idempotent guardian decisions; audit every transition. Verify application ownership and authorized guardian, configured requirements, school-year association, and available seats before committing.

The current synthetic capacity preview is not year-specific and must not be used as an authoritative capacity check. Offer writes use the first-development synthetic registrar and guardian principals.
