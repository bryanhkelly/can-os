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
