# CAN OS — Public Site → Admissions: remaining work backlog

**Status:** Active product execution backlog · 23 October 2026 · `FullFlow`.
**Owner:** Site publishing + admissions integration, with Program/Launch, Identity,
Enrichment, Communication, Operations and Legal/Compliance as canonical collaborators.
**Scope:** The partner website and family-acquisition experience from church/school
onboarding through inquiry, verified application and enrollment handoff. This is
**not** a replacement for the platform-wide [FullFlow acceptance contract](./full-flow-acceptance-contract.md)
or [integration convergence plan](./integration-convergence-audit.md).

## Operating rules and evidence

1. **Source-committed is not accepted/live.** The implementation below was
   inspected at repository source level. No migration, typecheck, unit, browser,
   edge-function, disposable-Neon or end-to-end check was run for this inventory.
   Every route-contract verification field remains `pending` unless independently
   evidenced. Do not advertise `[site].can-os.com` as usable yet.
2. **Use existing ownership:** Organization → Site → Program; existing GF22
   `Application`/Household/Person/StudentProfile/guardian relationship,
   GF2 enrollment, existing Enrichment Season/registration, Action,
   CommunicationThread, Journey, AuditEvent and DomainEvent. Public-interest
   rows are *unverified lead capture*, not a second SIS, CRM or application.
3. **Separate decisions:** Site marketing approval, Program listing approval,
   academic operating readiness, admissions availability, credit issuance,
   accreditation claims and enrichment registration are *not interchangeable*.
4. **Host and institution are distinct.** A church may host the Site without
   being the academic provider, school of record or credit issuer. Public claims
   about those roles require the responsible institution's approval.
5. **Permissions are server-side:** verified actor, capability, canonical
   Program/Site/Organization scope and real relationship. A local site editor
   never receives broad registrar, student-record or institution permissions
   through its publishing role.
6. **Small commits on `FullFlow`:** one coherent product bite at a time.
   Update this backlog and applicable source/contracts per bite; don't merge
   to `main`, migrate production or enable public traffic without explicit
   authorization. Deferred checks must be reported **unverified**.

**Status key:** `Committed / unverified` = files exist, no passing-run evidence;
`Partial` = supporting foundation exists but stated workflow remains missing;
`Not started` = product flow or integration not in this track.

## What is already source-committed (Bites 1–8)

| Capability | Current source-level evidence | Status |
| --- | --- | --- |
| Reserved canonical Site address, explicit scoped publishing and private editor | `src/modules/sites/site-publication.server.ts`; `src/routes/sites.$siteId.publish.tsx`; migration `0035` | Committed / unverified |
| Approved public-safe enrichment projection | `src/modules/activities/enrichment-catalog.server.ts`; `src/domain/public-site-catalog.ts` | Committed / unverified |
| Reviewed academic Program marketing independent of school/admission readiness | `src/modules/sites/academic-program-publication.server.ts`; `src/modules/sites/academic-program-catalog.server.ts`; migration `0036` | Committed / unverified |
| Read-only public HTML and isolated hostname edge rules | `src/routes/published-site.ts`; `src/domain/public-site-html.ts`; `netlify/edge-functions/site-host-gate.ts` | Committed / **default-off**, no DNS/TLS |
| Adult Request Information form and unverified lead queue | `src/routes/published-site.inquiry.ts`; `src/modules/enrollment/public-admissions-interest.server.ts`; migration `0037` | Committed / unverified |
| Registrar-scoped inquiry inbox, contacted/closed disposition | `src/components/admissions/PublicInterestInbox.tsx`; `src/modules/enrollment/public-admissions-interest.functions.ts` | Committed / unverified |
| Staff-reviewed conversion to canonical GF22 Application `inquiry` stage | `src/modules/enrollment/admissions-intake.functions.ts`; `src/routes/admissions.intake.tsx`; migration `0038` | Committed / unverified |

**Not yet operationally accepted:** publicly resolving and hosted
websites, family account signup, enrollment-ready application submission,
payments or registration CTAs, and network-wide website operations.
Draft-site generation during new Site creation **and** first Program launch
at an existing Site is now source-committed, not validated or publicly live.
Partner local website editing is also source-committed but not fully accepted.
Follow-up assignments and advanced designs/domains remain separate work.

## Current priority: one connected school journey

**Critical-path override (23 October 2026):** Complete the actual
Organization/Site → Program/authority → family application/enrollment →
instruction/Section → guardian/teacher → school operator journey, rather than
expanding a stand-alone lead-management product. The school launch can be
marketed before readiness, but admissions and operations cannot be opened
without their own authoritative approval checks.

**Just-closed source gap:** Existing Sites, not only newly created Sites, now
receive (or reuse) a **private** website reservation when a legitimate Program
launch starts there. `startProgramLaunch` calls
`ensureExistingSitePublicationDraftForLaunch` inside the canonical launch
transaction and Launch Studio displays the reserved address. The path reuses
existing Site records, locks ownership to the verified organization/site
scope, is idempotent, never resets a published address, never grants publisher
access and does not open hosting or admissions. Source committed, unverified.
Sites created through `createLaunchSite` retain their original same-transaction
provisioning.

**Next true gaps after that source change:**
1. Verified publisher access handoff and responsible **institution vs host**
   decision; do not auto-grant local registrars or allow host copy to assert
   CAN academic authority.
2. A canonical, readiness-gated **family application entry** for a published
   academic program, with verified household/guardian reuse (PUB-11/17).
3. A joined **accepted/enrolled student → assigned instructional Section →
   learning/grade/guardian → Site operations** handoff using the same Program.
4. Deferred public DNS/TLS rollout and external acceptance gates before any
   tenant-host family traffic; source code does not prove deployment.

## Ordered remaining PRODUCT bites

Each ID is independently assignable and should be delivered against its
existing owning module; **DoD** is the behavior required, not a claim that
tests or release gates have passed.

### Deferred: inquiry follow-up optimization (P2, off critical path)

**PUB-09 — Assign lead follow-up owner and due date.** `Not started`
- **Implement:** Create/reuse a canonical `Action` for `public_admissions_interest`
  with `subjectId`, Site/Program/Organization, scoped `ownerPersonId`,
  `dueAt` and status. Initial creation and later reassignment must be
  idempotent, authorized and evidenced with audit/outbox. Show assignment,
  due/overdue and one next action in `/admissions/intake`.
- **DoD:** The assigned eligible staff member can see and resolve the same
  follow-up; an unrelated site cannot list, claim or mutate it; repeat lead
  submission does not create duplicate Actions. No unrestricted partner
  access to GF22 or student data.
- **Depends on:** Existing `actions` schema and scoped action workflow;
  public interest inbox. **Not on the current school-launch critical path.**

**PUB-10 — Contact outcome and contact history.** `Partial`
- **Implement:** Distinguish attempted contact, reached, tour requested,
  declined/not interested and no response; record when/by whom and next
  follow-up, ideally as existing Action evidence and (when appropriate)
  canonical CommunicationThread. Keep personally identifying details
  behind admissions scope; no automated email/sms until approved provider
  and consent policies exist.
- **DoD:** Contact outcome survives reload, affects queue sorting,
  supports reschedule/closure and is auditable; interest conversion
  preserves and closes/resolves its follow-up without erasing history.
- **Depends on:** PUB-09, current unverified `contacted/closed/converted`
  dispositions.

**PUB-11 — Confirmed program inquiry → family application CTA.** `Partial`
- **Implement:** Show *Apply* only when the actual Program admissions/
  registration readiness contract permits it. New families must use
  existing verified guardian identity/invitation, household linking,
  GF22 application packet/eligibility/decision/offer and GF2 enrollment.
  Keep a marketing-only *Request information* fallback for launching
  programs; never have a tenant-host form create an accepted Application.
- **DoD:** A verified family can start/continue **one canonical**
  Application for the published Program, reload it, and resume incomplete
  forms. No duplicate Person/StudentProfile/Household; closed, full,
  unapproved or out-of-window Programs cannot promise enrollment.
- **Depends on:** Authoritative Program intake-readiness predicate;
  existing enrollment/identity/packet services; PUB-17 identity controls.

### Build the out-of-the-box partner website (P1)

**PUB-12 — Generate draft website from Site onboarding.** `Partial / committed, unverified`
- **Implement:** On a real church/school Site creation or launch Journey,
  provision a private Site-publication draft with suggested unique slug,
  canonical Site/Program/Organization mapping and templated academic/
  enrichment sections. Provide explicit address-availability and conflict
  resolution, ownership and publishing approval; never auto-publish
  institutional claims.
- **DoD:** Complete onboarding → immediately see an editable private
  website and correct linked Programs; no second CMS/SIS and no unrelated
  organization's Site data. Address reservation failures have actionable UI.
- **First source-committed bite on `FullFlow`:** The existing authorized
  `createLaunchSite` command now reserves a `site_publications` row with
  `status=draft`, `published_at=NULL` in the same transaction as the
  canonical Site. `suggestedSitePublicSlugs` uses the chosen Site slug
  when available, then a deterministic canonical Site-ID suffix; database
  uniqueness still decides collisions. DomainEvent/AuditEvent records use
  the existing public-address reservation contract. Launch Studio shows the
  newly reserved address and links to the existing separately authorized
  private publishing workspace. No Program, institution, application,
  DNS or public approval is fabricated. Source tests cover slug choices.
- **Additional gap closure (existing Site + Program launch):** The canonical
  `startProgramLaunch` now reserves/reuses a private public-address row for
  *previously existing* Sites that lacked a website. The helper uses the
  transaction and verified launch permissions, retains already-published
  Site state, and returns the reserved host for a Launch Studio handoff.
  It does not approve academic content, issue a Site publisher grant,
  or start admissions. This is committed but unverified.
- **Second source-committed bite on `FullFlow`:** The existing
  registrar + explicitly authorized Site-publisher read now generates
  `previewHtml` from `renderPublicSiteHtml`, the **exact same** escaped
  standalone template as the public host. The content projection only
  includes reviewed, published Program marketing snapshots and authorized
  enrichment catalog items; raw internal Programs remain separately listed
  for editor review. The Site publishing workspace shows the HTML in a
  sandboxed, origin-isolated iframe with scripts, forms and navigation
  blocked. The preview intentionally omits working inquiry request IDs,
  cannot open admissions and does not enable public hostname routing.
  An empty provisioned Site still shows the branded site shell.
  Unit coverage for template parity without active forms is source-committed.
- **Third source-committed bite (PUB-18 foundation):** An isolated
  `/site-website` workspace permits a specifically assigned
  `site_website_editor` to review the same private, public-safe HTML
  without entering CAN's registrar publishing workspace. The only session
  capability is `site.website.draft.read`; access also requires an
  active, Site-bound verified account-person grant and a matching
  same-Person, same-Organization/Site, membership-backed
  `role_assignments` entry. The partner cannot list raw Programs or
  access admissions; both service and unit denial tests are added.
  Grant creation is **not automated**.
- **Still outstanding:** Additional real partner/network onboarding entry
  points, editable and reviewed Site profile fields, a first-class safe
  Site-editor grant provisioning/invitation workflow, independent
  host/institution role-separated approval of protected claims,
  true editorial draft versus approved snapshot management,
  and verified disposable-Neon/route/browser acceptance. The new Site
  command requires migration `0035` to exist on its isolated target DB;
  do not deploy it to an unmigrated environment. Site creation is a
  transaction: address reservation failure rolls back the new Site.
- **Depends on:** Canonical launch/Site workflow and PUB-13; `0035` schema.

**PUB-13 — Site profile, editorial copy and true preview.** `Partial`
- **Implement:** Versioned public fields with ownership-specific approval, not blanket review. Church-owned hero, local description, denomination and spiritual-formation copy publish directly; CAN-owned grades, delivery, academic Program details and verified "host / education provider / school of record" descriptions remain authoritative. Make an authenticated preview use the **same public HTML
  projection** as the tenant page. Avoid unsanitized markdown/HTML or
  public staff/student information.
- **DoD:** Draft preview accurately matches approved output; content edit
  or withdrawal doesn't silently change an already-approved marketing
  snapshot; claims can be reviewed separately by the responsible institution.
- **Depends on:** Existing program publication snapshots, Site profile,
  PUB-18 role/approval boundaries.

**PUB-14 — Enrichment registration CTAs.** `Partial`
- **Implement:** Add *Register*/*Join waitlist* only for independently
  approved offerings with an open enrollment window, safe capacity/
  package state and applicable guardian/consent flow. Handoff to the
  existing authenticated CAN OS enrichment purchase/registration workflow,
  not a new public order or seat ledger.
- **DoD:** Correct Site, Program, Season, package and seat context survive
  authenticated handoff. Full/closed/expired offerings never render
  a misleading CTA; unpublish withdraws public entry without changing
  lawful existing registrations.
- **Depends on:** Existing enrichment family workflow and secure
  platform-host redirect/return context.

**PUB-15 — School-year availability, tours and contacts.** `Not started`
- **Implement:** Read-only admission cycle, intended launch year,
  grade/cohort interest, open-house/tour appointments and verified school
  contact channels from canonical configuration. A planned Program must
  never imply accreditation/approval or a fixed opening date.
- **DoD:** Each call to action is attached to a real Site/Program and
  current availability state; no invented staff calendars or
  booking slots. Tour inquiries route through the same lead follow-up.
- **Depends on:** PUB-09, PUB-13, existing calendar/readiness ownership.

**PUB-16 — Flexible site branding and media.** `Not started`
- **Implement:** Accessible theme presets, logo, hero image, approved
  photo assets, church/cohort branding and standard components. Store
  media in the existing approved document/object-storage architecture;
  use explicit media rights and child-image consent.
- **DoD:** Mobile, accessible, image-safe site preview and publish with
  no file uploads bypassing restricted R2/document policy.
- **Depends on:** PUB-13 and media/safeguarding policy.

### Preserve trust and enable partner operating autonomy (P1/P2)

**PUB-17 — Family identity collision and verified linkage.** `Partial`
- **Implement:** Scope-aware reconciliation when an inquiring adult
  already has a CAN household, sibling, guardian relationship or
  Program Application. Provide an explicit staff review/merge/reuse
  action rather than relying on a matching email/name to grant access.
  Close replay and concurrent-conversion gaps.
- **DoD:** Existing families resume known records, unrelated users cannot
  claim a guardian relationship, and one interest cannot link twice.
  Every identity change is durable, reviewed and auditable.
- **Depends on:** GF22/GF2 identity contract; PUB-11.

**PUB-18 — Church-owned website content and risk-based publishing.** `Partial / source-committed, unverified`
- **Governing principle:** **Centralize institutional accountability; decentralize
  local operations and expression.** A church does **not** request CAN approval
  for routine local, denominational or theological content changes.
- **Ownership lanes:**
  1. **Church-owned, self-published:** welcome, local mission, church history,
     denomination/affiliation, statement of faith, prayer, worship, discipleship,
     religious calendar, locally owned events and recruitment messaging. Local
     publishers must have a verified scoped grant, appropriate content rights
     and safety controls. Updates do not wait in a CAN editorial queue.
  2. **CAN institutional, centrally sourced:** academic curriculum and official
     Program status, academic provider, school of record, accreditation,
     diploma/credit/transcripts, tuition/fees, enrollment availability,
     regulatory and admissions policies. These are **not local website fields**;
     derive them from CAN OS authoritative services and reviewed snapshots.
  3. **Shared / regulated claims:** if free text asserts an institutional,
     financial, accreditation or denomination-endorsement promise, **hold only
     that submitted copy** for qualified review. Keep the last published
     church copy live, not a broken or unpublished website.
  4. **Unsafe or privacy-sensitive copy:** block rather than auto-publish.
     Content/media child privacy, discrimination and misleading representation
     require continuing policy and enforcement work. No reliance solely on AI.
- **Source-committed bite on `FullFlow`:**
  - Structured plain-text local fields: welcome, local community description,
    denomination, statement of faith, spiritual formation. No images, rich
    HTML, testimonials, student data or embedded third-party media in this bite.
  - The existing `site_website_editor` has separate
    `site.website.draft.read` and `site.website.local.publish` capabilities.
    A verified exact-Site membership and explicit Site RoleAssignment carrying
    the publish capability are required inside the write transaction; no
    institutional registrar permission is granted.
  - Migration `0040_site_local_content` adds append-only, per-Site revision
    snapshots with `published` vs `review_required` status, attributable
    author, revision number and optional restored-from revision. Mutations are
    serialized by the existing Site publication row and reject stale expected
    revisions. Rollbacks **append** another safe-screened revision.
  - Structured-field and deterministic text screening publishes ordinary
    church/denominational/theological copy immediately. Protected-claim wording
    creates an auditable held revision and a canonical, scoped CAN `Action`
    without changing the most recent `published` copy. Obvious unsafe
    markup/sensitive terms are rejected. The screen is deliberately
    conservative and **not a complete content moderation guarantee**.
  - Partner workspace exposes self-publishing fields, editor status, history
    and restore actions. Both private previews and the public Site catalog
    render only the latest `published` church copy through the escaped,
    shared HTML template, clearly labelled as local religious/community copy.
    The CAN institutional Program/enrichment projections remain read-only.
    Source-level unit cases cover ordinary faith/denomination copy,
    protected claims, unsafe inputs and escaping.
- **Important existing gate:** Site-level institutional publication and
  currently default-off public host/DNS still govern whether an address can be
  reached. Church copy requires **no routine CAN approval once the Site is
  publicly live**, but saving content alone does not activate a public hostname
  or override an intentional Site takedown.
- **Unfinished acceptance / product:** Source changes and migration 0040 have
  **not passed typecheck, disposable-Neon migrations, integration, child-safety,
  accessibility or browser testing**. No live traffic enabled. Explicit grant
  provisioning, qualified exception-review/approval commands, robust abuse
  detection, takedown/rollback operations, media consent, local events,
  campaign pages, social integrations and branded themes remain future bites.
  Denominational network content/branding must remain **optional and explicitly
  delegated**, never inferred from an affiliation. Formal CAN policies and
  separate authorization are still required for provider/issuer claims.
- **Depends on:** Host/institution separation, Site publishing, PUB-13 and
  verified authorizations. No generic editorial approval queue for church copy.

**PUB-19 — Publication lifecycle and change management.** `Partial`
- **Implement:** Edit/resubmit/approve workflow for published Program
  snapshots; scoped content versions, scheduled opening/closing, safe
  address rename, site closure, redirect or archived state, program
  reassignment and takedown. Require independent approval when the
  source Program's academic status/provider/credit issuer changes.
- **DoD:** No orphaned Site/Program listings; address collisions are
  handled; withdrawals take effect before new inquiries; existing
  family/application records remain intact.
- **Depends on:** Publisher and canonical Program lifecycle.

**PUB-20 — Site-facing performance and launch economics.** `Not started`
- **Implement:** Inquiry → reached → verified inquiry → application →
  offer → enrolled counts per canonical Site/Program, cohort capacity,
  referral sources and funnel dropoff. Add conservative planning
  economics, not actual bank balances or invented tuition. Suppress
  personally identifiable details and small-cohort disclosures.
- **DoD:** Counts reconcile to authoritative admissions/Enrollment records,
  exclude duplicate and synthetic traffic appropriately, and are limited
  to the Site's authorized scope.
- **Depends on:** PUB-09–11; financial/capacity configuration.

**PUB-21 — Network templates and repeatable deployments.** `Not started`
- **Implement:** Centrally approved templates for church-hosted academy,
  K–8 high-school extension, hybrid cohort, homeschool and summer
  programs. Network users may propose partner sites and watch readiness,
  but cannot silently become school of record or gain student access.
- **DoD:** A new approved partner can reuse legal/program/site templates
  without copying a previous site's families, staff or confidential data.
- **Depends on:** PUB-12/13/18 and institutional authorization.

**PUB-22 — Optional events, SEO, custom domain and campaigns.** `Not started`
- **Implement:** Canonical public calendar events, sitemap/search indexing
  after launch approval, shareable/QR entry, attribution, custom hostname
  ownership and validated TLS lifecycle. Avoid a general content platform
  until core inquiries and applications work.
- **DoD:** Events and external domains cannot bypass publication/role
  checks, unpublish, cookie isolation or standard enrollment CTAs.
- **Depends on:** PUB-13, DNS/TLS gates, existing CalendarEvent.

## Release, privacy and integration debt — mandatory gates, not another product

These are documented **remaining tasks** despite earlier direction to skip
validation while shipping individual product bites. Their existence does not
authorize running them now or applying production migrations.

| ID | Priority | Required work / objective acceptance | Status |
| --- | --- | --- | --- |
| GATE-01 | P0 | On **disposable Neon** only, apply `0035` → `0036` → `0037` → `0038`; reconcile Drizzle migration journal/schema, FK/review status invariants and actual SQL read/write shape. Run typecheck, route-contract checker, unit/integration tests. | Not executed |
| GATE-02 | P0 | Isolated multi-tenant browser acceptance on one real Site/Program: unpublished 404, published content, POST inquiry, registrar reads/contacts, identity-reviewed conversion, refresh/idempotent retry, unpublish immediately denies, cross-site reader/writer denial and audit rollback. | Not executed |
| GATE-03 | P0 | Test Netlify wildcard routing and origin verification on preview: direct internal handler access, Host/Forwarded-Host spoofing, HTTP method/path bypass, rewritten POST body, TLS, CSP/form-action, response caching and **host-only** authentication cookies. Keep `CAN_PUBLIC_SITE_HOSTING_ENABLED` off outside an approved isolated test. | Not executed |
| GATE-04 | P0 | Implement trusted-edge anti-bot controls beyond global 30/min database cap: per-source abuse limits at the trusted edge, privacy-safe bot filtering, failure visibility, alerts, spam response and DOS budget. Unknown/failing gate must reject. | Not started |
| GATE-05 | P0 | Version/stamp adult inquiry consent text, timestamp and channel; establish retention, deletion, marketing-contact suppression/opt-out, PII access audit, encryption and notification policy. Current form checks consent but the interest row does **not** retain versioned evidence. | Gap identified |
| GATE-06 | P0 | Approve legally accurate public language naming host Site vs operating institution, academic provider, school of record, credit issuer, accreditation status and jurisdiction. Marketing listing is not license/credit/admissions approval. | Not approved |
| GATE-07 | P0 | Review concurrency/authorization: publisher capability and active institutional assignment, Site/Program joins, safe public DTO, `FOR SHARE` vs unpublish, interest creation/duplication, identity reuse, transactional audit/events, no accidental guardian grant. | Not executed |
| GATE-08 | P1 | Accessibility/keyboard/screen-reader/mobile, image/content rights, privacy/security headers, browser reload/error messaging, analytics/observability and monitoring/takedown runbooks. Remove `noindex` only after an approved production launch. | Not executed |
| GATE-09 | P1 | Separate explicit authorization for wildcard DNS/TLS, Netlify production settings, secret scopes, database migrations and traffic enablement; rollback/unpublish must be rehearsed. No `main` merge, prod mutation or host launch without approval. | Not authorized |

**Known design limitations from current source (not claimed tested bugs):**
- `src/domain/public-site-html.ts` renders a basic escaped standalone page:
  no Site-managed hero/branding, tours, location or live application links.
- `src/modules/enrollment/public-admissions-interest.functions.ts` records
  only `new/contacted/closed/converted` statuses; it has no Action owner,
  due date, follow-up outcome or communication history.
- `src/db/schema/public-admissions-interests.ts` persists lead contact data
  but not a versioned consent receipt or a retention disposition.
- `src/modules/enrollment/admissions-intake.functions.ts` provides a reviewed
  new-student conversion path; it does not offer a human-authorized
  match/reuse/merge experience for known families.
- `src/routes/sites.$siteId.publish.tsx` presents a private editor
  preview, not necessarily pixel-identical to the served public HTML.
- Tenant routing is configured in
  `netlify/edge-functions/site-host-gate.ts` but is unverified against a
  deployed Netlify edge-to-server rewrite and has no managed wildcard
  DNS/TLS in this track.

## Suggested order of next small development handoffs

1. **Institution/host publisher handoff:** authorized school operator sees
   the existing Site's generated draft and can request/receive an explicit
   publisher role, with CAN institutional approvals separate.
2. **PUB-11/17:** connect a published academic offering to one readiness-gated
   canonical, authenticated guardian application and safe existing-family reuse.
3. **GF22 → GF2:** take that same application through authorized offer,
   consent and activation into one real Enrollment.
4. **FullFlow stages 2–6:** use the SAME Program/Student/Enrollment in Section
   staffing, learning, grading, guardian view and Site day/operations. Preserve
   institutional approval and child safety gates.
5. **PUB-14:** reuse existing guardian enrichment registration and payment
   context for independently open approved activity Seasons.
6. **PUB-09/10, PUB-15/16/19–22:** follow-up management, branding, campaigns,
   tours, network templating and analytics **after** the core school journey.
7. **GATE-01–09:** remain tracked as prerequisites to production exposure.
   Execute on an explicitly approved isolated environment before rollout;
   never treat postponed verification as a pass.

## Relationship to the broader CAN OS backlog

This list covers **only** the public-site/marketing-to-admissions slice.
The broader platform's P0 **single six-stage** School → Curriculum/Section →
Family Enrollment → Student Learning → Teacher/Guardian → Operator journey
remains governed by [FullFlow acceptance](./full-flow-acceptance-contract.md)
and [integration convergence](./integration-convergence-audit.md).
[FullFlow progress](./full-flow-progress.md) covers learning activity,
Student 360, staffing, hybrid Site day, safeguarding, financial modeling,
network onboarding and other independent product priorities. No item in
this public-site backlog replaces those requirements.

## Maintaining this backlog

On each `FullFlow` bite, update the relevant PUB/GATE row, commit SHA/path
references and outstanding DoD. Record actual command/test output and
deployed environment in a separate acceptance/evidence note; do not mark
`Done` because a file exists or a test was authored. Preserve earlier
Bite 1–8 history in [site publishing implementation notes](./site-public-publishing.md)
rather than silently rewriting it.
