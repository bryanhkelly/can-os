# CAN OS Site-first production reconciliation

Date: 2026-11-15
Source branch: `bryanhkelly/can-os/main`
Deployment target: Cloudflare Worker `can-os`
Database target: Neon project `can-os` (`sweet-hall-62441909`), default `main` branch (`br-restless-sea-ar9ooo55`)

## Verified production database migration

Applied a *single atomic transaction* to Neon `main` with 49 statements from these committed patches, in order:

1. `database/canonical/v3.0.1/patch-noncredit-self-enrollment.sql`
2. `database/canonical/v3.0.1/patch-noncredit-waitlist-invitations.sql`
3. `database/canonical/v3.0.1/patch-noncredit-released-seats.sql`
4. `database/canonical/v3.0.1/patch-site-identity-links.sql`
5. `database/canonical/v3.0.1/patch-site-identity-confirmation.sql`
6. `database/canonical/v3.0.1/patch-site-identity-restricted-writer.sql`

For a new table with zero rows, the initial noncredit release `CHECK` was created using the **final flexible online-Site constraint** from `patch-noncredit-site-associated-online.sql`, avoiding a redundant drop/recreate of the new constraint. The effect is the same as applying the two files sequentially. No existing production table was copied from `test01`, and no seed data was transferred.

**Post-transaction production query verified:**
- `public.access_account_noncredit_principals` exists
- `education_v30.noncredit_self_enrollment_releases` exists
- `education_v30.noncredit_self_enrollment_claims` exists
- `education_v30.noncredit_enrollment_waitlist` exists
- `education_v30.noncredit_released_seats` exists
- `public.site_canonical_identity_links` exists
- Native Site confirmation constraint and flexible noncredit Site association enforced
- Dedicated non-login `can_v30_site_identity_writer`: `BYPASSRLS=false`; `row_security_active=true`; INSERT permitted; DELETE denied
- `0` approved or pending Site links and `0` noncredit releases, as appropriate for clean production setup

On `test01`, separately installed the two missing noncredit waitlist and released-seat tables. Never overwrite the production-specific `education_v30.site_device_policies`, `education_v30.site_device_registrations`, `public.access_session_signals` or `public.session_device_retention_state` tables with test data.

## Operational limitations

- No successful production source release is proven by the database migration. Cloudflare Worker `can-os` is the configured runtime, but its latest check was **failed**. Do not claim the code is running until the Cloudflare build succeeds.
- GitHub Actions on `main` have repeatedly reported `startup_failure` without jobs. Typecheck, lint, build and browser acceptance have not passed.
- The Cloudflare dashboard's runtime `DATABASE_URL`, `CAN_ACCESS_PUBLIC_ORIGIN`, `CAN_PUBLIC_SITE_DOMAIN`, deployed commit, DNS/TLS and current Site hostnames were not accessible to verify through the available integration. Do not assume the runtime is using Neon `main` solely because it is the project default.
- A Neon recovery snapshot and a new pre-migration branch could not be created: account limits were exceeded. Prior recovery snapshot predates the current schema and should **not** be treated as a current rollback point. The migration used one atomic transaction; production backup capacity still needs to be restored.
- New canonical tables currently have no real released courses; approved public↔canonical identity links also remain empty. This is intentional, not a failed data transfer.
- Netlify `can-os-demo-new` is an older independent/demo deployment from 2026-11-05, not an acceptable substitute for the Cloudflare production Worker; the `can-academy` Netlify project uses a separate website repository.

## Source-defined final routes (not claims of live deployment)

`/launch` (entry); `/launch/site` (Site-first wizard); `/launch/site-preview?siteId=<UUID>` (private iframe HTML); `/launch/website?siteId=<UUID>` (Website Studio); `/site-identity` (three-party correspondence workflow); `/canonical/blueprints` (advanced Blueprints); `/programs/noncredit/enrollment` (operator noncredit releases); `/learn/enroll?release=<UUID>` (adult registration); `/sites/<UUID>/publish` (Site publisher); `/release-fingerprint` (deployment SHA probe). Public tenant websites follow `https://<site-slug>.<CAN_PUBLIC_SITE_DOMAIN>/` only after their own publication, wildcard hosting and DNS/TLS acceptance.

**Do not advertise a final absolute production URL** until the deployed Cloudflare origin is independently established and each exact path is tested with appropriate authorization.


## November 15 follow-up: Drizzle ledger and source snapshot reconciliation

**Completed on GitHub `main`:**
- Fixed malformed `DO $` PL/pgSQL delimiters in `drizzle/0081_account_favorite_sites.sql`.
- Reconstructed missing source-schema Drizzle snapshots `0077_snapshot.json` through `0083_snapshot.json`, carrying version 7, dialect `postgresql`, unique snapshot IDs and an unbroken `prevId` chain. Snapshot changes are modeled only where the current schema exports changed. Specifically, `0080` creates an SQL-only retention table not currently exported by the Drizzle ORM schema, so its modeled snapshot is intentionally unchanged.
- Verified eight snapshot versions `0076`–`0083` chain correctly. The modeled public table count rises from 182 to 186: session security signals, account favorite Sites, personal account signups and contact-sharing revisions.
- Added `scripts/check-drizzle-snapshot-chain.mjs` and the early CI guard; added `scripts/acceptance/check-production-drizzle-parity.mjs` (read-only, exact Neon branch assertion, local SQL SHA verification). Commands: `npm run db:check:journal` and `CAN_PRODUCTION_SCHEMA_VALIDATION=1 DATABASE_URL='<production connection>' npm run db:check:main`.
- The full Drizzle CLI `db:generate` or `drizzle-kit check` was **not run** in a successful CI/build environment, so these reconstructed source snapshots have not yet passed the official generator's no-drift test.

**Completed and verified on Neon production `main`:**
- Production objects for Drizzle SQL `0079`–`0083` were already present. Verified **22/22** specific post-migration table, column, constraint, index and RLS existence checks before backfilling. These SQL files were **not replayed** over production data.
- Applied transactionally and with explicit ledger-tip/object guards: `database/production/2026-11-15-reconcile-applied-drizzle-ledger.sql`. It records five already-applied migrations under the exact SHA-256 of the committed (and corrected) SQL files, from journal idx 79–83. Drizzle's ledger now contains **85 rows**, last id **85**, final journal timestamp **1794690004000** (migration `0083`), and its sequence is at 85. Original 80 history records were preserved.
- Added the missing `education_v30.noncredit_self_enrollment_releases(provider_organization_id,status,created_at DESC)` index. Verified it exists exactly once in production.
- Added `can_v30_public_site_reader` as **NOLOGIN, NOBYPASSRLS** with public schema usage and read access *only* to approved `public.site_canonical_identity_links`, not to claims or identities. Verified via `SET LOCAL ROLE`: RLS active, no INSERT authority, no native schema usage, zero visible approved links. No unrestricted `can_v30_public_site_app` login was cloned from `test01`, and no runtime Cloudflare login was granted access without independent verification.
- The existing `can_v30_site_identity_writer` remains a separate non-login RLS-constrained write role. No Site identity was approved or learner enrollment created.

**Unresolved environment gates, not claims of completion:**
- Neon has reached its **one-snapshot** and **ten-branch** limits. A fresh full recovery snapshot or staging branch could not be established. Do not delete an existing backup or project branch without identifying its ownership/retention purpose. A snapshot slot or additional plan capacity is required for a new production recovery point.
- GitHub Actions runs continue to report `startup_failure` with no executed CI jobs. No successful complete typecheck, Drizzle generator check, unit test, browser test or Cloudflare deployment has been observed for this change.
- Cloudflare's actual `DATABASE_URL` role, DNS/TLS and registration application origin still require read-only production runtime verification. The non-login Site mapping reader is not a substitute for an audited, supported production noncredit eligibility reader.
- Application tables/columns in `public` and `education_v30`: Neon `main` is a superset of `test01`. Do not re-copy `test01` or archived `education_v24` schemas.


## Site catalog / cohort privacy / waitlist dispatch follow-up

Source changes committed on November 15, 2026:

- The Site noncredit catalog now probes the actual database connection's
  schema/table permissions and performs zero-row relation SELECTs; the
  independent three-party-approved Site link and full canonical release
  eligibility checks remain mandatory. No broader canonical reader privileges
  were granted.
- Added an explicit, **read-only test01 integration gate**:
  `npm run test:site:enrollment-bridge`, with
  `CAN_SITE_BRIDGE_VALIDATION=1`, matching isolated `TEST_DATABASE_URL` and
  `CAN_EXPECTED_NEON_BRANCH_ID`. This gate cannot pass without an approved
  Site correspondence and eligible published release. No production identities
  were manufactured or auto-approved.
- Current production inspection: **0 approved Site links, 0 published noncredit
  releases**, therefore **no positive production enrollment handoff is
  demonstrated**. Test01 contains 2 published noncredit releases but currently
  **0 approved public↔canonical Site links**.
- Release-linked classroom rooms now require an exact
  `noncredit_self_enrollment_claims.release_id` and matching real Person,
  registration and Site in the QR, companion, media, learner activity, survey,
  roster, attendance and assisted response pathways. Historic out-of-cohort
  pairings no longer affect facilitator response/device summary counts.
  Roster SQL filters before its 301-row cap, and Neon transaction reads are
  sequential.
- `patch-noncredit-waitlist-email-deliveries.sql` was installed additively on
  **test01 and main**. Verified FORCE RLS, owner-only policy and no PUBLIC SELECT
  on both branches. The canonical restricted auth login cannot read the table
  directly on test01.
- Provider invitations now transactionally queue an idempotent email receipt.
  The existing scheduled-maintenance runner and Cloudflare minute cron process
  leased, retryable mail through Resend, rechecking current eligible releases,
  invitation expiry and recipient account/Person authorization. An accepted
  provider response **does not** mean the learner received/opened the email or
  accepted enrollment. The operator and learner surfaces show transport status.

**Unverified release gates:** Current Cloudflare deployment source SHA and
runtime credentials, actual external mail transport acceptance, an authorized
approved public Site link, complete test01 end-to-end Site registration, a
passing typecheck/build and authenticated browser QA. No synthetic approvals,
learning enrollments or waitlist recipients were written to production.
