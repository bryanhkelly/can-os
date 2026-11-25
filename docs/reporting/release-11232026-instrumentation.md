# Release 11232026: reporting instrumentation pass

This is an implementation inventory, not a claim of end-to-end acceptance. Reuse the existing strict event catalog, transactional emitter, outbox, canonical ownership resolver, receipts, replay, and private source quality queries. No second analytics ledger.

## Newly connected operational events

- Site Intelligence: claim, completion, failure, reuse. One claim revision per attempt; a fenced failure or completion is emitted only for a successful state write. No prompts, output text, provider credentials or raw responses. Abandoned leases and token/cost accounting remain gaps.
- Brand: immutable version save, not an unchanged save.
- Website copy: saved draft, reviewed content publication, review required. Existing event types now use the governed emitter, historical envelopes are not fabricated. Site publication, republish and unpublish use the authoritative publication revision. Academic marketing publication is separate from admissions.
- Site-scoped legacy Program launch: start/activate, using exact Program and Journey identity. Original business events remain for existing subscriptions; the reporting event is the sole normalized lifecycle observation. Site-less and native deployment paths remain separate gaps.
- Site-owned campaigns: scheduling and cancellation transaction. Recipient count is planned delivery rows, not people reached. HQ, platform and Program-owned campaign lifecycle events cannot be forced into the Site-scoped receipt contract. Do not invent a Site.

All new event types are picked up by existing worker/replay catalog. Existing events moved from pass-through registration into the reporting registration, preventing duplicate handlers. Ownership lookup independently checks immutable source rows or exact Program/campaign owner. Reporting still requires approved schema deployment, enabled projection, and successful reconciliation.

## Campaign metrics

One source-owned aggregate expression used by campaign workspace and authorized Site reporting. Counts delivery rows, pending, provider acceptance, confirmed delivery, bounce, complaint, failure, unconfirmed, suppression, cancellation. Acceptance overlaps later outcomes. A campaign is counted in a creation-time cohort and its current state is returned; this is NOT a historical delivery-period snapshot. Exact Site and Organization owner filters; Program ownership requires canonical current Site mapping. HQ/organization and platform campaigns are excluded from Site totals, not allocated to artificial Sites. The private metric registry now includes the campaign definitions. No addresses, subject/body or recipient identities in the Site reporting endpoint.

## Outstanding coverage to close before funder reporting

| Domain | Remaining evidence/validation |
|---|---|
| Site/Program/Offering | Native deployment lifecycle, readiness and authorization; release manifest lineage and program-specific content adoption |
| Website/public | Direct public page observations (not merely Go traffic), consent-sensitive preview lifecycle, bot-aware attribution |
| Engagement | Organization and platform ownership, exact downstream outcomes for all Go destinations; no anonymous-to-person inference |
| Campaigns | Immutable provider receipt and settlement history including out-of-order events, withdrawal, suppression, retry and cancellation; organization-wide rollups |
| Classes | Enrollment/transfer/withdrawal corrections, scheduled versus actual attendance, distinct verified persons, assessments and completion |
| Noncredit | Reconcile registrations, verified attendance, learning time and certificates; correction lineage and repeat participation |
| Experiences | Published offering, capacity, enrollment, attendance and outcomes |
| Partnerships/funding | Agreements, funding restrictions, measurement plan revisions, deliverables, approved sponsor reporting |
| Operations | Staffing, facilities utilization, compliance and approval evidence; privacy-restricted domains need explicit allowlists |

## Acceptance

Run typecheck, unit tests and worker integration; verify migrations 0100-0102 and campaign tables on target DB; replay legacy sources as legacy (no inferred facts); test source ownership, duplicate deliveries, tenant isolation, correction lineage, missing projections, provider receipt and report reconciliation. Execute a two-Site pilot and reconcile counts against canonical records before any external impact report. No build, database migration or live delivery is certified by this commit.
