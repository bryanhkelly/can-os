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
