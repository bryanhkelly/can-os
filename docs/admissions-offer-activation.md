# Admissions offer and activation safeguards

The initial offer-eligibility domain rule is intentionally **pure** and does not write to Neon. It requires a submitted/eligibility-reviewed application, completed blocking requirements, a configured seat capacity, and an unoccupied seat after existing enrollments and outstanding offers.

## Required before enabling real offers

1. Implement authenticated admissions and guardian identities with program/household scopes.
2. Introduce an explicit offer table with school year, expiration, guardian response, and immutable decision audit events.
3. Reserve and release seats in a single serialized transaction using a program-and-school-year capacity row lock; count only offers for the same year and capacity pool.
4. Enforce idempotency and unique active offers per application; prevent double enrollment during concurrent activation.
5. Validate school-year membership, application ownership, journey readiness, and program scope at the database boundary.
6. Cover competing offers, expired offers, withdrawals, sibling applications, capacity reductions, and waitlist promotion in integration tests.

Do not interpret the current capacity dashboard as an enforceable seat reservation system. Offer activation uses locked seat pools and the first-development synthetic principals.
