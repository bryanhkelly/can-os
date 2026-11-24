# Geographic Intelligence release verification

Branch: release-11232026. Database target: can-os Neon main (sweet-hall-62441909 / br-restless-sea-ar9ooo55).

## Verified
- Rollback-only 0121–0123 fixture: physical Site queueing, shared market isolation by organization and Site, historical retention, address-change lease invalidation, digital-only exclusion, invalid entity role rejected, consent-required and coarse-person geography constraints, forced RLS and denied direct client privileges.
- Previous rollback-only validation also covered pending 0117–0123 and backfill coverage.
- Official Census vintage catalog verifies benchmark 4 / vintage 424; official ACS2024 TIGERweb confirms metro 93 and micro 91 with GEOID and NAME.
- No lasting test rows or schema changes made to Neon main.

## Release blockers
- Neon applied migration 0082 (timestamp 1794690003000) has a malformed hash of length 58. Applied 0116 (1795462010000) has a malformed hash of length 62 and does not match the SHA-256 of the committed SQL. Migrations 0112–0115 match. Main is still at 0116. Do not repair the ledger by copying current hashes without independently establishing applied SQL provenance and approved reconciliation. Migrations 0117–0123 remain pending.
- GitHub Actions runs for ead8d81 report failure before observable job steps; log retrieval returned BlobNotFound. Exact cause unverified. The private repository is unavailable to this runner through git (DNS resolution failed), so full typecheck, Vitest, Storybook build and browser acceptance remain unexecuted here.
- Live geocoding and TIGERweb query responses for public landmarks were unavailable through the web retrieval environment. Metadata verification is not live provider acceptance. Run `node --import tsx scripts/acceptance/check-live-census-geography.mjs` in a network-enabled repository checkout, with Census Data API key for full ACS acceptance.
- No production migration or deployment claimed. Cross-tenant application sessions and restricted service-role runtime tests still require acceptance.

## Fixture execution
Use a rollback-only transaction with the geography migrations and `tests/postgres/geographic-intelligence-acceptance.sql` in a production-shaped database. The fixture must never be committed. For production apply, resolve migration provenance and require exact expected ledger hashes and verified release gates first.
