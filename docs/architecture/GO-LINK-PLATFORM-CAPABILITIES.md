# Link infrastructure: Manage, Resolve, Measure

Status: implemented in PR #363 under release validation, not deployed to production.

## 1. Link Management

- The one canonical `public.site_go_links` table represents a Site-owned link, optionally associated with an Introduce outreach plan. The short code is 12 opaque base64url characters. It is not a session token or an authorization grant.
- Operators can choose an eligible published Site page, curated journey, noncredit training release, Class offering or approved enrichment program. Exact IDs and same-origin links remain an advanced input; the server validates them.
- Site operators can open `/o/:organizationSlug/:siteSlug/go-links` without creating a Marketing Package; `/sites/:siteId/go-links` is the compact-ID equivalent. The existing Introduce workspace uses the same component and services with a package filter.
- Site-wide management requires verified authority over every attached Program, rather than exposing sibling programs through a partial grant.
- The destination picker and link inventory support permission-scoped server search. Inventory pagination uses 20-item keyset pages with exact PostgreSQL timestamp+ID ordering.
- Link creation supports a client-issued UUID and source-payload fingerprint with a Site/person-scoped unique index and transaction lock. A retry returns the same immutable code; reusing an ID for a different request is rejected.
- Link name and channel are operational metadata. Optional `starts_at` and `expires_at` delimit a link's validity.
- `active` can be paused and resumed. `revoked` is terminal. A distributed code never changes its destination. Pausing and revoking are audited, authorized commands.
- An archived outreach plan is not a mass revocation. Printed collateral continues to work until its links are explicitly paused, expire, or are revoked.
- Planning Sites may share **approved public interest pages**; closed Sites are unavailable. A planning Site cannot bypass the independent approval rules for enrollment or Class publication.
- Link management, destination choices and safe testing require a verified Site operator context and existing permissions. Test Link performs no redirect and records no traffic.
- The operator workspace is in `src/components/launch-studio/GoLinkWorkspace.tsx`. There is no second link CMS.

## 2. Destination Resolution

- The shared registry in `src/modules/engagement/go-destination-registry.server.ts` powers both the destination picker and the public `/go/$code` resolver. It checks **current** target ownership and eligibility on every request.
- Site pages require current approved publication. Noncredit training uses the existing exact-release published/eligible enrollment reader. Classes require the matching Site's latest public published Class offering. Enrichment reuses the approved extended-learning catalog with exact Season filtering before the general listing limit. Information journeys must be curated.
- The public resolver independently checks link lifecycle, Site/Organization ownership and an optional outreach package association. Publication can be withdrawn after a link was first created without leaving a stale redirect capability.
- No arbitrary user-provided URL is stored as a redirect destination. Links convey navigation context only, not identity, attendance, guardian access or enrollment permission.
- The public GET emits a non-cacheable 302 only on success. Invalid, expired, unpublished or revoked codes fail closed. Manual Test Link never increments counters. A generic accessible HTML failure page with a strict CSP provides a safe route to /landing without reflecting private link or Site metadata.
- All public `/go/` clipboard URLs use the explicit verified `CAN_ACCESS_PUBLIC_ORIGIN`, not browser preview/staging origins. Preview website sharing is separately governed.
- Historical aliases and historical slug management are deliberately **not** part of this release.

## 3. Outcome Evidence

The link layer deliberately does not own a person, enrollment, completion or outcome ledger.

- `public.site_go_link_daily_visits` stores only `link_id`, UTC day and redirect count. It stores no IP, device, cookie, email or Person ID. A count means **redirect requests** (including possible automated traffic), not unique visitors.
- Redirect observation uses a database atomic upsert for concurrency. A telemetry write failure does not prevent a valid redirect. The operational read is scoped to the verified Site, optional outreach plan and selected page.
- Training attribution is read-only from existing canonical `noncredit_self_enrollment_claims`. It counts claim records that reference the exact link code, destination release and Site.
- A claim referencing a link does **not** prove a click caused registration. The UI must never label these values as a causal conversion rate or unique people reached.
- Class, enrichment, interest and information destinations report `not_connected` for verified outcomes until an authoritative source and linking contract exist. **Unknown is not zero.**
- The definitions are registered under `go.*` in the shared Reporting Metric Registry; the reporting coverage inventory explicitly marks the remaining source gaps. There is no duplicate reporting system.
- The current view shows a 30-day UTC window. Link management uses bounded 20-item keyset pages; the public redirect counter is an atomic per-link/day upsert. High-volume redirect latency and hot-counter contention still require load tests before national deployment.

## Deployment safety and validation

- Additive SQL migrations `0105_site_go_links.sql`, `0106_universal_engagement.sql`, `0107_site_go_links_private_role_access.sql`, `0108_site_go_link_capabilities.sql`, `0109_site_go_link_reuse.sql`, and `0110_universal_engagement_private_role_access.sql` are in the reviewed SQL-only migration ledger. `0109` makes the Marketing Package reference optional and adds idempotency plus pagination indexes. `0110` enforces RLS and direct client-role denial for the universal engagement definitions and immutable versions, as well as FORCE RLS for Go Links.
- Both Go Link tables and both universal engagement tables live in PostgreSQL's `public` schema, **not** in public database permissions. Direct access for `anonymous` and `authenticated` is denied; FORCE RLS and private-role deployment checks are required.
- `npm run db:check:friendly-urls:deploy` is a read-only deployment gate. It checks every required migration from `0100` to the current journal tip, including new counter privacy and permission constraints. It does not apply migrations.
- `npm run test:urls:unit` includes lifecycle, route authorization, clipboard-origin, registry, reporting and service-boundary tests.
- Read-only Neon verification on November 23 found the production ledger at migration `0099` and none of the Go Link or universal engagement tables. Migrations `0100` through `0110` are **not** confirmed applied.
- The disposable PostgreSQL graduation workflow now includes `tests/postgres/go-link-release-acceptance.sql` for enforced RLS, role privilege denials, unique indexes, lifecycle, immutable published versions, and package-free Site reuse. GitHub CI and full-schema jobs have failed before runner steps were recorded; this new SQL acceptance is **added but not yet executed successfully**. There are no successful repository-wide typecheck, migrated database acceptance, performance or browser test results yet.
- Cloudflare Git-integrated builds do not necessarily invoke `npm run deploy:cloudflare`; production auto-deployment must be disabled or guarded separately until the migration and CI gates pass.

Production deployment must remain blocked until a disposable database is available for the complete ordered migration chain, real role-access tests pass, and full build and browser tests are verified.
