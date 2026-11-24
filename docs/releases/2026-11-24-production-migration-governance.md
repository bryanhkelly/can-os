# Production migration governance

Source reviewed: 58c0e81a9be2096767f476602d51a9630652578a. Target: CAN OS Neon main, neondb owner. User authorized reconciliation and pending migration work.

## Findings

- Every current journal entry 0000–0116 was compared against the actual database ledger. 111 match raw committed SQL, 5 historical Windows CRLF byte matches (0000, 0001, 0002, 0003, 0005) and the malformed 0116 record. The 0082 correction already exists and matches the committed SHA-256.
- 0116 source blob 6effd70ecd30e7640cea69b5bd0fb96528dfe527 is unchanged from original commit 58cc2ea. Both columns and the validated RESTRICT FK match the complete additive migration. Historical execution logs are unavailable. The narrowly guarded 0116 repair was executed successfully on Neon main. Postflight confirmed exact committed SHA-256 and zero malformed hash rows. This records schema-equivalence reconciliation, not original execution provenance.
- One preserved historical row has no current journal entry: id 27, timestamp 1792513890490, hash f434947644ed1fc9c0ab14ccffb71d6835666d41da3194769977c7a45604ab73. The timestamp is October 20, 2026 UTC. Original source located on retained main-local commit a6c38ac54b80599beaa6c822ab8cf30c83672bfe: drizzle/0026_charming_dark_beast.sql, blob 8e4d669aa26d6ac163c813f54309b5cda5095f33. Exact original bytes reproduce the ledger SHA-256; the removed account_person_grants.is_synthetic column is absent on main. Archived exact bytes are preserved outside the active migration journal. Never replay this historical migration.
- Seven entries 0117–0123 remain pending. Their rollback-only validation passed previously, but the historical source has now been recovered and verified. The complete journal and retained source may be used to establish a guarded production baseline.

## Reusable controls

Run `node scripts/acceptance/review-production-migration-ledger.mjs` from a clean exact Git checkout with an authorized owner connection. Read-only. Checks pinned target identity, journal ordering (including the exact known historical index 0020 timestamp inversion), immutable SQL-only Git blobs, exact SHA-256, tightly bounded CRLF compatibility, duplicates, gaps, unmapped history and pending suffix. Outputs an auditable preflight result; nonzero exit on issues. Test the pure policy with `node --test scripts/lib/production-migration-governance.test.mjs`.

Do not use the disposable-only migration alias against main. A reviewed production apply must bind the source SHA, prior ledger, approved pending suffix, rollback evidence, and transactional postconditions. Preserve historical records. Do not manufacture provenance or stamp migrations that have not executed. Full application, Storybook and live provider checks remain independent release gates.
