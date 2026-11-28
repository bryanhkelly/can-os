# Bottom-up reporting relationships

Status: additive schema installed on Neon main; relationship workflow source integrated on release-11232026. Not deployed or browser accepted.

## Direction
The data-owning organization initiates a tag, selects a relationship type and
approved versioned aggregate metrics, and sends immutable terms to the recipient.
The recipient independently accepts or declines. The owner can withdraw a pending
proposal; either party can revoke an accepted relationship. Top-down invitations,
delegation, mandated hierarchy, and national program distribution are out of scope.

Scope is a canonical Organization, Site, Program, Offering or native Class.
For shared Offerings, the owner is a publisher or an independently authorized
operator with current approved adoption, not every host of the product.
The agreement is always the pair of the contributing organization and the scope.
Class is available for narrower local delivery. Campaigns, standalone Events,
cohorts, and other resource kinds require explicit future scope adapters.

The scope applies only to authoritative source facts owned by the contributor
whose exact dimension matches. Organization scope includes its own facts at
current and future entities, but never another independent tenant's data.
Facts precede neither acceptance nor the source's actual occurrence timestamp.
Explicit historical access is deferred. New terms require a new agreement.
Current revocation or expiry blocks historical queries too.

## Reuse and separation
- Existing organizations, sites, programs, offerings, approved adoptions,
  classes and authoritative Persons remain the identity authorities.
- The existing organization_relationships table describes institutional/legal
  relationships; do not reinterpret those records as disclosure consent.
- network_reporting_grants remain legacy host-wide authorization. Never insert
  a narrower relationship as a broad grant; existing network reports must not
  treat new consent rows as host-wide access.
- Use reporting-source-contract dimensions and reporting-metric-registry
  key/version definitions. No duplicated metrics, enrollment facts or counts.
- Match each canonical fact against all direct eligible grants before projecting
  the metric. Consume the fact once; preserve all relationship IDs as provenance.
  Distinct-person, denominator, attendance and learning-hour rules still belong
  to the authoritative domain projection, not a sum of partner dashboard totals.
- No transitive or onward sharing; a recipient cannot re-share a source fact.
  Sponsorship labels do not convey financial attribution, endorsement,
  publication, operational, branding, academic or individual-record authority.
- New entity-level consent storage is owner-only forced RLS. The transaction
  service resolves current identity and resource authority and row-locks decisions.
  The database guard validates immutable terms, legal state transitions and
  actor-party structure; an append-only trigger records each transition.
  This is not an identity-provider replacement or direct client database API.

## Source delivered
- src/domain/bottom-up-reporting-relationships.ts
- tests/unit/bottom-up-reporting-relationships.test.ts
- database/production/2026-11-24-bottom-up-reporting-relationships.sql
- src/modules/reporting/bottom-up-reporting-relationships.server.ts
- src/components/reporting/ReportingRelationshipPanel.tsx
- src/components/reporting/ReportingRelationshipPanel.stories.tsx

The V6.1 panel uses the existing Button, Select, Field, Checkbox, Label and
WorkspaceNotice primitives. It is controlled by its authorized parent workspace,
with explicit metric selection and decision confirmation. The continuation mounts it in the independent relationship manager home workspace. An accessible, bounded organization search and
pagination, date-selection, incoming inbox, refresh/error handling and
notification integration remain work.

## Release gates
1. Ratify direct relationship proposal/decision/revocation/report capabilities
   through the existing centralized verified role and grant system; never
   bootstrap real agreements through impersonation or use ordinary tenant
   administration as implied consent. The capability mapping is now implemented for an explicit relationship manager role; real assignments remain unprovisioned.
2. Establish a trusted per-scope, versioned disclosure metric allowlist; the
   existing registry describes private operational metrics, not permission to
   share them. Recipient discovery, acceptance eligibility and current actor
   authority must be checked independently. Do not expose the internal command
   service directly to a browser.
3. Validate the guarded additive SQL migration and role privileges on the intended
   main schema; verify atomic audit, duplicate live proposals, invalid FK/owner
   pairs, concurrent decisions, transfer/revocation and cross-tenant denial.
   Confirm the migration is recorded in the governing deployment inventory.
4. Wire bounded authorized list and mutation endpoints, reuse the V6.1 panel
   across resource workspaces, add incoming relationship requests and use
   existing notification/feedback conventions. Validate keyboard and responsive
   behavior in Storybook and actual browser flows.
5. Integrate canonical fact readers and metric-specific aggregation with the
   scoped policy; enforce current source and recipient authority, versioned
   approved metric policy, effective time, revocation and explicit disclosure
   review including small-cell and differencing protections for cross-tenant
   reports. Protect exports, cached results and published snapshots. Never pass
   raw facts to the recipient. Test overlapping tags and distinct-person metrics
   against canonical counts.
6. Run exact-SHA typecheck, full unit suite, targeted relationship tests,
   build, Cloudflare build, design checks, Storybook and restricted-principal
   integration/browser acceptance before promoting.

Read-only main schema inspection confirmed canonical public table/column names
for the source scope and approved Offering adoption joins. The original source increment did not write the database; the continuation installed the additive migration as recorded below. No checkout or
dependency install was available in the authoring runtime; no build, unit,
Storybook, migration execution or browser pass is claimed.

## Continuation: 2026-11-24
- Corrected invalid Offering-owner SQL function dollar quoting and require both
  parties to remain active at acceptance. Applied the committed additive
  migration on Neon CAN OS main (neondb), not a test01 branch.
- Independently verified both tables, forced RLS, one policy per table,
  no direct anonymous/authenticated access, 10 validated agreement FKs,
  three validated event FKs, four valid agreement indexes, two enabled
  agreement triggers, one audit immutability trigger, and no anonymous or
  authenticated execution privilege on the Offering owner resolver.
- The live inventory contains zero agreements, zero events and zero active
  reporting_relationship_manager account grants. No real grants or synthetic
  acceptance records were created. Lifecycle behavior is not yet DB-tested.
- The dedicated reporting_relationship_manager role reuses account_person_grants
  and the central capability map, without default administrative inheritance.
  It is excluded from delegated Owner actions and ordinary Site/Program scope
  expansion. Initial workflow requires an independently verified, direct,
  organization-wide appointment. Rechecks lock current grant, account, Person,
  organization and session rows inside commands. Synthetic tenants are excluded.
- Bounded organization search lists only active organizations with a real
  relationship manager; bounded resource choices use canonical ownership or
  Offering adoption. Incoming/outgoing inbox returns exact resource and metric
  labels but omits actor Person IDs. No outcome records are returned.
- Server functions use a server-owned, version-pinned proposal metric allowlist
  for registration/reach and selected noncredit participation/completion terms.
  Acceptance does not approve an external release. The new role's /home
  workspace uses the existing V6.1 panel, query framework and mutation feedback.
- A pure internal registration projection applies eligible direct agreements
  at canonical fact grain, deduplicates overlaps, and reuses the existing
  participation rollup for registrations and distinct Person counts. Four
  registration/reach metrics are supported by this pure projection. It is not
  connected to live source adapters or an external report endpoint.
- Additional regression tests cover role isolation, owner delegation, source
  overlap, distinct contributors, wrong owner, revoked permission, version
  mismatch and unsupported metric/source combinations. Tests are written,
  not executed. Full typecheck, build, Storybook, browser and restricted-
  principal lifecycle acceptance remain blockers.
- Next: authorized role provisioning, independent source adapters with current
  scope proofs and report-disclosure artifact/workflow, then test and release
  the aggregate-only reporting reader. Add resource-local entry points,
  expiry controls, notifications and operational acceptance. Do not merge or
  deploy unvalidated code solely because the database schema exists.


## Reporting workstream continuation — release-11252026, 2026-11-27

The bottom-up tag is a voluntary, mutually accepted Organization relationship
at an exact owned resource. It is not a legal affiliation, an operator
appointment, a funding allocation, a credential, a hierarchy edge or permission
to publish. Preserve existing domain-specific authorities and legal evidence.
Do not generate legacy host-wide network_reporting_grants from scoped tags.
The Relationship Engine is the sole proposed path for new voluntary reporting
consent; legacy network configuration remains setup inventory, not execution
authority. No top-down invitations or distribution work is included.

Implemented in source:
- One scope-aware relationship reader and shared current-CAN-grant transaction
  guard; eliminated duplicate incoming and outgoing readers. Site-bound
  registrars/Site Admins may initiate a tag without granting any metric.
  Organization-wide relationship managers retain proposal, decision, revocation
  and report capability. Impersonation cannot manufacture consent.
- Relationship terms can contain zero metrics. A Site operator can initiate a
  tag; the authorized owner representative can subsequently propose reporting
  terms. No automatic report grant, branding or financial attribution.
- Additive terms migration 2026-11-27-reporting-relationship-terms.sql:
  prospective, explicit historical start or all eligible history; optional
  expiry; immutable same-party/scope/kind revision lineage; accepted original
  remains active until replacement accepted atomically. Old rows preserved.
  Logical separation of tag and reporting terms uses the existing agreement
  record; no parallel consent ledger.
- Population pinned at proposal, verified against current owner and recipient
  at acceptance. Synthetic-to-synthetic uses ordinary independently verified
  membership and the same business commands. Real/synthetic/unknown mixing
  denied; unknown legacy agreement population is never assumed real.
- Reusable ContextualReportingRelationships mounted in Site Profile, Launch
  Studio Site Profile, Program academic preparation and Class reports.
  Manager workspace reuses this component for all five supported scope kinds,
  including Organization and Offering. Organization and exact Site inherited
  terms are read-only in descendant contexts. No inferred Program-to-Class
  membership. Private query hooks isolate identity and scope.
- Relationship portfolio report uses existing V6.1 ReportDocumentView and
  server-derived setup inventory independent of inbox pagination. Counts
  distinguish connected organizations, accepted tags, accepted metric terms,
  pending incoming/outgoing and directly tagged Programs. No implied outcome
  or execution authority. Synthetic inventory explicitly labeled.
- Internal registration source reader uses exact native Class and noncredit
  self-enrollment release/claim joins. Internal projection resolves live
  accepted scoped agreements, active current owner, same population and
  current metric version before the existing deduplicated rollup.
  No inferred local Program membership or site-less facts. Source coverage
  remains incomplete; the reader is internal only, not a partner endpoint.
- Internal last-mile disclosure helper requires a reconciled source manifest,
  exact approval digest/audience, current agreements, reviewed overlapping
  cuts and differencing, and suppression below ten distinct contributors.
  No persisted disclosure approval workflow or external release is enabled.
- Tests added/updated for zero-metric tags, historical coverage, scoped
  initiation and synthetic population boundaries. Storybook adds tag-only
  interaction. Existing metric registry, metric definitions and proposal
  allowlist are unchanged.

Release blockers:
1. Neon main still has the original agreement schema; apply the new terms
   migration only after isolated validation. Attempted to create a dedicated
   QA database branch; Neon rejected it with "branches limit exceeded".
   No production data or schema changed in this continuation. Verify atomic
   amendment rollback, concurrent requests, grants, forced RLS, and role
   isolation before deployment.
2. No local repository checkout (GitHub DNS unavailable); execute exact-SHA
   typecheck, build, unit, integration, Storybook, and authenticated browser
   acceptance in the normal release workflow. No test execution claimed.
3. Complete governed organization-wide role appointment/provisioning and
   separate analyst access. No real or synthetic membership grants issued.
4. Complete approval/notification integration with existing work management
   and communication infrastructure, including independent disclosure
   artifact persistence, manifest reconciliation, source-completeness proof
   and revocation-safe snapshot/export behavior. Keep outcome endpoint closed
   until those controls exist. The incoming inbox is available as a workflow
   source, not a notification delivery service.
5. Mount Organization and Offering tags in their ordinary resource pages
   once those contexts support an authorized local grant. The manager
   workspace provides both selectors today.
6. Initiative, Campaign, Event, Funding Agreement, Solution and Content
   adapters remain explicit future resource types: establish canonical
   ownership, source dimensions, exact attribution and allowed action
   policy before expanding the five-kind schema. Do not add guessed links
   or widen an existing Program/Site grant.
7. Validate full relationship workflow with two independently assigned
   synthetic organizations and real/synthetic denial; no synthetic records
   inserted into production.

This is the reporting workstream; no metric-catalog expansion and no top-down
network control work in this increment.
