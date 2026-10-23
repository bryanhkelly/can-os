# Site public addresses and publishing — FullFlow

## Goal

Every canonical Site may reserve a globally unique public address such as
`vineyard.can-os.com`, then explicitly publish selected school programs,
summer programs, after-school enrichment, public events and application/
registration entry points. The public portal must reuse CAN OS operational
programs, guardian identity, admissions, consent, season/seat and financial
records; it must not become a separate SIS, admissions system, or CMS database.

## Bite 1 committed: reservation foundation, NOT a live site

- `site_publications` maps one canonical Site to at most one globally unique
  address label. It does not replace the existing organization-scoped
  `sites.slug` identifier or imply ownership of a domain name.
- Labels use 3–48 lowercase letters/digits/single hyphens, reject reserved
  platform hostnames, and match a single subdomain label.
- Reservation is a scoped, authenticated command using existing
  `program.launch.start` capability temporarily, pending a separate
  site-publication permission. It validates the Site's actual organization
  and the actor's site restriction inside the transaction.
- Concurrent claims are resolved by database uniqueness. Repeated claims for
  the same Site and label are idempotent. New reservations write audit and
  domain event evidence transactionally.
- Every reservation begins as `draft`; no route or API exposes its Site
  content publicly and no action may publish from this command. An explicit,
  separate publication gate is required.
- Migration `0035_site_publications` is committed but **not applied** to
  Neon by this change. No wildcard DNS/TLS, public website, hostname router,
  site management UI, payment flow, or signup flow is provisioned by bite 1.

## Next narrow bites

1. Expose authenticated site-publisher address setup and a draft preview.
   Replace transitional capability with a deliberately provisioned
   `site.publication.manage` grant. Do not allow a general registrar or
   an affiliated organization to take over a Site.
2. Create a public Site read projection, host-to-site resolver, and a minimal
   Site landing/catalog page. Public queries must only show separately
   authorized `published` offerings, never internal `draft` Programs,
   staff data, student details, case records, or private enrollment metadata.
3. Add scoped publication decisions with version, actor, time, and independent
   readiness checks at the point a registration/action becomes available.
   Marketing visibility and registration availability are separate.
4. Connect CTAs to existing admissions and enrichment journeys. New families
   require verified guardian account signup/invitation, anti-abuse controls,
   verified household relationships and canonical submissions.
5. Custom domains, editing/theme/branding, events, and advanced content after
   the site-to-published-offering flow is demonstrated end to end.

## Acceptance before exposing public hosts

- Apply `0035` only to an isolated disposable Neon branch and verify
  migration journal / schema parity.
- Unit tests: accepted/rejected labels and hostile/nested host values.
- Integration tests: two organizations competing for the same label; same
  site replay; losing access to organization/site; audit failure rollback;
  draft records invisible to unauthenticated reads.
- Browser tests: first site preview, publication gate, program discovery,
  family inquiry/registration, cross-tenant denial and unpublish.
- Provision wildcard DNS and certificate at the hosting platform separately.
  Do not treat migrations, docs or source commits as a deployment.

## Bite 2 committed: authenticated draft address setup and private preview

- `/sites/$siteId/publish` provides a registrar-only Site address
  reservation form and a **private** preview of the canonical Site and
  in-scope Programs. Site Today links to it.
- A signed-in registrar requires BOTH its session capability
  `site.publication.manage` and a matching explicitly provisioned
  institutional `role_assignments.capabilities` entry. The assignment must
  belong to the actor's active Person and Site's Organization, be backed by
  that Organization's Membership, have `program_id IS NULL` and cover
  the actual Site (or be Organization-wide). There is **no automatic grant**.
  An affiliated denomination cannot take over another organization's Site.
- The authenticated Organization and Site grant are validated in addition
  to the explicit institutional assignment. Restricted Site memberships
  cannot access sibling Sites even under a broad institutional assignment.
- The server returns only Site metadata, reserved-address state and
  authorized Program names, types, grades and internal statuses. It does
  not expose household, student, staff-sensitive or admissions records.
  Its response is marked `private, no-store`.
- Reservation preserves transactionally linked audit and domain events
  and concurrent-claim uniqueness. The preview does not serve an external
  hostname, publish program content, open admissions, or accept registration.
- Added scope-denial unit tests and a pending route contract. Test execution
  and isolated-Neon migration/browser verification remain outstanding.
  Migration `0035` must be applied and verified in a disposable environment
  before running the feature. A separate administrator provisioning flow
  for publisher grants is not part of this bite.

**Next:** First establish an independently controlled publication decision
and public-safe offering projection. Only expose `[site].can-os.com` once
host resolution, edge configuration and negative cross-site tests are complete.

## Bite 3 committed: published enrichment catalog projection (no public site yet)

- The existing CAN-wide `/enrichment` list now calls
  `readEnrichmentCatalog(siteId?)`. All prior activity/season publication,
  active status, same-site and same-organization association, noncredit mode,
  permission version, dated session, package, and available-seat logic are
  shared. The optional Site restriction is performed in SQL **before**
  `LIMIT 200`, not by filtering the first page of unrelated sites.
- `/sites/$siteId/publish` shows a **private** catalog preview of eligible,
  independently published enrichment Seasons at the requested Site, in
  addition to the existing internal program summaries. The preview requires
  the Bite 2 institutionally granted site publisher authorization.
- `readPublishedSiteCatalog(slug)` is a read-only public-safe projection
  bounded to one canonical Site. It returns `null` for missing/invalid,
  reserved or draft Sites, and requires both `published` status **and**
  `publishedAt`. Only then does it read that Site's eligible enrichment
  Seasons. No current publishing command can set those fields yet.
- The outward-facing DTO explicitly selects public title, site identity,
  season/date/price/availability, time and package summaries. It does not
  spread raw Season metadata, guardian permission text/version, calendar
  session IDs, staff details, student profiles or internal program records.
- Added focused tests for draft/missing publication, reserved host labels,
  cross-site read isolation (selected Site ID only) and explicit DTO field
  whitelisting. These tests are committed but **not yet executed**.
- An unauthenticated server-side catalog read is prepared, but no
  tenant hostname router, published-site page, wildcard DNS, site publish
  transition, guardian application flow or payment system has been enabled.
  This does not make `[site].can-os.com` live.

**Next bite:** Add an explicit, audited and reversible **Site publish/unpublish**
decision after reviewing public content and readiness; validate host-routing
and tests on an isolated database before exposing public website traffic.
Program marketing visibility must remain independent of opening registration.
