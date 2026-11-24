# Database migration acceptance: release-11232026

Date: 2026-11-24. Source commit: b086c0c5815ed138900cbb9436675cf30c342ee1. PR #364.
Target: Neon project can-os (sweet-hall-62441909), main (br-restless-sea-ar9ooo55), neondb. Identity and read-only transaction state were attested by PostgreSQL.

## Ledger reconciliation: PASS

Read-only inspection of drizzle.__drizzle_migrations and committed SQL bytes:
- 124 journal entries (0000–0123); all timestamps present; zero pending.
- 119 exact SHA-256 matches and five explicitly governed historical CRLF matches (0000, 0001, 0002, 0003, 0005).
- One extra retained historical SQL entry independently matched its source bytes (database/production/history/0026_charming_dark_beast.sql).
- 125 total rows, 125 distinct timestamps, zero malformed hashes. Tip 1795462017000 (0123).
- All 37 SQL-only entries (0087–0123) also matched their governed Git blob identifiers.
- All 21 release migrations (0103–0123) matched exactly. No replay or ledger repair is needed on main for this source commit.

## Live schema and data checks

- 20 inspected private engagement, campaign, intelligence and geography tables present, with enabled and forced RLS, no anonymous or authenticated table-level access.
- Inspected release constraints validated; zero unvalidated constraints across public and education_v30.
- Zero invalid or not-ready public indexes.
- Inspected Go gateway policies restrict current code and current-day counters.
- Inspected enrollment cutover, historical evidence, graded submission revisions, bottom-up reporting relationship tables, immutable/audit triggers and working-draft unique index present.
- 131 academic enrollment cutover links; 593 historical evidence records; zero evidence checksum mismatches; zero graded submissions lacking revision history.

## Outstanding least-privilege issue

Three owner-only academic tables (academic_enrollment_cutover_links, historical_academic_evidence, graded_submission_revisions) and two security-invoker recovery views (historical_academic_evidence_candidates, valor_instructional_reference_candidates) retain explicit authenticated-role SELECT/INSERT/UPDATE/DELETE grants. Their production source scripts revoked PUBLIC only. The three tables have forced RLS and only a trusted-owner policy. Read-only SET LOCAL ROLE authenticated returned zero rows from all three. Both view reads failed with permission denied on underlying protected relations. No record exposure was demonstrated by those probes. This is a defense-in-depth gap, not a passing least-privilege result.

Recommended separately reviewed forward migration: explicitly revoke all privileges on the five named relations from PUBLIC, anonymous and authenticated, preserve trusted owner access and existing RLS/policies, then verify effective ACLs and authorized application access. Do not alter old migration bytes or ledger history. Do not replay synthetic recovery scripts.

## Acceptance boundary

This is live read-only ledger and targeted schema/evidence acceptance, not clean-install certification or migration replay. No production writes, privilege changes, migrations, database branches or ledger updates were performed. Generated Drizzle snapshot parity remains unverified by design after 0086. Full ephemeral PostgreSQL replay, full schema comparison, application integration and the outstanding least-privilege remediation remain required for unconditional database release acceptance. Do not treat a matching ledger as proof that every SQL statement's original execution was witnessed.
