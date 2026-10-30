# FullFlow dedicated Neon migration evidence — 0039 and 0040

**Applied and postchecked:** 2026-10-23  
**Scope:** Dedicated development/acceptance branch only. **Not production.**  
**GitHub source commit used for SQL/journal:** `6e13cb6ec2be3e22ca18f2569d12251a59fe8826` on `FullFlow`.  
**Neon project:** `sweet-hall-62441909` (`can-os`).  
**Database:** `neondb`.  
**Only SQL write target:** `fullflow-e2e-20261022` (`br-proud-pine-arfju8h2`).  
**Point-in-time recovery branch:** `fullflow-pre-0039-0040-20261023` (`br-long-tooth-arg8xm19`), created from the target at parent LSN `0/ABE3F40` and confirmed `ready` before migrations.

## Preflight and controlled application

1. Confirmed the target branch directly from the connected Neon project, not merely from a hostname, branch label, or `DATABASE_URL`. The target is neither the primary `production` branch nor `test01`.
2. Verified **39** ledger entries, latest `0038_public_interest_conversion` (`created_at=1792728000000`). PostgreSQL-calculated SHA-256 of the exact GitHub `0038` file matched the latest stored Drizzle migration hash.
3. Confirmed `program_site_authorizations` and `site_local_content_versions` did not yet exist. Existing records: **1,192 Sites**, **1,038 Programs**.
4. Created the recovery branch above **before** writing.
5. Executed the **unchanged committed** `0039_program_site_authorizations.sql` and `0040_site_local_content.sql` SQL statements **sequentially in one Neon transaction** targeted by explicit project ID, branch ID and database name. Used a transaction-scoped advisory lock, server-attested branch/project/database guards, exact preceding migration ledger count/timestamp/hash checks, and a second within-transaction guard between the migrations. Migration journal rows contain PostgreSQL-computed SHA-256 of the **full unmodified source SQL** and original Drizzle journal timestamps. Any error would have rolled back both migrations.
6. Both migrations committed; read-only postcheck verified **41** ledger rows and both tables.

## Exact postcheck evidence

| Migration | Drizzle timestamp | Stored and independently source-verified SHA-256 |
| --- | ---: | --- |
| `0039_program_site_authorizations` | `1792731600000` | `ecdb2ce591dc4183840c0ecf5458bfbdc6c8593c5619307646cf6c00958efdf9` |
| `0040_site_local_content` | `1792735200000` | `3b1a8d22a5baf2b23e1e3f59f87a896eac96ff7177fa6253c4d5aaeffe85b422` |

- PostgreSQL returned the expected 21 columns on `program_site_authorizations` and 9 on `site_local_content_versions`.
- Verified required status/review/revocation/endorsement/JSON/positive-version check constraints, foreign keys, unique indexes, and supporting indexes on both tables.
- **Both new tables are empty**: zero authorization records and zero local website content revisions. There were no implicit CAN approvals, partner grants, registrations, students or website publications.
- Existing counts remained **1,192 Sites** and **1,038 Programs**.
- `FullFlow`'s committed migration journal at postcheck still contains exactly 41 entries ending at `0040_site_local_content`.

## Boundaries and outstanding acceptance

**Migration applied and schema checked** does **not** prove the new service code, authorization, browser journeys, public hosting, child-image privacy controls, or institutional exception workflow work end-to-end. Execute guarded `scripts/verify-fullflow-schema.mjs`, typecheck, integration and browser acceptance from a trusted runner before enabling public traffic. GitHub Actions have previously failed before allocating any runner; those are not passing test results.

This record is **not** authorization to apply these migrations to `production` or `test01`, merge to `main`, configure wildcard DNS, or enable public websites.
