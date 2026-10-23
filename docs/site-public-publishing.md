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

## Bite 4 committed: explicit Publish / Unpublish decision

The `/sites/$siteId/publish` editor now includes explicit approval and
withdrawal actions. They are **not** a deployment command; no wildcard
DNS/certificate, hostname-based routing, or public website route is enabled.

- Both commands use the same verified session, `site.publication.manage`
  capability and explicit institutionally verified site-level assignment.
  Scoped access is rechecked inside the write transaction.
- The publisher must reserve a globally unique address first. The database
  publication row is locked with `FOR UPDATE` to serialize opposing
  decisions. The command requires the previously viewed `updated_at` revision,
  rejects stale changes, and advances the revision monotonically.
- Publication requires a fresh confirmation that public Site content was
  reviewed, a reason, and at least **one eligible enriched Season** returned
  by the canonical `readEnrichmentCatalog(siteId, tx)` within the transaction.
  This intentionally supports only summer/after-school enrichment in this
  slice; academic Program publication and applications remain a future workflow.
- Unpublish clears `published_at` and returns the Site to `draft`,
  even when offerings are empty, ended, or withdrawn. No catalog or
  registration records are modified by this command.
- Each successful transition updates the publication row and writes an Audit
  and Domain Event in the **same transaction**; rejected transitions roll
  back. Repeated already-in-target requests are no-ops and write no events.
  Review reasons are stored only as decision evidence. Do not enter student PII.
- Public-safe catalog reads use a shared lock on the Site publication row
  throughout projection, serializing against a concurrent unpublish decision.
  A `draft` or invalid Site never reaches the canonical enrichment reader.
- Added pure decision-policy tests for content gates, revision conflicts,
  unpublish, idempotence, invalid stored state and monotonic revisions.
  Existing catalog-gate tests were updated for the transactional read boundary.
  **All tests, typecheck and browser acceptance are unverified until executed.**

### Open gates before external hostname launch

1. Apply and verify migration `0035` on a **disposable Neon branch** and
   validate publish, unpublish, cross-tenant denial, audit rollback and
   public read gating with real database transaction isolation.
2. Execute `npm run typecheck`, unit tests and route-contract check.
3. Build a minimal hostname-resolved public landing/catalog page, configure
   verified wildcard DNS/TLS and isolate public host routing from CAN OS
   administration, SSR sessions and private routes.
4. Independently add academic-program publicity, site content/brand editing,
   new-guardian signup, applications and CAN OS registration CTAs in small
   validated slices. Publishing a Site cannot bypass these workflows.

## Bite 5 committed: isolated public hostname landing page

- Added `src/routes/published-site.ts`, a **server-only GET route** that
  renders independently from CAN OS's client-side router, session provider,
  private navigation and hydration scripts. It serves escaped, static HTML
  for the approved public enrichment catalog, with strict CSP, `no-store`,
  no links into private site/guardian workspaces and `noindex` until launch.
- The server route requires `CAN_PUBLIC_SITE_HOSTING_ENABLED=true` and an
  exact HTTPS hostname of the form `[site].can-os.com`, matched from the
  actual request URL. A conflicting `Host` header, untrusted forwarded
  hostname, non-tenant origin, other method or path fails closed.
- Added `netlify/edge-functions/site-host-gate.ts` with Netlify inline
  `path: "/*"` configuration. It leaves recognized platform hosts and
  other deployment domains alone; on tenant hosts, it denies **all** app
  paths, identity endpoints, RPC, private dashboard routes, and static asset
  paths. The **only** allowed request is HTTPS GET `/`, internally rewritten
  to `/published-site`; that server-only route is the sole exception
  when the rewrite is processed. Unsupported tenant label/paths return 404.
- The **same rollout switch** must be set in the Netlify Edge Functions
  runtime and TanStack server runtime. Both default to **disabled**.
  No credentials, registration forms or authenticated entry points are
  exposed under tenant hostnames.
- Added pure host/route-denial tests, including malformed hostnames,
  a disabled switch, forged `X-Forwarded-Host`, conflicting `Host`,
  private route denial and normal CAN OS host pass-through. Added renderer
  tests for escaped publisher content, no client scripts and empty state.
- Added the server route to the route contract inventory with acceptance
  fields **pending**. Source presence is not browser/edge verification.

**CRITICAL: not live or accepted yet.** No wildcard DNS or TLS was
provisioned. The Netlify edge integration, rewritten requests, SSR handler,
cross-origin/session isolation, database migrations and automated tests have
not been executed together. Do not turn on `CAN_PUBLIC_SITE_HOSTING_ENABLED`
or point a partner hostname to the app before these checks pass.
The app's normal deployment host must remain on the platform-host pathway.

### Priorities after Bite 5

1. Typecheck, unit tests and static route-contract check; repair failures.
2. Apply migration `0035` in a disposable Neon branch only. Exercise
   tenant-read/publication transitions, publication audit rollbacks,
   cross-site denial, and concurrent unpublish/read behavior.
3. Run a deployed Netlify preview with the flag enabled **only for a
   disposable test tenant domain**, verifying rewrite behavior, root
   isolation, HTTP methods, private RPC denial, CSP and correct 404s.
4. When that acceptance is recorded, deliberately configure wildcard
   DNS/certificate and enable the production switch. Only then advertise
   `[site].can-os.com` as a working URL.
5. After safe external routing, implement an explicitly published school
   Program catalog and guardian inquiry/application handoff. No parallel
   admissions or registration system.

## Bite 6 committed: academic Program marketing, separate from enrollment

- A new `program_publications` table holds **explicitly approved marketing
  snapshots** for canonical Programs, keyed by the real `program_id` and
  associated with its Site. Migration `0036_program_publications.sql` and
  Drizzle schema/journal are committed but **not applied**. Snapshots include
  reviewed title, description, grade range, and delivery model, plus approval
  actor, timestamp and status. Operational Program/academic records remain
  the source of truth for running education, admissions and credit.
- Eligible academic models: church-hosted academies, high-school extensions,
  full schools, microschools, hybrid programs, homeschool cohorts. Summer and
  after-school offerings keep their existing activity-season publication flow.
- A scoped, explicitly assigned Site publisher can independently approve or
  withdraw an academic Program's public marketing. Publish requires the
  Program to belong to the Site and Organization, fall in the actor's verified
  Program scope, be neither paused nor closed, and have a human-reviewed
  30–2000-character plain-text summary and reason. The publisher may market
  a `draft` or `launching` program **without** opening admissions.
- Approval/unpublication has a transactional audit record and domain event.
  The Site publication row is locked before marketing decisions, so an
  unpublish of the Site and an individual Program decision cannot race past
  one another. Every Site still needs its **own** publication approval.
- The private Site publisher view now offers per-program approval forms,
  disclosure review and withdrawal, while preserving the original internal
  Program list and enrichment preview.
- Site publishing readiness can now be satisfied by an approved academic
  Program listing **or** an approved noncredit enrichment Season. There is
  no artificial requirement to run a summer camp before launching a
  ninth-grade academy's public page.
- The public catalog and escaped, server-rendered landing page now include
  only approved academic listings at the same Site/Organization, excluding
  paused/closed Programs. Rendering clearly distinguishes a **planned**
  academic offering from an operating one and never asserts accreditation,
  diploma authority, credit approval or actual application availability.
- Approved copy is snapshotted and not silently changed by later edits to
  canonical Program metadata. To change approved copy in this small slice,
  withdraw and approve a fresh snapshot. Broader content versioning and
  partner-proposed edits are subsequent features.
- Focused policy/unit fixtures were committed or updated but, per the
  current development instruction, test execution, typecheck, migrations
  and deployed acceptance were **not** performed. Public hosting still
  defaults off. No production DB data or `main` branch was changed.

**Next product bite:** A family-facing `Request Information` entry point
bound to a published Site and Program, feeding existing canonical admissions
inquiry/lead records without exposing private workflow or accepting a school
application before readiness.
