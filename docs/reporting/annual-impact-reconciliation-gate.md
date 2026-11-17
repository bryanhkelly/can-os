# Annual impact reporting reconciliation gate (P1)

This is a **source-evidence verification primitive**, not a new enrollment,
attendance, completion, award, or accounting ledger. It must not become an
alternative writer or a public network data endpoint.

## Implemented in this branch

- `reconcileAnnualImpact` counts source participation records once, deduplicates
  canonical Person IDs across authorized Sites, preserves withdrawals, resolves
  corrected room/session participation assertions, and excludes reversed
  completion decisions and revoked awards from current-valid totals.
- Each attendance, completion, and award input carries source participation
  identity. Missing, foreign-Site, duplicated or conflicting source facts fail
  closed. Award provenance requires the same participation and an original
  completion decision.
- The optional expected impact snapshot must exactly match recomputed source
  metrics and per-Site registrations/people. It cannot be marked reconciled
  through a manual dashboard override.
- Tests cover repeated participants across two Sites, withdrawn registrations,
  attendance corrections, completion reversals, award revocations, missing
  evidence, mismatched annual totals, and unauthorized Site facts.

## Integration gates before annual reports can be published

1. **Authoritative adapters:** Reuse existing canonical Class Enrollment,
   noncredit registration, school enrollment, participation attribution,
   room attendance, governed completion decisions and canonical credential
   issuances. Do not concatenate unrelated IDs as one participation.
2. **Effective-date authority:** Select source records and correction history
   with a consistent database snapshot. Require historical attendance session
   time separately from assertion/correction time; this initial primitive's
   `observedAt` is usable only for evidence whose observation date is the
   reporting occurrence date. Late corrections must not move old attendance
   into a later reporting year.
3. **Historical state:** Report withdrawal *events in period* only when
   lifecycle/event timestamps exist; otherwise label the count as current
   withdrawn status among in-period registrants. Completion decisions must
   include their original chain and the latest authorized correction as of
   the report snapshot.
4. **Award semantics:** A historical issuance remains in issued totals even
   after revocation; a currently valid award requires unrevoked canonical
   issuer evidence and latest governing completion authority.
5. **Network permission:** Independently verify source Organization reporting
   grants and metric-specific disclosure approvals. Site/network affiliation
   alone never grants access. Suppress or aggregate small cells only after
   permission checks; avoid reconstructable small cells in totals.
6. **Annual report reproducibility:** Store an immutable report manifest with
   metric definition version, UTC period, as-of, authorized scope fingerprint,
   canonical source reference/count manifest, generated-at, and approval
   history. It should reproduce the Site report under identical scope and
   timing, without copying student-level evidence into a public report.
7. **Release acceptance:** Use test01 with verified adult, staff and network
   principals, two independent Sites, cross-Site duplicate Persons, repeated
   attempts, late corrections, withdrawals, zero/unknown states, revocations,
   and denied cross-Organization access. Run unit, integration, RLS, browser
   acceptance and the Cloudflare build. Do not describe a CI startup failure
   as a passing test.

## Status

The pure reconciliation contract and unit tests are included. No live
database adapters, annual report publishing UI, migrations, executed CI
results, or production impact figures are claimed.
